"""One fixed subprocess adapter; model packages stay in their separate environment."""

import copy
import hashlib
import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from sdp_xray.common.contracts import validate_scan_result
from sdp_xray.model_catalog import get_model

from .config import APP_ROOT, REPOSITORY, Settings


class InferenceFailure(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass(frozen=True)
class InferenceOutput:
    prediction: dict
    execution: dict | None


COMPUTE_ERRORS = {
    "cuda_unavailable": "The selected GPU is unavailable. Review setup and restart the service.",
    "incompatible_runtime": "The selected runtime is incompatible. Review setup and restart.",
    "cuda_oom": "GPU memory was insufficient. Free GPU resources before deliberately retrying.",
    "device_changed": "The selected GPU identity changed. Review setup and restart the service.",
    "cuda_execution_failed": "GPU execution failed. Review setup and restart the service.",
}

RUNTIME_CHANGED = "Runtime identity changed after verification. Review setup and restart the service."


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_json(path: Path, maximum: int) -> dict:
    if not path.is_file() or path.stat().st_size > maximum:
        raise ValueError("missing or oversized JSON")
    with path.open("rb") as stream:
        content = stream.read(maximum + 1)
    if len(content) > maximum:
        raise ValueError("oversized JSON")
    value = json.loads(content)
    if not isinstance(value, dict):
        raise ValueError("expected JSON object")
    return value


def freeze_runtime(settings, probe):
    """Private session expectations; no additional model process per ordinary scan."""
    paths = [REPOSITORY / relative for relative in (
        "scripts/infer_generic_yolov10.py", "scripts/probe_model_runtime.py",
        "src/sdp_xray/model_runtime.py", "src/sdp_xray/runtime_setup.py",
        "src/sdp_xray/model_catalog.py",
        "environments/profiles.json",
    )]
    paths += [APP_ROOT / "backend/src/rayguard_gui" / name
              for name in ("runtime.py", "runner.py")]
    profiles = read_json(REPOSITORY / "environments/profiles.json", 64 * 1024)
    profile = next((row for row in profiles.values()
                    if isinstance(row, dict) and row.get("id") == settings.runtime_profile), {})
    paths += [REPOSITORY / "environments" / profile[key]
              for key in ("lock", "build_lock") if key in profile]
    interpreter = settings.model_python.resolve(strict=True)
    info = interpreter.stat()
    marker = interpreter.parent.parent / "rayguard-setup.json"
    files = {str(path): file_hash(path) for path in paths}
    files[str(marker)] = file_hash(marker) if marker.is_file() else None
    if settings.checkpoint is not None:
        files[str(settings.checkpoint)] = settings.checkpoint_sha256
    return {"files": files, "interpreter_stat": [info.st_size, info.st_mtime_ns],
            "environment": {key: os.environ.get(key) for key in (
                "CUDA_VISIBLE_DEVICES", "CUDA_DEVICE_ORDER",
            )}, "probe": copy.deepcopy(probe)}


def manifest_matches(manifest, settings, image, output):
    spec = get_model(settings.model_id)
    return (manifest.get("run_id") == output.name
            and manifest.get("model_id") == spec.id and manifest.get("task") == spec.task
            and manifest.get("class_map_sha256") == spec.class_map_sha256
            and manifest.get("model_catalog_sha256") == file_hash(REPOSITORY / "src/sdp_xray/model_catalog.py")
            and manifest.get("checkpoint_sha256") == settings.checkpoint_sha256
            and manifest.get("input_sha256") == file_hash(image)
            and manifest.get("script_sha256") == file_hash(
                REPOSITORY / "scripts/infer_generic_yolov10.py")
            and manifest.get("runtime_helper_sha256") == file_hash(
                REPOSITORY / "src/sdp_xray/model_runtime.py"))


def validate_execution(value: dict, device: str, expected_device_id: str | None = None) -> dict:
    fields = {"schema_version", "requested_device", "actual_device", "backend", "device_name",
              "device_id", "precision", "python", "torch", "torchvision", "cuda", "cudnn"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("invalid execution fields")
    backend = "cuda" if device.startswith("cuda:") else "cpu"
    if (value["schema_version"] != "rayguard.execution.v1"
            or value["requested_device"] != device or value["actual_device"] != device
            or value["backend"] != backend or value["precision"] != "float32"):
        raise ValueError("execution differs from requested device or precision")
    for key in ("python", "torch", "torchvision"):
        if not isinstance(value[key], str) or not re.fullmatch(r"[a-zA-Z0-9+._-]{1,80}", value[key]):
            raise ValueError("invalid runtime version")
    if value["cuda"] is not None and (
        not isinstance(value["cuda"], str) or not re.fullmatch(r"[0-9.]{1,30}", value["cuda"])
    ):
        raise ValueError("invalid CUDA version")
    if value["cudnn"] is not None and (type(value["cudnn"]) is not int or value["cudnn"] <= 0):
        raise ValueError("invalid cuDNN version")
    for key in ("device_name", "device_id"):
        if value[key] is not None and (
            not isinstance(value[key], str) or not 1 <= len(value[key]) <= 160
            or any(ord(c) < 32 for c in value[key])
        ):
            raise ValueError("invalid device identity")
    if backend == "cpu" and (value["device_name"] is not None or value["device_id"] is not None):
        raise ValueError("CPU execution cannot claim a GPU identity")
    if backend == "cuda" and (value["cuda"] is None or not value["device_name"]):
        raise ValueError("missing CUDA execution evidence")
    if expected_device_id is not None and value["device_id"] != expected_device_id:
        raise ValueError("GPU identity changed")
    return dict(value)


def validate_forwards(manifest, device):
    forwards = manifest.get("forwards")
    if not isinstance(forwards, list) or not 1 <= len(forwards) <= 16:
        raise ValueError("missing forward evidence")
    for item in forwards:
        if not isinstance(item, dict):
            raise ValueError("invalid forward evidence")
        shape = item.get("shape")
        if (not isinstance(shape, list) or len(shape) != 4 or shape[:2] != [1, 3]
                or any(type(n) is not int or n <= 0 for n in shape)
                or any(n > 640 or n % 32 for n in shape[2:])
                or any(item.get(key) != device for key in ("input_device", "model_device"))
                or any(item.get(key) != "torch.float32" for key in ("input_dtype", "model_dtype"))):
            raise ValueError("forward differs from selected device/FP32/input settings")
    if manifest.get("prediction_input_shape") != forwards[-1]["shape"]:
        raise ValueError("final input shape differs")
    if device.startswith("cuda:") and not any(item["shape"] == [1, 3, 640, 640] for item in forwards):
        raise ValueError("GPU warmup capacity was not verified")


def validate_prediction(result: dict, scan: dict, run: dict, settings: Settings) -> None:
    """Check schema AND job binding, before predictions can reach the interface."""
    validate_scan_result(result)
    spec = get_model(settings.model_id)
    expected_model = {
        "id": spec.id, "task": spec.task,
        "provenance": f"sha256:{settings.checkpoint_sha256}",
    }
    if (
        result["status"] != "ok"
        or result["scan_id"] != scan["id"]
        or result["image"] != {"width": scan["width"], "height": scan["height"]}
        or result["model"] != expected_model
        or result["run"] != {"id": run["id"], "provenance": "manifest.json"}
        or result["threshold"] != run["confidence"]
    ):
        raise ValueError("prediction identity, dimensions or settings differ from the requested job")
    for detection in result["detections"]:
        if (
            detection["category"]["namespace"] != spec.task
            or detection["category"]["label"] not in spec.classes
            or detection["kind"] != spec.kind
            or detection["device_id"] is not None
            or detection["confidence"] < run["confidence"]
        ):
            raise ValueError("prediction differs from the selected detector's task or threshold")


class SubprocessRunner:
    def __init__(self, settings: Settings, expected_device_id: str | None = None,
                 expectations: dict | None = None):
        self.settings = settings
        self.expected_device_id = expected_device_id
        self.expectations = copy.deepcopy(expectations)

    def _check_frozen_files(self):
        if self.expectations is None:
            return
        try:
            for name, expected in self.expectations["files"].items():
                path = Path(name)
                if (file_hash(path) if path.is_file() else None) != expected:
                    raise ValueError("source or profile changed")
            info = self.settings.model_python.stat()
            if [info.st_size, info.st_mtime_ns] != self.expectations["interpreter_stat"]:
                raise ValueError("interpreter changed")
            if any(os.environ.get(key) != value
                   for key, value in self.expectations["environment"].items()):
                raise ValueError("device visibility changed")
        except (OSError, ValueError) as error:
            raise InferenceFailure("runtime_changed", RUNTIME_CHANGED) from error

    def _check_frozen_manifest(self, manifest, execution):
        if self.expectations is None:
            return
        probe = self.expectations["probe"]
        identity = {key: probe.get(key) for key in ("packages_sha256", "upstream_code_sha256")}
        selected = next((row for row in probe.get("devices", [])
                         if self.settings.inference_device == f"cuda:{row['index']}"), None)
        if (manifest.get("runtime_identity") != identity
                or manifest.get("upstream_revision") != probe.get("upstream_revision")
                or manifest.get("visibility_mask") != probe.get("visibility_mask")
                or manifest.get("driver_devices") != probe.get("driver_devices")
                or any(execution.get(key) != probe.get(key) for key in (
                    "python", "torch", "torchvision", "cuda", "cudnn",
                )) or (selected is not None and (
                    execution.get("device_name") != selected.get("name")
                    or execution.get("device_id") != selected.get("uuid")))):
            raise InferenceFailure("runtime_changed", RUNTIME_CHANGED)

    def __call__(self, image: Path, output: Path, confidence: float) -> InferenceOutput:
        settings = self.settings
        self._check_frozen_files()
        command = [
            str(settings.model_python), str(REPOSITORY / "scripts" / "infer_generic_yolov10.py"),
            str(settings.checkpoint), str(image), str(output),
            "--checkpoint-sha256", str(settings.checkpoint_sha256),
            "--confidence", str(confidence),
            "--device", settings.inference_device,
            "--model", settings.model_id,
        ]
        if self.expected_device_id is not None:
            command.extend(["--expected-device-id", self.expected_device_id])
        # stdout/stderr stay local and never appear in an API error or export.
        # The runner creates its output directory itself (exist_ok=False).
        log_path = output.parent / f"{output.name}.log"
        environment = os.environ.copy()
        environment.update({"PYTHONUNBUFFERED": "1", "PYTHONUTF8": "1"})
        with log_path.open("wb") as log:
            try:
                completed = subprocess.run(
                    command, cwd=REPOSITORY, env=environment, stdin=subprocess.DEVNULL,
                    stdout=log, stderr=subprocess.STDOUT, timeout=settings.timeout_seconds,
                    check=False, shell=False,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
            except subprocess.TimeoutExpired as error:
                raise InferenceFailure(
                    "inference_timeout", "Inference exceeded the configured time limit."
                ) from error
            except OSError as error:
                raise InferenceFailure(
                    "model_unavailable", "The configured model process could not be started."
                ) from error
        self._check_frozen_files()
        if completed.returncode:
            try:
                failure = read_json(output / "manifest.json", 256 * 1024)
                code = failure.get("error_code")
                if (failure.get("status") == "error" and code in COMPUTE_ERRORS
                        and manifest_matches(failure, settings, image, output)):
                    raise InferenceFailure(code, COMPUTE_ERRORS[code])
            except (OSError, ValueError, TypeError):
                pass
            raise InferenceFailure(
                "inference_failed", "The model could not complete inference. Check the local run log."
            )
        try:
            predictions = output / "predictions.json"
            prediction = read_json(predictions, 2 * 1024 * 1024)
            manifest = read_json(output / "manifest.json", 256 * 1024)
            if (manifest.get("status") != "ok" or not manifest_matches(manifest, settings, image, output)
                    or manifest.get("output_sha256", {}).get("predictions.json") != file_hash(predictions)):
                raise ValueError("manifest differs from requested job or output")
            execution = validate_execution(
                manifest.get("execution"), settings.inference_device, self.expected_device_id,
            )
            validate_forwards(manifest, settings.inference_device)
            self._check_frozen_manifest(manifest, execution)
            return InferenceOutput(prediction, execution)
        except (OSError, ValueError, TypeError, AttributeError) as error:
            raise InferenceFailure("invalid_output", "The model did not produce valid bound evidence.") from error

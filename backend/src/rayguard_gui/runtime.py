"""Session-fixed device selection and explicit, serial model qualification.

No model package is imported into the API environment. Hardware checks and model
execution use the configured interpreter; only bounded evidence crosses that boundary.
"""

import copy
import hashlib
import json
import os
import platform
import subprocess
import tempfile
from dataclasses import asdict, replace
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sdp_xray.model_catalog import MODELS, UNVERIFIED_FAMILIES, get_model
from sdp_xray.model_runtime import UPSTREAM_REVISION

from .config import APP_ROOT, REPOSITORY
from .runner import (
    COMPUTE_ERRORS,
    InferenceFailure,
    InferenceOutput,
    SubprocessRunner,
    file_hash,
    freeze_runtime,
    read_json,
    validate_execution,
    validate_prediction,
)
from .runtime_policy import device_identity

PROBE_LIMIT = 64 * 1024


def reject(code, message, status=409):
    raise HTTPException(status, detail={"code": code, "message": message})


def probe_runtime(settings, device):
    """A file-backed, bounded-output probe; never run from the health endpoint."""
    command = [str(settings.model_python), str(REPOSITORY / "scripts/probe_model_runtime.py"),
               "--device", device]
    environment = os.environ.copy()
    environment.update(PYTHONUTF8="1", PYTHONUNBUFFERED="1")
    captured_stdout, captured_stderr = b"", b""
    try:
        with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
            try:
                result = subprocess.run(
                    command, cwd=REPOSITORY, env=environment, stdin=subprocess.DEVNULL,
                    stdout=stdout, stderr=stderr, timeout=120, check=False, shell=False,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
            finally:
                stdout.seek(0)
                stderr.seek(0)
                captured_stdout = stdout.read(PROBE_LIMIT + 1)
                captured_stderr = stderr.read(PROBE_LIMIT)
            content = captured_stdout
        if len(content) > PROBE_LIMIT:
            raise ValueError("oversized probe")
        value = json.loads(content)
        if (isinstance(value, dict) and value.get("schema_version") == "rayguard.runtime-probe.v1"
                and value.get("status") == "error" and value.get("error_code") in COMPUTE_ERRORS):
            raise InferenceFailure(value["error_code"], COMPUTE_ERRORS[value["error_code"]])
        if (not isinstance(value, dict) or value.get("schema_version") != "rayguard.runtime-probe.v1"
                or result.returncode or value.get("status") != "ok"
                or value.get("cpu_ok") is not True or value.get("kernel_ok") is not True
                or value.get("selected_device") != device
                or value.get("upstream_revision") != UPSTREAM_REVISION):
            raise ValueError("failed probe")
        if not isinstance(value.get("devices"), list) or len(value["devices"]) > 32:
            raise ValueError("invalid devices")
        for item in value["devices"]:
            if (not isinstance(item, dict) or type(item.get("index")) is not int
                    or item["index"] < 0 or not isinstance(item.get("name"), str)
                    or not 1 <= len(item["name"]) <= 160
                    or any(ord(c) < 32 for c in item["name"])
                    or type(item.get("total_memory_bytes")) is not int
                    or item["total_memory_bytes"] <= 0
                    or not isinstance(item.get("capability"), list) or len(item["capability"]) != 2
                    or any(type(n) is not int or n < 0 for n in item["capability"])
                    or (item.get("uuid") is not None and (
                        not isinstance(item["uuid"], str) or not 1 <= len(item["uuid"]) <= 160
                        or any(ord(c) < 32 for c in item["uuid"])) )
                    or (item.get("free_memory_bytes") is not None and (
                        type(item["free_memory_bytes"]) is not int or item["free_memory_bytes"] < 0))):
                raise ValueError("invalid device record")
        if value.get("hip") and device.startswith("cuda:"):
            raise ValueError("HIP is not a qualified NVIDIA backend")
        if device.startswith("cuda:") and not any(
            row["index"] == int(device.split(":")[1]) for row in value["devices"]
        ):
            raise ValueError("requested device missing")
        return value
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired, InferenceFailure) as error:
        try:
            logs = settings.storage_dir / "runtime-checks"
            logs.mkdir(parents=True, exist_ok=True)
            (logs / f"{uuid4().hex}.log").write_bytes(
                f"{type(error).__name__}: {str(error)[:2000]}\n".encode("utf-8")
                + captured_stdout[:PROBE_LIMIT] + b"\n--- stderr (bounded) ---\n" + captured_stderr
            )
        except OSError:
            pass
        if isinstance(error, InferenceFailure):
            raise
        raise InferenceFailure(
            "runtime_unavailable", "The runtime check failed. Review local setup and restart."
        ) from error


def qualification_fingerprint(settings, probe, device):
    """Exclude transient free memory; include identities that invalidate model evidence."""
    interpreter = settings.model_python.resolve(strict=True)
    info = interpreter.stat()
    sources = {}
    for relative in ("scripts/infer_generic_yolov10.py", "scripts/probe_model_runtime.py",
                     "src/sdp_xray/model_runtime.py", "src/sdp_xray/runtime_setup.py",
                     "src/sdp_xray/model_catalog.py",
                     "environments/profiles.json"):
        path = REPOSITORY / relative
        sources[f"engine/{relative}"] = file_hash(path) if path.is_file() else None
    for name in ("runtime.py", "runner.py"):
        relative = f"backend/src/rayguard_gui/{name}"
        path = APP_ROOT / relative
        sources[relative] = file_hash(path) if path.is_file() else None
    try:
        profiles = read_json(REPOSITORY / "environments/profiles.json", 64 * 1024)
        profile = next((row for row in profiles.values()
                        if isinstance(row, dict) and row.get("id") == settings.runtime_profile), {})
        if settings.runtime_profile not in ("manual", "cpu-fallback"):
            machine = platform.machine().lower()
            architecture = "x86_64" if machine in ("amd64", "x86_64") else machine
            expected = {"python": profile.get("python"), "torch": profile.get("torch_version"),
                        "torchvision": profile.get("torchvision_version"),
                        "upstream_revision": profile.get("fork_commit")}
            if (not profile or profile.get("enabled") is not True
                    or profile.get("os") != platform.system()
                    or profile.get("architecture") != architecture
                    or any(probe.get(key) != value for key, value in expected.items())):
                raise InferenceFailure("incompatible_runtime", "The interpreter does not match its managed runtime profile.")
        for key in ("lock", "build_lock"):
            if key in profile:
                path = (REPOSITORY / "environments" / profile[key]).resolve()
                if path.parent != (REPOSITORY / "environments").resolve():
                    raise ValueError("invalid profile path")
                sources[f"profile_{key}"] = file_hash(path)
                if sources[f"profile_{key}"] != profile.get(f"{key}_sha256"):
                    raise InferenceFailure("incompatible_runtime", "The reviewed runtime lock changed; prepare and verify it again.")
    except OSError as error:
        if settings.runtime_profile not in ("manual", "cpu-fallback"):
            raise InferenceFailure("incompatible_runtime", "The reviewed runtime profile files are unavailable.") from error
    marker = interpreter.parent.parent / "rayguard-setup.json"
    sources["environment_marker"] = file_hash(marker) if marker.is_file() else None
    spec = get_model(settings.model_id)
    evidence = {
        "schema_version": 1, "device": device, "profile": settings.runtime_profile,
        "model_id": spec.id, "task": spec.task, "class_map_sha256": spec.class_map_sha256,
        "interpreter": str(interpreter), "interpreter_stat": [info.st_size, info.st_mtime_ns],
        "host": [platform.node(), platform.system(), platform.release(), platform.machine()],
        "checkpoint": file_hash(settings.checkpoint), "expected_hash": settings.checkpoint_sha256,
        "visibility_mask": os.environ.get("CUDA_VISIBLE_DEVICES"),
        "device_order": os.environ.get("CUDA_DEVICE_ORDER"), "sources": sources,
        "probe": {key: probe.get(key) for key in (
            "host_id", "driver", "python", "torch", "torchvision", "cuda", "hip", "cudnn",
            "upstream_revision", "visibility_mask",
            "packages_sha256", "upstream_code_sha256",
        )},
        "devices": [{key: row.get(key) for key in (
            "index", "name", "capability", "total_memory_bytes", "uuid",
        )} for row in probe["devices"]],
    }
    if evidence["checkpoint"] != settings.checkpoint_sha256:
        raise InferenceFailure("model_unavailable", "The checkpoint hash differs from configuration.")
    return hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()


def compare_predictions(cpu, gpu):
    """One-to-one parity, with continuous original-pixel xyxy and fixed tolerances.

    Augmenting paths handle overlapping candidates without relying on output order.
    This checks numerical compatibility, never annotation agreement or accuracy.
    """
    if (cpu.get("status") != "ok" or gpu.get("status") != "ok"
            or cpu["image"] != gpu["image"] or cpu["threshold"] != gpu["threshold"]
            or cpu["model"] != gpu["model"]):
        raise ValueError("result identity/settings differ")
    first, second = cpu["detections"], gpu["detections"]
    if len(first) != len(second) or len(first) > 300:
        raise ValueError("detection counts differ or exceed the runner limit")
    edges = []
    for detection in first:
        candidates = []
        for index, other in enumerate(second):
            a, b = detection["box_xyxy"], other["box_xyxy"]
            intersection = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(
                0, min(a[3], b[3]) - max(a[1], b[1]),
            )
            union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection
            overlap = intersection / union
            if (detection["category"] == other["category"]
                    and detection["kind"] == other["kind"]
                    and detection["device_id"] == other["device_id"] and overlap >= .99
                    and max(abs(x - y) for x, y in zip(a, b, strict=True)) <= .5
                    and abs(detection["confidence"] - other["confidence"]) <= .001):
                candidates.append((overlap, index))
        edges.append([index for _, index in sorted(candidates, reverse=True)])
    matched = {}

    def assign(index, visited):
        for candidate in edges[index]:
            if candidate in visited:
                continue
            visited.add(candidate)
            if candidate not in matched or assign(matched[candidate], visited):
                matched[candidate] = index
                return True
        return False

    if not all(assign(index, set()) for index in range(len(first))):
        raise ValueError("boxes, categories or confidences exceed fixed parity tolerances")
    return {"matched_count": len(matched), "nonempty_parity_checked": bool(first),
            "coordinate_tolerance_pixels": .5, "minimum_iou": .99,
            "confidence_tolerance": .001}


class RuntimeController:
    def __init__(self, session):
        self.session = session
        self.settings = session.settings
        self.selected = None
        self.device_record = None
        self.fingerprint = None
        self.reason = None
        self.selection_reason = None
        self.error = None
        self.verification_scan_id = None
        self.model_verified = False
        self.restart_required = False
        self.inventory = None
        self.discovering = False
        self.models_checked = False
        self.options = [self._cpu_option()]
        self.model_options = [dict(spec.public(), selectable=False, reason="Checking the local checkpoint.")
                              for spec in MODELS.values()] + [dict(row) for row in UNVERIFIED_FAMILIES]
        self.state = "checking"
        self.legacy = (self.settings.inference_device == "cpu"
                       and not self.settings.runtime_verification_required)
        if not self.settings.model_status()["configured"]:
            self.state = "unavailable"
            self.reason = "Configure the local model before checking execution."
        elif self.legacy:
            self.selected = self._cpu_settings()
            if self.selected != self.settings:
                self.session.runner = SubprocessRunner(self.selected)
            self.state = "ready"
            self.reason = "CPU configured; model compatibility is checked on each run."
            self.selection_reason = self.reason
        if session.policy_store is not None and session.policy_store.load_error:
            self.state, self.restart_required = "unavailable", True
            self.reason = session.policy_store.load_error
            self.error = {"code": "saved_device_unavailable", "message": self.reason}

    def start(self):
        if self.state == "checking":
            self.session.pool.submit(self._initialize)
        elif self.session.policy_store is not None:
            self.discovering = True
            self.session.pool.submit(self._discover_choices)

    def _discover_models(self):
        if self.models_checked:
            return
        options = []
        for spec in MODELS.values():
            candidate = self.settings.with_model(spec.id)
            available = False
            reason = "The inspected checkpoint is not installed in the configured model folder."
            if candidate.checkpoint is not None and candidate.checkpoint.is_file():
                try:
                    available = file_hash(candidate.checkpoint) == spec.sha256
                    reason = ("Inspected checkpoint available; runtime verification may be required."
                              if available else "This file does not match the inspected checkpoint hash.")
                except OSError:
                    reason = "The local checkpoint could not be read."
            options.append({**spec.public(), "selectable": available, "reason": reason})
        with self.session.lock:
            self.model_options = options + [dict(row) for row in UNVERIFIED_FAMILIES]
            self.models_checked = True

    def _cpu_option(self):
        interpreter = self.settings.cpu_model_python or self.settings.model_python
        configured = interpreter is not None and interpreter.is_file()
        return {"device": "cpu", "kind": "cpu", "name": "CPU", "selectable": configured,
                "reason": ("Uses the configured CPU environment; verification may be required."
                           if configured else "Configure a CPU environment and authorized model first.")}

    def _discover_choices(self, probe=None):
        """Use the candidate interpreter even when a separate CPU runtime is selected."""
        self._discover_models()
        options = [self._cpu_option()]
        try:
            probe = probe or probe_runtime(self.settings, "cpu")
            profiles = read_json(REPOSITORY / "environments/profiles.json", 64 * 1024)
            machine = platform.machine().lower()
            architecture = "x86_64" if machine in ("amd64", "x86_64") else machine
            profile = next((row for row in profiles.values()
                            if isinstance(row, dict) and row.get("enabled") is True
                            and row.get("backend") != "cpu"
                            and row.get("torch_version") == probe.get("torch")
                            and row.get("torchvision_version") == probe.get("torchvision")
                            and row.get("python") == probe.get("python")
                            and row.get("os") == platform.system()
                            and row.get("architecture") == architecture
                            and (self.settings.runtime_profile == "manual"
                                 or row.get("id") == self.settings.runtime_profile)), None)
            for record in sorted(probe["devices"], key=lambda row: (
                -row["total_memory_bytes"], row.get("uuid") or row["name"], row["index"],
            )):
                reason = None
                major, minor = record["capability"]
                supported = profile.get("architecture_minors", {}).get(str(major)) if profile else None
                if not probe.get("cuda") or probe.get("hip") or profile is None:
                    reason = "A reviewed NVIDIA runtime must be prepared before choosing this GPU."
                elif supported is None or minor < supported:
                    reason = "This GPU architecture is not covered by the configured runtime profile."
                elif not record.get("uuid"):
                    reason = "A stable GPU identity is unavailable; explicit device selection is disabled."
                elif record.get("free_memory_bytes") == 0:
                    reason = "No free GPU memory was available at the runtime check. Free resources and restart."
                else:
                    try:
                        driver = tuple(int(n) for n in probe["driver"].split("."))
                        minimum = tuple(int(n) for n in profile["minimum_driver"].split("."))
                        if driver < minimum:
                            reason = "The NVIDIA driver does not meet this runtime profile's minimum."
                    except (KeyError, ValueError, TypeError, AttributeError):
                        reason = "The NVIDIA driver could not be checked for this runtime."
                options.append({"device": f"cuda:{record['index']}", "kind": "gpu",
                                "name": record["name"], "selectable": reason is None,
                                "reason": reason or "Detected in the model environment; model verification may be required."})
            if len(options) == 1:
                options[0]["reason"] += " No compatible GPU runtime is available; setup may be required."
            with self.session.lock:
                self.inventory = probe
        except (InferenceFailure, OSError, ValueError, TypeError, KeyError):
            options[0]["reason"] += " The GPU runtime check did not complete; setup may be required."
        finally:
            with self.session.lock:
                self.options, self.discovering = options, False

    def _policy_block_reason(self):
        session = self.session
        if session.restarting:
            return "The service is restarting. Wait for the new session."
        if self.discovering or self.state in ("checking", "verifying"):
            return "Wait for runtime checks or model verification to finish."
        if session.active_run_id or session.demo.active_index is not None:
            return "Wait for the active scan to finish."
        if session.intake.enabled or session.demo.enabled:
            return "Pause folder intake and dataset replay before changing devices."
        if session.intake.pending:
            return ("Finish queued folder scans before changing devices. If the runtime has failed, export reviews "
                    "and record pending filenames, then deliberately restart from the terminal with -InferenceDevice cpu. "
                    "Restart clears the session queue; recover unfinished files manually.")
        if session.demo.completed_count < session.demo.batch_total:
            return ("Finish the replay batch before changing devices. If the runtime has failed, export reviews "
                    "and record the next replay position, then deliberately restart from the terminal with "
                    "-InferenceDevice cpu. Restart clears the session and replay position.")
        return None

    def choices(self):
        store = self.session.policy_store
        saved = store.saved_device if store else None
        default = saved or (self.settings.inference_device if self.settings.inference_device != "auto" else None)
        if default is None:
            available = [row["device"] for row in self.options if row["kind"] == "gpu" and row["selectable"]]
            selected = self.selected.inference_device if self.selected else None
            default = selected if selected in available else next(iter(available), "cpu")
        blocked = self._policy_block_reason()
        can_save = store is not None and blocked is None and any(row["selectable"] for row in self.options)
        can_save = can_save and any(row["selectable"] for row in self.model_options)
        can_restart = can_save and self.session.restart_callback is not None
        if blocked is None and not can_restart:
            blocked = ("Runtime preferences are unavailable for this service. Use the local launcher."
                       if store is None else "This service cannot restart itself. Save the choice, then restart it from the terminal.")
        return {"options": self.options, "default_device": default, "saved_device": saved,
                "model_options": self.model_options,
                "default_model_id": (store.saved_model_id if store and store.saved_model_id else self.settings.model_id),
                "saved_model_id": store.saved_model_id if store else None,
                "can_save": can_save, "can_restart": can_restart,
                "restart_block_reason": blocked, "restarting": self.session.restarting}

    def change_device(self, device, service_instance_id, restart):
        return self.change_selection(self.settings.model_id, device, service_instance_id, restart)

    def change_selection(self, model_id, device, service_instance_id, restart):
        with self.session.lock:
            self.session.require_mutable()
            if service_instance_id != self.session.directory.name:
                reject("stale_service", "The service session changed. Reconnect before choosing a device.")
            choice = next((row for row in self.options if row["device"] == device), None)
            if choice is None or not choice["selectable"]:
                reject("device_unavailable", "Choose an available CPU or GPU from this service.")
            model = next((row for row in self.model_options if row["id"] == model_id), None)
            if model is None or not model["selectable"]:
                reject("model_unavailable", "Choose an inspected model whose checkpoint is available in this service.")
            blocked = self._policy_block_reason()
            if blocked:
                reject("runtime_device_busy", blocked)
            if self.session.policy_store is None:
                reject("device_preferences_unavailable", "Use the local launcher to configure runtime preferences.")
            if restart and self.session.restart_callback is None:
                reject("restart_unavailable", "Save the choice for the next launch, then restart from the terminal.")
            candidate = self.settings.with_model(model_id)
            try:
                unchanged = (candidate.checkpoint is not None
                             and file_hash(candidate.checkpoint) == get_model(model_id).sha256)
            except OSError:
                unchanged = False
            if not unchanged:
                reject("model_unavailable", "The selected checkpoint changed or is unavailable. Review local model setup.")
            identity = None
            if device != "cpu":
                record = next(row for row in self.inventory["devices"] if device == f"cuda:{row['index']}")
                identity = device_identity(self.inventory, record)
            try:
                self.session.policy_store.save(device, identity, model_id)
            except (OSError, ValueError) as error:
                message = str(error) if isinstance(error, ValueError) else "Could not save the runtime preference. The active device is unchanged."
                reject("device_preference_not_saved", message)
            self.session.restarting = restart
            return {"model_id": model_id, "device": device, "restarting": restart, "runtime": self.snapshot()}

    def snapshot(self):
        with self.session.lock:
            idle = not (self.session.active_run_id or self.session.intake.enabled
                        or self.session.intake.pending or self.session.demo.enabled)
            return copy.deepcopy({
                "policy": self.settings.inference_device, "state": self.state,
                "ready": self.state == "ready" and not self.session.restarting, "selected_device": (
                    self.selected.inference_device if self.selected else None),
                "profile": self.selected.runtime_profile if self.selected else self.settings.runtime_profile,
                "device_name": self.device_record.get("name") if self.device_record else None,
                "reason": self.reason, "error": self.error,
                "verification_scan_id": self.verification_scan_id,
                "can_verify": self.state == "verification_required" and idle and not self.session.restarting,
                "model_verified": self.model_verified, "restart_required": self.restart_required,
                "choices": self.choices(),
            })

    def require_ready(self):
        self.session.require_mutable()
        if self.state != "ready":
            reject("runtime_not_ready", self.reason or "Wait for runtime verification.", 503)

    def request_record(self):
        return {"policy": self.settings.inference_device,
                "device": self.selected.inference_device, "profile": self.selected.runtime_profile,
                "model_id": self.selected.model_id,
                "selection_reason": self.selection_reason}

    def private_request(self):
        config = json.loads(json.dumps(asdict(self.selected), default=str))
        profiles = read_json(REPOSITORY / "environments/profiles.json", 64 * 1024)
        profile = next((row for row in profiles.values()
                        if isinstance(row, dict) and row.get("id") == self.selected.runtime_profile), None)
        return {"schema_version": "rayguard.execution-request.v1", **self.request_record(),
                "interpreter": str(self.selected.model_python),
                "backend": "cuda" if self.selected.inference_device.startswith("cuda:") else "cpu",
                "device_id": self.device_record.get("uuid") if self.device_record else None,
                "configuration": config,
                "configuration_sha256": hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest(),
                "runtime_profile_record": profile,
                "runtime_profiles_sha256": file_hash(REPOSITORY / "environments/profiles.json"),
                "qualification_fingerprint": self.fingerprint,
                "model": self.selected.model_record(),
                "class_map_sha256": get_model(self.selected.model_id).class_map_sha256,
                "model_catalog_sha256": file_hash(REPOSITORY / "src/sdp_xray/model_catalog.py"),
                "inference_script_sha256": file_hash(REPOSITORY / "scripts/infer_generic_yolov10.py"),
                "runtime_helper_sha256": file_hash(REPOSITORY / "src/sdp_xray/model_runtime.py")}

    def execution_record(self, execution):
        if execution is None:
            return None  # Legacy injected software-test runners provide no execution evidence.
        return {**execution, "policy": self.settings.inference_device,
                "profile": self.selected.runtime_profile, "selection_reason": self.selection_reason}

    def _cpu_settings(self):
        interpreter = self.settings.cpu_model_python or self.settings.model_python
        profile = (self.settings.runtime_profile if interpreter == self.settings.model_python
                   else "cpu-fallback")
        if interpreter is not None and interpreter != self.settings.model_python:
            try:
                marker = read_json(interpreter.parent.parent / "rayguard-setup.json", 64 * 1024)
                if isinstance(marker.get("profile"), str):
                    profile = marker["profile"]
            except (OSError, ValueError):
                pass
        return replace(self.settings, model_python=interpreter, inference_device="cpu",
                       runtime_profile=profile)

    def _cached(self, fingerprint):
        try:
            data = read_json(self.settings.runtime_state, 64 * 1024)
            return (data.get("schema_version") == "rayguard.runtime-qualification.v1"
                    and any(row.get("fingerprint") == fingerprint and row.get("verified") is True
                            for row in data.get("qualifications", []) if isinstance(row, dict)))
        except (OSError, ValueError, TypeError, AttributeError):
            return False

    def _select(self, settings, probe, reason):
        if self.session.policy_store is not None:
            try:
                self.session.policy_store.validate_probe(probe, settings.inference_device)
            except ValueError as error:
                raise InferenceFailure("saved_device_unavailable", str(error)) from error
        fingerprint = qualification_fingerprint(settings, probe, settings.inference_device)
        record = next((row for row in probe["devices"]
                       if settings.inference_device == f"cuda:{row['index']}"), None)
        verified = self._cached(fingerprint)
        runner = SubprocessRunner(
            settings, record.get("uuid") if record else None, freeze_runtime(settings, probe),
        )
        with self.session.lock:
            self.selected, self.device_record, self.fingerprint = settings, record, fingerprint
            self.model_verified = verified
            self.state = "ready" if verified else "verification_required"
            self.reason = reason if verified else f"{reason} Verify the model with an authorized scan."
            self.selection_reason = reason
            self.session.runner = runner

    def _initialize(self):
        self._discover_models()
        try:
            policy = self.settings.inference_device
            if policy == "cpu":
                selected = self._cpu_settings()
                self._discover_choices()
                checked = (self.inventory if selected.model_python == self.settings.model_python
                           and self.inventory is not None else probe_runtime(selected, "cpu"))
                self._select(selected, checked, "CPU runtime selected.")
                return
            inventory = probe_runtime(self.settings, "cpu")
            self._discover_choices(inventory)
            devices = [] if inventory.get("hip") else inventory["devices"]
            if policy == "auto":
                eligible = {row["device"] for row in self.options if row["selectable"]}
                devices = [row for row in devices if f"cuda:{row['index']}" in eligible]
                devices = sorted(devices, key=lambda row: (
                    -row["total_memory_bytes"], row.get("uuid") or row["name"], row["index"],
                ))
                if not devices:
                    raise InferenceFailure("cuda_unavailable", "No qualified NVIDIA GPU is available.")
                for row in devices:
                    if type(row.get("free_memory_bytes")) is int and row["free_memory_bytes"] <= 0:
                        continue
                    device = f"cuda:{row['index']}"
                    selected = replace(self.settings, inference_device=device)
                    try:
                        checked = probe_runtime(selected, device)
                        available = next(item for item in checked["devices"] if item["index"] == row["index"])
                        free = available.get("free_memory_bytes")
                        reason = (f"NVIDIA GPU selected; {free / 1024**2:.0f} MiB free at the runtime check."
                                  if type(free) is int else "NVIDIA GPU selected; free memory is unreported.")
                        self._select(selected, checked, reason)
                        return
                    except InferenceFailure:
                        continue
                raise InferenceFailure("cuda_unavailable", "No NVIDIA device passed its runtime check.")
            else:
                device = policy
            selected = replace(self.settings, inference_device=device)
            self._select(selected, probe_runtime(selected, device), "NVIDIA GPU selected.")
        except Exception as error:
            if self.settings.inference_device == "auto":
                try:
                    selected = self._cpu_settings()
                    self._select(selected, probe_runtime(selected, "cpu"),
                                 "CPU selected because the GPU runtime check did not pass.")
                    return
                except Exception:
                    pass
            with self.session.lock:
                self.state = "unavailable"
                self.reason = (error.message if isinstance(error, InferenceFailure)
                               and error.code == "saved_device_unavailable"
                               else "Runtime unavailable. Review local setup and restart the service.")
                self.error = {"code": error.code if isinstance(error, InferenceFailure)
                              else "runtime_unavailable", "message": self.reason}
                self.restart_required = True

    def verify(self, scan_id):
        with self.session.lock:
            self.session.require_mutable()
            if scan_id not in self.session.scans:
                reject("scan_not_found", "Upload an authorized image from this session.", 404)
            if not self.snapshot()["can_verify"]:
                reject("runtime_verification_busy", "Pause acquisition and wait for the detector to be idle.")
            self.session.check_storage()
            self.state = "verifying"
            self.reason = "Checking model execution on this scan; acquisition remains paused."
            self.error = None
            self.verification_scan_id = scan_id
            self.session.pool.submit(self._verify, scan_id)
            return self.snapshot()

    def _qualification_run(self, settings, scan, directory, device_id=None):
        output = directory / uuid4().hex
        result = SubprocessRunner(settings, device_id)(
            self.session.directory / f"{scan['id']}.png", output, .25,
        )
        if not isinstance(result, InferenceOutput) or result.execution is None:
            raise InferenceFailure("invalid_output", "Model verification requires execution evidence.")
        validate_prediction(result.prediction, scan, {"id": output.name, "confidence": .25}, settings)
        validate_execution(result.execution, settings.inference_device, device_id)
        return result.prediction

    def _save_qualification(self, fingerprints, scan, comparison):
        if self.settings.runtime_state is None:
            return  # Session-only qualification when no cache path was configured.
        target = self.settings.runtime_state
        rows = []
        try:
            old = read_json(target, 64 * 1024)
            if old.get("schema_version") == "rayguard.runtime-qualification.v1":
                rows = [row for row in old.get("qualifications", []) if isinstance(row, dict)
                        and row.get("fingerprint") not in fingerprints][-14:]
        except (OSError, ValueError, TypeError):
            pass
        rows += [{"fingerprint": value, "verified": True, "scan_sha256": scan["sha256"],
                  "comparison": comparison,
                  "verified_at": datetime.now(UTC).isoformat()} for value in fingerprints]
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f"{target.name}.{uuid4().hex}.tmp")
        try:
            temporary.write_text(json.dumps({"schema_version": "rayguard.runtime-qualification.v1",
                                             "qualifications": rows}, indent=2), encoding="utf-8")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)

    def _verify(self, scan_id):
        scan = self.session.scans[scan_id]
        cpu, cpu_fingerprint, cpu_result = self._cpu_settings(), None, None
        cpu_verified, comparison, directory = False, None, None
        try:
            directory = self.session.directory / f"verification-{uuid4().hex}"
            directory.mkdir()
            cpu_probe = probe_runtime(cpu, "cpu")
            cpu_fingerprint = qualification_fingerprint(cpu, cpu_probe, "cpu")
            if self.selected.inference_device == "cpu" and cpu_fingerprint != self.fingerprint:
                raise InferenceFailure("runtime_changed", "Runtime identity changed; restart before verification.")
            cpu_result = self._qualification_run(cpu, scan, directory)
            if qualification_fingerprint(cpu, probe_runtime(cpu, "cpu"), "cpu") != cpu_fingerprint:
                raise InferenceFailure("runtime_changed", "CPU runtime changed during verification; restart.")
            cpu_verified = True
            fingerprints = [cpu_fingerprint]
            comparison = {"mode": "cpu_execution_only", "nonempty_parity_checked": False,
                          "cpu_detection_count": len(cpu_result["detections"])}
            if self.selected.inference_device != "cpu":
                probe = probe_runtime(self.selected, self.selected.inference_device)
                fresh = qualification_fingerprint(self.selected, probe, self.selected.inference_device)
                if fresh != self.fingerprint:
                    raise InferenceFailure("runtime_changed", "Runtime identity changed; restart before verification.")
                gpu_result = self._qualification_run(
                    self.selected, scan, directory, self.device_record.get("uuid"),
                )
                if qualification_fingerprint(self.selected, probe_runtime(
                    self.selected, self.selected.inference_device), self.selected.inference_device) != fresh:
                    raise InferenceFailure("runtime_changed", "GPU runtime changed during verification; restart.")
                try:
                    comparison = {"mode": "cpu_gpu", **compare_predictions(cpu_result, gpu_result)}
                except ValueError as error:
                    raise InferenceFailure(
                        "runtime_parity_failed",
                        "CPU and GPU outputs differed beyond the fixed tolerances.",
                    ) from error
                fingerprints.append(fresh)
            (directory / "qualification.json").write_text(json.dumps({
                "status": "ok", "scan_sha256": scan["sha256"], "comparison": comparison,
                "fingerprints": fingerprints,
            }, indent=2), encoding="utf-8")
            self._save_qualification(fingerprints, scan, comparison)
            with self.session.lock:
                self.state, self.model_verified = "ready", True
                if self.selected.inference_device == "cpu":
                    self.fingerprint = cpu_fingerprint
                self.reason = "Model execution verified on the supplied scan; this is not an accuracy assessment."
                self.error = None
        except Exception as error:
            failure = error if isinstance(error, InferenceFailure) else InferenceFailure(
                "runtime_verification_failed", "Model verification failed. Review local evidence and setup.",
            )
            try:
                if directory is not None:
                    (directory / "qualification.json").write_text(json.dumps({
                        "status": "failed", "error_code": failure.code,
                        "scan_sha256": scan["sha256"], "cpu_verified": cpu_verified,
                        "comparison": comparison,
                    }, indent=2), encoding="utf-8")
            except OSError:
                pass
            # Auto may resolve to genuinely verified CPU only before ordinary jobs are admitted.
            if self.settings.inference_device == "auto" and cpu_verified:
                try:
                    self._save_qualification([cpu_fingerprint], scan, {
                        "mode": "cpu_execution_only", "nonempty_parity_checked": False,
                        "cpu_detection_count": len(cpu_result["detections"]),
                        "gpu_error_code": failure.code,
                    })
                    runner = SubprocessRunner(cpu, expectations=freeze_runtime(cpu, cpu_probe))
                    with self.session.lock:
                        self.selected, self.device_record, self.fingerprint = cpu, None, cpu_fingerprint
                        self.session.runner = runner
                        self.state, self.model_verified = "ready", True
                        self.reason = "CPU selected after GPU verification failed; CPU execution passed on this scan."
                        self.selection_reason = self.reason
                        self.error = {"code": failure.code, "message": failure.message}
                    return
                except OSError:
                    pass
            with self.session.lock:
                self.state = "unavailable" if failure.code == "runtime_changed" else "verification_required"
                self.restart_required = failure.code == "runtime_changed"
                self.model_verified = False
                self.error = {"code": failure.code, "message": failure.message}
                self.reason = failure.message

    def on_run_failure(self, failure):
        """Called while holding the session lock, before releasing the active run."""
        if failure["code"] == "runtime_changed":
            self.state, self.restart_required, self.model_verified = "unavailable", True, False
            self.error, self.reason = dict(failure), failure["message"]
            if self.session.intake.enabled:
                self.session.intake.fail(failure["code"], failure["message"])
            return
        persistent = failure["code"] in ("model_unavailable", "incompatible_runtime", "invalid_output", "storage_error")
        if persistent and self.session.intake.enabled:
            self.session.intake.fail(failure["code"], failure["message"])
        if not self.selected or not self.selected.inference_device.startswith("cuda:"):
            return
        if failure["code"] not in (*COMPUTE_ERRORS, "inference_timeout"):
            return
        self.error = dict(failure)
        self.reason = failure["message"]
        if failure["code"] in ("cuda_unavailable", "incompatible_runtime", "device_changed",
                               "cuda_execution_failed"):
            self.state, self.restart_required = "unavailable", True
        if self.session.intake.enabled:
            self.session.intake.fail(failure["code"], failure["message"])

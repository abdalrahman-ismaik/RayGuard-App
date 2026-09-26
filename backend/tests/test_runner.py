"""Synthetic process-boundary tests; no model import, inference, or download."""

import json
import os
import subprocess
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from sdp_xray.model_catalog import get_model

from rayguard_gui.config import APP_ROOT, REPOSITORY, Settings
from rayguard_gui.runner import InferenceFailure, SubprocessRunner, file_hash, freeze_runtime


def execution(device="cpu", identity=None):
    return {"schema_version": "rayguard.execution.v1", "requested_device": device,
            "actual_device": device, "backend": "cpu" if device == "cpu" else "cuda",
            "device_name": None if device == "cpu" else "Synthetic GPU", "device_id": identity,
            "precision": "float32", "python": "3.11.9", "torch": "2.9.0+cpu",
            "torchvision": "0.24.0+cpu", "cuda": None if device == "cpu" else "12.6",
            "cudnn": None}


def write_evidence(settings, image, output):
    spec = get_model(settings.model_id)
    output.mkdir()
    (output / "predictions.json").write_text(json.dumps({"synthetic": True}))
    return {"status": "ok", "run_id": output.name,
            "model_id": spec.id, "task": spec.task, "class_map_sha256": spec.class_map_sha256,
            "model_catalog_sha256": file_hash(REPOSITORY / "src/sdp_xray/model_catalog.py"),
            "checkpoint_sha256": settings.checkpoint_sha256, "input_sha256": file_hash(image),
            "script_sha256": file_hash(REPOSITORY / "scripts/infer_generic_yolov10.py"),
            "runtime_helper_sha256": file_hash(REPOSITORY / "src/sdp_xray/model_runtime.py"),
            "output_sha256": {"predictions.json": file_hash(output / "predictions.json")},
            "forwards": [{"shape": [1, 3, 640, 640], "input_device": settings.inference_device,
                          "model_device": settings.inference_device, "input_dtype": "torch.float32",
                          "model_dtype": "torch.float32"}], "prediction_input_shape": [1, 3, 640, 640],
            "execution": execution(settings.inference_device)}


def test_subprocess_is_fixed_argv_bounded_and_has_no_shell(monkeypatch, tmp_path):
    settings = Settings(model_python=Path("python space.exe"), checkpoint=Path("safe weights.pt"),
                        checkpoint_sha256="a" * 64, timeout_seconds=7)
    output = tmp_path / "run-id"
    image = tmp_path / "image.png"
    image.write_bytes(b"synthetic pixels")
    calls = []

    def synthetic_process(command, **kwargs):
        calls.append((command, kwargs))
        manifest = write_evidence(settings, image, output)
        (output / "manifest.json").write_text(json.dumps(manifest))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, "run", synthetic_process)
    observed = SubprocessRunner(settings)(image, output, .25)
    assert observed.prediction == {"synthetic": True}
    assert observed.execution == execution()
    command, options = calls[0]
    assert command == [
        "python space.exe", str(REPOSITORY / "scripts" / "infer_generic_yolov10.py"),
        "safe weights.pt", str(tmp_path / "image.png"), str(output),
        "--checkpoint-sha256", "a" * 64, "--confidence", "0.25",
        "--device", "cpu",
        "--model", settings.model_id,
    ]
    assert options["shell"] is False and options["timeout"] == 7
    assert options["cwd"] == REPOSITORY == APP_ROOT / "engine"
    assert options["stdin"] == subprocess.DEVNULL
    assert options["creationflags"] == (subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)


@pytest.mark.parametrize("error,code", [
    (subprocess.TimeoutExpired(["python"], 1), "inference_timeout"),
    (OSError("private absolute path"), "model_unavailable"),
])
def test_process_errors_are_sanitized(monkeypatch, tmp_path, error, code):
    def fails(*args, **kwargs):
        raise error

    monkeypatch.setattr(subprocess, "run", fails)
    with pytest.raises(InferenceFailure) as observed:
        SubprocessRunner(Settings())(tmp_path / "image.png", tmp_path / "run", .25)
    assert observed.value.code == code
    assert "private absolute path" not in str(observed.value)


def test_nonzero_process_cannot_return_predictions(monkeypatch, tmp_path):
    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: SimpleNamespace(returncode=1))
    with pytest.raises(InferenceFailure, match="could not complete"):
        SubprocessRunner(replace(Settings(), storage_dir=tmp_path))(
            tmp_path / "image.png", tmp_path / "run", .25
        )


@pytest.mark.parametrize("change", [
    lambda m: m.update(run_id="wrong"),
    lambda m: m.update(input_sha256="0" * 64),
    lambda m: m.update(checkpoint_sha256="0" * 64),
    lambda m: m.update(model_id="author-yolov10m-device"),
    lambda m: m.update(task="iedxray.device_detection"),
    lambda m: m.update(class_map_sha256="0" * 64),
    lambda m: m.update(model_catalog_sha256="0" * 64),
    lambda m: m["output_sha256"].update({"predictions.json": "0" * 64}),
    lambda m: m["execution"].update(actual_device="cuda:0"),
    lambda m: m["execution"].update(precision="float16"),
    lambda m: m["execution"].update(private_path="C:/private/checkpoint"),
    lambda m: m["forwards"][0].update(model_dtype="torch.float16"),
    lambda m: m["forwards"][0].update(input_device="cuda:99"),
])
def test_bound_execution_evidence_fails_closed(monkeypatch, tmp_path, change):
    settings = Settings(checkpoint_sha256="a" * 64)
    image, output = tmp_path / "image.png", tmp_path / "output"
    image.write_bytes(b"synthetic")

    def process(*args, **kwargs):
        manifest = write_evidence(settings, image, output)
        change(manifest)
        (output / "manifest.json").write_text(json.dumps(manifest))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, "run", process)
    with pytest.raises(InferenceFailure) as observed:
        SubprocessRunner(settings)(image, output, .25)
    assert observed.value.code == "invalid_output"
    assert "private" not in str(observed.value)


@pytest.mark.parametrize("code", ["cuda_oom", "cuda_unavailable", "device_changed", "unknown"])
def test_compute_error_codes_are_allowlisted_without_stderr_parsing(monkeypatch, tmp_path, code):
    output = tmp_path / "failed"
    image = tmp_path / "image.png"
    image.write_bytes(b"synthetic")
    settings = Settings(checkpoint_sha256="a" * 64)
    manifest = write_evidence(settings, image, output)
    manifest.update({
        "status": "error", "error_code": code, "error": "C:/private/token-secret",
    })
    (output / "manifest.json").write_text(json.dumps(manifest))
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=1))
    with pytest.raises(InferenceFailure) as observed:
        SubprocessRunner(settings)(image, output, .25)
    assert observed.value.code == ("inference_failed" if code == "unknown" else code)
    assert "private" not in str(observed.value)


@pytest.mark.parametrize("change", [
    None,
    lambda m: m["execution"].update(torch="2.9.1+cpu"),
    lambda m: m["execution"].update(cudnn=91003),
    lambda m: m["runtime_identity"].update(packages_sha256="c" * 64),
    lambda m: m["runtime_identity"].update(upstream_code_sha256="d" * 64),
    lambda m: m.update(upstream_revision="changed"),
    lambda m: m.update(driver_devices=[{"driver": "changed"}]),
    lambda m: m.update(visibility_mask="0"),
])
def test_qualified_run_requires_frozen_runtime_identity(monkeypatch, tmp_path, change):
    image, interpreter, output = tmp_path / "image.png", tmp_path / "python.exe", tmp_path / "output"
    image.write_bytes(b"synthetic")
    interpreter.touch()
    settings = Settings(model_python=interpreter, checkpoint_sha256="a" * 64)
    probe = {**execution(), "packages_sha256": "a" * 64, "upstream_code_sha256": "b" * 64,
             "driver_devices": [{"driver": "synthetic"}], "visibility_mask": None,
             "upstream_revision": "synthetic-revision"}
    runner = SubprocessRunner(settings, expectations=freeze_runtime(settings, probe))

    def process(*args, **kwargs):
        manifest = write_evidence(settings, image, output)
        manifest.update(runtime_identity={key: probe[key] for key in (
            "packages_sha256", "upstream_code_sha256",
        )}, driver_devices=probe["driver_devices"], visibility_mask=None,
            upstream_revision=probe["upstream_revision"])
        if change:
            change(manifest)
        (output / "manifest.json").write_text(json.dumps(manifest))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, "run", process)
    if change is None:
        assert runner(image, output, .25).prediction == {"synthetic": True}
    else:
        with pytest.raises(InferenceFailure) as observed:
            runner(image, output, .25)
        assert observed.value.code == "runtime_changed"


@pytest.mark.parametrize("during_process", [False, True])
@pytest.mark.parametrize("kind", ["profile", "checkpoint"])
def test_qualified_source_mutation_cannot_start_or_publish(monkeypatch, tmp_path, during_process, kind):
    interpreter, source = tmp_path / "python.exe", tmp_path / "profile.json"
    interpreter.touch()
    source.write_text("reviewed")
    settings = Settings(model_python=interpreter, checkpoint=source if kind == "checkpoint" else None,
                        checkpoint_sha256=file_hash(source))
    expected = freeze_runtime(settings, {})
    if kind == "profile":
        expected["files"][str(source)] = file_hash(source)
    runner = SubprocessRunner(settings, expectations=expected)
    calls = []

    def process(*args, **kwargs):
        calls.append(True)
        source.write_text("changed")
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(subprocess, "run", process)
    if not during_process:
        source.write_text("changed")
    with pytest.raises(InferenceFailure) as observed:
        runner(tmp_path / "image.png", tmp_path / "output", .25)
    assert observed.value.code == "runtime_changed"
    assert bool(calls) is during_process


def test_frozen_sources_bind_app_adapters_and_engine_separately(tmp_path):
    interpreter = tmp_path / "python.exe"
    interpreter.touch()
    frozen = freeze_runtime(Settings(model_python=interpreter), {})["files"]
    for name in ("runner.py", "runtime.py"):
        source = APP_ROOT / "backend/src/rayguard_gui" / name
        assert frozen[str(source)] == file_hash(source)
    source = REPOSITORY / "scripts/infer_generic_yolov10.py"
    assert frozen[str(source)] == file_hash(source)
    assert not any(Path(name).is_relative_to(REPOSITORY / "app") for name in frozen)

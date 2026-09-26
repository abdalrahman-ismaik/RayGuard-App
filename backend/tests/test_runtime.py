"""Synthetic runtime/queue/provenance checks; no Torch import or GPU execution."""

import copy
import json
from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sdp_xray.model_catalog import DEFAULT_MODEL_ID, MODELS
from test_api import image_bytes, synthetic_result, upload
from test_demo import StepPool
from test_runner import execution

from rayguard_gui import api, runtime
from rayguard_gui.api import create_app
from rayguard_gui.config import Settings
from rayguard_gui.demo import DatasetDemo
from rayguard_gui.intake import FolderIntake
from rayguard_gui.runner import InferenceFailure, InferenceOutput, file_hash
from rayguard_gui.runtime import compare_predictions, qualification_fingerprint


@pytest.fixture
def environment(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime.platform, "system", lambda: "Windows")
    monkeypatch.setattr(runtime.platform, "machine", lambda: "AMD64")
    monkeypatch.setattr(api, "ThreadPoolExecutor", StepPool)
    monkeypatch.setattr(FolderIntake, "_loop", lambda self: self.stopped.wait())
    monkeypatch.setattr(DatasetDemo, "_loop", lambda self: self.stopped.wait())
    interpreter, cpu, checkpoint = [tmp_path / name for name in ("gpu.exe", "cpu.exe", "weights.pt")]
    for path in (interpreter, cpu, checkpoint):
        path.touch()
    monkeypatch.setitem(MODELS, DEFAULT_MODEL_ID, replace(MODELS[DEFAULT_MODEL_ID], sha256=file_hash(checkpoint)))
    incoming, source = tmp_path / "incoming", tmp_path / "test"
    incoming.mkdir()
    source.mkdir()
    (source / "Test000001.jpg").write_bytes(image_bytes("JPEG"))
    settings = Settings(model_python=interpreter, cpu_model_python=cpu, checkpoint=checkpoint,
                        checkpoint_sha256=file_hash(checkpoint), storage_dir=tmp_path / "runs",
                        inference_device="auto", runtime_profile="manual",
                        runtime_verification_required=True, runtime_state=tmp_path / "runtime.local.json",
                        incoming_dir=incoming, demo_dir=source)
    state = {"gpu_failure": None, "probe_failure": None, "devices": [
        {"index": 0, "name": "Synthetic GPU", "capability": [7, 5],
         "total_memory_bytes": 6 * 1024**3, "free_memory_bytes": 4 * 1024**3, "uuid": "GPU-test"},
    ], "driver": "591.74", "bad_execution": False}
    calls = []

    def probe(config, device):
        if device == state["probe_failure"]:
            raise InferenceFailure("runtime_unavailable", "Synthetic unavailable device.")
        return {"schema_version": "rayguard.runtime-probe.v1", "status": "ok", "cpu_ok": True,
                "selected_device": device, "kernel_ok": True, "driver": state["driver"],
                "python": "3.11.9", "torch": "2.9.0+cu126", "torchvision": "0.24.0+cu126",
                "cuda": "12.6", "hip": None, "cudnn": 91002, "host_id": "synthetic-host",
                "upstream_revision": runtime.UPSTREAM_REVISION, "devices": copy.deepcopy(state["devices"]),
                "packages_sha256": "a" * 64, "upstream_code_sha256": "b" * 64}

    class Runner:
        def __init__(self, config, expected_device_id=None, expectations=None):
            self.settings, self.identity = config, expected_device_id

        def __call__(self, image, output, confidence):
            calls.append(self.settings.inference_device)
            if self.settings.inference_device != "cpu" and state["gpu_failure"]:
                raise InferenceFailure(state["gpu_failure"], "Synthetic GPU failure.")
            prediction = synthetic_result(image, output, confidence)
            prediction["model"]["provenance"] = f"sha256:{self.settings.checkpoint_sha256}"
            observed = execution(self.settings.inference_device, self.identity)
            if state["bad_execution"]:
                observed["actual_device"] = "cuda:99"
            return InferenceOutput(prediction, observed)

    monkeypatch.setattr(runtime, "probe_runtime", probe)
    monkeypatch.setattr(runtime, "SubprocessRunner", Runner)
    return SimpleNamespace(settings=settings, state=state, calls=calls, probe=probe, runner=Runner)


def status(client):
    return client.get("/api/health").json()["runtime"]


def qualify(client):
    session = client.app.state.session
    session.pool.finish()
    scan = upload(client).json()
    response = client.post("/api/runtime/verify", json={"scan_id": scan["id"]})
    assert response.status_code == 202, response.text
    session.pool.finish()
    return scan


def test_startup_pending_verification_and_all_source_admission(environment):
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        scan = upload(client).json()
        assert status(client)["state"] == "checking"
        assert not status(client)["can_verify"]
        assert len(session.pool.jobs) == 1
        for _ in range(3):
            client.get("/api/health")
        assert len(session.pool.jobs) == 1  # Health never launches a probe.
        session.pool.finish()
        assert status(client)["state"] == "verification_required"
        assert status(client)["can_verify"] and not status(client)["model_verified"]
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).status_code == 503
        assert client.post("/api/intake", json={"enabled": True, "confidence": .25}).status_code == 503
        assert client.post("/api/demo", json={"action": "start"}).status_code == 503
        assert not session.intake.initialized and not session.demo.enabled
        assert client.post("/api/runtime/verify", json={"scan_id": scan["id"]}).status_code == 202
        assert status(client)["state"] == "verifying"
        assert client.post("/api/runtime/verify", json={"scan_id": scan["id"]}).status_code == 409
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).status_code == 503
        session.pool.finish()
        assert environment.calls == ["cpu", "cuda:0"]
        assert status(client)["ready"] and status(client)["model_verified"]
        assert not status(client)["can_verify"]
        assert client.get("/api/runs").json() == {"items": []}
        assert client.get("/api/health").json()["active_run_id"] is None
        assert str(environment.settings.model_python) not in client.get("/api/health").text
        proof = json.loads(environment.settings.runtime_state.read_text())
        assert proof["qualifications"][-1]["comparison"]["nonempty_parity_checked"] is False
        run = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        session.pool.finish()
        completed = client.get(f"/api/runs/{run['id']}").json()
        assert completed["execution"]["actual_device"] == "cuda:0"
        assert completed["execution_request"]["policy"] == "auto"
        assert client.get(f"/api/runs/{run['id']}/export").json()["run"] == completed


def test_cache_reused_only_for_unchanged_identity_not_transient_free_memory(environment):
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        qualify(client)
    environment.state["devices"][0]["free_memory_bytes"] -= 100
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert status(client)["ready"]
        assert environment.calls == ["cpu", "cuda:0"]
    environment.state["driver"] = "changed-driver"
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert status(client)["state"] == "verification_required"


@pytest.mark.parametrize("policy, expected", [("auto", "verification_required"), ("cuda:0", "unavailable")])
def test_initial_gpu_failure_falls_back_only_in_auto(environment, policy, expected):
    environment.state["probe_failure"] = "cuda:0"
    with TestClient(create_app(replace(environment.settings, inference_device=policy)),
                    base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        observed = status(client)
        assert observed["state"] == expected and not observed["ready"]
        assert observed["selected_device"] == ("cpu" if policy == "auto" else None)
        assert not environment.calls


def test_auto_tries_another_gpu_after_first_candidate_fails_probe(environment):
    environment.state["probe_failure"] = "cuda:0"
    environment.state["devices"].append({**environment.state["devices"][0], "index": 1, "uuid": "GPU-second"})
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert status(client)["selected_device"] == "cuda:1"


@pytest.mark.parametrize("policy, expected_device, ready", [("auto", "cpu", True), ("cuda:0", "cuda:0", False)])
def test_gpu_qualification_failure_never_claims_gpu_verified(environment, policy, expected_device, ready):
    environment.state["gpu_failure"] = "cuda_oom"
    with TestClient(create_app(replace(environment.settings, inference_device=policy)),
                    base_url="http://127.0.0.1") as client:
        qualify(client)
        observed = status(client)
        assert observed["selected_device"] == expected_device and observed["ready"] is ready
        assert observed["model_verified"] is ready
        assert observed["error"]["code"] == "cuda_oom"
        assert environment.calls == ["cpu", "cuda:0"]
        assert not client.get("/api/runs").json()["items"]


def test_wrong_execution_identity_cannot_qualify_cpu_or_gpu(environment):
    environment.state["bad_execution"] = True
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        qualify(client)
        assert not status(client)["ready"] and not status(client)["model_verified"]
        assert not environment.settings.runtime_state.exists()


@pytest.mark.parametrize("code,ready", [("cuda_oom", True), ("inference_timeout", True),
                                        ("device_changed", False), ("cuda_execution_failed", False)])
def test_gpu_failure_pauses_intake_before_next_dispatch_and_retains_work(environment, code, ready):
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        first = qualify(client)
        second = upload(client, filename="second.png").json()
        session = client.app.state.session
        selection_reason = session.runtime.request_record()["selection_reason"]
        client.post("/api/intake", json={"enabled": True, "confidence": .25})
        for scan in (first, second):
            session.intake.pending.append({"id": uuid4().hex, "scan": scan, "confidence": .25})
        environment.state["gpu_failure"] = code
        session.intake._dispatch()
        session.pool.finish()
        assert session.active_run_id is None
        assert not session.intake.enabled and len(session.intake.pending) == 1
        assert session.intake.pending[0]["scan"]["id"] == second["id"]
        observed = status(client)
        assert observed["ready"] is ready and observed["restart_required"] is not ready
        assert observed["selected_device"] == "cuda:0"  # No mid-session CPU fallback.
        failed = client.get("/api/runs").json()["items"][0]
        assert failed["state"] == "failed" and failed["result"] is None
        assert failed["scan_id"] == first["id"]
        environment.state["gpu_failure"] = None
        response = client.post("/api/runs", json={"scan_id": first["id"], "confidence": .25})
        assert response.status_code == (202 if ready else 503)
        if ready:
            session.pool.finish()
            retried = client.get(f"/api/runs/{response.json()['id']}").json()
            assert retried["state"] == "succeeded"
            assert retried["execution"]["selection_reason"] == selection_reason


@pytest.mark.parametrize("device", ["cpu", "cuda:0"])
def test_runtime_mutation_quarantines_either_device_and_preserves_pending_scans(environment, device):
    with TestClient(create_app(replace(environment.settings, inference_device=device)),
                    base_url="http://127.0.0.1") as client:
        scan = qualify(client)
        session = client.app.state.session
        client.post("/api/intake", json={"enabled": True, "confidence": .25})

        def changed_runtime(*args):
            raise InferenceFailure("runtime_changed", "Runtime changed.")

        session.runner = changed_runtime
        for _ in range(2):
            session.intake.pending.append({"id": uuid4().hex, "scan": scan, "confidence": .25})
        session.intake._dispatch()
        session.pool.finish()
        observed = status(client)
        assert not observed["ready"] and not observed["model_verified"]
        assert observed["restart_required"] and observed["selected_device"] == device
        assert not session.intake.enabled and len(session.intake.pending) == 1
        failed = client.get("/api/runs").json()["items"][0]
        assert failed["state"] == "failed" and failed["result"] is None
        assert failed["error"]["code"] == "runtime_changed"
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).status_code == 503


@pytest.mark.parametrize("value", ["cuda", "cuda:-1", "cuda:00", "cuda:0,1", "mps", "", None, True])
def test_config_rejects_ambiguous_or_unsupported_device(tmp_path, value):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"inference_device": value}))
    with pytest.raises(ValueError):
        Settings.from_file(path)


def test_fingerprint_changes_with_code_environment_and_visibility(environment, monkeypatch):
    config = environment.settings
    probe = environment.probe(config, "cuda:0")
    first = qualification_fingerprint(config, probe, "cuda:0")
    changed = {**probe, "packages_sha256": "c" * 64}
    assert qualification_fingerprint(config, changed, "cuda:0") != first
    with monkeypatch.context() as patch:
        patch.setattr(runtime, "file_hash", lambda path: "d" * 64
                      if path == runtime.APP_ROOT / "backend/src/rayguard_gui/runner.py"
                      else file_hash(path))
        assert qualification_fingerprint(config, probe, "cuda:0") != first
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "GPU-test")
    assert qualification_fingerprint(config, probe, "cuda:0") != first


def test_cpu_runtime_change_before_verification_blocks_admission(environment):
    config = replace(environment.settings, inference_device="cpu")
    with TestClient(create_app(config), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        scan = upload(client).json()
        environment.state["driver"] = "changed-after-start"
        client.post("/api/runtime/verify", json={"scan_id": scan["id"]})
        client.app.state.session.pool.finish()
        observed = status(client)
        assert observed["state"] == "unavailable" and observed["restart_required"]
        assert not observed["model_verified"] and not environment.calls


def test_cpu_runtime_change_during_verification_cannot_enable_auto_fallback(environment, monkeypatch):
    class ChangingRunner(environment.runner):
        def __call__(self, *args):
            observed = super().__call__(*args)
            environment.state["driver"] = "changed-during-forward"
            return observed

    monkeypatch.setattr(runtime, "SubprocessRunner", ChangingRunner)
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        qualify(client)
        assert not status(client)["ready"]
        assert not status(client)["model_verified"]
        assert environment.calls == ["cpu"]
        assert not environment.settings.runtime_state.exists()


def test_failed_probe_retains_only_bounded_private_diagnostics(tmp_path, monkeypatch):
    def process(command, **options):
        assert options["timeout"] == 120
        options["stdout"].write(json.dumps({
            "schema_version": "rayguard.runtime-probe.v1", "status": "error",
            "error_code": "cuda_unavailable",
        }).encode())
        options["stderr"].write(b"private diagnostic C:/secret/path\n" + b"x" * 100_000)
        return SimpleNamespace(returncode=1)

    monkeypatch.setattr(runtime.subprocess, "run", process)
    with pytest.raises(InferenceFailure) as observed:
        runtime.probe_runtime(Settings(storage_dir=tmp_path), "cuda:0")
    assert observed.value.code == "cuda_unavailable"
    assert "secret" not in str(observed.value)
    records = list((tmp_path / "runtime-checks").glob("*.log"))
    assert len(records) == 1 and records[0].stat().st_size < 2 * runtime.PROBE_LIMIT + 2048
    assert "C:/secret/path" in records[0].read_text()


def test_managed_profile_cannot_claim_different_torch_build(environment):
    profiles = json.loads((runtime.REPOSITORY / "environments/profiles.json").read_text())
    config = replace(environment.settings, runtime_profile=profiles["cpu"]["id"])
    with pytest.raises(InferenceFailure) as observed:
        qualification_fingerprint(config, environment.probe(config, "cpu"), "cpu")
    assert observed.value.code == "incompatible_runtime"


def test_no_free_memory_candidate_is_not_selected(environment):
    environment.state["devices"][0]["free_memory_bytes"] = 0
    with TestClient(create_app(environment.settings), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert status(client)["selected_device"] == "cpu"
        assert not status(client)["ready"]  # CPU also needs actual model verification.


def result(boxes):
    return {"status": "ok", "image": {"width": 300, "height": 300}, "threshold": .25,
            "model": {"id": "synthetic", "task": "synthetic", "provenance": "synthetic"},
            "detections": [{"id": str(i), "kind": "suspicious_region", "device_id": None,
                            "category": {"namespace": "synthetic", "label": "example"},
                            "box_xyxy": box, "confidence": .7} for i, box in enumerate(boxes)]}


def test_parity_handles_reordering_and_ambiguous_matches_without_greedy_failure():
    cpu = result([[10, 10, 110, 110], [10.4, 10, 110.4, 110]])
    gpu = result([[10.1, 10, 110.1, 110], [9.6, 10, 109.6, 110]])
    assert compare_predictions(cpu, gpu)["matched_count"] == 2
    gpu["detections"].reverse()
    assert compare_predictions(cpu, gpu)["nonempty_parity_checked"] is True
    assert compare_predictions(result([]), result([]))["nonempty_parity_checked"] is False


@pytest.mark.parametrize("change", [
    lambda r: r.update(threshold=.3),
    lambda r: r["image"].update(width=299),
    lambda r: r["detections"].clear(),
    lambda r: r["detections"][0]["category"].update(label="wrong"),
    lambda r: r["detections"][0].update(confidence=.702),
    lambda r: r["detections"][0].update(box_xyxy=[11, 10, 111, 110]),
])
def test_parity_rejects_count_class_threshold_coordinate_and_score_changes(change):
    cpu = result([[10, 10, 110, 110]])
    gpu = copy.deepcopy(cpu)
    change(gpu)
    with pytest.raises(ValueError):
        compare_predictions(cpu, gpu)

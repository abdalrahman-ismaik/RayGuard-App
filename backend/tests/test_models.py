"""Synthetic model routing and task isolation, not model inference evidence."""

import copy
import json
from dataclasses import replace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sdp_xray.model_catalog import DEFAULT_MODEL_ID, MODELS, get_model
from test_runner import write_evidence
from test_runtime import environment as environment
from test_runtime import qualify
from test_runtime_policy import configured as configured

from rayguard_gui import comparison, runtime
from rayguard_gui.api import create_app
from rayguard_gui.config import Settings
from rayguard_gui.runner import InferenceOutput, SubprocessRunner, file_hash, validate_prediction
from rayguard_gui.runtime import qualification_fingerprint
from rayguard_gui.runtime_policy import PolicyStore

DEVICE_MODEL = "author-yolov10m-device"
SPECIFIC_MODEL = "author-yolov10m-specific"


@pytest.fixture
def models(configured, monkeypatch):
    paths = {}
    for spec in list(MODELS.values()):
        path = configured.settings.checkpoint.parent / spec.filename
        path.write_bytes(f"synthetic {spec.id}".encode())
        paths[spec.id] = path
        monkeypatch.setitem(MODELS, spec.id, replace(spec, sha256=file_hash(path)))
    configured.settings = replace(configured.settings, checkpoint=paths[DEFAULT_MODEL_ID],
                                  checkpoint_sha256=MODELS[DEFAULT_MODEL_ID].sha256,
                                  model_checkpoints=paths)
    configured.store.load(configured.settings)

    class ModelRunner(configured.runner):
        def __call__(self, image, output, confidence):
            observed = super().__call__(image, output, confidence)
            result = observed.prediction
            spec = get_model(self.settings.model_id)
            result["model"] = {"id": spec.id, "task": spec.task,
                               "provenance": f"sha256:{self.settings.checkpoint_sha256}"}
            result["detections"] = [{"id": "synthetic", "kind": spec.kind,
                                     "category": {"namespace": spec.task, "label": spec.classes[0]},
                                     "box_xyxy": [1, 1, 6, 6], "confidence": .8, "device_id": None}]
            return InferenceOutput(result, observed.execution)

    monkeypatch.setattr(runtime, "SubprocessRunner", ModelRunner)
    return configured


def select(client, model_id, *, device="cpu", restart=False, instance=None):
    return client.post("/api/runtime/selection", json={
        "model_id": model_id, "device": device, "restart": restart,
        "service_instance_id": instance or client.get("/api/health").json()["service_instance_id"],
    })


def test_map_only_config_selects_model_and_preserves_all_paths(models, tmp_path):
    config = tmp_path / "mapped.local.json"
    config.write_text(json.dumps({
        "model_id": DEVICE_MODEL, "model_python": str(models.settings.model_python),
        "model_checkpoints": {key: str(path) for key, path in models.settings.model_checkpoints.items()},
    }))
    settings = Settings.from_file(config)
    assert settings.model_status()["configured"]
    assert settings.checkpoint == models.settings.model_checkpoints[DEVICE_MODEL]
    assert settings.checkpoint_sha256 == MODELS[DEVICE_MODEL].sha256
    switched = settings.with_model(SPECIFIC_MODEL).with_model(DEFAULT_MODEL_ID)
    assert switched.checkpoint == models.settings.checkpoint
    assert switched.model_python == settings.model_python


def test_only_three_inspected_models_are_selectable_and_missing_hash_stays_disabled(models):
    models.settings.model_checkpoints[DEVICE_MODEL].write_bytes(b"wrong checkpoint")
    with TestClient(create_app(models.settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        session.pool.finish()
        options = client.get("/api/health").json()["runtime"]["choices"]["model_options"]
        assert len(options) == 8
        assert {row["id"] for row in options if row["selectable"]} == {DEFAULT_MODEL_ID, SPECIFIC_MODEL}
        assert all(not row["selectable"] for row in options if row["family"] != "YOLOv10-M")
        assert select(client, DEVICE_MODEL).status_code == 409
        assert select(client, "unverified-detr").status_code == 409
        assert select(client, "C:/private/weights.pt").status_code == 409
        assert not models.store.path.exists()
        assert not models.calls


def test_combined_selection_is_atomic_frozen_until_restart_and_requires_new_model_verification(models):
    restarts = []
    with TestClient(create_app(models.settings, policy_store=models.store,
                              restart_callback=lambda: restarts.append(True)), base_url="http://127.0.0.1") as client:
        first_scan = qualify(client)
        session = client.app.state.session
        original_instance = session.directory.name
        first = client.post("/api/runs", json={"scan_id": first_scan["id"], "confidence": .25}).json()
        session.pool.finish()
        response = select(client, DEVICE_MODEL, device="cpu")
        assert response.status_code == 200 and not restarts
        assert client.get("/api/health").json()["model"]["id"] == DEFAULT_MODEL_ID
        saved = json.loads(models.store.path.read_text())
        assert saved["model_id"] == DEVICE_MODEL and saved["device"] == "cpu"
        old = client.get(f"/api/runs/{first['id']}").json()
        assert old["model"]["id"] == old["result"]["model"]["id"] == DEFAULT_MODEL_ID
        assert select(client, DEVICE_MODEL, restart=True).status_code == 202
        assert restarts == [True]
    settings = models.store.load(models.settings)
    with TestClient(create_app(settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        session.pool.finish()
        health = client.get("/api/health").json()
        assert health["service_instance_id"] != original_instance
        assert health["model"]["id"] == DEVICE_MODEL
        assert health["runtime"]["state"] == "verification_required"
        assert not health["runtime"]["model_verified"]
        assert select(client, DEFAULT_MODEL_ID, instance=original_instance).status_code == 409


@pytest.mark.parametrize("model_id", list(MODELS))
def test_each_model_routes_its_names_kind_and_recorded_identity(models, model_id):
    settings = models.settings.with_model(model_id)
    with TestClient(create_app(settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        scan = qualify(client)
        created = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        assert created["model"]["id"] == model_id
        client.app.state.session.pool.finish()
        run = client.get(f"/api/runs/{created['id']}").json()
        spec = MODELS[model_id]
        assert run["state"] == "succeeded"
        assert run["model"]["classes"] == list(spec.classes)
        assert run["result"]["model"]["id"] == model_id
        detection = run["result"]["detections"][0]
        assert detection["category"] == {"namespace": spec.task, "label": spec.classes[0]}
        assert detection["kind"] == spec.kind and detection["device_id"] is None
        exported = client.get(f"/api/runs/{run['id']}/export").json()
        assert exported["run"]["model"] == run["model"]
        scopes = {DEFAULT_MODEL_ID: "Generic explosive localization only.",
                  DEVICE_MODEL: "Electronic-device localization only; device presence does not establish an explosive threat.",
                  SPECIFIC_MODEL: "Class-specific suspicious-region localization only; these labels are not a whole-device safety classification."}
        assert exported["limitations"][1] == f"{scopes[model_id]} Full P1/P2 are not implemented."


@pytest.mark.parametrize("recorded,expected", [
    ({"id": DEFAULT_MODEL_ID, "task": MODELS[DEFAULT_MODEL_ID].task}, "Generic explosive localization only."),
    ({"id": "unknown", "task": MODELS[DEFAULT_MODEL_ID].task}, "Recorded model identity is unavailable or unrecognized"),
    ({"id": DEFAULT_MODEL_ID, "task": MODELS[DEVICE_MODEL].task}, "Recorded model identity is unavailable or unrecognized"),
    (None, "Recorded model identity is unavailable or unrecognized"),
])
def test_historical_export_uses_recorded_result_model_not_current_settings(models, recorded, expected):
    with TestClient(create_app(models.settings.with_model(SPECIFIC_MODEL), policy_store=models.store),
                    base_url="http://127.0.0.1") as client:
        scan = qualify(client)
        created = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        session = client.app.state.session
        session.pool.finish()
        # Pre-snapshot history records model identity only in the saved prediction.
        with session.lock:
            run = session.runs[created["id"]]
            run.pop("model")
            run["result"]["model"] = recorded
        exported = client.get(f"/api/runs/{created['id']}/export").json()
        assert exported["limitations"][1].startswith(expected)
        assert "Class-specific" not in exported["limitations"][1]


@pytest.mark.parametrize("model_id", [DEVICE_MODEL, SPECIFIC_MODEL])
def test_non_generic_models_never_load_generic_reference_boxes(models, monkeypatch, model_id):
    def forbidden(*args):
        raise AssertionError("Generic annotation bytes must not be loaded for another task")

    monkeypatch.setattr(comparison, "bounded_read", forbidden)
    settings = replace(models.settings.with_model(model_id), demo_annotations=models.settings.checkpoint)
    with TestClient(create_app(settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        scan = qualify(client)
        created = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        client.app.state.session.pool.finish()
        observed = client.get(f"/api/runs/{created['id']}/comparison").json()
        assert observed["status"] == "unavailable" and observed["boxes"] == []
        assert observed["evaluation"] is None and "different task" in observed["reason"]


def test_missing_current_model_can_recover_to_an_available_model_and_cpu(models):
    models.settings.checkpoint.unlink()
    with TestClient(create_app(models.settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert not client.get("/api/health").json()["model"]["configured"]
        assert select(client, SPECIFIC_MODEL, device="cpu").status_code == 200


def test_failed_run_retains_requested_model_identity(models):
    settings = models.settings.with_model(DEVICE_MODEL)
    with TestClient(create_app(settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        scan = qualify(client)
        models.state["gpu_failure"] = "cuda_oom"
        created = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        client.app.state.session.pool.finish()
        failed = client.get(f"/api/runs/{created['id']}").json()
        assert failed["state"] == "failed" and failed["result"] is None
        assert failed["model"] == created["model"] == settings.model_record()
        assert failed["error"]["code"] == "cuda_oom"


def test_checkpoint_changed_after_inventory_cannot_be_saved(models):
    with TestClient(create_app(models.settings, policy_store=models.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        models.settings.model_checkpoints[DEVICE_MODEL].write_bytes(b"changed since discovery")
        response = select(client, DEVICE_MODEL)
        assert response.status_code == 409
        assert response.json()["detail"]["code"] == "model_unavailable"
        assert not models.store.path.exists()


def test_cpu_recovery_preserves_saved_model_without_applying_stale_gpu_guard(models, monkeypatch):
    from rayguard_gui.runtime_policy import device_identity

    probe = models.checked_probe(models.settings, "cpu")
    models.store.save("cuda:0", device_identity(probe, probe["devices"][0]), DEVICE_MODEL)
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "1")
    selected = models.store.load(models.settings, apply=False)
    assert selected.model_id == DEVICE_MODEL and selected.model_python == models.settings.model_python
    assert models.store.load_error is None and models.store.identity is None


def test_legacy_preference_migrates_without_changing_configured_model(models):
    models.store.path.write_text(json.dumps({"schema_version": "rayguard.runtime-policy.v1",
                                           "device": "cpu", "identity": None}))
    store = PolicyStore(models.store.path.parent / "config.local.json")
    selected = store.load(models.settings.with_model(DEVICE_MODEL))
    assert selected.model_id == store.saved_model_id == DEVICE_MODEL
    assert selected.inference_device == "cpu"
    store.save("cpu", None, SPECIFIC_MODEL)
    assert json.loads(store.path.read_text())["model_id"] == SPECIFIC_MODEL


def test_model_and_class_map_separate_qualification_fingerprints(models, monkeypatch):
    config = models.settings
    probe = models.checked_probe(config, "cpu")
    generic = qualification_fingerprint(config, probe, "cpu")
    # Same artifact is deliberately misassigned: task identity must still invalidate cache.
    assert qualification_fingerprint(replace(config, model_id=DEVICE_MODEL), probe, "cpu") != generic
    spec = MODELS[DEFAULT_MODEL_ID]
    monkeypatch.setitem(MODELS, spec.id, replace(spec, classes=("Changed class",)))
    assert qualification_fingerprint(config, probe, "cpu") != generic


@pytest.mark.parametrize("change", [
    lambda value: value["detections"][0]["category"].update(label="Explosive"),
    lambda value: value["detections"][0]["category"].update(namespace="wrong-task"),
    lambda value: value["detections"][0].update(kind="suspicious_region"),
    lambda value: value["model"].update(provenance="sha256:wrong"),
])
def test_device_output_rejects_wrong_class_namespace_kind_or_checkpoint(models, change):
    settings = models.settings.with_model(DEVICE_MODEL)
    scan_id, run_id = uuid4().hex, uuid4().hex
    result = synthetic_result_for(settings, scan_id, run_id)
    scan, run = {"id": scan_id, "width": 12, "height": 8}, {"id": run_id, "confidence": .25}
    validate_prediction(result, scan, run, settings)
    invalid = copy.deepcopy(result)
    change(invalid)
    with pytest.raises(ValueError):
        validate_prediction(invalid, scan, run, settings)


def synthetic_result_for(settings, scan_id, run_id):
    spec = get_model(settings.model_id)
    return {"schema_version": "1.0", "scan_id": scan_id, "status": "ok", "image": {"width": 12, "height": 8},
            "model": {"id": spec.id, "task": spec.task, "provenance": f"sha256:{settings.checkpoint_sha256}"},
            "run": {"id": run_id, "provenance": "manifest.json"}, "threshold": .25, "error": None,
            "detections": [{"id": "synthetic", "kind": spec.kind, "box_xyxy": [1, 1, 6, 6],
                            "category": {"namespace": spec.task, "label": spec.classes[0]},
                            "confidence": .8, "device_id": None}]}


@pytest.mark.parametrize("model_id", list(MODELS))
def test_fixed_subprocess_argv_passes_selected_model(models, monkeypatch, tmp_path, model_id):
    from types import SimpleNamespace

    settings = replace(models.settings.with_model(model_id), inference_device="cpu")
    image, output = tmp_path / "scan.png", tmp_path / "run"
    image.write_bytes(b"synthetic pixels")

    def process(command, **kwargs):
        assert command[command.index("--model") + 1] == model_id
        assert command[2] == str(settings.checkpoint)
        manifest = write_evidence(settings, image, output)
        (output / "manifest.json").write_text(json.dumps(manifest))
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("rayguard_gui.runner.subprocess.run", process)
    assert SubprocessRunner(settings)(image, output, .25).prediction == {"synthetic": True}

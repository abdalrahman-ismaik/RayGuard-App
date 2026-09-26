"""Device preference/restart software checks; no model or hardware execution."""

import json
from dataclasses import replace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from test_api import upload
from test_runtime import environment as environment

from rayguard_gui import runtime
from rayguard_gui.api import create_app
from rayguard_gui.runtime_policy import PolicyStore, device_identity, host_id


@pytest.fixture
def configured(environment, monkeypatch, tmp_path):
    def probe(settings, device):
        return {**environment.probe(settings, device), "host_id": host_id(), "driver": "591.74",
                "visibility_mask": None, "architecture_list": ["sm_75"]}

    monkeypatch.delenv("CUDA_VISIBLE_DEVICES", raising=False)
    monkeypatch.delenv("CUDA_DEVICE_ORDER", raising=False)
    monkeypatch.setattr(runtime, "probe_runtime", probe)
    environment.store = PolicyStore(tmp_path / "config.local.json")
    environment.store.load(environment.settings)
    environment.checked_probe = probe
    return environment


def choose(client, device="cpu", restart=False, instance=None):
    instance = instance or client.get("/api/health").json()["service_instance_id"]
    return client.post("/api/runtime/device", json={
        "device": device, "service_instance_id": instance, "restart": restart,
    })


def choices(client):
    return client.get("/api/health").json()["runtime"]["choices"]


def test_cpu_policy_preserves_gpu_environment_and_probe_options(configured):
    base = configured.settings
    configured.store.save("cpu", None)
    settings = configured.store.load(base)
    assert settings.model_python == base.model_python
    assert settings.cpu_model_python == base.cpu_model_python
    assert settings.runtime_profile == base.runtime_profile
    with TestClient(create_app(settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        assert not choices(client)["can_save"]
        client.app.state.session.pool.finish()
        observed = choices(client)
        assert observed["saved_device"] == observed["default_device"] == "cpu"
        assert {row["device"] for row in observed["options"] if row["selectable"]} == {"cpu", "cuda:0"}
        assert client.get("/api/health").json()["runtime"]["selected_device"] == "cpu"
        assert not configured.calls


def test_auto_default_follows_selected_gpu_then_cpu_on_missing_cuda(configured):
    configured.state["devices"].append({**configured.state["devices"][0], "index": 1,
                                        "uuid": "GPU-second", "total_memory_bytes": 12 * 1024**3})
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert choices(client)["default_device"] == "cuda:1"
        assert [row["device"] for row in choices(client)["options"]] == ["cpu", "cuda:1", "cuda:0"]
        assert not choices(client)["can_restart"] and choices(client)["can_save"]
    configured.state["devices"] = []
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert choices(client)["default_device"] == "cpu"
        assert "setup may be required" in choices(client)["options"][0]["reason"]


@pytest.mark.parametrize("change", [
    lambda p: p.update(driver=None),
    lambda p: p.update(driver="500.0"),
    lambda p: p.update(hip="6.0"),
    lambda p: p.update(cuda=None),
    lambda p: p["devices"][0].update(capability=[12, 0]),
    lambda p: p["devices"][0].update(uuid=None),
    lambda p: p["devices"][0].update(free_memory_bytes=0),
])
def test_auto_and_selector_use_same_reviewed_eligibility(configured, monkeypatch, change):
    def probe(settings, device):
        observed = configured.checked_probe(settings, device)
        change(observed)
        return observed

    monkeypatch.setattr(runtime, "probe_runtime", probe)
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        current = client.get("/api/health").json()["runtime"]
        assert current["selected_device"] == current["choices"]["default_device"] == "cpu"
        assert not next(row for row in current["choices"]["options"] if row["kind"] == "gpu")["selectable"]
        assert choose(client, "cuda:0").status_code == 409


@pytest.mark.parametrize("system,machine", [("Linux", "x86_64"), ("Windows", "ARM64")])
def test_unreviewed_platform_does_not_offer_managed_gpu(configured, monkeypatch, system, machine):
    monkeypatch.setattr(runtime.platform, "system", lambda: system)
    monkeypatch.setattr(runtime.platform, "machine", lambda: machine)
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        observed = choices(client)
        assert observed["default_device"] == "cpu"
        assert not next(row for row in observed["options"] if row["kind"] == "gpu")["selectable"]
        assert choose(client, "cuda:0").status_code == 409


def test_preference_host_identity_uses_api_even_if_model_python_reports_differently(configured, monkeypatch):
    probe = configured.checked_probe(configured.settings, "cpu")
    probe["host_id"] = "0" * 64
    identity = device_identity(probe, probe["devices"][0])
    assert identity["host_id"] == host_id() != probe["host_id"]
    configured.store.save("cuda:0", identity)
    assert configured.store.load(configured.settings).inference_device == "cuda:0"
    assert configured.store.load_error is None
    configured.store.validate_probe(probe, "cuda:0")
    monkeypatch.setattr("rayguard_gui.runtime_policy.host_id", lambda: "f" * 64)
    with pytest.raises(ValueError, match="host or GPU visibility changed"):
        configured.store.validate_probe(probe, "cuda:0")


def test_save_only_does_not_change_selected_device_or_trigger_restart(configured):
    restarted = []
    with TestClient(create_app(configured.settings, policy_store=configured.store,
                              restart_callback=lambda: restarted.append(True)), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        response = choose(client)
        assert response.status_code == 200
        assert response.json()["device"] == "cpu" and not response.json()["restarting"]
        assert response.json()["runtime"]["selected_device"] == "cuda:0"
        assert choices(client)["saved_device"] == "cpu"
        assert upload(client).status_code == 201
        assert not restarted
    reloaded = PolicyStore(configured.store.path.parent / "config.local.json")
    assert reloaded.load(configured.settings).inference_device == "cpu"


def test_restart_latch_rejects_every_mutation_and_stale_tabs(configured):
    restarted = []
    with TestClient(create_app(configured.settings, policy_store=configured.store,
                              restart_callback=lambda: restarted.append(True)), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        session.pool.finish()
        scan = upload(client).json()
        assert choose(client, instance=uuid4().hex, restart=True).status_code == 409
        assert not configured.store.path.exists() and not restarted
        response = choose(client, restart=True)
        assert response.status_code == 202 and response.json()["restarting"]
        assert restarted == [True] and choices(client)["restarting"]
        assert not choices(client)["can_save"] and not choices(client)["can_restart"]
        assert not client.get("/api/health").json()["runtime"]["ready"]
        responses = [upload(client), choose(client),
                     client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}),
                     client.post("/api/runtime/verify", json={"scan_id": scan["id"]}),
                     client.post("/api/intake", json={"enabled": False, "confidence": .25}),
                     client.post("/api/demo", json={"action": "pause"}),
                     client.patch(f"/api/runs/{uuid4().hex}/review", json={"status": "reviewed", "note": "x"})]
        assert all(row.status_code == 409 for row in responses)
        assert all(row.json()["detail"]["code"] == "service_restarting" for row in responses)
        assert restarted == [True]
        assert str(configured.settings.model_python) not in response.text


@pytest.mark.parametrize("busy", ["checking", "verifying", "active", "intake", "pending", "replay"])
def test_policy_change_rejects_live_or_unfinished_work(configured, busy):
    with TestClient(create_app(configured.settings, policy_store=configured.store,
                              restart_callback=lambda: None), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        session.pool.finish()
        if busy in ("checking", "verifying"):
            session.runtime.state = busy
        elif busy == "active":
            session.active_run_id = uuid4().hex
        elif busy == "intake":
            session.intake.enabled = True
        elif busy == "pending":
            scan = upload(client).json()
            session.intake.pending.append({"id": uuid4().hex, "scan": scan, "confidence": .25})
        else:
            session.demo.batch_total, session.demo.completed_count = 3, 1
        assert not choices(client)["can_restart"]
        assert choose(client, restart=True).status_code == 409
        assert not configured.store.path.exists() and not session.restarting


def test_unsupervised_service_can_save_but_cannot_claim_restart(configured):
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert choose(client, restart=True).json()["detail"]["code"] == "restart_unavailable"
        assert not configured.store.path.exists()
        assert choose(client).status_code == 200
    with TestClient(create_app(configured.settings), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert not choices(client)["can_save"]
        assert choose(client).json()["detail"]["code"] == "device_preferences_unavailable"


def test_invalid_device_or_browser_paths_cannot_be_persisted(configured):
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert choose(client, "cuda:99").status_code == 409
        response = client.post("/api/runtime/device", json={
            "device": "cpu", "service_instance_id": client.get("/api/health").json()["service_instance_id"],
            "restart": False, "config_path": "C:/private/other.json",
        })
        assert response.status_code == 422 and "C:/private" not in response.text
        assert not configured.store.path.exists()


@pytest.mark.parametrize("change", ["host", "mask", "order", "uuid", "ordinal"])
def test_saved_gpu_identity_cannot_silently_retarget(configured, monkeypatch, change):
    probe = configured.checked_probe(configured.settings, "cpu")
    configured.store.save("cuda:0", device_identity(probe, probe["devices"][0]))
    if change == "host":
        monkeypatch.setattr("rayguard_gui.runtime_policy.host_id", lambda: "0" * 64)
    elif change == "mask":
        monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "1")
    elif change == "order":
        monkeypatch.setenv("CUDA_DEVICE_ORDER", "PCI_BUS_ID")
    elif change == "uuid":
        configured.state["devices"][0]["uuid"] = "GPU-replaced"
    else:
        configured.state["devices"][0]["index"] = 1
    settings = configured.store.load(configured.settings)
    with TestClient(create_app(settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        current = client.get("/api/health").json()["runtime"]
        assert not current["ready"] and current["restart_required"]
        assert upload(client).status_code == 201
        assert choose(client, "cpu").status_code == 200
        assert not configured.calls


@pytest.mark.parametrize("content", [b"invalid", b"x" * 9000], ids=["invalid", "oversized"])
def test_malformed_preference_allows_api_and_explicit_cpu_recovery(configured, content):
    configured.store.path.write_bytes(content)
    configured.store.load(configured.settings)
    assert configured.store.load_error
    with TestClient(create_app(configured.settings, policy_store=configured.store), base_url="http://127.0.0.1") as client:
        client.app.state.session.pool.finish()
        assert not client.get("/api/health").json()["runtime"]["ready"]
        assert choose(client).status_code == 200
    configured.store.path.write_bytes(content)
    settings = configured.store.load(replace(configured.settings, inference_device="cpu"), apply=False)
    assert settings.inference_device == "cpu" and configured.store.load_error is None
    configured.store.save("cpu", None)


def test_concurrent_preference_update_fails_without_overwriting(configured):
    first = configured.store
    second = PolicyStore(first.path.parent / "config.local.json")
    second.load(configured.settings)
    first.save("cpu", None)
    with pytest.raises(ValueError, match="another service"):
        second.save("cpu", None)
    assert json.loads(first.path.read_text())["device"] == "cpu"
    assert not list(first.path.parent.glob("*.tmp"))
    assert not list(first.path.parent.glob("*.lock"))

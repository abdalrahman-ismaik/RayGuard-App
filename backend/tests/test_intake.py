"""Synthetic file and model fixtures; these do not establish hardware compatibility."""

import hashlib
import json
import stat
import threading
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from test_api import image_bytes, synthetic_result, upload, wait_done

from rayguard_gui.api import create_app
from rayguard_gui.config import Settings
from rayguard_gui.intake import FolderIntake, plain_file


@pytest.fixture
def settings(tmp_path, monkeypatch):
    # Keep the real lifecycle/shutdown, but advance polls explicitly in these tests.
    monkeypatch.setattr(FolderIntake, "_loop", lambda self: self.stopped.wait())
    python = tmp_path / "python.exe"
    checkpoint = tmp_path / "checkpoint.pt"
    python.touch()
    checkpoint.touch()
    source = tmp_path / "incoming"
    source.mkdir()
    return Settings(model_python=python, checkpoint=checkpoint, checkpoint_sha256="a" * 64,
                    storage_dir=tmp_path / "storage", incoming_dir=source)


def control(client, enabled=True, confidence=0.25):
    response = client.post("/api/intake", json={"enabled": enabled, "confidence": confidence})
    assert response.status_code == 200
    return response.json()


def poll(client, first=0):
    client.app.state.session.intake.tick(first)
    client.app.state.session.intake.tick(first + 2)


def test_starts_paused_skips_history_then_receives_new_file_without_modifying_source(settings):
    old = settings.incoming_dir / "historical.png"
    old.write_bytes(image_bytes())
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        intake = client.get("/api/intake").json()
        assert intake["state"] == "paused" and not intake["enabled"]
        assert intake["hardware_verified"] is False and intake["adapter"] == "folder"
        assert str(settings.incoming_dir) not in json.dumps(intake)
        assert control(client)["state"] == "waiting"
        poll(client)
        assert client.get("/api/runs").json()["items"] == []
        new = settings.incoming_dir / "new.png"
        content = image_bytes(size=(15, 9))
        new.write_bytes(content)
        client.app.state.session.intake.tick(4)
        assert not client.app.state.session.scans  # One observation is insufficient.
        client.app.state.session.intake.tick(5.9)
        assert not client.app.state.session.scans  # Two observations alone are insufficient.
        client.app.state.session.intake.tick(6)
        run = client.get("/api/runs").json()["items"][0]
        done = wait_done(client, run["id"])
        assert done["state"] == "succeeded"
        assert done["scan"]["origin"] == "folder" and done["scan"]["received_at"]
        assert done["result"]["scan_id"] == done["scan_id"]
        assert done["result"]["run"]["id"] == done["id"]
        assert done["scan"]["width"] == 15 and done["scan"]["height"] == 9
        assert new.read_bytes() == content and old.read_bytes() == image_bytes()
        assert sorted(path.name for path in settings.incoming_dir.iterdir()) == [
            "historical.png", "new.png",
        ]
        poll(client, 8)
        assert len(client.get("/api/runs").json()["items"]) == 1
        assert client.get("/api/intake").json()["received_count"] == 1


def test_partial_writes_reset_stability_and_invalid_files_recover_only_after_change(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        source = settings.incoming_dir / "partial.png"
        source.write_bytes(b"\x89PNG\r\n\x1a\n")
        client.app.state.session.intake.tick(0)
        source.write_bytes(image_bytes())
        client.app.state.session.intake.tick(2)
        assert not client.app.state.session.scans
        client.app.state.session.intake.tick(4)
        run = client.get("/api/runs").json()["items"][0]
        wait_done(client, run["id"])
        bad = settings.incoming_dir / "broken.jpg"
        bad.write_bytes(b"bad")
        poll(client, 6)
        state = client.get("/api/intake").json()
        assert state["issues"][0]["code"] == "invalid_image"
        assert state["received_count"] == 1 and state["enabled"]
        poll(client, 10)
        assert len(client.get("/api/intake").json()["issues"]) == 1
        bad.write_bytes(image_bytes("JPEG"))
        poll(client, 14)
        assert client.get("/api/intake").json()["received_count"] == 2


def test_bmp_folder_export_is_normalized_but_manual_bmp_remains_unsupported(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        data = image_bytes("BMP", size=(7, 5))
        (settings.incoming_dir / "export.BMP").write_bytes(data)
        poll(client)
        run = client.get("/api/runs").json()["items"][0]
        scan = run["scan"]
        saved = client.get(scan["image_url"])
        assert saved.content.startswith(b"\x89PNG\r\n\x1a\n")
        assert hashlib.sha256(saved.content).hexdigest() == scan["sha256"]
        assert (scan["width"], scan["height"]) == (7, 5)
        assert upload(client, data, "manual.bmp").status_code == 415


def test_no_recursive_or_unsupported_intake_and_reparse_files_rejected(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        nested = settings.incoming_dir / "nested"
        nested.mkdir()
        (nested / "scan.png").write_bytes(image_bytes())
        (settings.incoming_dir / "private.txt").write_bytes(image_bytes())
        poll(client)
        assert not client.app.state.session.scans
    info = SimpleNamespace(st_mode=stat.S_IFREG, st_file_attributes=stat.FILE_ATTRIBUTE_REPARSE_POINT)
    path = SimpleNamespace(lstat=lambda: info, is_symlink=lambda: False)
    assert plain_file(path, settings.incoming_dir) is None
    escaped = SimpleNamespace(lstat=lambda: SimpleNamespace(st_mode=stat.S_IFREG),
                              is_symlink=lambda: False, resolve=lambda: Path("/outside/file.png"))
    assert plain_file(escaped, settings.incoming_dir) is None


def test_pause_finishes_active_preserves_queue_and_resumes_exports_arriving_while_paused(settings):
    entered = threading.Event()
    release = threading.Event()

    def blocked(*args):
        entered.set()
        assert release.wait(3)
        return synthetic_result(*args)

    with TestClient(create_app(settings, blocked), base_url="http://127.0.0.1") as client:
        try:
            control(client)
            (settings.incoming_dir / "first.png").write_bytes(image_bytes())
            (settings.incoming_dir / "second.png").write_bytes(image_bytes())
            poll(client)
            assert entered.wait(1)
            state = client.get("/api/intake").json()
            assert state["pending_count"] == 1 and state["state"] == "receiving"
            queued_id = state["pending"][0]["id"]
            active_id = client.get("/api/health").json()["active_run_id"]
            assert active_id
            control(client, False)
            (settings.incoming_dir / "while-paused.png").write_bytes(image_bytes())
            release.set()
            wait_done(client, active_id)
            poll(client, 4)
            assert len(client.get("/api/runs").json()["items"]) == 1
            assert client.get("/api/intake").json()["pending_count"] == 1
            control(client, True, .4)
            poll(client, 8)
            wait_done(client, queued_id)
            poll(client, 12)
            state = client.get("/api/intake").json()
            assert state["received_count"] == 3
            records = client.get("/api/runs").json()["items"]
            assert len(records) == 3
            assert client.get(f"/api/runs/{queued_id}").json()["confidence"] == .25
            assert next(r for r in records if r["scan"]["name"] == "while-paused.png")["confidence"] == .4
        finally:
            release.set()


def test_overflow_preserves_candidates_and_recovers_without_replaying_or_dropping_files(settings):
    settings = replace(settings, max_pending=1)
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        for number in range(3):
            (settings.incoming_dir / f"{number}.png").write_bytes(image_bytes())
        poll(client)
        state = client.get("/api/intake").json()
        assert state["state"] == "backpressure" and state["error"]["code"] == "queue_full"
        assert state["enabled"] and state["pending_count"] <= 1
        assert len(client.app.state.session.intake.candidates) == 2
        first_id = client.get("/api/runs").json()["items"][0]["id"]
        wait_done(client, first_id)
        client.app.state.session.intake.tick(4)
        assert client.get("/api/intake").json()["error"]["code"] == "queue_full"
        for run in client.get("/api/runs").json()["items"]:
            wait_done(client, run["id"])
        client.app.state.session.intake.tick(6)
        runs = client.get("/api/runs").json()["items"]
        assert len(runs) == 3
        assert len({run["scan"]["name"] for run in runs}) == 3
        assert client.get("/api/intake").json()["received_count"] == 3
        assert client.get("/api/intake").json()["error"] is None


def test_source_unavailable_visible_on_start_and_disconnect_then_recover(settings):
    settings.incoming_dir.rmdir()
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        state = control(client)
        assert state["error"]["code"] == "source_unavailable"
        assert str(settings.incoming_dir) not in json.dumps(state)
        settings.incoming_dir.mkdir()
        assert control(client)["state"] == "waiting"
        settings.incoming_dir.rmdir()
        client.app.state.session.intake.tick(0)
        assert client.get("/api/intake").json()["error"]["code"] == "source_unavailable"
        settings.incoming_dir.mkdir()
        (settings.incoming_dir / "after-reconnect.png").write_bytes(image_bytes())
        control(client)
        poll(client, 2)
        assert client.get("/api/intake").json()["received_count"] == 1


@pytest.mark.parametrize("change,code", [
    ({"incoming_dir": None}, "source_unconfigured"),
    ({"checkpoint": None}, "model_unconfigured"),
])
def test_unconfigured_source_and_model(settings, change, code):
    with TestClient(create_app(replace(settings, **change)), base_url="http://127.0.0.1") as client:
        assert control(client)["error"]["code"] == code


def test_manual_run_conflicts_only_while_intake_enabled(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        scan = upload(client).json()
        assert scan["origin"] == "upload"
        body = {"scan_id": scan["id"], "confidence": .25}
        assert client.post("/api/runs", json=body).json()["detail"]["code"] == "intake_active"
        control(client, False)
        assert client.post("/api/runs", json=body).status_code == 202


def test_changed_existing_export_is_received_but_restart_baselines_all_existing_files(settings):
    source = settings.incoming_dir / "reused-name.png"
    source.write_bytes(image_bytes())
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        source.write_bytes(image_bytes(size=(14, 10)))
        poll(client)
        assert client.get("/api/intake").json()["received_count"] == 1
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        poll(client)
        assert client.get("/api/intake").json()["received_count"] == 0


def test_session_limit_pauses_without_consuming_unaccepted_file(settings):
    settings = replace(settings, max_scans=1)
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        (settings.incoming_dir / "a.png").write_bytes(image_bytes())
        (settings.incoming_dir / "b.png").write_bytes(image_bytes())
        poll(client)
        state = client.get("/api/intake").json()
        assert state["error"]["code"] == "session_limit"
        assert state["received_count"] == 1 and state["pending_count"] == 1
        assert len(client.app.state.session.intake.candidates) == 1


def test_invalid_model_output_pauses_queue_and_deliberate_resume_can_finish(settings):
    calls = []

    def first_result_is_wrong(*args):
        result = synthetic_result(*args)
        calls.append(result["scan_id"])
        if len(calls) == 1:
            result["scan_id"] = "wrong"
        return result

    with TestClient(create_app(settings, first_result_is_wrong), base_url="http://127.0.0.1") as client:
        control(client)
        (settings.incoming_dir / "a.png").write_bytes(image_bytes())
        (settings.incoming_dir / "b.png").write_bytes(image_bytes())
        poll(client)
        first = client.get("/api/runs").json()["items"][0]
        failed = wait_done(client, first["id"])
        assert failed["state"] == "failed" and failed["result"] is None
        assert failed["error"]["code"] == "invalid_output"
        assert not client.get("/api/intake").json()["enabled"]
        next_id = client.get("/api/intake").json()["pending"][0]["id"]
        control(client)
        client.app.state.session.intake.tick(4)
        completed = wait_done(client, next_id)
        assert completed["state"] == "succeeded" and completed["scan_id"] != first["scan_id"]
        assert client.get("/api/intake").json()["pending_count"] == 0


def test_storage_error_is_visible_and_source_file_can_be_retried(settings, monkeypatch):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        source = settings.incoming_dir / "scan.png"
        original = image_bytes()
        source.write_bytes(original)
        write_bytes = Path.write_bytes

        def fail(*args, **kwargs):
            raise OSError("synthetic private storage path")

        monkeypatch.setattr(Path, "write_bytes", fail)
        poll(client)
        state = client.get("/api/intake").json()
        assert state["state"] == "error" and state["error"]["code"] == "storage_error"
        assert not state["enabled"] and state["received_count"] == 0
        assert "private storage path" not in json.dumps(state)
        assert source.read_bytes() == original
        monkeypatch.setattr(Path, "write_bytes", write_bytes)
        control(client)
        client.app.state.session.intake.tick(4)
        assert client.get("/api/intake").json()["received_count"] == 1


def test_folder_limits_and_bounded_issues(settings):
    settings = replace(settings, max_upload_bytes=20)
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        for number in range(25):
            (settings.incoming_dir / f"{number}.png").write_bytes(image_bytes())
        poll(client)
        state = client.get("/api/intake").json()
        assert len(state["issues"]) == 20
        assert {item["code"] for item in state["issues"]} == {"upload_too_large"}
        assert state["received_count"] == 0


def test_review_saved_in_run_evidence_and_export_with_no_clearance_meaning(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        scan = upload(client).json()
        run = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        wait_done(client, run["id"])
        response = client.patch(f"/api/runs/{run['id']}/review",
                                json={"status": "follow_up", "note": "Inspect the annotation."})
        assert response.status_code == 200
        updated = response.json()
        assert updated["review"]["status"] == "follow_up" and updated["review"]["updated_at"]
        persisted = json.loads((client.app.state.session.directory / f"{run['id']}.json").read_text())
        assert persisted == updated
        exported = client.get(f"/api/runs/{run['id']}/export").json()
        assert exported["run"]["review"] == updated["review"]
        assert "operator" not in updated["review"] and "benign" not in updated
        assert client.patch(f"/api/runs/{run['id']}/review",
                            json={"status": "clear", "note": ""}).status_code == 422
        assert client.patch(f"/api/runs/{run['id']}/review",
                            json={"status": "reviewed", "note": "x" * 1001}).status_code == 422
        assert client.patch("/api/runs/unknown/review",
                            json={"status": "reviewed", "note": ""}).status_code == 404


def test_review_rejects_active_job_and_preserves_previous_review_on_write_failure(settings, monkeypatch):
    release = threading.Event()

    def blocked(*args):
        assert release.wait(3)
        return synthetic_result(*args)

    with TestClient(create_app(settings, blocked), base_url="http://127.0.0.1") as client:
        try:
            scan = upload(client).json()
            run = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
            request = {"status": "reviewed", "note": "Checked by demo user"}
            endpoint = f"/api/runs/{run['id']}/review"
            assert client.patch(endpoint, json=request).status_code == 409
            release.set()
            previous = wait_done(client, run["id"])

            def fail(*args, **kwargs):
                raise OSError("synthetic private storage path")

            monkeypatch.setattr(Path, "replace", fail)
            response = client.patch(endpoint, json=request)
            assert response.status_code == 507
            assert "private storage path" not in response.text
            assert client.get(f"/api/runs/{run['id']}").json()["review"] == previous["review"]
            saved = json.loads((client.app.state.session.directory / f"{run['id']}.json").read_text())
            assert saved == previous
        finally:
            release.set()


@pytest.mark.parametrize("value", [
    {"settle_seconds": 0}, {"settle_seconds": True}, {"settle_seconds": float("nan")},
    {"max_pending": 0}, {"source_label": ""}, {"source_label": "bad\nlabel"},
])
def test_intake_configuration_rejects_invalid_values(tmp_path, value):
    config = tmp_path / "invalid.json"
    config.write_text(json.dumps(value))
    with pytest.raises(ValueError):
        Settings.from_file(config)

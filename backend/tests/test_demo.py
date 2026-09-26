"""Synthetic replay checks; no model accuracy or scanner compatibility claims."""

import hashlib
import json
import stat
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from test_api import image_bytes, synthetic_result, upload

from rayguard_gui import api, demo
from rayguard_gui.api import create_app
from rayguard_gui.config import Settings
from rayguard_gui.demo import DatasetDemo
from rayguard_gui.intake import FolderIntake
from rayguard_gui.runner import InferenceFailure


class StepPool:
    """Run each synthetic model job explicitly, without threads or timing assumptions."""

    def __init__(self, **kwargs):
        self.jobs = []

    def submit(self, function, *args):
        self.jobs.append((function, args))

    def finish(self):
        function, args = self.jobs.pop(0)
        function(*args)

    def shutdown(self, **kwargs):
        while self.jobs:
            self.finish()


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setattr(DatasetDemo, "_loop", lambda self: self.stopped.wait())
    monkeypatch.setattr(FolderIntake, "_loop", lambda self: self.stopped.wait())
    monkeypatch.setattr(api, "ThreadPoolExecutor", StepPool)
    python = tmp_path / "python.exe"
    checkpoint = tmp_path / "checkpoint.pt"
    python.touch()
    checkpoint.touch()
    source = tmp_path / "test"
    source.mkdir()
    incoming = tmp_path / "incoming"
    incoming.mkdir()
    for name in ("Test000003.jpg", "Test000001.jpg", "Test000002.jpg", "Test000004.jpg"):
        (source / name).write_bytes(image_bytes("JPEG"))
    return Settings(model_python=python, checkpoint=checkpoint, checkpoint_sha256="a" * 64,
                    storage_dir=tmp_path / "storage", demo_dir=source, incoming_dir=incoming)


def control(client, action="start", **kwargs):
    response = client.post("/api/demo", json={"action": action, **kwargs})
    assert response.status_code == 200, response.text
    return response.json()


def finish(client, clock):
    session = client.app.state.session
    session.pool.finish()
    session.demo.tick(clock)
    return client.get("/api/demo").json()


def test_idle_sorted_finite_batch_delay_source_unchanged_and_export_provenance(settings):
    originals = {path.name: path.read_bytes() for path in settings.demo_dir.iterdir()}
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        state = client.get("/api/demo").json()
        assert state["state"] == "ready" and state["total"] == 4 and not state["enabled"]
        assert state["next_name"] == "Test000001.jpg"
        demo = client.app.state.session.demo
        demo.tick(0)
        assert not client.app.state.session.runs
        assert control(client)["batch_total"] == 3
        for index in range(3):
            clock = index * 10
            demo.tick(clock)
            state = client.get("/api/demo").json()
            run_id = state["last_run_id"]
            assert state["current_name"] == f"Test{index + 1:06}.jpg"
            assert client.get(f"/api/runs/{run_id}").json()["state"] == "running"
            state = finish(client, clock + 1)
            assert state["completed_count"] == index + 1
            assert state["cursor"] == index + 1
            demo.tick(clock + 3.99)
            assert not client.app.state.session.active_run_id  # Delay begins after completion.
            exported = client.get(f"/api/runs/{run_id}/export").json()
            scan = exported["run"]["scan"]
            assert scan["origin"] == "dataset_demo"
            assert scan["source"] == {"dataset": "IEDXray", "split": "test", "index": index}
            assert scan["source_sha256"] == hashlib.sha256(originals[scan["name"]]).hexdigest()
            assert str(settings.demo_dir) not in json.dumps(exported)
        assert state["state"] == "completed" and not state["enabled"]
        demo.tick(1000)
        assert len(client.app.state.session.runs) == 3
        assert {p.name: p.read_bytes() for p in settings.demo_dir.iterdir()} == originals
        assert str(settings.demo_dir) not in json.dumps(state)


def test_pause_finishes_active_resume_retains_threshold_and_tail_clips(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        demo = client.app.state.session.demo
        assert control(client, start_index=2, count=20, confidence=.6)["batch_total"] == 2
        demo.tick(0)
        assert control(client, "pause")["enabled"] is False
        assert client.app.state.session.active_run_id
        assert client.post("/api/demo", json={"action": "resume"}).status_code == 409
        state = finish(client, 1)
        assert state["state"] == "paused" and state["completed_count"] == 1
        demo.tick(100)
        assert len(client.app.state.session.runs) == 1
        assert control(client, "resume")["confidence"] == .6
        demo.tick(101)
        assert finish(client, 102)["state"] == "completed"
        assert {r["confidence"] for r in client.app.state.session.runs.values()} == {.6}
        assert client.get("/api/demo").json()["next_name"] is None
        assert client.post("/api/demo", json={"action": "start"}).status_code == 422
        assert control(client, start_index=0, count=1)["cursor"] == 0


@pytest.mark.parametrize("body", [
    {"action": "start", "count": 0}, {"action": "start", "count": 21},
    {"action": "start", "count": True}, {"action": "start", "start_index": -1},
    {"action": "start", "start_index": 1.1}, {"action": "start", "start_index": 99},
    {"action": "start", "confidence": 0}, {"action": "start", "confidence": True},
    {"action": "start", "source": "private/path"}, {"action": "loop"},
    {"action": "resume", "confidence": .4}, {"action": "pause", "count": 2},
])
def test_rejects_invalid_controls_without_starting_or_echoing_paths(settings, body):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        response = client.post("/api/demo", json=body)
        assert response.status_code == 422
        assert "private/path" not in response.text
        assert client.get("/api/demo").json()["enabled"] is False


def test_manual_folder_and_demo_modes_cannot_take_each_others_work(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        scan = upload(client).json()
        run_body = {"scan_id": scan["id"], "confidence": .25}
        control(client)
        assert client.post("/api/runs", json=run_body).json()["detail"]["code"] == "demo_active"
        assert client.post("/api/intake", json={"enabled": True, "confidence": .25}).status_code == 409
        assert not session.intake.enabled
        assert client.post("/api/demo", json={"action": "start"}).status_code == 409
        control(client, "pause")
        assert client.post("/api/runs", json=run_body).status_code == 202
        assert client.post("/api/demo", json={"action": "resume"}).status_code == 409
        session.pool.finish()
        session.intake.pending.append({"id": "queued", "scan": scan, "confidence": .25})
        assert client.post("/api/demo", json={"action": "start"}).status_code == 409
        session.intake.pending.clear()
        assert client.post("/api/intake", json={"enabled": True, "confidence": .25}).status_code == 200
        assert client.post("/api/demo", json={"action": "start"}).status_code == 409


def test_concurrent_mode_starts_are_serialized_by_shared_lock(settings):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        with ThreadPoolExecutor(max_workers=2) as pool:
            calls = [pool.submit(client.post, "/api/demo", json={"action": "start"}),
                     pool.submit(client.post, "/api/intake", json={"enabled": True, "confidence": .25})]
            assert sorted(f.result().status_code for f in calls) == [200, 409]
        session = client.app.state.session
        assert session.demo.enabled != session.intake.enabled


@pytest.mark.parametrize("failure", ["model", "image", "changed", "deleted", "storage", "capacity"])
def test_failure_stops_at_failed_index_without_skipping(settings, monkeypatch, failure):
    if failure == "image":
        (settings.demo_dir / "Test000001.jpg").write_bytes(b"broken")
    if failure == "capacity":
        settings = replace(settings, max_storage_bytes=1)

    def runner(*args):
        if failure == "model":
            raise InferenceFailure("model_failed", "The model could not complete this image.")
        return synthetic_result(*args)

    with TestClient(create_app(settings, runner), base_url="http://127.0.0.1") as client:
        session = client.app.state.session
        control(client)
        source = settings.demo_dir / "Test000001.jpg"
        if failure == "changed":
            source.write_bytes(image_bytes("JPEG", size=(16, 10)))
        if failure == "deleted":
            source.unlink()
        if failure == "storage":
            def fail_write(*args, **kwargs):
                raise OSError("private machine path")
            monkeypatch.setattr(Path, "write_bytes", fail_write)
        session.demo.tick(0)
        if session.pool.jobs:
            finish(client, 1)
        state = client.get("/api/demo").json()
        assert state["state"] == "error" and not state["enabled"]
        assert state["cursor"] == 0 and state["completed_count"] == 0
        assert state["current_name"] == "Test000001.jpg"
        assert state["error"] and "private machine path" not in json.dumps(state)
        session.demo.tick(1000)
        assert len(session.runs) <= 1
        assert control(client, "pause")["error"] == state["error"]
        assert client.post("/api/demo", json={"action": "resume"}).status_code == 409


def test_only_top_level_supported_files_cataloged_and_image_bytes_bounded(settings):
    nested = settings.demo_dir / "nested"
    nested.mkdir()
    (nested / "a.jpg").write_bytes(image_bytes("JPEG"))
    (settings.demo_dir / "ignored.bmp").write_bytes(image_bytes("BMP"))
    settings = replace(settings, max_upload_bytes=10)
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        assert client.get("/api/demo").json()["total"] == 4
        control(client)
        client.app.state.session.demo.tick(0)
        assert client.get("/api/demo").json()["error"]["code"] == "upload_too_large"


def test_reparse_root_or_file_is_rejected_without_reading(settings, monkeypatch):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        control(client)
        original = Path.lstat

        def reparse(path, *args, **kwargs):
            if path == settings.demo_dir / "Test000001.jpg":
                return SimpleNamespace(st_mode=stat.S_IFREG,
                                       st_file_attributes=stat.FILE_ATTRIBUTE_REPARSE_POINT)
            return original(path, *args, **kwargs)

        monkeypatch.setattr(Path, "lstat", reparse)
        client.app.state.session.demo.tick(0)
        assert client.get("/api/demo").json()["error"]["code"] == "demo_source_unavailable"
        assert not client.app.state.session.scans
    monkeypatch.setattr(Path, "lstat", lambda *args, **kwargs: SimpleNamespace(
        st_file_attributes=stat.FILE_ATTRIBUTE_REPARSE_POINT, st_mode=stat.S_IFDIR,
    ))
    session = SimpleNamespace(settings=settings)
    assert DatasetDemo(session).state == "error"


def test_catalog_limit_is_bounded(settings, monkeypatch):
    sample = (settings.demo_dir / "Test000001.jpg").stat()

    @contextmanager
    def entries(*args):
        yield (SimpleNamespace(name=f"{i:05}.jpg") for i in range(10_001))

    monkeypatch.setattr(demo.os, "scandir", entries)
    monkeypatch.setattr(demo, "plain_file", lambda *args: sample)
    instance = DatasetDemo(SimpleNamespace(settings=settings))
    assert instance.state == "error" and not instance.catalog


@pytest.mark.parametrize("value", [0, .5, True, float("nan"), float("inf")])
def test_demo_interval_config_requires_finite_minimum_one(tmp_path, value):
    path = tmp_path / "config.json"
    path.write_text(json.dumps({"demo_interval_seconds": value}), encoding="utf-8")
    with pytest.raises(ValueError):
        Settings.from_file(path)


def test_unconfigured_empty_and_storage_inside_source_are_explicit(settings):
    with TestClient(create_app(replace(settings, demo_dir=None)), base_url="http://127.0.0.1") as client:
        assert client.get("/api/demo").json()["state"] == "unconfigured"
        assert client.post("/api/demo", json={"action": "start"}).status_code == 503
    with TestClient(create_app(replace(settings, demo_dir=settings.incoming_dir)),
                    base_url="http://127.0.0.1") as client:
        assert control(client)["error"]["code"] == "demo_empty"
    with pytest.raises(ValueError, match="storage must be outside"):
        with TestClient(create_app(replace(settings, storage_dir=settings.demo_dir / "runs")),
                        base_url="http://127.0.0.1"):
            pass
    assert not (settings.demo_dir / "runs").exists()

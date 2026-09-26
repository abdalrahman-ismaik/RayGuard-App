"""Synthetic software tests. Stub detections are never a model-performance claim."""

import hashlib
import io
import json
import threading
import time
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from rayguard_gui.api import create_app
from rayguard_gui.config import MODEL_ID, MODEL_TASK, Settings
from rayguard_gui.runner import InferenceFailure


def image_bytes(format="PNG", size=(12, 8), exif=None):
    buffer = io.BytesIO()
    Image.new("RGB", size, "gray").save(buffer, format=format, **({"exif": exif} if exif else {}))
    return buffer.getvalue()


@pytest.fixture
def settings(tmp_path):
    python = tmp_path / "python.exe"
    checkpoint = tmp_path / "checkpoint.pt"
    python.touch()
    checkpoint.touch()
    return Settings(model_python=python, checkpoint=checkpoint, checkpoint_sha256="a" * 64,
                    storage_dir=tmp_path / "storage")


def synthetic_result(image: Path, output: Path, confidence: float):
    with Image.open(image) as source:
        width, height = source.size
    return {
        "schema_version": "1.0", "scan_id": image.stem, "status": "ok",
        "image": {"width": width, "height": height},
        "model": {"id": MODEL_ID, "task": MODEL_TASK, "provenance": f"sha256:{'a' * 64}"},
        "run": {"id": output.name, "provenance": "manifest.json"},
        "threshold": confidence, "detections": [], "error": None,
    }


def upload(client, content=None, filename="scan.png"):
    return client.post("/api/scans", files={"file": (filename, content or image_bytes(), "image/png")})


def wait_done(client, run_id):
    for _ in range(100):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["state"] != "running":
            return run
        time.sleep(0.01)
    pytest.fail("synthetic worker did not complete")


def test_upload_normalizes_exif_and_hashes_actual_model_input(settings):
    exif = Image.Exif()
    exif[274] = 6  # 90-degree display rotation: 12x8 becomes 8x12.
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        response = upload(client, image_bytes("JPEG", exif=exif), "../../secret\\scan.jpg")
        assert response.status_code == 201
        scan = response.json()
        assert scan["name"] == "scan.jpg"
        assert (scan["width"], scan["height"]) == (8, 12)
        image = client.get(scan["image_url"])
        assert image.headers["cache-control"] == "no-store"
        assert hashlib.sha256(image.content).hexdigest() == scan["sha256"]
        with Image.open(io.BytesIO(image.content)) as canonical:
            assert canonical.format == "PNG" and canonical.mode == "RGB"
            assert not canonical.getexif()


@pytest.mark.parametrize("content,expected", [
    (b"not an image", 422), (b"\x89PNG\r\n\x1a\n", 422),
    (image_bytes("GIF"), 415), (image_bytes("BMP"), 415),
])
def test_rejects_invalid_or_unsupported_uploads(settings, content, expected):
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        assert upload(client, content).status_code == expected
        assert not client.app.state.session.scans


def test_empty_upload(settings):
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        assert client.post("/api/scans", files={"file": ("a.png", b"")}).status_code == 422


def test_upload_limits_and_unknown_paths(settings):
    settings = replace(settings, max_upload_bytes=100, max_pixels=50)
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        assert upload(client, b"x" * 101).status_code == 413
        assert upload(client, b"x" * 66000).status_code == 413  # Before multipart parser.
        assert upload(client).json()["detail"]["code"] == "too_many_pixels"
        assert client.get("/api/scans/unknown/image").status_code == 404
        assert client.get("/api/scans/..%2F..%2Fpyproject.toml/image").status_code == 404
        assert client.get("/api/runs/unknown").status_code == 404


def test_session_and_storage_limits(settings):
    with TestClient(create_app(replace(settings, max_scans=1)),
                    base_url="http://127.0.0.1") as client:
        assert upload(client).status_code == 201
        assert upload(client).status_code == 409
    with TestClient(create_app(replace(settings, max_storage_bytes=1)),
                    base_url="http://127.0.0.1") as client:
        assert upload(client).status_code == 507


def test_unconfigured_health_and_execution(settings):
    settings = replace(settings, checkpoint=None)
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        health = client.get("/api/health").json()
        assert health["model"]["configured"] is False
        scan = upload(client).json()
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).status_code == 503


def test_realistic_async_job_boundary_busy_empty_result_and_export(settings):
    entered = threading.Event()
    release = threading.Event()

    def blocked_runner(*args):
        entered.set()
        assert release.wait(3)
        return synthetic_result(*args)

    with TestClient(create_app(settings, blocked_runner), base_url="http://127.0.0.1") as client:
        scan = upload(client).json()
        response = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25})
        assert response.status_code == 202
        running = response.json()
        assert running["state"] == "running" and running["result"] is None
        assert entered.wait(1)
        assert client.get("/api/health").json()["active_run_id"] == running["id"]
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).status_code == 409
        assert client.get(f"/api/runs/{running['id']}/export").status_code == 409
        release.set()
        run = wait_done(client, running["id"])
        assert run["state"] == "succeeded" and run["result"]["detections"] == []
        assert run["error"] is None and run["completed_at"] and run["elapsed_seconds"] >= 0
        assert client.get("/api/runs").json()["items"] == [run]
        exported = client.get(f"/api/runs/{run['id']}/export")
        assert exported.json()["run"] == run
        assert "filename=" in exported.headers["content-disposition"]
        assert str(settings.storage_dir) not in exported.text
        assert "benign" not in run
        assert client.get("/api/health").json()["active_run_id"] is None


@pytest.mark.parametrize("confidence", [0, 1.01, -1, None, "0.5", True])
def test_invalid_confidence(settings, confidence):
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        scan = upload(client).json()
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": confidence}).status_code == 422


@pytest.mark.parametrize("confidence", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_json_input_returns_safe_validation_error(settings, confidence):
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        response = client.post("/api/runs", content='{"scan_id":"' + "a" * 32 +
                               '","confidence":' + confidence + '}',
                               headers={"Content-Type": "application/json"})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_request"


@pytest.mark.parametrize("change", [
    lambda result: result.update(scan_id="wrong"),
    lambda result: result["image"].update(width=99),
    lambda result: result.update(threshold=.9),
    lambda result: result["model"].update(task="invented"),
    lambda result: result["model"].update(provenance="unverified"),
    lambda result: result["run"].update(id="wrong"),
    lambda result: result.update(detections=[{"id": "invalid-contract"}]),
])
def test_schema_and_job_binding_fail_closed(settings, change):
    def corrupt(*args):
        result = synthetic_result(*args)
        change(result)
        return result

    with TestClient(create_app(settings, corrupt), base_url="http://127.0.0.1") as client:
        scan = upload(client).json()
        run = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        done = wait_done(client, run["id"])
        assert done["state"] == "failed" and done["result"] is None
        assert done["error"]["code"] == "invalid_output"


def test_timeout_failure_is_visible_and_frees_worker(settings):
    def fails(*args):
        raise InferenceFailure("inference_timeout", "Inference exceeded the configured time limit.")

    with TestClient(create_app(settings, fails), base_url="http://127.0.0.1") as client:
        scan = upload(client).json()
        run = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        done = wait_done(client, run["id"])
        assert done["error"]["code"] == "inference_timeout"
        assert client.get("/api/health").json()["active_run_id"] is None
        assert client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).status_code == 202


def test_failed_diagnostic_and_evidence_writes_do_not_leave_running_state(settings, monkeypatch):
    def fails(*args):
        raise OSError("synthetic private path failure")

    with TestClient(create_app(settings, fails), base_url="http://127.0.0.1") as client:
        scan = upload(client).json()

        def disk_full(*args, **kwargs):
            raise OSError("synthetic full disk")

        monkeypatch.setattr(Path, "write_text", disk_full)
        run = client.post("/api/runs", json={"scan_id": scan["id"], "confidence": .25}).json()
        done = wait_done(client, run["id"])
        assert done["state"] == "failed" and done["result"] is None
        assert done["error"]["code"] == "storage_error"
        assert client.get("/api/health").json()["active_run_id"] is None


def test_valid_synthetic_box_and_run_limit(settings):
    def detects(*args):
        result = synthetic_result(*args)
        result["detections"] = [{
            "id": "synthetic-0", "kind": "suspicious_region", "box_xyxy": [1, 2, 8, 7],
            "category": {"namespace": MODEL_TASK, "label": "Explosive"},
            "confidence": .7, "device_id": None,
        }]
        return result

    with TestClient(create_app(replace(settings, max_runs=1), detects),
                    base_url="http://127.0.0.1") as client:
        scan = upload(client).json()
        body = {"scan_id": scan["id"], "confidence": .25}
        run = client.post("/api/runs", json=body).json()
        done = wait_done(client, run["id"])
        assert done["result"]["detections"][0]["box_xyxy"] == [1, 2, 8, 7]
        assert client.post("/api/runs", json=body).status_code == 409


def test_mutation_origin_and_host_boundary(settings):
    with TestClient(create_app(settings), base_url="http://127.0.0.1") as client:
        assert client.get("/api/health", headers={"Host": "attacker.example"}).status_code == 400
        assert client.post("/api/scans", headers={"Origin": "https://attacker.example"},
                           files={"file": ("x.png", image_bytes())}).status_code == 403
        assert client.post("/api/scans", headers={"Origin": "http://[invalid"},
                           files={"file": ("x.png", image_bytes())}).status_code == 403
        assert client.post("/api/scans", headers={"Sec-Fetch-Site": "cross-site"},
                           files={"file": ("x.png", image_bytes())}).status_code == 403
        assert client.post("/api/scans", headers={"Origin": "http://127.0.0.1:5173"},
                           files={"file": ("x.png", image_bytes())}).status_code == 201


def test_config_paths_are_relative_to_config_file_and_unknown_fields_rejected(tmp_path):
    config = tmp_path / "local.json"
    config.write_text(json.dumps({"model_python": "env/python", "checkpoint": "weights/a.pt",
                                  "checkpoint_sha256": "a" * 64, "storage_dir": "runs"}))
    settings = Settings.from_file(config)
    assert settings.model_python == tmp_path / "env" / "python"
    assert settings.checkpoint == tmp_path / "weights" / "a.pt"
    assert settings.storage_dir == tmp_path / "runs"
    assert settings.model_status()["configured"] is False
    config.write_text('{"unrecognized": true}')
    with pytest.raises(ValueError):
        Settings.from_file(config)

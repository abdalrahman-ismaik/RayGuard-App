"""Synthetic annotation agreement checks, never detector-accuracy evidence."""

import copy
import hashlib
import json
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from test_api import image_bytes, synthetic_result
from test_demo import StepPool

from rayguard_gui import api
from rayguard_gui.api import create_app
from rayguard_gui.comparison import evaluate, parse_annotations
from rayguard_gui.config import MODEL_TASK, Settings
from rayguard_gui.demo import DatasetDemo
from rayguard_gui.intake import FolderIntake


def annotation_data():
    return {
        "images": [{"id": 532, "file_name": "Test000001.jpg", "width": 12, "height": 8}],
        "categories": [{"id": 0, "name": "Explosive"}],
        "annotations": [{"id": 91, "image_id": 532, "category_id": 0,
                         "bbox": [1, 2, 4, 4], "iscrowd": 0}],
    }


def detection(identifier="d1", box=None, score=.9):
    return {"id": identifier, "kind": "suspicious_region", "box_xyxy": box or [1, 2, 5, 6],
            "category": {"namespace": MODEL_TASK, "label": "Explosive"},
            "confidence": score, "device_id": None}


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setattr(DatasetDemo, "_loop", lambda self: self.stopped.wait())
    monkeypatch.setattr(FolderIntake, "_loop", lambda self: self.stopped.wait())
    monkeypatch.setattr(api, "ThreadPoolExecutor", StepPool)
    source = tmp_path / "test"
    source.mkdir()
    (source / "Test000001.jpg").write_bytes(image_bytes("JPEG"))
    annotations = tmp_path / "generic_test.json"
    annotations.write_text(json.dumps(annotation_data()), encoding="utf-8")
    python, checkpoint = tmp_path / "python.exe", tmp_path / "checkpoint.pt"
    python.touch()
    checkpoint.touch()
    return Settings(model_python=python, checkpoint=checkpoint, checkpoint_sha256="a" * 64,
                    storage_dir=tmp_path / "storage", demo_dir=source, demo_annotations=annotations)


def start(client, finish=True):
    assert client.post("/api/demo", json={"action": "start", "count": 1}).status_code == 200
    session = client.app.state.session
    session.demo.tick(0)
    run_id = session.demo.last_run_id
    assert run_id
    if finish:
        session.pool.finish()
        session.demo.tick(1)
    return run_id


def compare(client, run_id):
    response = client.get(f"/api/runs/{run_id}/comparison")
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def test_exact_filename_join_hashes_missed_result_export_and_no_writes(settings):
    originals = {p: p.read_bytes() for p in [settings.demo_annotations,
                                          settings.demo_dir / "Test000001.jpg"]}
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        run_id = start(client)
        session = client.app.state.session
        before = copy.deepcopy(session.get_run(run_id))
        files = {p: p.read_bytes() for p in session.directory.rglob("*") if p.is_file()}
        data = compare(client, run_id)
        assert data["status"] == "available" and data["reason"] is None
        assert data["image_id"] == 532  # Not the filename's 000001 suffix.
        assert data["annotation_source"] == {
            "name": "generic_test.json", "split": "test",
            "sha256": hashlib.sha256(originals[settings.demo_annotations]).hexdigest(),
        }
        assert data["image_sha256"] == before["scan"]["source_sha256"]
        assert data["boxes"] == [{"annotation_id": 91, "category_id": 0, "label": "Explosive",
                                   "box_xyxy": [1, 2, 5, 6]}]
        assert data["evaluation"] == {
            "outcome": "missed", "matched": 0, "missed": 1, "extra": 0, "matches": [],
            "missed_annotation_ids": [91], "extra_detection_ids": [],
        }
        assert "generalization" in " ".join(data["warnings"])
        exported = client.get(f"/api/runs/{run_id}/export").json()
        assert exported["annotation_comparison"] == data
        assert exported["run"] == before == session.get_run(run_id)
        assert str(settings.demo_dir.parent) not in json.dumps(exported)
        assert files == {p: p.read_bytes() for p in session.directory.rglob("*") if p.is_file()}
        assert not session.active_run_id and not session.demo.enabled and not session.intake.enabled
    assert originals == {p: p.read_bytes() for p in originals}


@pytest.mark.parametrize("detections,expected", [
    ([detection()], ("matched", 1, 0, 0)),
    ([detection("low", score=.5), detection("high", score=.9)], ("extra", 1, 0, 1)),
    ([detection(box=[8, 2, 12, 6])], ("mixed", 0, 1, 1)),
    ([detection(box=[1, 2, 3, 6])], ("matched", 1, 0, 0)),  # Exactly IoU .50.
    ([detection(box=[1, 2, 2.999, 6])], ("mixed", 0, 1, 1)),
])
def test_real_api_matching_uses_completed_saved_prediction(settings, detections, expected):
    def runner(*args):
        return {**synthetic_result(*args), "detections": detections}

    with TestClient(create_app(settings, runner), base_url="http://127.0.0.1") as client:
        data = compare(client, start(client))["evaluation"]
        assert tuple(data[key] for key in ("outcome", "matched", "missed", "extra")) == expected
        if len(detections) == 2:
            assert data["matches"][0]["detection_id"] == "high"
            assert data["extra_detection_ids"] == ["low"]


def test_multiple_boxes_are_one_to_one_deterministic_and_same_class():
    boxes = [{"annotation_id": ident, "category_id": 0, "label": "Explosive",
              "box_xyxy": [1, 2, 5, 6]} for ident in (7, 3)]
    detections = [detection("b"), detection("a"), detection("c")]
    answer = evaluate(boxes, detections)
    assert answer["matches"] == [{"annotation_id": 3, "detection_id": "a", "iou": 1},
                                 {"annotation_id": 7, "detection_id": "b", "iou": 1}]
    assert answer["extra_detection_ids"] == ["c"]
    wrong_class = {**detection(), "category": {"namespace": MODEL_TASK, "label": "Laptop"}}
    assert evaluate(boxes, [wrong_class])["matched"] == 0


@pytest.mark.parametrize("predictions,outcome,extra", [([], "empty", 0), ([detection()], "extra", 1)])
def test_empty_annotations_are_not_a_success_or_benign_verdict(settings, predictions, outcome, extra):
    data = annotation_data()
    data["annotations"] = []
    settings.demo_annotations.write_text(json.dumps(data), encoding="utf-8")
    with TestClient(create_app(settings, lambda *a: {**synthetic_result(*a), "detections": predictions}),
                    base_url="http://127.0.0.1") as client:
        result = compare(client, start(client))
        assert result["status"] == "available" and result["boxes"] == []
        assert result["evaluation"]["outcome"] == outcome
        assert result["evaluation"]["extra"] == extra
        assert "does not establish a benign image" in " ".join(result["warnings"])


@pytest.mark.parametrize("state", ["running", "failed", "missing_result"])
def test_incomplete_failed_missing_result_still_shows_verified_annotations(settings, state):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        run_id = start(client, finish=False)
        run = client.app.state.session.runs[run_id]
        if state != "running":
            run["state"] = "succeeded" if state == "missing_result" else state
        result = compare(client, run_id)
        assert result["status"] == "available" and result["boxes"]
        assert result["evaluation"] is None and result["reason"]


@pytest.mark.parametrize("change", ["task", "label", "size", "threshold", "duplicate_id"])
def test_invalid_prediction_never_gets_comparison_verdict(settings, change):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        run_id = start(client)
        result = client.app.state.session.runs[run_id]["result"]
        if change == "task":
            result["model"]["task"] = "another.task"
        elif change == "size":
            result["image"]["width"] = 13
        elif change == "threshold":
            result["threshold"] = .7
        elif change == "label":
            result["detections"] = [detection()]
            result["detections"][0]["category"]["label"] = "Laptop"
        else:
            result["detections"] = [detection(), detection()]
        data = compare(client, run_id)
        assert data["status"] == "available" and data["evaluation"] is None and data["reason"]


@pytest.mark.parametrize("change", ["unconfigured", "missing", "broken", "wrong_task", "too_deep"])
def test_bad_annotations_leave_detector_working(settings, change):
    if change == "unconfigured":
        settings = replace(settings, demo_annotations=None)
    elif change == "missing":
        settings.demo_annotations.unlink()
    elif change == "broken":
        settings.demo_annotations.write_text("not JSON", encoding="utf-8")
    elif change == "too_deep":
        settings.demo_annotations.write_text("[" * 2000 + "0" + "]" * 2000, encoding="utf-8")
    else:
        data = annotation_data()
        data["categories"][0]["name"] = "Laptop"
        settings.demo_annotations.write_text(json.dumps(data), encoding="utf-8")
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        run_id = start(client)
        assert client.get(f"/api/runs/{run_id}").json()["state"] == "succeeded"
        data = compare(client, run_id)
        assert data["status"] == "unavailable" and data["evaluation"] is None and data["reason"]


@pytest.mark.parametrize("change", [
    "annotations_changed", "source_changed", "source_deleted", "normalized_changed",
    "normalized_hash", "source_hash", "dimensions", "filename", "scan_size", "root_changed",
])
def test_unverified_pairings_are_rejected(settings, change):
    if change in ("dimensions", "filename"):
        data = annotation_data()
        data["images"][0]["width" if change == "dimensions" else "file_name"] = (
            13 if change == "dimensions" else "Test009999.jpg")
        settings.demo_annotations.write_text(json.dumps(data), encoding="utf-8")
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        run_id = start(client)
        session = client.app.state.session
        scan = session.runs[run_id]["scan"]
        source_path = settings.demo_dir / scan["name"]
        if change == "annotations_changed":
            settings.demo_annotations.write_text(json.dumps(annotation_data()) + " ", encoding="utf-8")
        elif change == "source_changed":
            source_path.write_bytes(image_bytes("JPEG", size=(13, 8)))
        elif change == "source_deleted":
            source_path.unlink()
        elif change == "normalized_changed":
            (session.directory / f"{scan['id']}.png").write_bytes(image_bytes(size=(13, 8)))
        elif change == "normalized_hash":
            scan["sha256"] = "b" * 64
        elif change == "source_hash":
            scan["source_sha256"] = "b" * 64
        elif change == "scan_size":
            scan["width"] = 13
        elif change == "root_changed":
            session.demo.root_identity = (-1, -1)
        data = compare(client, run_id)
        assert data["status"] == "unavailable" and data["boxes"] == []
        assert data["evaluation"] is None and data["reason"]


def test_exif_rotation_not_silently_compared(settings):
    exif = Image.Exif()
    exif[274] = 6
    (settings.demo_dir / "Test000001.jpg").write_bytes(image_bytes("JPEG", exif=exif))
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        result = compare(client, start(client))
        assert result["status"] == "unavailable" and "EXIF" in result["reason"]


@pytest.mark.parametrize("change", ["upload", "folder", "training", "dataset"])
def test_non_test_inputs_do_not_get_references_even_when_filename_matches(settings, change):
    with TestClient(create_app(settings, synthetic_result), base_url="http://127.0.0.1") as client:
        run_id = start(client)
        scan = client.app.state.session.runs[run_id]["scan"]
        if change in ("upload", "folder"):
            scan["origin"] = change
        else:
            scan["source"]["split" if change == "training" else "dataset"] = "other"
        result = compare(client, run_id)
        assert result["status"] == "unavailable" and result["boxes"] == []
        assert client.get("/api/runs/missing/comparison").status_code == 404


@pytest.mark.parametrize("change", [
    "duplicate_image", "duplicate_filename", "duplicate_annotation", "missing_image",
    "category", "duplicate_category", "negative", "oversized", "nan", "zero", "crowd",
    "ignore", "bool_id", "unsafe_name", "invalid_top", "bool_coordinate",
])
def test_annotation_validation_rejects_ambiguous_or_unsupported_sources(change):
    data = annotation_data()
    if change == "duplicate_image":
        data["images"].append(copy.deepcopy(data["images"][0]))
    elif change == "duplicate_filename":
        data["images"].append({**data["images"][0], "id": 1})
    elif change == "duplicate_annotation":
        data["annotations"].append(copy.deepcopy(data["annotations"][0]))
    elif change == "missing_image":
        data["annotations"][0]["image_id"] = 999
    elif change == "category":
        data["annotations"][0]["category_id"] = 1
    elif change == "duplicate_category":
        data["categories"].append(copy.deepcopy(data["categories"][0]))
    elif change in ("negative", "oversized", "nan", "zero", "bool_coordinate"):
        data["annotations"][0]["bbox"] = {
            "negative": [-1, 0, 4, 4], "oversized": [0, 0, 50, 5],
            "nan": [0, 0, float("nan"), 5], "zero": [0, 0, 0, 5],
            "bool_coordinate": [False, 0, 4, 4],
        }[change]
    elif change in ("crowd", "ignore"):
        data["annotations"][0]["iscrowd" if change == "crowd" else "ignore"] = 1
    elif change == "bool_id":
        data["annotations"][0]["id"] = True
    elif change == "unsafe_name":
        data["images"][0]["file_name"] = "../Test000001.jpg"
    else:
        data = []
    with pytest.raises(ValueError):
        parse_annotations(json.dumps(data).encode())


def test_config_annotation_path_is_explicit_and_relative_to_config(tmp_path):
    config = tmp_path / "config.json"
    config.write_text(json.dumps({"demo_annotations": "data/generic_test.json"}), encoding="utf-8")
    assert Settings.from_file(config).demo_annotations == (tmp_path / "data/generic_test.json").resolve()
    assert Settings().demo_annotations is None

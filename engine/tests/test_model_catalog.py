"""Inspected model/task mappings; these are software checks, not detector evidence."""

import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest

from sdp_xray.model_catalog import DEFAULT_MODEL_ID, MODELS, UNVERIFIED_FAMILIES, get_model


def test_model_indices_do_not_replace_original_coco_ids():
    generic = get_model(DEFAULT_MODEL_ID)
    device = get_model("author-yolov10m-device")
    specific = get_model("author-yolov10m-specific")
    assert generic.names == {0: "Explosive"}
    assert generic.source_category_map == {"0": "Explosive"}
    assert device.names == {0: "Laptop", 1: "Mobile", 2: "Pager", 3: "Walkie-Talkie"}
    assert device.source_category_map == {"1": "Laptop", "2": "Mobile", "3": "Pager", "4": "Walkie-Talkie"}
    assert specific.classes[2:4] == ("Mobile Phone Explosive", "Pager Explosive")
    assert specific.source_category_map["3"] == "Mobile Phone Explosive"
    assert len({model.task for model in MODELS.values()}) == 3
    assert device.kind == "device"
    assert generic.kind == specific.kind == "suspicious_region"


def test_class_map_identity_changes_for_swapped_labels_and_source_ids():
    device = get_model("author-yolov10m-device")
    swapped = replace(device, classes=("Laptop", "Pager", "Mobile", "Walkie-Talkie"))
    renumbered = replace(device, coco_ids=(0, 1, 2, 3))
    assert len({device.class_map_sha256, swapped.class_map_sha256, renumbered.class_map_sha256}) == 3
    assert all(len(model.class_map_sha256) == 64 for model in MODELS.values())


def test_unverified_family_entries_cannot_be_executed():
    assert len(UNVERIFIED_FAMILIES) == 5
    for row in UNVERIFIED_FAMILIES:
        assert not row["selectable"] and row["reason"] and row["classes"] == []
        with pytest.raises(ValueError):
            get_model(row["id"])
    for model in MODELS.values():
        assert "filename" not in model.public()
        json.dumps(model.public())


def test_wrong_task_checkpoint_is_rejected_before_importing_model_packages(tmp_path):
    # The audit interpreter has no Torch. The mismatch must be rejected before
    # loading a checkpoint, importing that backend or creating an output folder.
    checkpoint = tmp_path / "synthetic-untrusted.pt"
    image = tmp_path / "synthetic.png"
    checkpoint.write_bytes(b"never unpickle this")
    image.write_bytes(b"not a real image")
    output = tmp_path / "result"
    script = Path(__file__).resolve().parents[1] / "scripts/infer_generic_yolov10.py"
    completed = subprocess.run([
        sys.executable, str(script), str(checkpoint), str(image), str(output),
        "--model", "author-yolov10m-device", "--checkpoint-sha256", get_model(DEFAULT_MODEL_ID).sha256,
    ], capture_output=True, text=True, timeout=15, check=False)
    assert completed.returncode == 2
    assert "does not belong to the selected inspected model" in completed.stderr
    assert "ModuleNotFoundError" not in completed.stderr
    assert not output.exists()

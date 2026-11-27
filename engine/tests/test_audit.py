"""Synthetic software tests: these do not validate IEDXray or run a model."""

import copy
import json
from pathlib import Path

import pytest
from PIL import Image

from sdp_xray.data.audit import audit_coco

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_coco.json"


@pytest.fixture
def document():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def save(tmp_path, document, name="coco.json"):
    path = tmp_path / name
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def test_synthetic_negatives_arbitrary_mapping_and_json_report():
    result = audit_coco(FIXTURE)
    assert result["ok"]
    assert result["summary"]["primary"]["images_without_annotations"] == 1
    assert result["summary"]["primary"]["category_map"] == {
        "101": "SYNTHETIC_WIDGET",
        "205": "SYNTHETIC_MARK",
    }
    assert result["summary"]["primary"]["physical_group_checks"] == "not_checked"
    assert any("exact duplicates are unverified" in entry for entry in result["warnings"])
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize(
    "box",
    [
        [0, 0, 0, 5],
        [-1, 0, 5, 5],
        [60, 0, 5, 5],
        [0, 0, 5, 49],
        [0, 0, float("nan"), 4],
        [0, 0, float("inf"), 4],
        [0, 0, True, 4],
        [0, 1, 2],
    ],
)
def test_invalid_boxes(tmp_path, document, box):
    document["annotations"][0]["bbox"] = box
    result = audit_coco(save(tmp_path, document))
    assert not result["ok"]
    assert any("bbox" in entry for entry in result["errors"])


def test_ids_references_and_category_maps(tmp_path, document):
    document["images"].append(copy.deepcopy(document["images"][0]))
    document["annotations"].append(
        {"id": 2, "image_id": 999, "category_id": 999, "bbox": [0, 0, 1, 1]}
    )
    document["categories"][1]["name"] = document["categories"][0]["name"]
    result = audit_coco(save(tmp_path, document))
    assert not result["ok"]
    assert any("Duplicate images id" in entry for entry in result["errors"])
    assert any("image_id 999" in entry for entry in result["errors"])
    assert any("category_id 999" in entry for entry in result["errors"])
    assert any("maps to both" in entry for entry in result["errors"])


@pytest.mark.parametrize(
    "content",
    [
        "{",
        "[]",
        '{"images": {}, "annotations": null}',
        '{"images": [null], "annotations": [], "categories": []}',
    ],
)
def test_invalid_json_and_schema_are_reports(tmp_path, content):
    path = tmp_path / "bad.json"
    path.write_text(content, encoding="utf-8")
    assert not audit_coco(path)["ok"]


def test_missing_annotation_file(tmp_path):
    assert not audit_coco(tmp_path / "missing.json")["ok"]


def test_real_file_dimensions_missing_files_and_hashes(tmp_path, document):
    Image.new("RGB", (64, 48), "red").save(tmp_path / "positive.png")
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert any("missing file" in entry for entry in result["errors"])
    Image.new("RGB", (12, 10), "blue").save(tmp_path / "negative.png")
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert any("differ from file" in entry for entry in result["errors"])
    Image.new("RGB", (64, 48), "blue").save(tmp_path / "negative.png")
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert result["ok"]
    assert result["summary"]["primary"]["image_files_checked"] == 2
    (tmp_path / "negative.png").write_bytes((tmp_path / "positive.png").read_bytes())
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert result["ok"]
    assert any("Exact file duplicates within" in entry for entry in result["warnings"])


@pytest.mark.parametrize(
    "name",
    [
        "../outside.png",
        "..\\outside.png",
        "C:\\outside.png",
        "/outside.png",
        "\\\\server\\share\\outside.png",
    ],
)
def test_image_path_cannot_escape_root(tmp_path, document, name):
    document["images"][0]["file_name"] = name
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert any("relative path" in entry for entry in result["errors"])


def test_corrupt_image_reported(tmp_path, document):
    (tmp_path / "positive.png").write_text("not an image")
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert any("cannot be inspected" in entry for entry in result["errors"])


def test_corrupt_png_checksum_reported_without_aborting(tmp_path, document):
    path = tmp_path / "positive.png"
    Image.new("RGB", (64, 48), "red").save(path)
    content = bytearray(path.read_bytes())
    marker = content.index(b"IDAT")
    chunk_length = int.from_bytes(content[marker - 4 : marker], "big")
    content[marker + 4 + chunk_length] ^= 1
    path.write_bytes(content)
    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert not result["ok"]
    assert any("cannot be inspected" in entry for entry in result["errors"])


def test_truncated_jpeg_passing_verify_is_rejected_by_full_decode(tmp_path, document):
    path = tmp_path / "positive.jpg"
    document["images"][0]["file_name"] = path.name
    Image.new("RGB", (64, 48), "red").save(path)
    path.write_bytes(path.read_bytes()[:-8])
    Image.new("RGB", (64, 48), "blue").save(tmp_path / "negative.png")

    with Image.open(path) as image:
        image.verify()  # This truncated JPEG still has valid headers.
    with Image.open(path) as image, pytest.raises(OSError):
        image.load()

    result = audit_coco(save(tmp_path, document), image_root=tmp_path)
    assert not result["ok"]
    assert any("Image 1 cannot be inspected" in error for error in result["errors"])
    assert result["summary"]["primary"]["image_files_checked"] == 1
    assert result["summary"]["primary"]["image_file_checks"] == "incomplete"


def test_compare_maps_filenames_groups_but_not_ids(tmp_path, document):
    first = save(tmp_path, document)
    other = copy.deepcopy(document)
    for row in other["images"]:
        row["file_name"] = "other-" + row["file_name"]
        row["synthetic_group"] = "other-" + row["synthetic_group"]
    second = save(tmp_path, other, "other.json")
    assert audit_coco(first, other=second, group_key="synthetic_group")["ok"]
    other["images"][0]["synthetic_group"] = document["images"][0]["synthetic_group"]
    other["images"][0]["file_name"] = document["images"][0]["file_name"]
    other["categories"][0]["name"] = "DIFFERENT_SYNTHETIC_WIDGET"
    result = audit_coco(
        first, other=save(tmp_path, other, "other.json"), group_key="synthetic_group"
    )
    assert not result["ok"]
    assert any("Category ID/name maps differ" in entry for entry in result["errors"])
    assert any("Split filename overlap" in entry for entry in result["errors"])
    assert any("Physical-group overlap" in entry for entry in result["errors"])


def test_cross_split_content_duplicates_with_different_names(tmp_path, document):
    Image.new("RGB", (64, 48), "red").save(tmp_path / "positive.png")
    Image.new("RGB", (64, 48), "blue").save(tmp_path / "negative.png")
    first = save(tmp_path, document)
    other = copy.deepcopy(document)
    for row in other["images"]:
        old_name = row["file_name"]
        row["file_name"] = "other-" + old_name
        (tmp_path / row["file_name"]).write_bytes((tmp_path / old_name).read_bytes())
    second = save(tmp_path, other, "other.json")
    result = audit_coco(first, image_root=tmp_path, other=second, other_image_root=tmp_path)
    assert not result["ok"]
    assert len(result["summary"]["split_overlap"]["exact_file_duplicates"]) == 2
    assert any("Exact file content overlaps" in entry for entry in result["errors"])


def test_missing_group_values_explicit(tmp_path, document):
    del document["images"][1]["synthetic_group"]
    result = audit_coco(save(tmp_path, document), group_key="synthetic_group")
    assert result["ok"]
    assert result["summary"]["primary"]["physical_group_checks"] == "incomplete"
    assert any("metadata incomplete" in entry for entry in result["warnings"])


@pytest.mark.parametrize("box", [[0, 0, 10**400, 1], [10**400, 0, 1.0, 1]])
def test_very_large_box_is_out_of_bounds_without_numeric_crash(tmp_path, document, box):
    document["annotations"][0]["bbox"] = box
    result = audit_coco(save(tmp_path, document))
    assert not result["ok"]
    assert any("exceeds image bounds" in entry for entry in result["errors"])


def test_annotation_and_category_duplicate_ids(tmp_path, document):
    document["annotations"].append(copy.deepcopy(document["annotations"][0]))
    document["categories"].append(copy.deepcopy(document["categories"][0]))
    result = audit_coco(save(tmp_path, document))
    assert any("Duplicate annotations id" in entry for entry in result["errors"])
    assert any("Duplicate categories id" in entry for entry in result["errors"])


def test_unhashable_reference_becomes_error(tmp_path, document):
    document["annotations"][0]["image_id"] = []
    document["annotations"][0]["category_id"] = {}
    result = audit_coco(save(tmp_path, document))
    assert not result["ok"]
    assert any("unknown/invalid image_id" in entry for entry in result["errors"])
    assert any("unknown/invalid category_id" in entry for entry in result["errors"])

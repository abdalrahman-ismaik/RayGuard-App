"""Tiny generated software fixtures; not STCray dataset-validation evidence."""

import json
from pathlib import Path

import pytest
from PIL import Image

from sdp_xray.data.stcray import audit_stcray

TRAIN = "STCray_TrainSet"
TEST = "STCray_TestSet"
CLASS = "Class Synthetic"


def annotation(name):
    return {
        "imagePath": name, "imageWidth": 16, "imageHeight": 12,
        "shapes": [{"label": "arbitrary synthetic label", "shape_type": "rectangle",
                    "points": [[10, 9], [2, 3]]}],
    }


def add_image(root, split, name="one.jpg", folder=CLASS, color="red", annotated=True):
    image = root / split / "Images" / folder / name
    image.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (16, 12), color).save(image)
    path = root / split / "Json_BB" / folder / Path(name).with_suffix(".json")
    path.parent.mkdir(parents=True, exist_ok=True)
    if annotated:
        path.write_text(json.dumps(annotation(name)), encoding="utf-8")
    return image, path


@pytest.fixture
def dataset(tmp_path):
    add_image(tmp_path, TRAIN)
    add_image(tmp_path, TEST, name="test.jpg", color="blue")
    return tmp_path


def mutate(path, change):
    value = json.loads(path.read_text())
    change(value)
    path.write_text(json.dumps(value), encoding="utf-8")


def test_full_decode_counts_native_labels_reversed_points_and_negative_folder(dataset):
    add_image(dataset, TRAIN, name="negative.jpg", folder="Class 22_Non Threat", color="green", annotated=False)
    companion = dataset / TRAIN / "Jsonpolygon"
    companion.mkdir()
    (companion / "unvalidated.json").write_text("not parsed")
    result = audit_stcray(dataset)
    assert result["ok"]
    train = result["summary"]["splits"][TRAIN]
    assert train["counts"]["images_decoded"] == 2
    assert train["counts"]["images_hashed"] == 2
    assert train["counts"]["declared_non_threat_without_bbox_json"] == 1
    assert train["counts"]["rectangles_with_reversed_points"] == 1
    assert train["shape_label_histogram"] == {"arbitrary synthetic label": 1}
    assert train["companions"]["Jsonpolygon"]["semantics"] == "unaudited"
    assert "physical_groups_unavailable" in result["summary"]["findings"]
    json.dumps(result, allow_nan=False)


def test_missing_and_orphan_json_and_no_inferred_negative(dataset):
    add_image(dataset, TRAIN, name="missing.jpg", annotated=False)
    add_image(dataset, TRAIN, name="not-negative.jpg", folder="Other Empty Folder", annotated=False)
    orphan = dataset / TRAIN / "Json_BB" / CLASS / "orphan.json"
    orphan.write_text(json.dumps(annotation("orphan.jpg")))
    result = audit_stcray(dataset)
    counts = result["summary"]["splits"][TRAIN]["counts"]
    assert not result["ok"]
    assert counts["missing_expected_bbox_json"] == 2
    assert counts["orphan_bbox_json"] == 1
    assert counts["declared_non_threat_images"] == 0


@pytest.mark.parametrize("name", ["../one.jpg", "sub/one.jpg", "sub\\one.jpg", "C:one.jpg", "wrong.jpg", None])
def test_imagepath_reference_is_safe_basename(dataset, name):
    path = dataset / TRAIN / "Json_BB" / CLASS / "one.json"
    mutate(path, lambda value: value.update(imagePath=name))
    assert not audit_stcray(dataset)["ok"]


@pytest.mark.parametrize("points", [
    [[0, 0], [0, 2]], [[-1, 0], [2, 3]], [[0, 0], [17, 5]],
    [[0, 0], [2, float("inf")]], [[0, 0], [2, float("nan")]],
    [[0, 0], [True, 2]], [[0, 0], [10**400, 1]], [[0, 0]],
])
def test_invalid_rectangles(dataset, points):
    path = dataset / TRAIN / "Json_BB" / CLASS / "one.json"
    mutate(path, lambda value: value["shapes"][0].update(points=points))
    assert not audit_stcray(dataset)["ok"]


def test_actual_dimensions_and_unsupported_shape_type(dataset):
    path = dataset / TRAIN / "Json_BB" / CLASS / "one.json"
    mutate(path, lambda value: value.update(imageWidth=100))
    mutate(path, lambda value: value["shapes"][0].update(shape_type="polygon"))
    findings = audit_stcray(dataset)["summary"]["findings"]
    assert findings["annotation_dimensions_mismatch"]["count"] == 1
    assert findings["unsupported_shape_type"]["count"] == 1


def test_bounds_use_decoded_pixels_even_when_annotation_dimensions_are_larger(dataset):
    path = dataset / TRAIN / "Json_BB" / CLASS / "one.json"
    mutate(path, lambda value: value.update(imageWidth=100))
    mutate(path, lambda value: value["shapes"][0].update(points=[[0, 0], [80, 4]]))
    findings = audit_stcray(dataset)["summary"]["findings"]
    assert "rectangle_outside_declared_dimensions" not in findings
    assert findings["rectangle_outside_actual_dimensions"]["count"] == 1


def test_same_relative_filename_is_warning_without_identical_bytes(dataset):
    test_image = dataset / TEST / "Images" / CLASS / "test.jpg"
    test_annotation = dataset / TEST / "Json_BB" / CLASS / "test.json"
    test_image.rename(test_image.with_name("one.jpg"))
    test_annotation.rename(test_annotation.with_name("one.json"))
    mutate(test_annotation.with_name("one.json"), lambda value: value.update(imagePath="one.jpg"))
    result = audit_stcray(dataset)
    assert result["ok"]
    assert result["summary"]["cross_split"]["relative_image_path_overlap"] == 1
    assert result["summary"]["cross_split"]["exact_duplicate_hashes"] == 0
    assert result["summary"]["findings"]["relative_image_path_cross_split"]["severity"] == "warning"


def test_junk_files_are_preserved_and_excluded_from_image_count(dataset):
    junk = dataset / TRAIN / "Images" / CLASS / "desktop.ini"
    junk.write_text("synthetic metadata")
    result = audit_stcray(dataset)
    assert result["ok"]
    assert result["summary"]["splits"][TRAIN]["counts"]["images"] == 1
    assert result["summary"]["findings"]["unexpected_image_file_extension"]["count"] == 1
    assert junk.read_text() == "synthetic metadata"


@pytest.mark.parametrize("content", ["{", "[]", '{"shapes": null}', '{"imagePath":"one.jpg","imageWidth":true,"imageHeight":12,"shapes":[null]}'])
def test_malformed_json_and_schema_reported(dataset, content):
    (dataset / TRAIN / "Json_BB" / CLASS / "one.json").write_text(content)
    assert not audit_stcray(dataset)["ok"]


def test_empty_shapes_never_implies_benign(dataset):
    path = dataset / TRAIN / "Json_BB" / CLASS / "one.json"
    mutate(path, lambda value: value.update(shapes=[]))
    result = audit_stcray(dataset)
    assert result["ok"]
    assert result["summary"]["splits"][TRAIN]["counts"]["declared_non_threat_images"] == 0
    assert "empty_shapes_no_benign_inference" in result["summary"]["findings"]


def test_corrupt_and_truncated_jpeg_are_fully_decoded(dataset):
    image = dataset / TRAIN / "Images" / CLASS / "one.jpg"
    # Headers remain parseable; full decoding catches the removed final bytes.
    image.write_bytes(image.read_bytes()[:-8])
    result = audit_stcray(dataset)
    assert not result["ok"]
    assert result["summary"]["findings"]["image_decode_failed"]["count"] == 1
    assert result["summary"]["splits"][TRAIN]["counts"]["images_hashed"] == 1


def test_exact_duplicates_detected_across_names_and_splits_with_capped_examples(dataset):
    source = dataset / TRAIN / "Images" / CLASS / "one.jpg"
    for index in range(8):
        image, _ = add_image(dataset, TRAIN, name=f"copy-{index}.jpg")
        image.write_bytes(source.read_bytes())
    image = dataset / TEST / "Images" / CLASS / "test.jpg"
    image.write_bytes(source.read_bytes())
    result = audit_stcray(dataset)
    assert not result["ok"]
    assert result["summary"]["cross_split"]["exact_duplicate_hashes"] == 1
    assert result["summary"]["cross_split"]["train_files_with_overlapping_hash"] == 9
    assert result["summary"]["splits"][TRAIN]["counts"]["within_split_redundant_image_files"] == 8
    for finding in result["summary"]["findings"].values():
        assert len(finding["examples"]) <= 5


def test_finding_counts_remain_exact_after_example_limit(dataset):
    for index in range(8):
        add_image(dataset, TRAIN, name=f"missing-{index}.jpg", annotated=False)
    finding = audit_stcray(dataset)["summary"]["findings"]["missing_expected_bbox_json"]
    assert finding["count"] == 8
    assert len(finding["examples"]) == 5


def test_duplicate_basenames_and_case_insensitive_annotation_match(dataset):
    add_image(dataset, TRAIN, name="one.jpg", folder="Different Synthetic Folder", color="green")
    path = dataset / TRAIN / "Json_BB" / CLASS / "one.json"
    mutate(path, lambda value: value.update(imagePath="ONE.JPG"))
    result = audit_stcray(dataset)
    assert result["ok"]
    assert result["summary"]["findings"]["duplicate_image_basename_within_split"]["count"] == 1
    assert result["summary"]["findings"]["imagePath_case_mismatch"]["count"] == 1


def test_two_images_cannot_share_one_annotation_stem(dataset):
    add_image(dataset, TRAIN, name="one.jpeg")
    result = audit_stcray(dataset)
    assert not result["ok"]
    assert "case_insensitive_image_stem_collision" in result["summary"]["findings"]


def test_missing_dataset_is_reported(tmp_path):
    result = audit_stcray(tmp_path / "absent")
    assert not result["ok"]
    assert result["summary"]["findings"]["missing_required_directory"]["count"] == 6


def symlink(link, target, directory=False):
    link.parent.mkdir(parents=True, exist_ok=True)
    try:
        link.symlink_to(target, target_is_directory=directory)
    except OSError as exc:
        pytest.skip(f"Platform cannot create test symlink: {exc}")


@pytest.mark.parametrize("entry", ["image", "json", "image_directory", "companion", "broken_image"])
def test_external_and_broken_links_are_reported_before_reading(tmp_path, entry):
    root = tmp_path / "dataset"
    add_image(root, TRAIN)
    add_image(root, TEST, name="test.jpg", color="blue")
    outside = tmp_path / "outside"
    outside.mkdir()
    Image.new("RGB", (16, 12), "green").save(outside / "external.jpg")
    (outside / "external.json").write_text(json.dumps(annotation("external.jpg")))
    if entry == "image":
        symlink(root / TRAIN / "Images" / "Class 22_Non Threat" / "external.jpg", outside / "external.jpg")
    elif entry == "json":
        symlink(root / TRAIN / "Json_BB" / CLASS / "external.json", outside / "external.json")
    elif entry == "image_directory":
        symlink(root / TRAIN / "Images" / "External Class", outside, directory=True)
    elif entry == "companion":
        symlink(root / TRAIN / "Captions", outside, directory=True)
    else:
        symlink(root / TRAIN / "Images" / CLASS / "broken.jpg", outside / "missing.jpg")
    result = audit_stcray(root)
    assert not result["ok"]
    assert result["summary"]["findings"]["linked_entry_not_audited"]["count"] == 1
    train = result["summary"]["splits"][TRAIN]
    assert train["counts"]["images_decoded"] == 1
    assert train["counts"]["images_hashed"] == 1
    assert train["counts"]["json_parsed"] == 1
    assert "Captions" not in train["companions"]


@pytest.mark.parametrize("entry", ["split", "Images", "Json_BB"])
def test_required_directory_links_are_not_followed(tmp_path, entry):
    root = tmp_path / "dataset"
    add_image(root, TEST, name="test.jpg", color="blue")
    outside = tmp_path / "outside"
    outside.mkdir()
    if entry == "split":
        symlink(root / TRAIN, outside, directory=True)
    else:
        (root / TRAIN / ("Json_BB" if entry == "Images" else "Images")).mkdir(parents=True)
        symlink(root / TRAIN / entry, outside, directory=True)
    result = audit_stcray(root)
    assert not result["ok"]
    assert result["summary"]["findings"]["linked_entry_not_audited"]["count"] == 1
    assert result["summary"]["splits"][TRAIN]["counts"]["images_decoded"] == 0


def test_explicitly_selected_dataset_root_may_be_a_link(tmp_path):
    root = tmp_path / "dataset"
    add_image(root, TRAIN)
    add_image(root, TEST, name="test.jpg", color="blue")
    chosen_root = tmp_path / "chosen-root"
    symlink(chosen_root, root, directory=True)
    assert audit_stcray(chosen_root)["ok"]

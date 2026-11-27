"""Read-only CPU audit of the native STCray image and rectangle annotation layout."""

from __future__ import annotations

import hashlib
import json
import math
import os
import stat
from collections import Counter, defaultdict
from pathlib import Path, PureWindowsPath
from typing import Any

from PIL import Image

NON_THREAT_FOLDER = "Class 22_Non Threat"
EXAMPLE_LIMIT = 5


def _finite(value: Any) -> bool:
    return type(value) is int or (type(value) is float and math.isfinite(value))


def _annotation(
    path: Path, image: Path | None, size: tuple[int, int] | None,
    display: str, counts: Counter, labels: Counter, add: Any,
) -> None:
    try:
        document = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, ValueError) as exc:
        add("error", "unreadable_json", f"{display}: {type(exc).__name__}")
        return
    if not isinstance(document, dict):
        add("error", "invalid_annotation_object", display)
        return
    counts["json_parsed"] += 1
    name = document.get("imagePath")
    safe_name = (
        isinstance(name, str) and bool(name.strip()) and name not in (".", "..")
        and "/" not in name and "\\" not in name and not PureWindowsPath(name).drive
        and "\x00" not in name
    )
    if not safe_name:
        add("error", "invalid_imagePath_basename", display)
    elif image is not None and name.casefold() != image.name.casefold():
        add("error", "imagePath_mismatch", f"{display}: {name!r} != {image.name!r}")
    elif image is not None and name != image.name:
        add("warning", "imagePath_case_mismatch", display)

    width, height = document.get("imageWidth"), document.get("imageHeight")
    valid_dimensions = all(type(value) is int and value > 0 for value in (width, height))
    if not valid_dimensions:
        add("error", "invalid_annotation_dimensions", display)
    elif size is not None and (width, height) != size:
        add("error", "annotation_dimensions_mismatch", f"{display}: {(width, height)} != {size}")

    shapes = document.get("shapes")
    if not isinstance(shapes, list):
        add("error", "invalid_shapes_array", display)
        return
    if not shapes:
        counts["json_with_empty_shapes"] += 1
        add("warning", "empty_shapes_no_benign_inference", display)
    for index, shape in enumerate(shapes):
        location = f"{display} shapes[{index}]"
        counts["shapes"] += 1
        if not isinstance(shape, dict):
            add("error", "invalid_shape_object", location)
            continue
        label = shape.get("label")
        if not isinstance(label, str) or not label.strip():
            add("error", "invalid_shape_label", location)
        else:
            labels[label] += 1
        if shape.get("shape_type") != "rectangle":
            add("error", "unsupported_shape_type", location)
            continue
        points = shape.get("points")
        if (
            not isinstance(points, list) or len(points) != 2
            or any(not isinstance(point, list) or len(point) != 2 for point in points)
            or not all(_finite(value) for point in points for value in point)
        ):
            add("error", "invalid_rectangle_points", location)
            continue
        counts["rectangles"] += 1
        (xa, ya), (xb, yb) = points
        x1, x2 = min(xa, xb), max(xa, xb)
        y1, y2 = min(ya, yb), max(ya, yb)
        if xa > xb or ya > yb:
            counts["rectangles_with_reversed_points"] += 1
        if x1 == x2 or y1 == y2:
            add("error", "degenerate_rectangle", location)
        if x1 < 0 or y1 < 0 or (valid_dimensions and (x2 > width or y2 > height)):
            add("error", "rectangle_outside_declared_dimensions", location)
        if size is not None and (x1 < 0 or y1 < 0 or x2 > size[0] or y2 > size[1]):
            add("error", "rectangle_outside_actual_dimensions", location)


def audit_stcray(root: Path) -> dict[str, Any]:
    """Audit train/test JPGs and Json_BB, preserving all source files and labels.

    Findings have exact occurrence counts and at most five relative-path examples.
    Rectangles may give corners in either order. Hashes compare file bytes, not
    physical identity or near-duplicates. Companion annotation semantics are not
    validated. No category IDs, benign outcomes, or physical groups are inferred.
    """
    # A user-selected root may itself be a link; all entries beneath it must be local.
    root = Path(root).resolve()
    findings: dict[str, dict[str, Any]] = {}

    def add(severity: str, code: str, example: str) -> None:
        finding = findings.setdefault(code, {"severity": severity, "count": 0, "examples": []})
        finding["count"] += 1
        if len(finding["examples"]) < EXAMPLE_LIMIT:
            finding["examples"].append(example)

    def safe_entry(path: Path) -> bool:
        """Reject links before reads, including broken links and Windows junctions."""
        display = path.relative_to(root).as_posix()
        try:
            attributes = path.lstat()
            if stat.S_ISLNK(attributes.st_mode) or (
                getattr(attributes, "st_file_attributes", 0)
                & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
            ):
                add("error", "linked_entry_not_audited", display)
                return False
            if not path.resolve().is_relative_to(root):
                add("error", "path_outside_dataset_root", display)
                return False
        except FileNotFoundError:
            # Required-directory checks below give missing paths their own finding.
            return True
        except (OSError, ValueError):
            add("error", "unreadable_filesystem_entry", display)
            return False
        return True

    def files_under(folder: Path):
        def walk_error(error: OSError) -> None:
            add("error", "directory_inventory_failed", folder.relative_to(root).as_posix())

        for current, directories, filenames in os.walk(folder, onerror=walk_error, followlinks=False):
            current_path = Path(current)
            directories[:] = [name for name in sorted(directories) if safe_entry(current_path / name)]
            for name in sorted(filenames):
                path = current_path / name
                if safe_entry(path) and path.is_file():
                    yield path

    summary: dict[str, Any] = {
        "splits": {}, "findings": findings, "examples_per_finding_limit": EXAMPLE_LIMIT,
        "physical_groups": "unavailable: no physical-group metadata has been established",
        "scope": "Native JPG decoding/hashes and Json_BB rectangles; no inference, conversion, or source modification",
        "negative_handling": f"Only source folder {NON_THREAT_FOLDER!r} is recorded as declared non-threat; empty shapes imply no benign decision",
    }
    hashes: dict[str, dict[str, list[str]]] = {}
    split_names: dict[str, set[str]] = {}
    add("warning", "physical_groups_unavailable", "Filename/class folders do not establish physical configurations or cases")

    for split in ("STCray_TrainSet", "STCray_TestSet"):
        split_root = root / split
        counts: Counter[str] = Counter({key: 0 for key in (
            "images", "images_decoded", "images_hashed", "bbox_json_files", "json_parsed",
            "images_with_bbox_json", "missing_expected_bbox_json", "orphan_bbox_json",
            "declared_non_threat_images", "declared_non_threat_without_bbox_json",
            "json_with_empty_shapes", "shapes", "rectangles", "rectangles_with_reversed_points",
            "within_split_exact_duplicate_groups", "within_split_redundant_image_files",
        )})
        labels: Counter[str] = Counter()
        folders: Counter[str] = Counter()
        digest_paths: dict[str, list[str]] = defaultdict(list)
        hashes[split] = digest_paths
        split_names[split] = set()
        split_summary: dict[str, Any] = {
            "counts": counts, "folder_image_counts": folders, "shape_label_histogram": labels,
            "companions": {}, "image_extensions": [".jpg", ".jpeg"],
        }
        summary["splits"][split] = split_summary
        images_root, annotations_root = split_root / "Images", split_root / "Json_BB"
        if not safe_entry(split_root):
            continue
        available: dict[Path, bool] = {}
        for folder in (split_root, images_root, annotations_root):
            safe = safe_entry(folder)
            available[folder] = safe and folder.is_dir()
            if safe and not available[folder]:
                add("error", "missing_required_directory", folder.relative_to(root).as_posix())
        if not available[split_root]:
            continue
        image_paths = files_under(images_root) if available[images_root] else []
        annotations: dict[str, Path] = {}
        for path in files_under(annotations_root) if available[annotations_root] else []:
            relative = path.relative_to(annotations_root)
            if path.suffix.casefold() != ".json":
                add("warning", "unexpected_bbox_file_extension", path.relative_to(root).as_posix())
                continue
            counts["bbox_json_files"] += 1
            key = relative.as_posix().casefold()
            if key in annotations:
                add("error", "case_insensitive_json_path_collision", path.relative_to(root).as_posix())
            else:
                annotations[key] = path
        paired: dict[str, tuple[Path, tuple[int, int] | None]] = {}
        basenames: dict[str, list[str]] = defaultdict(list)
        for path in image_paths:
            display = path.relative_to(root).as_posix()
            if path.suffix.casefold() not in (".jpg", ".jpeg"):
                add("warning", "unexpected_image_file_extension", display)
                continue
            relative = path.relative_to(images_root)
            if len(relative.parts) != 2:
                add("error", "unexpected_image_layout", display)
            counts["images"] += 1
            folder = relative.parts[0] if len(relative.parts) > 1 else "<no class folder>"
            folders[folder] += 1
            basenames[path.name.casefold()].append(display)
            split_names[split].add(relative.as_posix().casefold())
            declared_negative = folder == NON_THREAT_FOLDER
            if declared_negative:
                counts["declared_non_threat_images"] += 1
            size = None
            try:
                with Image.open(path) as image:
                    image.load()  # Decode pixel data, not just JPEG headers.
                    size = image.size
                counts["images_decoded"] += 1
            except (OSError, ValueError, Image.DecompressionBombError) as exc:
                add("error", "image_decode_failed", f"{display}: {type(exc).__name__}")
            try:
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                digest_paths[digest.hexdigest()].append(display)
                counts["images_hashed"] += 1
            except OSError as exc:
                add("error", "image_hash_failed", f"{display}: {type(exc).__name__}")
            key = relative.with_suffix(".json").as_posix().casefold()
            if key in paired:
                add("error", "case_insensitive_image_stem_collision", display)
            else:
                paired[key] = (path, size)
            if key in annotations:
                counts["images_with_bbox_json"] += 1
                annotation_relative = annotations[key].relative_to(annotations_root)
                if annotation_relative.as_posix() != relative.with_suffix(".json").as_posix():
                    add("warning", "annotation_path_case_mismatch", display)
                if declared_negative:
                    add("warning", "unexpected_non_threat_bbox_json", display)
            elif declared_negative:
                counts["declared_non_threat_without_bbox_json"] += 1
            else:
                counts["missing_expected_bbox_json"] += 1
                add("error", "missing_expected_bbox_json", display)

        for key, annotation in annotations.items():
            display = annotation.relative_to(root).as_posix()
            if len(annotation.relative_to(annotations_root).parts) != 2:
                add("error", "unexpected_bbox_json_layout", display)
            image, size = paired.get(key, (None, None))
            if image is None:
                counts["orphan_bbox_json"] += 1
                add("error", "orphan_bbox_json", display)
            _annotation(annotation, image, size, display, counts, labels, add)
        for paths in basenames.values():
            if len(paths) > 1:
                add("warning", "duplicate_image_basename_within_split", f"{len(paths)} files: {paths[:EXAMPLE_LIMIT]}")
        for paths in digest_paths.values():
            if len(paths) > 1:
                counts["within_split_exact_duplicate_groups"] += 1
                counts["within_split_redundant_image_files"] += len(paths) - 1
                add("warning", "exact_duplicate_images_within_split", f"{len(paths)} files: {paths[:EXAMPLE_LIMIT]}")
        for companion in sorted(split_root.iterdir()):
            if companion.name in ("Images", "Json_BB") or not safe_entry(companion) or not companion.is_dir():
                continue
            extensions: Counter[str] = Counter()
            total_bytes = 0
            for path in files_under(companion):
                extensions[path.suffix.casefold() or "<no extension>"] += 1
                total_bytes += path.stat().st_size
            split_summary["companions"][companion.name] = {
                "files": sum(extensions.values()), "bytes": total_bytes,
                "extensions": dict(extensions), "semantics": "unaudited",
            }
        if split_summary["companions"]:
            add("warning", "companion_semantics_unaudited", f"{split}: {sorted(split_summary['companions'])}")
        if not counts["images"]:
            add("error", "empty_image_split", split)

    train, test = "STCray_TrainSet", "STCray_TestSet"
    overlap = hashes[train].keys() & hashes[test].keys()
    for digest in sorted(overlap):
        add("error", "exact_image_bytes_cross_split", f"SHA256 {digest}: {hashes[train][digest][0]} / {hashes[test][digest][0]}")
    path_overlap = split_names[train] & split_names[test]
    for name in sorted(path_overlap):
        add("warning", "relative_image_path_cross_split", name)
    summary["cross_split"] = {
        "exact_duplicate_hashes": len(overlap),
        "train_files_with_overlapping_hash": sum(len(hashes[train][key]) for key in overlap),
        "test_files_with_overlapping_hash": sum(len(hashes[test][key]) for key in overlap),
        "relative_image_path_overlap": len(path_overlap),
        "note": "Path overlap alone is not verified leakage; exact-byte equality is not a physical-group audit.",
    }
    summary["error_count"] = sum(entry["count"] for entry in findings.values() if entry["severity"] == "error")
    summary["warning_count"] = sum(entry["count"] for entry in findings.values() if entry["severity"] == "warning")
    messages = {
        severity: [f"{code}: {entry['count']} finding(s); examples in summary.findings"
                   for code, entry in findings.items() if entry["severity"] == severity]
        for severity in ("error", "warning")
    }
    return {"ok": not messages["error"], "errors": messages["error"], "warnings": messages["warning"], "summary": summary}

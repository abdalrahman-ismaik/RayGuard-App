"""Small COCO detection audit. Warnings identify evidence we cannot establish."""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any

from PIL import Image


def _integer(value: Any, minimum: int = 0) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum


def _number(value: Any) -> bool:
    # Python integers are finite even when too large to coerce to a float.
    return (isinstance(value, int) and not isinstance(value, bool)) or (
        isinstance(value, float) and math.isfinite(value)
    )


def _image_path(root: Path, name: str) -> Path:
    """Reject foreign-platform absolute paths and directory/symlink escapes."""
    windows, posix = PureWindowsPath(name), PurePosixPath(name.replace("\\", "/"))
    if windows.drive or windows.root or posix.is_absolute() or ".." in posix.parts:
        raise ValueError("file_name must be a relative path without '..'")
    resolved_root = root.resolve()
    result = resolved_root.joinpath(*posix.parts).resolve()
    if not result.is_relative_to(resolved_root):
        raise ValueError("file_name resolves outside image_root")
    return result


def _inspect(path: Path, root: Path | None, group_key: str | None) -> dict[str, Any]:
    report: dict[str, Any] = {
        "path": str(path),
        "errors": [],
        "warnings": [],
        "summary": {},
        "category_map": {},
        "filenames": set(),
        "hashes": defaultdict(list),
        "groups": set(),
    }
    errors, warnings = report["errors"], report["warnings"]
    try:
        document = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, ValueError) as exc:
        errors.append(f"Cannot read COCO JSON: {exc}")
        return report
    if not isinstance(document, dict):
        errors.append("COCO document must be an object")
        return report

    tables: dict[str, dict[int, dict[str, Any]]] = {}
    for section in ("images", "annotations", "categories"):
        rows = document.get(section)
        tables[section] = {}
        if not isinstance(rows, list):
            errors.append(f"{section} must be an array")
            continue
        for index, row in enumerate(rows):
            if not isinstance(row, dict) or not _integer(row.get("id")):
                errors.append(f"{section}[{index}] needs a nonnegative integer id")
                continue
            identifier = row["id"]
            if identifier in tables[section]:
                errors.append(f"Duplicate {section} id {identifier}")
                continue
            tables[section][identifier] = row

    images, annotations, categories = (
        tables[key] for key in ("images", "annotations", "categories")
    )
    names: dict[str, int] = {}
    for identifier, row in categories.items():
        name = row.get("name")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"Category {identifier} needs a nonempty name")
        elif name in names:
            errors.append(f"Category name {name!r} maps to both {names[name]} and {identifier}")
        else:
            names[name] = identifier
            report["category_map"][str(identifier)] = name

    dimensions: dict[int, tuple[int, int]] = {}
    file_counts: Counter[str] = Counter()
    files_checked = 0
    groups_missing = 0
    for identifier, row in images.items():
        width, height = row.get("width"), row.get("height")
        if not _integer(width, 1) or not _integer(height, 1):
            errors.append(f"Image {identifier} needs positive integer width and height")
        else:
            dimensions[identifier] = (width, height)
        if group_key is not None:
            group = row.get(group_key)
            if (isinstance(group, str) and group.strip()) or _integer(group):
                # Preserve type: numeric 1 must not silently equal string '1'.
                report["groups"].add(json.dumps(group))
            else:
                groups_missing += 1
        name = row.get("file_name")
        if not isinstance(name, str) or not name.strip():
            errors.append(f"Image {identifier} needs a nonempty file_name")
            continue
        normalized = str(PurePosixPath(name.replace("\\", "/")))
        report["filenames"].add(normalized)
        file_counts[normalized] += 1
        try:
            # Validate paths even when access has not yet been supplied.
            image_path = _image_path(root or Path.cwd(), name)
        except (ValueError, OSError) as exc:
            errors.append(f"Image {identifier}: {exc}")
            continue
        if root is None:
            continue
        try:
            if not image_path.is_file():
                errors.append(f"Image {identifier} missing file: {name}")
                continue
            with Image.open(image_path) as image:
                actual_size = image.size
                image.verify()
            # verify() checks file structure; decoding requires reopening the image.
            with Image.open(image_path) as image:
                image.load()
            files_checked += 1
            if identifier in dimensions and actual_size != dimensions[identifier]:
                errors.append(
                    f"Image {identifier} dimensions {dimensions[identifier]} differ from file {actual_size}"
                )
            digest = hashlib.sha256()
            with image_path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            report["hashes"][digest.hexdigest()].append(name)
        except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
            errors.append(f"Image {identifier} cannot be inspected: {exc}")

    duplicate_names = sorted(name for name, count in file_counts.items() if count > 1)
    if duplicate_names:
        warnings.append(f"Repeated file_name entries: {duplicate_names}")
    duplicate_hashes = [names for names in report["hashes"].values() if len(names) > 1]
    if duplicate_hashes:
        warnings.append(f"Exact file duplicates within split: {duplicate_hashes}")
    if root is None:
        warnings.append(
            "Image files not checked: no image_root; actual dimensions and exact duplicates are unverified"
        )
    elif files_checked < len(images):
        warnings.append(
            "Image-file checks incomplete; unreadable/missing files leave duplicate coverage incomplete"
        )
    if group_key is None:
        warnings.append(
            "Physical-group metadata not checked: no group_key supplied; filenames do not establish physical identity"
        )
    elif groups_missing:
        warnings.append(
            f"Physical-group metadata incomplete: {groups_missing} images lack valid {group_key!r}"
        )

    annotated_ids: set[int] = set()
    category_counts: Counter[str] = Counter()
    for identifier, row in annotations.items():
        image_id, category_id = row.get("image_id"), row.get("category_id")
        valid_image = _integer(image_id) and image_id in images
        if not valid_image:
            errors.append(
                f"Annotation {identifier} references unknown/invalid image_id {image_id!r}"
            )
        else:
            annotated_ids.add(image_id)
        if not _integer(category_id) or category_id not in categories:
            errors.append(
                f"Annotation {identifier} references unknown/invalid category_id {category_id!r}"
            )
        else:
            category_counts[str(category_id)] += 1
        box = row.get("bbox")
        if not isinstance(box, list) or len(box) != 4 or not all(_number(value) for value in box):
            errors.append(
                f"Annotation {identifier} bbox needs four finite numbers [x, y, width, height]"
            )
            continue
        x, y, width, height = box
        if x < 0 or y < 0 or width <= 0 or height <= 0:
            errors.append(f"Annotation {identifier} bbox has negative origin or nonpositive size")
        if valid_image and image_id in dimensions:
            image_width, image_height = dimensions[image_id]
            if (
                x > image_width
                or y > image_height
                or width > image_width - x
                or height > image_height - y
            ):
                errors.append(f"Annotation {identifier} bbox exceeds image bounds")

    report["summary"] = {
        "images": len(images),
        "annotations": len(annotations),
        "categories": len(categories),
        "images_without_annotations": len(images) - len(annotated_ids),
        "negative_count_note": "Annotation-empty images are counted; semantic benign labels are not inferred.",
        "annotations_per_category": dict(sorted(category_counts.items())),
        "image_files_checked": files_checked,
        "image_file_checks": "not_checked"
        if root is None
        else ("complete" if files_checked == len(images) else "incomplete"),
        "exact_file_duplicate_groups": duplicate_hashes,
        "physical_group_key": group_key,
        "physical_group_checks": "not_checked"
        if group_key is None
        else ("incomplete" if groups_missing else "complete"),
        "physical_group_count": len(report["groups"]),
        "category_map": report["category_map"],
    }
    return report


def audit_coco(
    path: Path,
    image_root: Path | None = None,
    other: Path | None = None,
    other_image_root: Path | None = None,
    group_key: str | None = None,
) -> dict[str, Any]:
    """Audit one split, optionally comparing another. Never infer links from IDs.

    ``group_key`` names externally documented image-level physical-group metadata
    (nonempty strings or nonnegative integer IDs).
    Hashes compare exact file bytes only: they do not detect near-duplicates.
    Missing roots/metadata produce warnings; invalid annotations/files produce errors.
    """
    primary = _inspect(Path(path), Path(image_root) if image_root is not None else None, group_key)
    errors, warnings = primary["errors"].copy(), primary["warnings"].copy()
    summary: dict[str, Any] = {"primary": primary["summary"], "split_overlap": "not_checked"}
    if other is None:
        warnings.append("Split overlap not checked: no other annotation file supplied")
        if other_image_root is not None:
            errors.append("other_image_root requires other annotation file")
    else:
        secondary = _inspect(
            Path(other), Path(other_image_root) if other_image_root is not None else None, group_key
        )
        summary["other"] = secondary["summary"]
        errors.extend(f"Other split: {entry}" for entry in secondary["errors"])
        warnings.extend(f"Other split: {entry}" for entry in secondary["warnings"])
        overlap_names = sorted(primary["filenames"] & secondary["filenames"])
        overlap_groups = sorted(primary["groups"] & secondary["groups"])
        overlap_hashes = sorted(primary["hashes"].keys() & secondary["hashes"].keys())
        comparable = bool(primary["summary"] and secondary["summary"])
        category_match = (
            primary["category_map"] == secondary["category_map"] if comparable else None
        )
        summary["split_overlap"] = {
            "filenames": overlap_names,
            "physical_group_values": [json.loads(value) for value in overlap_groups],
            "exact_file_duplicates": [
                {
                    "sha256": value,
                    "primary": primary["hashes"][value],
                    "other": secondary["hashes"][value],
                }
                for value in overlap_hashes
            ],
            "exact_file_checks": "checked_available_files"
            if image_root is not None and other_image_root is not None
            else "not_checked",
            "category_maps_match": category_match,
            "image_ids_note": "Image IDs may repeat between splits and are not evidence of leakage.",
        }
        if category_match is False:
            errors.append(
                "Category ID/name maps differ across splits; verify task and mapping before use"
            )
        if overlap_names:
            errors.append(
                f"Split filename overlap: {overlap_names}; investigate content and provenance"
            )
        if overlap_groups:
            errors.append(
                f"Physical-group overlap across splits: {[json.loads(value) for value in overlap_groups]}"
            )
        if overlap_hashes:
            errors.append(
                f"Exact file content overlaps across splits: {len(overlap_hashes)} hashes"
            )
        if image_root is None or other_image_root is None:
            warnings.append(
                "Cross-split exact duplicates not checked: both image roots are required"
            )
    return {"ok": not errors, "errors": errors, "warnings": warnings, "summary": summary}

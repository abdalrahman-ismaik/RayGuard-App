"""Read-only, per-image annotation agreement; deliberately not a COCO AP evaluator."""

import copy
import hashlib
import io
import json
import math
import os

from fastapi import HTTPException
from PIL import Image
from sdp_xray.model_catalog import DEFAULT_MODEL_ID

from .config import MODEL_TASK
from .images import normalize_image
from .intake import plain_file, signature
from .runner import validate_prediction

IOU_THRESHOLD = 0.5
MAX_ANNOTATION_BYTES = 16 * 1024 * 1024
WARNINGS = [
    "Per-image annotation agreement at IoU >= 0.50 and this run's confidence threshold; "
    "not AP, overall accuracy or a safety verdict.",
    "The supplied IEDXray release has known train/test byte duplicates and unresolved "
    "physical groups; agreement does not establish unseen generalization.",
    "An empty generic annotation does not establish a benign image; some modified hosts "
    "have no corresponding region annotation.",
]


def bounded_read(path, root, maximum):
    """Verify a plain file before/after a bounded read, using the intake path boundary."""
    info = plain_file(path, root)
    if info is None or info.st_size > maximum:
        raise ValueError("Unavailable or oversized file")
    stamp = signature(info)
    with path.open("rb") as stream:
        opened = os.fstat(stream.fileno())
        if signature(opened) != stamp or opened.st_dev != info.st_dev:
            raise ValueError("File changed during open")
        content = stream.read(maximum + 1)
        if len(content) > maximum or signature(os.fstat(stream.fileno())) != stamp:
            raise ValueError("File changed during read")
    final = plain_file(path, root)
    if final is None or signature(final) != stamp:
        raise ValueError("File changed after read")
    return content


def identifier(value):
    return type(value) is int and value >= 0


def parse_annotations(content):
    """Validate original COCO IDs/xywh; preserve category 0 rather than renumbering it."""
    data = json.loads(content)
    if not isinstance(data, dict) or any(
        not isinstance(data.get(key), list) for key in ("images", "categories", "annotations")
    ):
        raise ValueError("Expected COCO image, category and annotation lists")
    categories = data["categories"]
    if (
        len(categories) != 1 or not isinstance(categories[0], dict)
        or type(categories[0].get("id")) is not int or categories[0]["id"] != 0
        or categories[0].get("name") != "Explosive"
    ):
        raise ValueError("Expected generic category 0 Explosive")
    images, names, boxes, annotation_ids = {}, {}, {}, set()
    for row in data["images"]:
        if not isinstance(row, dict):
            raise ValueError("Invalid image row")
        image_id, name = row.get("id"), row.get("file_name")
        if (
            not identifier(image_id) or image_id in images
            or not isinstance(name, str) or not name or name in names
            or name in (".", "..") or any(c in name for c in ("/", "\\", "\x00"))
            or any(type(row.get(key)) is not int or row[key] <= 0 for key in ("width", "height"))
        ):
            raise ValueError("Invalid, duplicate or unsafe image identity")
        images[image_id] = row
        names[name] = row
        boxes[image_id] = []
    if not images:
        raise ValueError("Empty image table")
    for row in data["annotations"]:
        if not isinstance(row, dict):
            raise ValueError("Invalid annotation row")
        ann_id, image_id = row.get("id"), row.get("image_id")
        if (
            not identifier(ann_id) or ann_id in annotation_ids
            or not identifier(image_id) or image_id not in images
            or type(row.get("category_id")) is not int or row["category_id"] != 0
            or row.get("iscrowd", 0) != 0 or row.get("ignore", 0) != 0
        ):
            raise ValueError("Invalid IDs, references, crowd or ignored annotation")
        annotation_ids.add(ann_id)
        bbox = row.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4 or any(
            type(v) not in (int, float) or not math.isfinite(v) for v in bbox
        ):
            raise ValueError("Invalid box")
        x, y, width, height = bbox
        image = images[image_id]
        if not (
            x >= 0 and y >= 0 and width > 0 and height > 0
            and x + width <= image["width"] and y + height <= image["height"]
        ):
            raise ValueError("Nonpositive or out-of-bounds box")
        boxes[image_id].append({
            "annotation_id": ann_id, "category_id": 0, "label": "Explosive",
            "box_xyxy": [x, y, x + width, y + height],
        })
    return names, {key: sorted(value, key=lambda b: b["annotation_id"])
                   for key, value in boxes.items()}


def box_iou(first, second):
    """Continuous original-pixel xyxy intersection/union (no inclusive-pixel +1)."""
    intersection = max(0, min(first[2], second[2]) - max(first[0], second[0])) * max(
        0, min(first[3], second[3]) - max(first[1], second[1]),
    )
    area_a = (first[2] - first[0]) * (first[3] - first[1])
    area_b = (second[2] - second[0]) * (second[3] - second[1])
    return intersection / (area_a + area_b - intersection)


def evaluate(boxes, detections):
    """Score-first greedy one-to-one matching; equal scores/IoUs break by source ID."""
    remaining = {box["annotation_id"]: box for box in boxes}
    matches, extras = [], []
    for detection in sorted(detections, key=lambda d: (-d["confidence"], d["id"])):
        candidates = [
            (box_iou(detection["box_xyxy"], box["box_xyxy"]), annotation_id)
            for annotation_id, box in remaining.items()
            if detection["category"] == {"namespace": MODEL_TASK, "label": box["label"]}
        ]
        overlap, annotation_id = max(candidates, key=lambda p: (p[0], -p[1]), default=(0, None))
        if annotation_id is not None and overlap >= IOU_THRESHOLD:
            matches.append({"annotation_id": annotation_id, "detection_id": detection["id"],
                            "iou": overlap})
            del remaining[annotation_id]
        else:
            extras.append(detection["id"])
    missed = sorted(remaining)
    outcome = ("mixed" if missed and extras else "missed" if missed else "extra" if extras
               else "matched" if matches else "empty")
    return {"outcome": outcome, "matched": len(matches), "missed": len(missed),
            "extra": len(extras), "matches": matches, "missed_annotation_ids": missed,
            "extra_detection_ids": extras}


class AnnotationComparison:
    """A pinned, session-local annotation snapshot. Invalid configuration affects only this view."""

    def __init__(self, settings):
        self.settings = settings
        self.source = None
        self.names, self.boxes = {}, {}
        self.reason = "Configure the generic IEDXray test annotation JSON to compare this scan."
        if settings.model_id != DEFAULT_MODEL_ID:
            self.reason = "Reference comparison is available only for the generic detector; this model has a different task."
            return
        path = settings.demo_annotations
        if path is not None:
            try:
                content = bounded_read(path, path.parent.resolve(), MAX_ANNOTATION_BYTES)
                self.names, self.boxes = parse_annotations(content)
                self.source = {"name": path.name, "sha256": hashlib.sha256(content).hexdigest(),
                               "split": "test"}
                self.reason = None
            except (OSError, ValueError, TypeError, KeyError, OverflowError, RecursionError):
                self.reason = "The generic test annotation file is missing, invalid or unsupported."

    def compare(self, run, session):
        response = {
            "schema_version": "rayguard.annotation-comparison.v1", "run_id": run["id"],
            "status": "unavailable", "reason": None, "task": MODEL_TASK,
            "iou_threshold": IOU_THRESHOLD, "annotation_source": None,
            "image_id": None, "image_sha256": None, "boxes": [], "evaluation": None,
            "warnings": list(WARNINGS),
        }
        model = run.get("model") or (run.get("result") or {}).get("model")
        if self.settings.model_id != DEFAULT_MODEL_ID or (
            model is not None and (model.get("id") != DEFAULT_MODEL_ID or model.get("task") != MODEL_TASK)
        ):
            response["reason"] = "Reference comparison is available only for the generic detector; this model has a different task."
            return response
        scan = run["scan"]
        source = scan.get("source", {})
        if (scan.get("origin") != "dataset_demo" or source.get("dataset") != "IEDXray"
                or source.get("split") != "test"):
            response["reason"] = "Reference annotations are available only for IEDXray test replay."
            return response
        if self.reason:
            response["reason"] = self.reason
            return response
        try:
            content = bounded_read(self.settings.demo_annotations,
                                   self.settings.demo_annotations.parent.resolve(),
                                   MAX_ANNOTATION_BYTES)
            if hashlib.sha256(content).hexdigest() != self.source["sha256"]:
                response["reason"] = "The annotation file changed; restart after verifying its pairing."
                return response
            row = self.names.get(scan["name"])
            if row is None:
                response["reason"] = "No exact filename match exists in the configured annotations."
                return response
            with session.lock:
                session.demo._check_root()
                source_bytes = bounded_read(session.demo.root / scan["name"], session.demo.root,
                                            self.settings.max_upload_bytes)
            source_sha256 = hashlib.sha256(source_bytes).hexdigest()
            if source_sha256 != scan.get("source_sha256"):
                response["reason"] = "The original test image no longer matches this run's source hash."
                return response
            with Image.open(io.BytesIO(source_bytes)) as image:
                if image.getexif().get(274, 1) != 1:
                    response["reason"] = "EXIF-oriented images need a verified annotation transform."
                    return response
            _, width, height, normalized = normalize_image(source_bytes, scan["name"], self.settings)
            if (width, height) != (row["width"], row["height"]) or (width, height) != (
                scan["width"], scan["height"],
            ):
                response["reason"] = "Annotation, source image and model-input dimensions do not agree."
                return response
            canonical = bounded_read(session.directory / f"{scan['id']}.png",
                                     session.directory.resolve(), self.settings.max_pixels * 4 + 65536)
            if any(hashlib.sha256(value).hexdigest() != scan["sha256"]
                   for value in (normalized, canonical)):
                response["reason"] = "The source image and stored model input do not match this run."
                return response
        except (OSError, ValueError, TypeError, KeyError, HTTPException):
            response["reason"] = "The annotation or image source is unavailable, changed or unsupported."
            return response
        response.update(status="available", annotation_source=copy.deepcopy(self.source),
                        image_id=row["id"], image_sha256=source_sha256,
                        boxes=copy.deepcopy(self.boxes[row["id"]]))
        if run["state"] != "succeeded" or run.get("result") is None:
            response["reason"] = "Comparison requires a completed, valid detector result."
            return response
        try:
            validate_prediction(run["result"], scan, run, self.settings)
        except (ValueError, TypeError, KeyError):
            response["reason"] = "The detector result does not match this image, task or run settings."
            return response
        response["evaluation"] = evaluate(response["boxes"], run["result"]["detections"])
        return response

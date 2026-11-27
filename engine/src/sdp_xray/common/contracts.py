"""Small, strict JSON contracts. See docs/contracts.md for field semantics."""

import json
import math
from typing import Any

SCHEMA_VERSION = "1.0"


def _object(value: Any, fields: set[str], path: str) -> None:
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError(f"{path} must be an object with exactly {sorted(fields)}")


def _text(value: Any, path: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path} must be a nonempty string")


def _number(value: Any, path: str) -> None:
    if type(value) not in (int, float) or (type(value) is float and not math.isfinite(value)):
        raise ValueError(f"{path} must be a finite number")


def _score(value: Any, path: str) -> None:
    _number(value, path)
    if not 0 <= value <= 1:
        raise ValueError(f"{path} must be between 0 and 1")


def _version(value: dict[str, Any]) -> None:
    if value["schema_version"] != SCHEMA_VERSION:
        raise ValueError(f"schema_version must be {SCHEMA_VERSION!r}")


def validate_scan_input(value: Any) -> None:
    """Validate an externally assigned scan ID and image path, without I/O."""
    _object(value, {"schema_version", "scan_id", "image_path"}, "scan_input")
    _version(value)
    _text(value["scan_id"], "scan_id")
    _text(value["image_path"], "image_path")


def validate_scan_result(value: Any) -> None:
    """Raise ValueError on invalid result structure, coordinates, or associations."""
    _object(
        value,
        {
            "schema_version",
            "scan_id",
            "status",
            "image",
            "model",
            "run",
            "threshold",
            "detections",
            "error",
        },
        "scan_result",
    )
    _version(value)
    _text(value["scan_id"], "scan_id")
    if value["status"] not in ("ok", "missing_input", "error"):
        raise ValueError("status must be ok, missing_input, or error")
    for name, fields in (("model", {"id", "task", "provenance"}), ("run", {"id", "provenance"})):
        _object(value[name], fields, name)
        for field in fields:
            _text(value[name][field], f"{name}.{field}")
    _score(value["threshold"], "threshold")
    if not isinstance(value["detections"], list):
        raise ValueError("detections must be a list")

    image = value["image"]
    if image is not None:
        _object(image, {"width", "height"}, "image")
        if any(type(image[key]) is not int or image[key] <= 0 for key in image):
            raise ValueError("image width and height must be positive integers")
    if value["status"] == "ok":
        if image is None or value["error"] is not None:
            raise ValueError("ok requires image dimensions and a null error")
    else:
        if value["detections"]:
            raise ValueError("missing_input/error cannot carry detections")
        _object(value["error"], {"code", "message"}, "error")
        _text(value["error"]["code"], "error.code")
        _text(value["error"]["message"], "error.message")

    by_id: dict[str, dict[str, Any]] = {}
    for detection in value["detections"]:
        _object(
            detection,
            {
                "id",
                "kind",
                "box_xyxy",
                "category",
                "confidence",
                "device_id",
            },
            "detection",
        )
        _text(detection["id"], "detection.id")
        if detection["id"] in by_id:
            raise ValueError("detection IDs must be unique within a scan")
        by_id[detection["id"]] = detection
        if detection["kind"] not in ("device", "suspicious_region"):
            raise ValueError("detection.kind must be device or suspicious_region")
        _object(detection["category"], {"namespace", "label"}, "category")
        for key in ("namespace", "label"):
            _text(detection["category"][key], f"category.{key}")
        _score(detection["confidence"], "confidence")
        box = detection["box_xyxy"]
        if not isinstance(box, list) or len(box) != 4:
            raise ValueError("box_xyxy must be a four-number list")
        for coordinate in box:
            _number(coordinate, "box coordinate")
        x1, y1, x2, y2 = box
        if not (0 <= x1 < x2 <= image["width"] and 0 <= y1 < y2 <= image["height"]):
            raise ValueError("box must have positive size within original image bounds")
        if detection["device_id"] is not None:
            _text(detection["device_id"], "device_id")
            if detection["kind"] == "device":
                raise ValueError("a device detection must have device_id=null")
    for detection in by_id.values():
        device_id = detection["device_id"]
        if device_id is not None:
            if device_id not in by_id or by_id[device_id]["kind"] != "device":
                raise ValueError("device_id must refer to a device in the same scan")


def validate_case_input(value: Any) -> None:
    """Validate supplied grouping, never derive case identity from filenames."""
    _object(
        value,
        {
            "schema_version",
            "case_id",
            "group_provenance",
            "scans",
            "component_evidence_status",
        },
        "case_input",
    )
    _version(value)
    _text(value["case_id"], "case_id")
    _text(value["group_provenance"], "group_provenance")
    if value["component_evidence_status"] != "not_supplied":
        raise ValueError("component evidence is not implemented; use not_supplied")
    if not isinstance(value["scans"], list) or not value["scans"]:
        raise ValueError("scans must be a nonempty list of scan results")
    scan_ids = set()
    for scan in value["scans"]:
        validate_scan_result(scan)
        if scan["scan_id"] in scan_ids:
            raise ValueError("scan IDs must be unique within a case")
        scan_ids.add(scan["scan_id"])


def dumps_scan_result(value: dict[str, Any]) -> str:
    """Validate and serialize one scan result as JSON."""
    validate_scan_result(value)
    return json.dumps(value, allow_nan=False, sort_keys=True)


def loads_scan_result(value: str) -> dict[str, Any]:
    """Parse and validate one JSON scan result."""
    result = json.loads(value)
    validate_scan_result(result)
    return result


def dumps_case_input(value: dict[str, Any]) -> str:
    """Validate and serialize supplied case grouping as JSON."""
    validate_case_input(value)
    return json.dumps(value, allow_nan=False, sort_keys=True)


def loads_case_input(value: str) -> dict[str, Any]:
    """Parse and validate one JSON case input."""
    result = json.loads(value)
    validate_case_input(result)
    return result

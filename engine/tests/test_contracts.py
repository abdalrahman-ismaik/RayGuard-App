"""Synthetic software contract tests; no dataset or inference validation."""

import copy
import json
import unittest

from sdp_xray.common.contracts import (
    dumps_case_input,
    dumps_scan_result,
    loads_case_input,
    loads_scan_result,
    validate_case_input,
    validate_scan_input,
    validate_scan_result,
)
from sdp_xray.p1 import predict
from sdp_xray.p2 import fuse


def synthetic_result():
    return {
        "schema_version": "1.0",
        "scan_id": "synthetic-scan",
        "status": "ok",
        "image": {"width": 100, "height": 80},
        "model": {
            "id": "synthetic-only",
            "task": "contract-test",
            "provenance": "tests/test_contracts.py",
        },
        "run": {"id": "synthetic-only", "provenance": "tests/test_contracts.py"},
        "threshold": 0.5,
        "error": None,
        "detections": [
            {
                "id": "device-1",
                "kind": "device",
                "box_xyxy": [0, 0, 100, 80],
                "category": {"namespace": "synthetic-only", "label": "example-device"},
                "confidence": 0.8,
                "device_id": None,
            },
            {
                "id": "region-1",
                "kind": "suspicious_region",
                "box_xyxy": [2, 3, 9, 12],
                "category": {"namespace": "synthetic-only", "label": "example-region"},
                "confidence": 0.7,
                "device_id": "device-1",
            },
        ],
    }


def synthetic_case():
    return {
        "schema_version": "1.0",
        "case_id": "externally-supplied-synthetic-case",
        "group_provenance": "Synthetic grouping for software test only",
        "scans": [synthetic_result()],
        "component_evidence_status": "not_supplied",
    }


class ContractTests(unittest.TestCase):
    def test_json_round_trips(self):
        result = synthetic_result()
        self.assertEqual(loads_scan_result(dumps_scan_result(result)), result)
        case = synthetic_case()
        self.assertEqual(loads_case_input(dumps_case_input(case)), case)

    def test_scan_input_checks_structure_without_reading_file(self):
        scan = {
            "schema_version": "1.0",
            "scan_id": "synthetic",
            "image_path": "not-a-real-image.png",
        }
        validate_scan_input(scan)
        for field, value in (("schema_version", "2.0"), ("scan_id", ""), ("image_path", None)):
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_scan_input({**scan, field: value})

    def test_no_detections_is_distinct_from_failure(self):
        result = synthetic_result()
        result["detections"] = []
        validate_scan_result(result)
        self.assertNotIn("benign", dumps_scan_result(result))
        for status in ("missing_input", "error"):
            failure = {
                **result,
                "status": status,
                "image": None,
                "error": {"code": "synthetic-failure", "message": "Test only"},
            }
            validate_scan_result(failure)
            with self.assertRaises(ValueError):
                validate_scan_result({**failure, "error": None})
            with self.assertRaises(ValueError):
                validate_scan_result({**failure, "detections": synthetic_result()["detections"]})
        with self.assertRaises(ValueError):
            validate_scan_result({**result, "image": None})
        with self.assertRaises(ValueError):
            validate_scan_result({**result, "error": {"code": "x", "message": "x"}})

    def test_invalid_boxes_and_dimensions(self):
        for box in (
            [1, 1, 1, 3],
            [9, 1, 2, 3],
            [-1, 0, 2, 3],
            [0, 0, 101, 80],
            [0, 0, 100, 81],
            [0, 0, 2],
            [0, 0, float("nan"), 3],
            [False, 0, 2, 3],
            [0, 0, 10**400, 3],
        ):
            result = synthetic_result()
            result["detections"][0]["box_xyxy"] = box
            with self.subTest(box=box), self.assertRaises(ValueError):
                validate_scan_result(result)
        for width in (0, -1, True, 1.5):
            result = synthetic_result()
            result["image"]["width"] = width
            with self.subTest(width=width), self.assertRaises(ValueError):
                validate_scan_result(result)

    def test_invalid_confidence_and_threshold(self):
        for score in (float("nan"), float("inf"), -0.1, 1.1, True, "0.5", 10**400):
            for field in ("threshold", "confidence"):
                result = synthetic_result()
                target = result if field == "threshold" else result["detections"][0]
                target[field] = score
                with self.subTest(score=score, field=field), self.assertRaises(ValueError):
                    validate_scan_result(result)
        result = synthetic_result()
        result["threshold"] = float("nan")
        with self.assertRaises(ValueError):
            loads_scan_result(json.dumps(result))

    def test_association_must_be_explicit_and_refer_to_device(self):
        result = synthetic_result()
        result["detections"][1]["device_id"] = None
        validate_scan_result(result)
        for device_id in ("missing-device", "region-1", 123):
            result["detections"][1]["device_id"] = device_id
            with self.subTest(device_id=device_id), self.assertRaises(ValueError):
                validate_scan_result(result)
        result = synthetic_result()
        result["detections"][0]["device_id"] = "device-1"
        with self.assertRaises(ValueError):
            validate_scan_result(result)
        del result["detections"][0]["device_id"]
        with self.assertRaises(ValueError):
            validate_scan_result(result)

    def test_duplicate_ids_missing_categories_and_unknown_version(self):
        result = synthetic_result()
        result["detections"].append(copy.deepcopy(result["detections"][0]))
        with self.assertRaises(ValueError):
            validate_scan_result(result)
        for field in ("namespace", "label"):
            result = synthetic_result()
            del result["detections"][0]["category"][field]
            with self.assertRaises(ValueError):
                validate_scan_result(result)
        result = synthetic_result()
        result["schema_version"] = "2.0"
        with self.assertRaises(ValueError):
            validate_scan_result(result)

    def test_case_requires_external_provenance_unique_scans_and_honest_components(self):
        for field, value in (
            ("case_id", ""),
            ("group_provenance", None),
            ("component_evidence_status", "supplied"),
            ("scans", []),
        ):
            case = synthetic_case()
            case[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_case_input(case)
        case = synthetic_case()
        case["scans"].append(synthetic_result())
        with self.assertRaises(ValueError):
            validate_case_input(case)

    def test_model_paths_fail_clearly(self):
        with self.assertRaisesRegex(NotImplementedError, "P1 inference is not implemented"):
            predict({"schema_version": "1.0", "scan_id": "synthetic", "image_path": "x.png"})
        with self.assertRaisesRegex(NotImplementedError, "P2 fusion is not implemented"):
            fuse(synthetic_case())


if __name__ == "__main__":
    unittest.main()

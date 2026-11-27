"""Prototype 1 interface. Model loading and inference are not implemented."""

from typing import Any


def predict(scan_input: dict[str, Any]) -> dict[str, Any]:
    """Reserved scan-input -> scan-result interface; never returns fake predictions."""
    raise NotImplementedError(
        "P1 inference is not implemented. Verify a task-compatible checkpoint, "
        "configuration, category map, and backend before implementing predict()."
    )

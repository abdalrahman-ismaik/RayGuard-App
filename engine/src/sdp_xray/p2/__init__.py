"""Prototype 2 interface. Group fusion and component evidence are not implemented."""

from typing import Any


def fuse(case_input: dict[str, Any]) -> dict[str, Any]:
    """Reserved case-input -> future case-result interface; no inferred grouping."""
    raise NotImplementedError(
        "P2 fusion is not implemented. Confirm externally supplied grouping, "
        "component evidence, case labels, and ownership first."
    )

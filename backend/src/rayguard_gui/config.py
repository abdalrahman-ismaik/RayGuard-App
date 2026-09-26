"""Explicit, local-only settings; browser requests never select executable paths."""

import json
import math
import re
from dataclasses import dataclass, replace
from pathlib import Path

from sdp_xray.model_catalog import DEFAULT_MODEL_ID, get_model

from .engine import APP_ROOT as APP_ROOT
from .engine import REPOSITORY as REPOSITORY

MODEL_ID = DEFAULT_MODEL_ID  # Compatibility for existing generic clients and fixtures.
MODEL_TASK = get_model(DEFAULT_MODEL_ID).task


@dataclass(frozen=True)
class Settings:
    model_id: str = DEFAULT_MODEL_ID
    model_checkpoints: dict[str, Path] | None = None
    model_python: Path | None = None
    cpu_model_python: Path | None = None
    inference_device: str = "cpu"
    runtime_profile: str = "manual"
    runtime_state: Path | None = None
    runtime_verification_required: bool = False
    checkpoint: Path | None = None
    checkpoint_sha256: str | None = None
    storage_dir: Path = APP_ROOT / "runs" / "gui"
    timeout_seconds: int = 180
    max_upload_bytes: int = 20 * 1024 * 1024
    max_pixels: int = 20_000_000
    max_scans: int = 100
    max_runs: int = 100
    max_storage_bytes: int = 2 * 1024**3
    incoming_dir: Path | None = None
    source_label: str = "Export folder"
    max_pending: int = 10
    settle_seconds: float = 2.0
    demo_dir: Path | None = None
    demo_annotations: Path | None = None
    demo_interval_seconds: float = 3.0

    @classmethod
    def from_file(cls, path: Path | None) -> "Settings":
        if path is None:
            return cls()
        path = path.resolve(strict=True)
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or set(value) - set(cls.__dataclass_fields__):
            raise ValueError("GUI config must be an object with recognized settings only")
        spec = get_model(value.get("model_id", DEFAULT_MODEL_ID))
        mappings = value.get("model_checkpoints")
        if mappings is not None:
            if not isinstance(mappings, dict):
                raise ValueError("model_checkpoints must map supported model IDs to local paths")
            parsed = {}
            for model_id, location in mappings.items():
                get_model(model_id)
                if not isinstance(location, str) or not location.strip():
                    raise ValueError("model_checkpoints requires nonempty local paths")
                parsed[model_id] = (path.parent / location).resolve()
            value["model_checkpoints"] = parsed
        for key in ("model_python", "cpu_model_python", "runtime_state", "checkpoint",
                    "storage_dir", "incoming_dir", "demo_annotations"):
            if value.get(key) is not None:
                if not isinstance(value[key], str) or not value[key].strip():
                    raise ValueError(f"{key} must be a nonempty path")
                value[key] = (path.parent / value[key]).resolve()
        if value.get("demo_dir") is not None:
            if not isinstance(value["demo_dir"], str) or not value["demo_dir"].strip():
                raise ValueError("demo_dir must be a nonempty path")
            # Retain links in the configured path so the read-only catalog can reject them.
            value["demo_dir"] = (path.parent / value["demo_dir"]).absolute()
        if "demo_interval_seconds" in value and (
            type(value["demo_interval_seconds"]) not in (int, float)
            or not math.isfinite(value["demo_interval_seconds"])
            or value["demo_interval_seconds"] < 1
        ):
            raise ValueError("demo_interval_seconds must be a finite number of at least 1")
        if "storage_dir" in value and value["storage_dir"] is None:
            raise ValueError("storage_dir cannot be null")
        device = value.get("inference_device", "cpu")
        if not isinstance(device, str) or not re.fullmatch(r"auto|cpu|cuda:(0|[1-9][0-9]{0,2})", device):
            raise ValueError("inference_device must be auto, cpu or cuda:N")
        profile = value.get("runtime_profile", "manual")
        if not isinstance(profile, str) or not re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", profile):
            raise ValueError("runtime_profile must be a short profile identifier")
        if type(value.get("runtime_verification_required", False)) is not bool:
            raise ValueError("runtime_verification_required must be a boolean")
        digest = value.get("checkpoint_sha256")
        if digest is not None and (
            not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
        ):
            raise ValueError("checkpoint_sha256 must be a lowercase SHA-256 digest")
        if spec.id != DEFAULT_MODEL_ID and digest is not None and digest != spec.sha256:
            raise ValueError("The selected model requires its inspected catalog checkpoint hash")
        for key in (
            "timeout_seconds", "max_upload_bytes", "max_pixels", "max_scans",
            "max_runs", "max_storage_bytes", "max_pending",
        ):
            if key in value and (type(value[key]) is not int or value[key] <= 0):
                raise ValueError(f"{key} must be a positive integer")
        if "settle_seconds" in value and (
            type(value["settle_seconds"]) not in (int, float)
            or not math.isfinite(value["settle_seconds"])
            or value["settle_seconds"] <= 0
        ):
            raise ValueError("settle_seconds must be a finite positive number")
        if "source_label" in value and (
            not isinstance(value["source_label"], str)
            or not 1 <= len(value["source_label"].strip()) <= 80
            or any(ord(char) < 32 for char in value["source_label"])
        ):
            raise ValueError("source_label must contain 1 to 80 readable characters")
        return cls(**value).with_model(spec.id)

    def with_model(self, model_id: str) -> "Settings":
        """Resolve three allowlisted artifacts, retaining the original candidate paths."""
        spec = get_model(model_id)
        mappings = dict(self.model_checkpoints or {})
        if self.checkpoint is not None:
            mappings.setdefault(self.model_id, self.checkpoint)
        checkpoint = mappings.get(model_id)
        if checkpoint is None and self.checkpoint is not None:
            checkpoint = self.checkpoint.parent / spec.filename
        digest = (self.checkpoint_sha256 if model_id == self.model_id == DEFAULT_MODEL_ID
                  and self.checkpoint_sha256 is not None
                  else spec.sha256)
        return replace(self, model_id=model_id, checkpoint=checkpoint,
                       checkpoint_sha256=digest, model_checkpoints=mappings,
                       runtime_verification_required=(self.runtime_verification_required
                                                      or model_id != DEFAULT_MODEL_ID))

    def model_record(self) -> dict:
        spec = get_model(self.model_id)
        return {"id": spec.id, "label": spec.label, "task": spec.task, "kind": spec.kind,
                "classes": list(spec.classes), "provenance": f"sha256:{self.checkpoint_sha256}"}

    def model_status(self) -> dict:
        spec = get_model(self.model_id)
        interpreter = (self.cpu_model_python or self.model_python
                       if self.inference_device == "cpu" else self.model_python)
        if self.inference_device == "auto" and (
            interpreter is None or not interpreter.is_file()
        ):
            interpreter = self.cpu_model_python
        configured = all((interpreter, self.checkpoint, self.checkpoint_sha256))
        if not configured:
            reason = "Configure an authorized checkpoint, its SHA-256 and model Python environment."
        elif not interpreter.is_file() or not self.checkpoint.is_file():
            configured = False
            reason = "The configured model environment or checkpoint file is unavailable."
        else:
            reason = "Configured; checkpoint hash and pinned backend are verified on every run."
        return {
            "id": spec.id, "label": spec.label, "task": spec.task, "kind": spec.kind,
            "classes": list(spec.classes), "configured": bool(configured), "reason": reason,
        }

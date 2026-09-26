"""Small machine-local preference; executable paths remain in operator configuration."""

import hashlib
import json
import os
import platform
import re
from dataclasses import replace
from pathlib import Path
from uuid import uuid4

from sdp_xray.model_catalog import DEFAULT_MODEL_ID, get_model

SCHEMA = "rayguard.runtime-policy.v2"
DEVICE = r"cpu|cuda:(0|[1-9][0-9]{0,2})"


def host_id():
    values = [platform.node(), platform.system(), platform.release(), platform.machine()]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


def device_identity(probe, record):
    # Python versions can report different Windows release labels on the same host.
    # Persist and validate this preference with the API interpreter's identity.
    return {"host_id": host_id(), "visibility_mask": probe.get("visibility_mask"),
            "device_order": os.environ.get("CUDA_DEVICE_ORDER"), "uuid": record.get("uuid")}


def _validate_identity(identity):
    if (not isinstance(identity, dict)
            or set(identity) != {"host_id", "visibility_mask", "device_order", "uuid"}
            or not isinstance(identity["host_id"], str)
            or not re.fullmatch(r"[a-f0-9]{64}", identity["host_id"])
            or not isinstance(identity["uuid"], str) or not 1 <= len(identity["uuid"]) <= 160
            or any(ord(c) < 32 for c in identity["uuid"])
            or any(value is not None and (not isinstance(value, str) or len(value) > 2048)
                   for value in (identity["visibility_mask"], identity["device_order"]))):
        raise ValueError("Saved GPU identity is invalid. Select CPU or reselect a detected GPU.")
    if (identity["host_id"] != host_id()
            or identity["visibility_mask"] != os.environ.get("CUDA_VISIBLE_DEVICES")
            or identity["device_order"] != os.environ.get("CUDA_DEVICE_ORDER")):
        raise ValueError("The host or GPU visibility changed. Select CPU or reselect a detected GPU.")


class PolicyStore:
    def __init__(self, config_path: Path):
        self.path = Path(config_path).resolve().with_suffix(".device.local.json")
        self.saved_device = None
        self.saved_model_id = None
        self.identity = None
        self.load_error = None
        self._original = None
        self._applied = False

    def _read(self):
        try:
            with self.path.open("rb") as stream:
                value = stream.read(8193)
        except FileNotFoundError:
            return None
        return value

    def load(self, settings, *, apply=True):
        self.saved_device, self.identity, self.load_error = None, None, None
        self.saved_model_id = None
        self._applied = False
        try:
            self._original = self._read()
            if self._original is None:
                return settings
            if len(self._original) > 8192:
                raise ValueError("Saved runtime preference is oversized. Select CPU to recover.")
            value = json.loads(self._original)
            if not isinstance(value, dict):
                raise ValueError("Saved runtime preference is invalid. Select a model and device again.")
            legacy = value.get("schema_version") == "rayguard.runtime-policy.v1"
            expected = {"schema_version", "device", "identity"} | (set() if legacy else {"model_id"})
            if (set(value) != expected or value["schema_version"] not in (SCHEMA, "rayguard.runtime-policy.v1")
                    or not isinstance(value["device"], str)
                    or not re.fullmatch(DEVICE, value["device"])):
                raise ValueError("Saved runtime preference is invalid. Select CPU or a detected GPU again.")
            model_id = value.get("model_id", settings.model_id)
            get_model(model_id)
            selected = settings.with_model(model_id)
            self.saved_model_id = model_id
            if not apply:
                return selected  # CPU recovery bypasses GPU guards, preserving a valid model choice.
            self.saved_device, self.identity = value["device"], value["identity"]
            if self.saved_device == "cpu":
                if self.identity is not None:
                    raise ValueError("Saved CPU preference is invalid. Select CPU again.")
            else:
                _validate_identity(self.identity)
            self._applied = True
            return replace(selected, inference_device=self.saved_device)
        except (OSError, ValueError, TypeError) as error:
            if apply:
                self.load_error = (str(error) if isinstance(error, ValueError)
                                   and not isinstance(error, json.JSONDecodeError)
                                   else "Saved runtime preference could not be read. Select CPU or a detected GPU again.")
            return settings

    def validate_probe(self, probe, device):
        if not self._applied or device == "cpu" or self.saved_device != device:
            return
        _validate_identity(self.identity)
        record = next((row for row in probe["devices"] if device == f"cuda:{row['index']}"), None)
        if record is None or device_identity(probe, record) != self.identity:
            raise ValueError("The saved GPU mapping changed. Select CPU or reselect a detected GPU.")

    def save(self, policy, identity, model_id=None):
        model_id = model_id or self.saved_model_id or DEFAULT_MODEL_ID
        get_model(model_id)
        if not isinstance(policy, str) or not re.fullmatch(DEVICE, policy):
            raise ValueError("Select CPU or one of the detected GPUs.")
        if policy == "cpu":
            identity = None
        else:
            _validate_identity(identity)
        payload = json.dumps({"schema_version": SCHEMA, "device": policy, "identity": identity,
                              "model_id": model_id},
                             indent=2, allow_nan=False).encode() + b"\n"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock = self.path.with_name(self.path.name + ".lock")
        temporary = self.path.with_name(self.path.name + f".{uuid4().hex}.tmp")
        try:
            lock_stream = lock.open("xb")
        except FileExistsError as error:
            raise ValueError("Another runtime preference update is active. Wait and retry.") from error
        try:
            with lock_stream:
                if self._read() != self._original:
                    raise ValueError("The saved preference changed in another service. Restart before changing it again.")
                with temporary.open("xb") as stream:
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                temporary.replace(self.path)
                self._original = payload
                self.saved_device, self.identity, self.load_error = policy, identity, None
                self.saved_model_id = model_id
                self._applied = False  # A saved preference never changes this session's selected device.
        finally:
            temporary.unlink(missing_ok=True)
            lock.unlink(missing_ok=True)

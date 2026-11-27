"""Bounded hardware discovery and isolated, hash-locked model environment setup.

This module never imports Torch or loads a checkpoint. Installation is preparation;
the application owns real CPU/GPU qualification and the qualification cache.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path

GIB = 1024 ** 3
PATH_FIELDS = ("checkpoint", "storage_dir", "incoming_dir", "demo_dir", "demo_annotations",
               "model_python", "cpu_model_python", "runtime_state")


def _query(argv: list[str]) -> str:
    return subprocess.run(argv, check=True, capture_output=True, text=True,
                          timeout=8, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout


def inventory() -> dict:
    """Return physical inventory, preserving CUDA visibility; no availability claim."""
    result = {
        "schema_version": 1, "system": platform.system(), "machine": platform.machine(),
        "os_version": platform.version(), "cuda_visible_devices": os.getenv("CUDA_VISIBLE_DEVICES"),
        "cuda_device_order": os.getenv("CUDA_DEVICE_ORDER"), "adapters": [],
        "nvidia_devices": [], "errors": [],
    }
    if result["system"] == "Windows":
        command = ("Get-CimInstance Win32_VideoController | "
                   "Select-Object Name,AdapterCompatibility,PNPDeviceID,DriverVersion | "
                   "ConvertTo-Json -Compress")
        try:
            adapters = json.loads(_query(["powershell.exe", "-NoProfile", "-NonInteractive",
                                          "-Command", command]) or "[]")
            result["adapters"] = adapters if isinstance(adapters, list) else [adapters]
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            result["errors"].append(f"Adapter inventory unavailable: {type(error).__name__}")
    smi = shutil.which("nvidia-smi")
    if smi:
        fields = ["index", "uuid", "name", "driver_version", "pci.bus_id", "compute_cap"]
        try:
            try:
                output = _query([smi, "--query-gpu=" + ",".join(fields), "--format=csv,noheader"])
            except subprocess.CalledProcessError:
                fields = fields[:-1]  # Older drivers may not expose compute_cap.
                output = _query([smi, "--query-gpu=" + ",".join(fields), "--format=csv,noheader"])
            for row in csv.reader(io.StringIO(output)):
                if len(row) != len(fields):
                    raise ValueError("Malformed nvidia-smi response")
                device = dict(zip(fields, (item.strip() for item in row)))
                device.setdefault("compute_cap", None)
                result["nvidia_devices"].append(device)
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            result["errors"].append(f"NVIDIA inventory unavailable: {type(error).__name__}")
    else:
        result["errors"].append("nvidia-smi unavailable; this does not establish GPU absence")
    return result


def hardware_fingerprint(details: dict) -> str:
    """Stable host/driver/visibility identity; excludes volatile free memory and errors."""
    keys = ("system", "machine", "os_version", "cuda_visible_devices", "cuda_device_order")
    identity = {key: details.get(key) for key in keys}
    identity["adapters"] = sorted(details.get("adapters", []), key=lambda row: json.dumps(row))
    identity["nvidia_devices"] = sorted(details.get("nvidia_devices", []),
                                         key=lambda row: row.get("uuid", ""))
    return hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()


def _version(value: str) -> tuple[int, ...]:
    if not re.fullmatch(r"\d+(\.\d+)+", value or ""):
        return ()
    return tuple(int(part) for part in value.split("."))


def _visible_candidates(details: dict) -> tuple[list[dict], int]:
    devices = details.get("nvidia_devices", [])
    mask = details.get("cuda_visible_devices")
    if mask is None:
        return devices, len(devices)
    tokens = [part.strip() for part in mask.split(",")]
    if not mask.strip() or tokens == ["-1"]:
        return [], 0
    if all(token.startswith("GPU-") for token in tokens):
        selected = []
        for token in tokens:
            matches = [gpu for gpu in devices if gpu.get("uuid", "").startswith(token)]
            if len(matches) != 1 or matches[0] in selected:
                return [], 0
            selected.append(matches[0])
        return selected, len(selected)
    if all(token.isdecimal() for token in tokens) and len(set(tokens)) == len(tokens):
        if any(int(token) >= len(devices) for token in tokens):
            return [], 0
        # CUDA's ordinal order need not equal nvidia-smi's physical index order.
        # Require coverage of every possible adapter; the runtime probe resolves ordinals.
        return devices, len(tokens)
    return [], 0


def select_profile(details: dict, profiles: dict, device: str = "auto") -> dict:
    """Choose an install candidate, never mark a device qualified."""
    if not re.fullmatch(r"auto|cpu|cuda:\d+", device):
        raise ValueError("Device must be auto, cpu, or cuda:N")
    if details.get("system") != "Windows" or details.get("machine", "").lower() not in {
        "amd64", "x86_64",
    }:
        raise ValueError("Managed profiles currently support Windows x64 only; use a manual runtime")
    cpu = profiles["cpu"]
    if device == "cpu":
        return {"profile": cpu, "reason": "CPU explicitly selected", "device": device}
    candidates, count = _visible_candidates(details)
    if device.startswith("cuda:") and int(device.split(":")[1]) >= count:
        raise ValueError("Requested CUDA ordinal is unavailable in the preserved visibility mask")
    for name in ("cu126", "cu128"):
        profile = profiles[name]
        if not profile["enabled"] or not candidates:
            continue
        compatible = True
        for gpu in candidates:
            cap = _version(gpu.get("compute_cap") or "")
            driver = _version(gpu.get("driver_version") or "")
            minimum_minor = profile["architecture_minors"].get(str(cap[0])) if cap else None
            if (minimum_minor is None or cap[1] < minimum_minor
                    or driver < _version(profile["minimum_driver"])):
                compatible = False
        if compatible:
            return {"profile": profile, "device": device,
                    "reason": "Compatible NVIDIA installation candidate; real qualification required"}
    reason = ("No enabled CUDA profile covers the visible hardware/driver; "
              "CPU candidate selected (unsupported, hidden or unknown GPUs remain unqualified)")
    if device.startswith("cuda:"):
        raise ValueError(reason)
    return {"profile": cpu, "reason": reason, "device": device}


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_profiles(root: Path) -> dict:
    profiles = json.loads((root / "environments/profiles.json").read_text(encoding="utf-8"))
    for profile in profiles.values():
        for key, digest_key in (("lock", "lock_sha256"), ("build_lock", "build_lock_sha256")):
            path = (root / "environments" / profile[key]).resolve()
            if path.parent != (root / "environments").resolve() or _hash(path) != profile[digest_key]:
                raise ValueError(f"Reviewed {key} hash differs for {profile['id']}; review profiles")
    return profiles


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def _setup_lock(root: Path):
    path = root / ".venv-rayguard-cache/setup.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise ValueError("Setup already running or interrupted: inspect .venv-rayguard-cache/setup.lock "
                         "and remove it only after confirming no installer is running") from error
    try:
        with os.fdopen(descriptor, "w") as handle:
            handle.write(str(os.getpid()))
        yield
    finally:
        path.unlink(missing_ok=True)


def environment_path(root: Path, profile: dict) -> Path:
    return root / f".venv-rayguard-{profile['backend']}-{profile['lock_sha256'][:12]}"


def _prepared(root: Path, profile: dict) -> bool:
    folder = environment_path(root, profile)
    try:
        marker = json.loads((folder / "rayguard-setup.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return (marker.get("state") == "prepared" and marker.get("profile") == profile["id"]
            and marker.get("path") == str(folder.resolve())
            and marker.get("lock_sha256") == profile["lock_sha256"]
            and marker.get("python") == profile["python"]
            and marker.get("fork_source") == profile["fork_source"]
            and (folder / "Scripts/python.exe").is_file())


def _run(argv: list[str], env: dict) -> None:
    # subprocess.run kills/reaps the child on timeout or interruption before returning.
    subprocess.run(argv, env=env, check=True, timeout=1800)


def prepare_environment(root: Path, profile: dict, uv: str) -> Path:
    """Install at its permanent path; a failed attempt never changes app config."""
    folder = environment_path(root, profile)
    if folder.resolve().parent != root.resolve():
        raise ValueError("Managed environment must stay directly inside the project")
    marker = folder / "rayguard-setup.json"
    identity = {"profile": profile["id"], "lock_sha256": profile["lock_sha256"],
                "python": profile["python"], "path": str(folder.resolve())}
    python = folder / "Scripts/python.exe"
    if folder.exists():
        if not marker.is_file():
            raise ValueError(f"Refusing to adopt an unmanaged environment: {folder.name}")
        previous = json.loads(marker.read_text(encoding="utf-8"))
        if any(previous.get(key) != value for key, value in identity.items()):
            raise ValueError("Managed environment identity changed; preserve it and review setup")
        if previous.get("state") == "prepared" and python.is_file():
            if previous.get("fork_source") != profile["fork_source"]:
                raise ValueError("Prepared environment lacks the reviewed installer source receipt; "
                                 "review its installation evidence before reuse")
            return python
    else:
        folder.mkdir()
    _atomic_json(marker, {**identity, "state": "preparing"})
    env = dict(os.environ)
    env["UV_PYTHON_INSTALL_DIR"] = str(root / ".venv-rayguard-python")
    env["UV_CACHE_DIR"] = str(root / ".venv-rayguard-cache")
    env["PYTHONNOUSERSITE"] = "1"
    prefix = [uv, "--no-config"]
    try:
        if not python.is_file():
            _run([*prefix, "venv", "--allow-existing", "--python", profile["python"],
                  str(folder)], env)
        cfg = (folder / "pyvenv.cfg").read_text(encoding="utf-8").lower()
        if "include-system-site-packages = false" not in cfg:
            raise ValueError("Managed environment unexpectedly inherits system packages")
        common = ["--python", str(python), "--require-hashes", "--no-index"]
        _run([*prefix, "pip", "install", *common, "--no-deps", "--only-binary", ":all:",
              "-r", str(root / "environments" / profile["build_lock"])], env)
        _run([*prefix, "pip", "sync", *common, "--no-build-isolation", "--link-mode", "copy",
              str(root / "environments" / profile["lock"])], env)
        _run([*prefix, "pip", "check", "--python", str(python)], env)
        # uv verifies --require-hashes but may leave PEP 610 archive_info empty.
        # Record our verified source receipt only after successful install/check.
        _atomic_json(marker, {**identity, "state": "prepared", "qualification": "required",
                              "fork_source": profile["fork_source"]})
    except BaseException:
        _atomic_json(marker, {**identity, "state": "incomplete"})
        raise
    return python


def _base_config(path: Path) -> dict:
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(config, dict):
        raise ValueError("Config must be a JSON object")
    for key in PATH_FIELDS:
        if config.get(key):
            candidate = path.parent / config[key]
            # The replay catalog deliberately rejects linked source components.
            # Resolving them while copying config would erase that evidence.
            config[key] = str(candidate.absolute() if key == "demo_dir" else candidate.resolve())
    mappings = config.get("model_checkpoints")
    if mappings is not None:
        if not isinstance(mappings, dict) or any(
            not isinstance(location, str) or not location.strip() for location in mappings.values()
        ):
            raise ValueError("model_checkpoints must map model IDs to nonempty local paths")
        config["model_checkpoints"] = {
            model_id: str((path.parent / location).resolve()) for model_id, location in mappings.items()
        }
    return config


def setup(root: Path, config_path: Path, *, device: str = "auto", managed: bool = False,
          source_config: Path | None = None, dry_run: bool = False) -> dict:
    """Prepare CPU plus selected CUDA candidate, then atomically write pending config."""
    root, config_path = root.resolve(), config_path.resolve()
    source = source_config or (config_path if config_path.exists() else root / "app/config.example.json")
    base = _base_config(source)
    if base.get("model_python") and not managed:
        raise ValueError("Existing model_python is a manual override; pass --managed explicitly "
                         "with a separate --config path to opt into managed setup")
    profiles = load_profiles(root)
    details = inventory()
    choice = select_profile(details, profiles, device)
    chosen = choice["profile"]
    needed = [profiles["cpu"]]
    if chosen["backend"] != "cpu":
        needed.append(chosen)
    pending = [profile for profile in needed if not _prepared(root, profile)]
    download = sum(profile["download_bytes"] for profile in pending)
    # A metadata-only reuse must not require a second full installation's free space.
    required = 4 * download + GIB if pending else 1024 * 1024
    report = {"profile": chosen["id"], "reason": choice["reason"], "device": device,
              "download_bytes_upper_bound": download, "required_free_bytes": required,
              "free_bytes": shutil.disk_usage(root).free, "inventory": details,
              "hardware_fingerprint": hardware_fingerprint(details),
              "config": str(config_path), "qualification": "required",
              "profiles_to_prepare": [profile["id"] for profile in pending],
              "source_hosts": sorted({host for profile in pending for host in profile["source_hosts"]})}
    if dry_run:
        return report
    print(json.dumps({key: report[key] for key in (
        "profile", "reason", "download_bytes_upper_bound", "required_free_bytes", "free_bytes",
        "profiles_to_prepare", "source_hosts")}), file=sys.stderr, flush=True)
    if report["free_bytes"] < required:
        raise ValueError(f"Insufficient disk: require {required} free bytes before setup")
    uv = shutil.which("uv")
    if not uv:
        raise ValueError("Install uv before preparing the managed model environment")
    original = config_path.read_bytes() if config_path.exists() else None
    with _setup_lock(root):
        interpreters = {p["backend"]: prepare_environment(root, p, uv) for p in needed}
        current = config_path.read_bytes() if config_path.exists() else None
        if current != original:
            raise ValueError("Config changed during installation; prepared environments retained, "
                             "activation cancelled")
        base.update(model_python=str(interpreters[chosen["backend"]]),
                    cpu_model_python=str(interpreters["cpu"]), inference_device=device,
                    runtime_profile=chosen["id"], runtime_verification_required=True,
                    runtime_state=str(config_path.with_name(config_path.stem + ".runtime.local.json")))
        _atomic_json(config_path, base)
    return {**report, "model_python": base["model_python"],
            "cpu_model_python": base["cpu_model_python"], "state": "prepared"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--config", type=Path, default=Path("app/config.managed.local.json"))
    parser.add_argument("--source-config", type=Path)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--managed", action="store_true", help="Explicitly opt into managed setup")
    parser.add_argument("--dry-run", action="store_true", help="Inventory and estimate; no installation")
    parser.add_argument("--inventory", action="store_true", help="Hardware inventory only")
    args = parser.parse_args(argv)
    try:
        report = inventory() if args.inventory else setup(
            args.root, args.config, device=args.device, managed=args.managed,
            source_config=args.source_config, dry_run=args.dry_run)
        print(json.dumps(report, indent=2))
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"state": "setup_incomplete", "error": str(error)}), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Setup cancelled; existing app configuration preserved.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())

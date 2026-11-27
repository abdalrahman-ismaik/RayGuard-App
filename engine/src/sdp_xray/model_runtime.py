"""Small model-process helpers. Torch is supplied by the isolated model environment."""

import csv
import hashlib
import importlib.metadata as metadata
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

UPSTREAM_REVISION = "453c6e38a51e9d1d5a2aa5fb7f1014a711913397"
UPSTREAM_URL = f"https://github.com/THU-MIG/yolov10/archive/{UPSTREAM_REVISION}.zip"
MANAGED_UPSTREAM_URL = f"https://github.com/THU-MIG/yolov10/archive/{UPSTREAM_REVISION}.tar.gz"
MANAGED_UPSTREAM_SHA256 = "ac5262ab1c7f2ad916496cdf6a00cad62cc5d92c2c6254833d9282d26d4e728f"


class RuntimeCheckError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def device_argument(value):
    if not isinstance(value, str) or not re.fullmatch(r"cpu|cuda:(0|[1-9][0-9]*)", value):
        raise ValueError("device must be cpu or a visible cuda:N index")
    return value


def upstream_source():
    distribution = metadata.distribution("ultralytics")
    source = json.loads(distribution.read_text("direct_url.json") or "{}")
    archive = source.get("archive_info", {})
    managed = (source.get("url") == MANAGED_UPSTREAM_URL
               and archive.get("hashes", {}).get("sha256") == MANAGED_UPSTREAM_SHA256)
    if source.get("url") == MANAGED_UPSTREAM_URL and not archive.get("hashes"):
        # uv may omit PEP 610 archive hashes even after --require-hashes succeeds.
        # Accept only the installer's explicit proof for this reviewed lock/prefix.
        try:
            prefix = Path(sys.prefix).resolve()
            proof = json.loads((prefix / "rayguard-setup.json").read_text(encoding="utf-8"))
            profiles = json.loads((Path(__file__).resolve().parents[2]
                                   / "environments/profiles.json").read_text(encoding="utf-8"))
            managed = (proof.get("state") == "prepared" and Path(proof["path"]).resolve() == prefix
                       and proof.get("fork_source") == {"url": MANAGED_UPSTREAM_URL,
                                                          "sha256": MANAGED_UPSTREAM_SHA256}
                       and any(proof.get("profile") == p["id"]
                               and proof.get("lock_sha256") == p["lock_sha256"]
                               for p in profiles.values()))
        except (OSError, ValueError, KeyError, TypeError):
            managed = False
    if distribution.version != "8.1.34" or not (source.get("url") == UPSTREAM_URL or managed):
        raise RuntimeCheckError("incompatible_runtime", "The inspected original YOLOv10 fork is required.")
    return source


def environment_identity():
    """Include dependency versions and installed fork code in qualification invalidation."""
    packages = sorted((dist.metadata.get("Name", ""), dist.version)
                      for dist in metadata.distributions())
    distribution = metadata.distribution("ultralytics")
    folder = Path(distribution.locate_file("ultralytics"))
    digest = hashlib.sha256()
    for source in sorted(folder.rglob("*.py")):
        digest.update(str(source.relative_to(folder)).replace("\\", "/").encode())
        digest.update(source.read_bytes())
    return {"packages_sha256": hashlib.sha256(json.dumps(packages).encode()).hexdigest(),
            "upstream_code_sha256": digest.hexdigest()}


def driver_inventory():
    """Best-effort private provenance; absent nvidia-smi is not hardware absence."""
    try:
        completed = subprocess.run(
            ["nvidia-smi", "--query-gpu=uuid,name,driver_version,pci.bus_id", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5, check=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        return [dict(zip(("uuid", "name", "driver", "pci_bus_id"), map(str.strip, row), strict=True))
                for row in csv.reader(completed.stdout.splitlines()) if len(row) == 4]
    except (OSError, subprocess.SubprocessError, ValueError):
        return []


def device_details(torch, index):
    props = torch.cuda.get_device_properties(index)
    identity = getattr(props, "uuid", None)
    return {
        "index": index, "name": props.name,
        "capability": [props.major, props.minor],
        "total_memory_bytes": props.total_memory,
        "free_memory_bytes": torch.cuda.mem_get_info(index)[0],
        "uuid": str(identity) if identity is not None else None,
    }


def resolve_device(torch, requested, expected_identity=None):
    """Preserve inherited visibility; never let upstream rewrite its CUDA mask."""
    device_argument(requested)
    if requested == "cpu":
        return torch.device("cpu")
    if torch.version.hip:
        raise RuntimeCheckError("incompatible_runtime", "ROCm has not been qualified for this adapter.")
    if not torch.version.cuda or not torch.cuda.is_available():
        raise RuntimeCheckError("cuda_unavailable", "CUDA is unavailable in the selected environment.")
    index = int(requested.split(":")[1])
    if index >= torch.cuda.device_count():
        raise RuntimeCheckError("cuda_unavailable", "The requested visible CUDA device is unavailable.")
    device = torch.device(requested)
    details = device_details(torch, index)
    if expected_identity is not None and details["uuid"] != expected_identity:
        raise RuntimeCheckError("device_changed", "The selected GPU identity changed; restart verification.")
    torch.cuda.set_device(device)
    return device


def fp32_policy(torch):
    """Use only Torch 2.9's new precision controls, including on newer NVIDIA GPUs."""
    torch.backends.fp32_precision = "ieee"
    torch.backends.cuda.matmul.fp32_precision = "ieee"
    torch.backends.cudnn.fp32_precision = "ieee"
    return precision_settings(torch)


def precision_settings(torch):
    return {
        "global": torch.backends.fp32_precision,
        "matmul": torch.backends.cuda.matmul.fp32_precision,
        "cudnn": torch.backends.cudnn.fp32_precision,
        "cudnn_benchmark": torch.backends.cudnn.benchmark,
        "cudnn_deterministic": torch.backends.cudnn.deterministic,
        "deterministic_algorithms": torch.are_deterministic_algorithms_enabled(),
    }


def kernel_check(torch, device):
    """Check allocation, convolution and matmul, not merely runtime availability."""
    try:
        with torch.inference_mode():
            x = torch.ones((1, 3, 16, 16), device=device, dtype=torch.float32)
            weight = torch.ones((4, 3, 3, 3), device=device, dtype=torch.float32)
            result = torch.nn.functional.conv2d(x, weight)
            matrix = torch.ones((8, 8), device=device, dtype=torch.float32)
            product = matrix @ matrix
            if not bool(torch.isfinite(result).all()) or product[0, 0].item() != 8:
                raise RuntimeError("kernel result invalid")
        if device.type == "cuda":
            torch.cuda.synchronize(device)
    except torch.OutOfMemoryError:
        raise
    except RuntimeError as error:
        raise RuntimeCheckError("incompatible_runtime", "The selected runtime failed its kernel check.") from error


def failure_code(error, torch=None, device=None):
    if isinstance(error, RuntimeCheckError):
        return error.code
    if torch is not None and isinstance(error, torch.OutOfMemoryError):
        return "cuda_oom" if device and device.type == "cuda" else "inference_failed"
    if isinstance(error, (ImportError, ModuleNotFoundError)):
        return "incompatible_runtime"
    if isinstance(error, RuntimeError) and device and device.type == "cuda":
        return "cuda_execution_failed"
    return "inference_failed"


def runtime_probe(requested="cpu"):
    """Executed only in a bounded child process; contains no model predictions."""
    import torch
    import torchvision

    upstream_source()
    drivers = driver_inventory()
    host = [platform.node(), platform.system(), platform.release(), platform.machine()]
    report = {
        "schema_version": "rayguard.runtime-probe.v1", "status": "ok",
        "python": platform.python_version(), "torch": str(torch.__version__),
        "torchvision": str(torchvision.__version__), "cuda": torch.version.cuda,
        "hip": torch.version.hip, "cudnn": torch.backends.cudnn.version(),
        "upstream_revision": UPSTREAM_REVISION,
        "host_id": hashlib.sha256(json.dumps(host).encode()).hexdigest(),
        "driver": ",".join(sorted({item["driver"] for item in drivers})) or None,
        "driver_devices": drivers,
        "visibility_mask": os.environ.get("CUDA_VISIBLE_DEVICES"),
        "devices": [], "cpu_ok": False, "selected_device": requested,
        "kernel_ok": False, "architecture_list": [],
        **environment_identity(),
    }
    fp32_policy(torch)
    kernel_check(torch, torch.device("cpu"))
    report["cpu_ok"] = True
    if torch.version.cuda and not torch.version.hip and torch.cuda.is_available():
        report["devices"] = [device_details(torch, i) for i in range(torch.cuda.device_count())]
        report["architecture_list"] = torch.cuda.get_arch_list()
    device = resolve_device(torch, requested)
    if device.type == "cuda":
        kernel_check(torch, device)
    report["kernel_ok"] = True
    return report

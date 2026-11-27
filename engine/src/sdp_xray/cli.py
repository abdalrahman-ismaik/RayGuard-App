"""CPU-only environment inspection and dataset annotation audits."""

import argparse
import json
import os
import platform
import shutil
import subprocess
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

PATH_SETTINGS = {
    "dataset_root": ("SDP_DATA_ROOT", "directory"),
    "annotations": ("SDP_ANNOTATIONS", "file"),
    "checkpoint": ("SDP_CHECKPOINT", "file"),
    "model_config": ("SDP_MODEL_CONFIG", "file"),
    "class_map": ("SDP_CLASS_MAP", "file"),
}


def doctor(config_path: Path | None = None) -> dict:
    """Inspect only supplied paths; never import a model or expose environment values."""
    config = {}
    if config_path is not None:
        config = json.loads(config_path.read_text(encoding="utf-8-sig"))
        if not isinstance(config, dict):
            raise ValueError("Configuration must be a JSON object")
        allowed = set(PATH_SETTINGS) | {"task", "upstream_revision", "physical_group_key"}
        if set(config) - allowed:
            raise ValueError("Unknown configuration field(s); see configs/project.example.json")
        if any(value is not None and not isinstance(value, str) for value in config.values()):
            raise ValueError("Configuration values must be strings or null")

    paths = {}
    for key, (env_name, kind) in PATH_SETTINGS.items():
        env_value = os.environ.get(env_name)
        value = env_value or config.get(key)
        state = "not_configured"
        if value:
            path = Path(value).expanduser()
            if not path.is_absolute() and config_path is not None and not env_value:
                path = config_path.parent / path
            try:
                exists = path.is_dir() if kind == "directory" else path.is_file()
                state = "present_unverified" if exists else "missing_or_wrong_type"
            except OSError:
                state = "unreadable"
        paths[key] = state

    packages = {}
    for package in ("sdp-rayguard", "Pillow", "torch"):
        try:
            packages[package] = version(package)
        except PackageNotFoundError:
            packages[package] = "not_installed"
    gpu = {"status": "nvidia_smi_unavailable", "devices": []}
    executable = shutil.which("nvidia-smi")
    if executable:
        try:
            result = subprocess.run(
                [
                    executable,
                    "--query-gpu=name,memory.total,driver_version",
                    "--format=csv,noheader",
                ],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            gpu = {
                "status": "hardware_reported" if result.returncode == 0 else "query_failed",
                "devices": result.stdout.strip().splitlines() if result.returncode == 0 else [],
            }
        except (OSError, subprocess.TimeoutExpired):
            gpu["status"] = "query_failed"
    return {
        "python": platform.python_version(),
        "platform": platform.system(),
        "packages": packages,
        "paths": paths,
        "gpu": gpu,
        "implemented": ["doctor", "audit-coco", "audit-stcray", "validated JSON contracts"],
        "not_implemented": ["P1 inference/training", "P2 fusion", "model evaluation", "GUI"],
        "real_data_validated": False,
        "model_inference_verified": False,
        "note": "Path presence and GPU inventory do not verify data, checkpoint pairing or CUDA inference.",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    environment = commands.add_parser(
        "doctor", help="Report environment/access; does not load models"
    )
    environment.add_argument("--config", type=Path)
    audit = commands.add_parser(
        "audit-coco", help="Audit COCO JSON and optionally images/split overlap"
    )
    audit.add_argument("annotations", type=Path)
    audit.add_argument("--image-root", type=Path)
    audit.add_argument(
        "--other", type=Path, help="Other published split JSON; does not create a split"
    )
    audit.add_argument("--other-image-root", type=Path)
    audit.add_argument("--group-key", help="Verified image metadata field for physical groups")
    stcray = commands.add_parser(
        "audit-stcray", help="Audit extracted STCray images and native rectangle JSON"
    )
    stcray.add_argument("root", type=Path, help="Parent of STCray_TrainSet and STCray_TestSet")
    args = parser.parse_args(argv)
    try:
        if args.command == "doctor":
            report = doctor(args.config)
            code = 0  # Missing optional artifacts are findings, not a broken doctor.
        elif args.command == "audit-stcray":
            from sdp_xray.data.stcray import audit_stcray

            report = audit_stcray(args.root)
            code = 0 if report["ok"] else 1
        else:
            from sdp_xray.data.audit import audit_coco

            if args.other_image_root and not args.other:
                parser.error("--other-image-root requires --other")
            report = audit_coco(
                args.annotations,
                image_root=args.image_root,
                other=args.other,
                other_image_root=args.other_image_root,
                group_key=args.group_key,
            )
            code = 0 if report["ok"] else 1
    except (OSError, ValueError) as exc:
        # Do not dump local paths or the contents of a malformed configuration.
        report = {
            "ok": False,
            "error": type(exc).__name__,
            "message": "Cannot read valid input; check paths and JSON/configuration format.",
        }
        code = 2
    print(json.dumps(report, indent=2, allow_nan=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())

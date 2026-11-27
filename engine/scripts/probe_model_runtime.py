"""Bounded by the caller; checks an isolated environment without loading a checkpoint."""

import argparse
import contextlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sdp_xray.model_runtime import device_argument, failure_code, runtime_probe  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", type=device_argument, default="cpu")
    args = parser.parse_args()
    try:
        # Keep JSON stdout clean if an imported dependency prints initialization text.
        with contextlib.redirect_stdout(sys.stderr):
            report = runtime_probe(args.device)
    except Exception as error:
        report = {"schema_version": "rayguard.runtime-probe.v1", "status": "error",
                  "error_code": failure_code(error), "cpu_ok": False,
                  "devices": [], "kernel_ok": False}
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
    print(json.dumps(report, allow_nan=False))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Bounded release comparison: three canonical PNGs x A/B/C x five process-cold runs.

Run with `uv run --project app/backend --locked python scripts/benchmark_generic_runtime.py`.
Outputs are private diagnostic evidence, never accuracy estimates or per-install setup work.
"""

import argparse
import json
import os
import platform
import statistics
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app/backend/src"))

from rayguard_gui.runner import validate_forwards  # noqa: E402
from rayguard_gui.runtime import compare_predictions  # noqa: E402

from sdp_xray.common.contracts import validate_scan_result  # noqa: E402
from sdp_xray.model_runtime import sha256  # noqa: E402


def gpu_snapshot():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,driver_version,memory.total,memory.used,"
             "utilization.gpu,pstate,power.draw", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5, check=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        return result.stdout.strip().splitlines()
    except (OSError, subprocess.SubprocessError):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cpu-python", required=True, type=Path)
    parser.add_argument("--gpu-python", required=True, type=Path)
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--images", required=True, type=Path, nargs=3)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if sha256(args.checkpoint) != args.checkpoint_sha256:
        parser.error("checkpoint differs from inspected hash")
    if any(path.suffix.lower() != ".png" or not path.is_file() for path in args.images):
        parser.error("supply exactly three saved canonical PNG files")
    if len({path.stem for path in args.images}) != 3:
        parser.error("canonical image stems must be distinct")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    identity = {
        "schema_version": "rayguard.runtime-benchmark.v1", "started_at": datetime.now(UTC).isoformat(),
        "checkpoint_sha256": args.checkpoint_sha256, "script_sha256": sha256(Path(__file__)),
        "runner_sha256": sha256(ROOT / "scripts/infer_generic_yolov10.py"),
        "helper_sha256": sha256(ROOT / "src/sdp_xray/model_runtime.py"),
        "platform": platform.platform(), "logical_cpus": os.cpu_count(),
        "images": [{"name": p.name, "sha256": sha256(p)} for p in args.images],
        "settings": {"confidence": .25, "precision": "float32", "batch": 1, "repetitions": 5},
        "limitations": ["Process-cold, not machine-cold; no accuracy, FPS or p95 claim.",
                        "Driver power snapshots do not capture all competing application activity."],
    }
    (output / "protocol.json").write_text(json.dumps(identity, indent=2) + "\n", encoding="utf-8")
    targets = [("A", args.cpu_python, "cpu"), ("B", args.gpu_python, "cpu"),
               ("C", args.gpu_python, "cuda:0")]
    references = {}
    runtime_identities = {}
    samples = []
    for repeat in range(5):
        for image_index in range(3):
            source = args.images[(image_index + repeat) % 3]
            order = targets[repeat % 3:] + targets[:repeat % 3]
            for label, python, device in order:
                name = f"{label}-{source.stem}-{repeat + 1}"
                target = output / name
                command = [str(python.resolve()), str(ROOT / "scripts/infer_generic_yolov10.py"),
                           str(args.checkpoint.resolve()), str(source.resolve()), str(target),
                           "--checkpoint-sha256", args.checkpoint_sha256,
                           "--confidence", "0.25", "--device", device]
                before = gpu_snapshot()
                start = perf_counter()
                with (output / f"{name}.log").open("wb") as log:
                    completed = subprocess.run(
                        command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log,
                        stderr=subprocess.STDOUT, timeout=180, check=False,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                    )
                elapsed = perf_counter() - start
                if completed.returncode:
                    raise RuntimeError(f"Stopped at failed trial {name}; inspect its private log.")
                prediction = json.loads((target / "predictions.json").read_text())
                manifest = json.loads((target / "manifest.json").read_text())
                validate_scan_result(prediction)
                expected_input = next(row["sha256"] for row in identity["images"]
                                      if row["name"] == source.name)
                if (manifest["execution"]["actual_device"] != device
                        or manifest["script_sha256"] != identity["runner_sha256"]
                        or manifest["runtime_helper_sha256"] != identity["helper_sha256"]
                        or manifest["checkpoint_sha256"] != identity["checkpoint_sha256"]
                        or manifest["input_sha256"] != expected_input
                        or manifest["output_sha256"]["predictions.json"] != sha256(target / "predictions.json")
                        or manifest["run_id"] != name):
                    raise ValueError("execution identity differs from the frozen protocol")
                validate_forwards(manifest, device)
                observed_identity = {"runtime": manifest["runtime_identity"],
                                     "execution": manifest["execution"],
                                     "driver": manifest["driver_devices"]}
                if runtime_identities.setdefault(label, observed_identity) != observed_identity:
                    raise ValueError("runtime/device identity changed during the benchmark")
                if source.name not in references:
                    references[source.name] = prediction
                parity = compare_predictions(references[source.name], prediction)
                sample = {"target": label, "image": source.name, "repeat": repeat + 1,
                          "process_seconds": elapsed, "load_seconds": manifest["load_seconds"],
                          "predict_call_seconds": manifest["predict_call_seconds"],
                          "upstream_stage_milliseconds": manifest["upstream_stage_milliseconds"],
                          "execution": manifest["execution"], "memory": manifest.get("cuda_memory"),
                          "gpu_before": before, "gpu_after": gpu_snapshot(), "parity": parity}
                samples.append(sample)
                with (output / "samples.jsonl").open("a", encoding="utf-8") as stream:
                    stream.write(json.dumps(sample, allow_nan=False) + "\n")
                print(f"{len(samples)}/45 {name}: process {elapsed:.3f}s; predict "
                      f"{sample['predict_call_seconds']:.3f}s", flush=True)
    summary = []
    for label, _, _ in targets:
        for source in args.images:
            group = [s for s in samples if s["target"] == label and s["image"] == source.name]
            row = {"target": label, "image": source.name, "count": len(group)}
            for metric in ("process_seconds", "predict_call_seconds", "load_seconds"):
                values = [s[metric] for s in group]
                row[metric] = {"median": statistics.median(values), "min": min(values), "max": max(values)}
            summary.append(row)
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

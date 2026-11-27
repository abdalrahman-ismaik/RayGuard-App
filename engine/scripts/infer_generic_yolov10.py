"""One real forward pass from the inspected YOLOv10-M task catalog.

This is a CPU/CUDA reference, not the complete P1 pipeline or an evaluation tool.
Only load author-supplied, inspected checkpoints with their recorded SHA-256.
"""

import argparse
import importlib.metadata as metadata
import json
import os
import platform
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sdp_xray.model_catalog import DEFAULT_MODEL_ID, MODELS, get_model  # noqa: E402
from sdp_xray.model_runtime import (  # noqa: E402
    UPSTREAM_REVISION,
    device_argument,
    device_details,
    driver_inventory,
    environment_identity,
    failure_code,
    fp32_policy,
    precision_settings,
    resolve_device,
    sha256,
    upstream_source,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("image", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--checkpoint-sha256", required=True)
    parser.add_argument("--confidence", type=float, default=0.25)
    parser.add_argument("--device", type=device_argument, default="cpu")
    parser.add_argument("--expected-device-id")
    parser.add_argument("--model", choices=tuple(MODELS), default=DEFAULT_MODEL_ID)
    args = parser.parse_args()
    specification = get_model(args.model)
    if not 0 <= args.confidence <= 1:
        parser.error("confidence must be between zero and one")
    checkpoint = args.checkpoint.resolve(strict=True)
    image_path = args.image.resolve(strict=True)
    if args.checkpoint_sha256 != specification.sha256:
        parser.error("checkpoint hash does not belong to the selected inspected model")
    if sha256(checkpoint) != args.checkpoint_sha256:
        parser.error("checkpoint SHA-256 differs from the inspected artifact")
    args.output.mkdir(parents=True, exist_ok=False)
    os.environ["YOLO_CONFIG_DIR"] = str(args.output.resolve() / "yolo-config")
    os.environ["YOLO_AUTOINSTALL"] = "false"
    os.environ["HF_HUB_OFFLINE"] = "1"
    manifest = {
        "status": "started",
        "run_id": args.output.name,
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "command": [sys.executable, *sys.argv],
        "script_sha256": sha256(Path(__file__)),
        "runtime_helper_sha256": sha256(Path(__file__).resolve().parents[1]
                                        / "src/sdp_xray/model_runtime.py"),
        "model_catalog_sha256": sha256(Path(__file__).resolve().parents[1]
                                       / "src/sdp_xray/model_catalog.py"),
        "model_id": specification.id,
        "class_map_sha256": specification.class_map_sha256,
        "git_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip(),
        "git_status": subprocess.check_output(["git", "status", "--porcelain"], text=True),
        "checkpoint": str(checkpoint),
        "checkpoint_sha256": args.checkpoint_sha256,
        "input": str(image_path),
        "input_sha256": sha256(image_path),
        "upstream_revision": UPSTREAM_REVISION,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "requested_device": args.device,
        "device": None,
        "precision": "float32",
        "seed": None,
        "seed_policy": "not set; evaluation-mode inference with augmentation disabled",
        "annotations_used_for_prediction": False,
        "task": specification.task,
        "source_category_map": specification.source_category_map,
        "settings": {"imgsz": 640, "batch": 1, "conf": args.confidence,
                     "max_det": 300, "augment": False},
        "preprocessing": "original fork LetterBox auto=True for one PT image; RGB / 255",
        "postprocessing": "original fork one-to-one head, top-k, no NMS",
        "limitations": ["single-image smoke test; no accuracy metrics",
                        "fresh-process prediction timing; not benchmark FPS",
                        "author's exact source revision/environment unverified"],
    }
    torch = None
    device = None
    try:
        manifest["upstream_distribution"] = upstream_source()
        import torch
        import torchvision
        from PIL import Image, ImageDraw
        from ultralytics import YOLOv10
        from ultralytics.utils import SETTINGS

        from sdp_xray.common.contracts import validate_scan_result

        SETTINGS.update({"sync": False})
        device = resolve_device(torch, args.device, args.expected_device_id)
        manifest["precision_policy"] = fp32_policy(torch)
        manifest["runtime_identity"] = environment_identity()
        details = device_details(torch, device.index) if device.type == "cuda" else None
        manifest["driver_devices"] = driver_inventory()
        manifest["visibility_mask"] = os.environ.get("CUDA_VISIBLE_DEVICES")
        manifest["device"] = str(device)
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)
            manifest["cuda_memory_before"] = dict(zip(
                ("free_bytes", "total_bytes"), torch.cuda.mem_get_info(device), strict=True,
            ))
        manifest["packages"] = {
            package: metadata.version(package) for package in
            ("torch", "torchvision", "ultralytics", "numpy", "opencv-python", "Pillow")
        }
        original_load = torch.load

        def load_inspected_file(path, *positional, **kwargs):
            # The original fork predates PyTorch's weights_only default. Limit this
            # compatibility override to the one explicitly hashed author artifact.
            if Path(path).resolve() != checkpoint:
                raise ValueError("unexpected checkpoint load")
            kwargs["weights_only"] = False
            return original_load(path, *positional, **kwargs)

        start = perf_counter()
        with patch("torch.load", load_inspected_file):
            model = YOLOv10(str(checkpoint))
        manifest["load_seconds"] = perf_counter() - start
        if model.names != specification.names:
            raise ValueError(f"checkpoint class map differs from selected task: {model.names}")
        manifest["model_names"] = model.names
        manifest["model_yaml"] = model.model.yaml
        forwards = []

        def record_forward(module, inputs):
            effective = precision_settings(torch)
            if any(effective[key] != "ieee" for key in ("global", "matmul", "cudnn")):
                raise ValueError("effective precision changed from IEEE FP32")
            parameter = next(module.parameters())
            forwards.append({"shape": list(inputs[0].shape), "input_device": str(inputs[0].device),
                             "input_dtype": str(inputs[0].dtype),
                             "model_device": str(parameter.device), "model_dtype": str(parameter.dtype)})

        hook = model.model.register_forward_pre_hook(record_forward)
        if device.type == "cuda":
            torch.cuda.synchronize(device)
        start = perf_counter()
        try:
            prediction = model.predict(
                source=str(image_path), device=device, half=False, save=False, verbose=False,
                **manifest["settings"],
            )[0]
        finally:
            hook.remove()
        if device.type == "cuda":
            torch.cuda.synchronize(device)
        manifest["predict_call_seconds"] = perf_counter() - start
        manifest["effective_precision_policy"] = precision_settings(torch)
        if not forwards or any(
            item["input_device"] != str(device) or item["model_device"] != str(device)
            or item["input_dtype"] != "torch.float32" or item["model_dtype"] != "torch.float32"
            for item in forwards
        ):
            raise ValueError("forward did not execute on the requested device in FP32")
        manifest["forwards"] = forwards
        manifest["forward_input_shapes_including_warmup"] = [item["shape"] for item in forwards]
        manifest["prediction_input_shape"] = forwards[-1]["shape"]
        manifest["prediction_box_tensor"] = {
            "shape": list(prediction.boxes.data.shape),
            "device": str(prediction.boxes.data.device), "dtype": str(prediction.boxes.data.dtype),
        }
        manifest["execution"] = {
            "schema_version": "rayguard.execution.v1", "requested_device": args.device,
            "actual_device": forwards[-1]["input_device"], "backend": device.type,
            "device_name": details["name"] if details else None,
            "device_id": details["uuid"] if details else None, "precision": "float32",
            "python": platform.python_version(), "torch": str(torch.__version__),
            "torchvision": str(torchvision.__version__), "cuda": torch.version.cuda,
            "cudnn": torch.backends.cudnn.version(),
        }
        if device.type == "cuda":
            manifest["cuda_memory"] = {
                "peak_allocated_bytes": torch.cuda.max_memory_allocated(device),
                "peak_reserved_bytes": torch.cuda.max_memory_reserved(device),
                "free_bytes": torch.cuda.mem_get_info(device)[0],
                "total_bytes": torch.cuda.mem_get_info(device)[1],
            }
        manifest["upstream_stage_milliseconds"] = prediction.speed
        with Image.open(image_path) as image:
            overlay = image.convert("RGB")
        result = {
            "schema_version": "1.0", "scan_id": image_path.stem, "status": "ok",
            "image": {"width": overlay.width, "height": overlay.height},
            "model": {"id": specification.id, "task": manifest["task"],
                      "provenance": f"sha256:{args.checkpoint_sha256}"},
            "run": {"id": args.output.name, "provenance": "manifest.json"},
            "threshold": args.confidence, "detections": [], "error": None,
        }
        for index, box in enumerate(prediction.boxes):
            class_id = int(box.cls.item())
            if class_id not in specification.names:
                raise ValueError(f"unexpected predicted class {class_id}")
            result["detections"].append({
                "id": f'{"device" if specification.kind == "device" else "threat"}-{index}',
                "kind": specification.kind,
                "box_xyxy": box.xyxy[0].cpu().tolist(),
                "category": {"namespace": manifest["task"], "label": model.names[class_id]},
                "confidence": float(box.conf.item()), "device_id": None,
            })
        validate_scan_result(result)
        draw = ImageDraw.Draw(overlay)
        for detection in result["detections"]:
            box = detection["box_xyxy"]
            draw.rectangle(box, outline="red", width=2)
            draw.text((box[0], max(0, box[1] - 12)),
                      f'{detection["category"]["label"]} {detection["confidence"]:.3f}', fill="red")
        draw.text((5, 5), "MODEL PREDICTIONS - smoke test", fill="red")
        overlay.save(args.output / "overlay.png")
        (args.output / "predictions.json").write_text(json.dumps(result, indent=2) + "\n")
        manifest.update(status="ok", detection_count=len(result["detections"]),
                        output_sha256={name: sha256(args.output / name)
                                       for name in ("overlay.png", "predictions.json")})
        print(json.dumps({"status": "ok", "detections": len(result["detections"]),
                          "output": str(args.output)}))
    except Exception as error:
        manifest.update(status="error", error_code=failure_code(error, torch, device),
                        error=f"{type(error).__name__}: {error}")
        raise
    finally:
        (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()

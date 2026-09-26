# Model selection and trained classes

> Historical SDP record from 25–26 September 2026. Commands and service ports
> below describe that original checkout and its private evidence, not an
> automatically available preview or a new verification of this repository.
> Use the [current app setup](../README.md) for the extracted layout.

26 September 2026 · T28. The workspace selects one inspected checkpoint/task and
one CPU/GPU target per server session. The architecture name alone does not define
the classes: these names come from the particular trained checkpoint. Selection
does not retrain a model or add classes to it.

## Available task pairings

| Model menu entry | Model output classes, in index order | Meaning |
|---|---|---|
| YOLOv10-M · Generic Explosive | 0: Explosive | Suspicious explosive region localization |
| YOLOv10-M · Electronic Devices | 0: Laptop; 1: Mobile; 2: Pager; 3: Walkie-Talkie | Electronic-device localization; no threat verdict |
| YOLOv10-M · Specific Explosives | 0: IED Explosive; 1: Laptop Explosive; 2: Mobile Phone Explosive; 3: Pager Explosive; 4: Walkie-Talkie Explosive | Suspicious-region labels; not whole-device safety classification |

Namespaces are respectively `iedxray.generic_explosive_detection`,
`iedxray.device_detection` and `iedxray.specific_explosive_detection`. Generic
COCO category ID is 0; device/specific source COCO IDs are 1–4/1–5, distinct from
zero-based model indices. Exact mappings live in
[`model_catalog.py`](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4/src/sdp_xray/model_catalog.py). The device model emits
`kind=device`; the other two emit `kind=suspicious_region`. Standalone predictions
keep `device_id=null`; no host association or compute identity is invented.

All three artifacts are executed using the original THU-MIG YOLOv10 revision
`453c6e38a51e9d1d5a2aa5fb7f1014a711913397`, embedded YOLOv10-M architecture and
inspected class order. Before deserialization, the CLI requires the selected
catalog hash; after loading it checks exact embedded names. It preserves the
narrow trusted-checkpoint override, canonical RGB PNG/EXIF handling, original
stride-aligned letterboxing and one-to-one/top-k postprocessing without NMS.

| Model ID / file | SHA-256 |
|---|---|
| `author-yolov10m-generic` / `yolov10_generic_exp.pt` | `b484d9a6fb37236f6adcc8c019e6a836f11901dc53a0f71d6cce7262413287ff` |
| `author-yolov10m-device` / `yolov10_device_detection.pt` | `8106dc79234473def8335e863585623f2c0de17e57a6b6c0a7d1c61bf2691f2d` |
| `author-yolov10m-specific` / `yolov10_specific_exp.pt` | `4464ad8a9c02d550b79fe616ea1c39869f5f9c2e604025ef3dd9de4f544f0172` |

The broader annotation export is not a verified eleven-class model. Proposed lab
component labels are not automatically outputs of these checkpoints. Stored
Mobile/Pager labels are preserved: the source audit's 4,955 disagreements remain
unresolved. See [data and execution limits](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/verification.md).

## Selection and readiness

Open **Workspace setup → Model & compute**, choose **Model**, then **CPU / GPU**,
and select **Apply and restart**. The active model remains explicit while editing
the draft. Model/device save atomically; only the opted-in launcher restarts its
own child. No weights or packages are installed by page load or selection.

Pause acquisition, finish active/pending work and export needed reviews first.
Restart clears in-memory scans/history/queues; disk evidence remains. Existing
folder files become the next session's startup baseline. Unsupervised launches
offer **Save for next launch**. See [restart and CPU recovery](usage.md#choose-cpu-or-gpu-in-the-workspace).

Managed or verification-enabled sessions need matching runtime qualification for
each model. Legacy generic CPU configurations retain their per-run compatibility
checks; selecting a non-generic model requires explicit verification. Upload an authorized
scan, then **Verify with this scan** when pending. CPU selection checks CPU alone;
GPU selection compares prepared CPU/GPU execution using the same canonical image.
Ordinary manual/replay/folder work stays gated until ready. Qualification binds
checkpoint, task, class map, catalog/adapter source, runtime and hardware identity.
Existing CPU/GPU preference files migrate without changing the configured model.

Saved results and exports retain immutable model/classes and actual execution
evidence. Historical records use their recorded result identity; absent metadata
stays unrecorded. The shared `ScanResult`/`predictions.json` schema remains 1.0.
Generic annotation comparison is available only for eligible generic test replay.
Device/specific comparison is explicitly unavailable in this increment; their
boxes are never compared against generic ground truth.

## Configuration

Old configs default to the generic model. Place the three known filenames beside
the configured checkpoint, or map their local locations explicitly:

```json
{
  "model_id": "author-yolov10m-generic",
  "model_checkpoints": {
    "author-yolov10m-generic": "models/local/yolov10_generic_exp.pt",
    "author-yolov10m-device": "models/local/yolov10_device_detection.pt",
    "author-yolov10m-specific": "models/local/yolov10_specific_exp.pt"
  }
}
```

These fields supplement the interpreter/runtime/storage settings in
[`config.example.json`](../config.example.json). Paths are relative to the config
file. Managed setup rebases mappings when copying between config directories.
Browser requests carry only allowlisted IDs, never checkpoint/interpreter paths.
Missing or altered files remain unavailable with a reason.

## Listed but unavailable families

| Family | Remaining pairing work |
|---|---|
| AO-DETR | Custom modules/backend and task mapping |
| Cascade R-CNN | MMDetection backend and exact task/class mapping |
| Faster R-CNN | Backend; specific checkpoint's four-class head versus five-name metadata |
| DETR | Trained output-index/category mapping; inspected heads have 92 outputs |
| Grounding DINO | Prompt/category mapping and local language/tokenizer assets |

The historical 22 September inventory contained eighteen files. The 26 September
working folder contains only the three YOLO checkpoints. Other families stay
disabled even if an arbitrary file is copied into the folder; no backend for them
was installed or executed. [Historical inspection](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/checkpoint-catalog.md)
is distinct from current availability and execution evidence.

## Executed diagnostic study

Before modification, the original CPU runner was preserved privately and rerun on
the same canonical PNG bytes for Train000003, Test000001 and Test000034. Current
config/source identity and outputs were retained in a fresh ignored evidence
directory. The updated generic CPU results match those three outputs exactly.

The frozen protocol then ran eighteen fresh processes serially: three images ×
three task models × CPU/GPU. Generic CPU used the preserved reference environment;
device/specific CPU used the isolated CPU profile; all GPUs used the isolated
CUDA 12.6 profile on the local RTX 2060. FP32, batch one, confidence 0.25,
imgsz 640, max_det 300, no augmentation and original postprocessing stayed fixed.

| Diagnostic image | Generic output | Device output | Specific output |
|---|---|---|---|
| Train000003 | 1 Explosive | Empty | 1 IED Explosive |
| Test000001 | Empty (retained generic known miss) | 1 Laptop | Empty |
| Test000034 | Empty | 1 Laptop | Empty |

All nine CPU/GPU pairs passed the predeclared gates: exact count/class/namespace/
dimensions/threshold, one-to-one box matches, maximum coordinate difference 0.5
original-image pixel, IoU at least 0.99 and confidence difference at most 0.001.
Manifests prove actual model/input device and FP32 dtype, including GPU warm-up.
Nonempty device/specific overlays were visually inspected. Empty matches prove
execution compatibility only, not nonempty-box correspondence or benignness.

Private protocol, input hashes, manifests, outputs and the parity summary are in
`runs/model-selection-2026-09-26/`. This bounded smoke study does not establish
AP/recall, unseen generalization, label correctness, P1 association/decisions or
P2 fusion. No training, new weights, full dataset benchmark or other-family
installation was performed. Second-laptop and separate CPU-host qualification,
intended lab pairing and human showcase acceptance remain open.

## Application and software checks

The task-owned service on 8772 completed actual workspace model/device changes:
generic GPU → device CPU → device GPU → specific GPU → generic GPU. Each selected
pair completed required qualification and positive ordinary inference, with model
and actual-device evidence retained in private exports. The launcher recognized
the non-generic running service on a repeated invocation without replacing it.
A specific-model one-image test replay/review/export returned unavailable generic
comparison with zero GT boxes. Actual positive/empty/provenance browser views were
inspected read-only; no safety verdict appeared.
After returning to generic GPU, the same one-image replay preserved the known
miss: one generic reference box, zero predictions, outcome **Missed target**.
The final preview is GPU-ready with a positive upload and the reviewed known miss.

Ruff passed; 143 root, 267 backend and 133 browser tests passed, and the production
build passed. Coverage includes old configs/exports, wrong model/hash/class/kind,
qualification separation, saved/current identities, atomic restart, failed runs,
reference isolation and mobile accessibility. CPU CI uses synthetic software
checks; actual-model evidence is the separate bounded local study above. The
original CPU config is byte-identical to its protected copy. Existing 8765–8767,
8770 and 8771 service PIDs were unchanged throughout this task.

For another machine, follow [current app setup](../README.md), configure
authorized checkpoint locations and complete that machine's model checks.
Export needed reviews before changing model/device. `-InferenceDevice cpu`
provides CPU recovery without restoring session-only queues/history.

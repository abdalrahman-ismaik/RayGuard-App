# RayGuard portable GPU inference — implementation prompt

> Historical SDP record from 25–26 September 2026. Commands and service ports
> below describe that original checkout and its private evidence, not an
> automatically available preview or a new verification of this repository.
> Use the [current app setup](../README.md) for the extracted layout.

Copy the prompt below into an implementation session opened at the repository root.
Its technical reference is [the reviewed GPU plan](gpu-inference-plan.md).
This document is an execution brief for T28, not a second backlog or evidence of implementation.

---

Implement portable GPU inference and automatic local runtime setup for RayGuard.
Deliver working code, tests, documentation and honest execution evidence. Follow the
existing repository architecture and the reviewed plan; do not stop after proposing
another plan. Keep the implementation small enough for the student contributors to explain.

**1. Read the project and establish ownership**

Read `AGENTS.md`, `docs/status.md`, active task T28 in `docs/tasks.md`,
`docs/meeting_minutes/README.md` and the latest applicable companion/follow-up.
Then read `docs/README.md`, `CONTRIBUTING.md`, relevant `docs/context.md`,
`docs/research.md`, `docs/architecture.md`, `docs/first-inference.md`,
`app/README.md`, `app/architecture.md`, `app/annotation-comparison.md`, and
`app/gpu-inference-plan.md`. Apply the project baseline-reproduction and
detection-evaluation skills; use the frontend/browser skills when their work applies.

Inspect current source, Git status and running services before editing. Other sessions
have been changing the dashboard and annotation comparison. Preserve their work and
the current eye intro, themes, review drafts, overlays, queues and exports. Re-read
shared files before narrow changes. Preserve pre-existing services; use an isolated,
task-owned qualification service and port, which may be deliberately restarted for
verification/rollback. Do not reset, overwrite unrelated edits, publish, merge or push.

Use one coordinator for shared contracts/status. Delegate independent reviews and
separately owned files when useful. One owner controls GPU jobs and private output
directories; do not run parallel GPU benchmarks. Give concise progress updates and
continue routine reversible work without repeated confirmation. Stop only dependent
work when information or access is genuinely missing; continue independent implementation.

This implementation brief includes project-local installation of the reviewed, locked
dependencies needed for bounded qualification. First inspect and report download size,
disk requirements and package sources. Do not change global Python, drivers, system
CUDA Toolkit, OS settings or unrelated environments. Do not download new model weights,
run training or launch a full-dataset benchmark.

**2. Required product behavior**

On a supported laptop, first-run setup must detect hardware, choose an appropriate
reviewed runtime, prepare an isolated environment, verify model execution and save
machine-local configuration. Users should not need to choose a CUDA version or copy
another person's interpreter paths. Ordinary page loads must not install packages.

Initial acceleration scope is supported Windows x64 NVIDIA laptops. Include a portable
CPU runtime. Identify other vendors accurately, but keep AMD/ROCm, Intel/XPU,
Apple/MPS, DirectML and other OS profiles disabled until separately qualified. Never
claim support for every laptop or every GPU. The GPU belongs to the API host, not
necessarily the computer displaying the browser.

Implement these policies:

- `auto`: default for newly generated configurations. Select a verified compatible
  GPU before accepting runs; otherwise use verified CPU and show the reason.
- `cpu`: explicit CPU with no CUDA requirement.
- `cuda:N`: explicit visible CUDA device. Invalid/unavailable/incompatible selection
  fails clearly; it never silently substitutes CPU.
- Existing configurations without the new field retain their CPU behavior. Preserve
  `model_python` as an advanced override; do not modify that environment implicitly.

Freeze the resolved interpreter, backend, device and profile for the server session
and snapshot them per accepted job. Device changes require a deliberate restart.
A GPU failure during a run remains a failed run; never silently replay it on CPU.
Before any ordinary job has been accepted, unresolved startup may finalize its CPU/GPU
choice. Once a session is resolved, later GPU qualification records readiness for a
restart, not a hot swap. If neither runtime is verified, report incomplete setup.

**3. Preserve the verified model boundary**

Use the supplied generic YOLOv10-M checkpoint and original THU-MIG fork:

- Checkpoint: `yolov10_generic_exp.pt`.
- SHA-256: `b484d9a6fb37236f6adcc8c019e6a836f11901dc53a0f71d6cce7262413287ff`.
- Fork revision: `453c6e38a51e9d1d5a2aa5fb7f1014a711913397`.
- Class: model index `0: Explosive`; namespace `iedxray.generic_explosive_detection`.
- Qualification: FP32, batch one, confidence 0.25, `imgsz=640`, `max_det=300`, no
  augmentation, original one-to-one/top-k postprocessing without NMS.
- Preserve EXIF/RGB canonical PNG handling, original stride-aligned letterboxing,
  and original canonical-image pixel `xyxy` coordinates.

Retain checkpoint/fork verification and the narrowly scoped trusted-file load override.
Do not replace the fork with stock Ultralytics or blindly install its old requirements.
Preserve the published split, category semantics and known missed threat. Annotation
comparison stays separate from predictions and hardware qualification. Empty detections
never mean benign; infrastructure failures never become successful empty results.

Keep FP16/AMP, TensorRT, ONNX export, compilation, batching, parallel multi-GPU
execution and persistent model workers outside this increment. Use a consistent IEEE
FP32 policy on newer GPUs and record effective precision settings.

**4. Phase A — baseline and runtime profiles**

Before changing inference behavior, save the current config, dependency freeze, source
identity and checkpoint hash privately. Capture pre-change CPU predictions on identical
canonical PNGs for the three established diagnostics, preserving original-source and
canonical hashes. Keep those outputs separate from all new runs.

Create small reviewed runtime profiles and isolated locks under an appropriate public
`environments/` directory. Keep installed environments and machine-specific state ignored.
Root/API environments must remain free of Torch/model dependencies.

Each profile must identify OS/CPU architecture, Python ABI, backend, driver and GPU
architecture constraints, exact package versions/sources/hashes, fork identity,
precision policy and qualification status. Separate reviewed candidates from verified
execution. Unsupported combinations must not trigger arbitrary online package searches.

The local RTX 2060 candidate is Python 3.11.9, torch 2.9.0+cu126 and torchvision
0.24.0+cu126. Recheck official sources before installation. Other NVIDIA generations
may need a different build. Do not use the `nvidia-smi` CUDA banner as the installed
PyTorch runtime version, or assume an exact architecture-list string is the only valid
binary/PTX compatibility route.

Provide a genuinely isolated, reproducible CPU profile as well. The existing CPU
environment inherits system packages and must remain intact as the local reference.
Do not require that inherited environment on a fresh laptop.

**5. Phase B — discovery and first-run preparation**

Implement a small setup entry point, with thin launcher integration, rather than a
general package manager. Detect OS/architecture, disk space, adapters, driver and device
identity without relying on GPU-enabled Torch already being installed. On Windows,
combine bounded OS inventory with `nvidia-smi` when available; its absence alone must
not mean no GPU exists. Handle hybrid Intel/NVIDIA and multiple visible adapters.

Respect `CUDA_VISIBLE_DEVICES`. Define `cuda:N` in the model process's visible-device
namespace. The pinned fork rewrites visibility for string inputs: resolve and validate
the device, then use its supported `torch.device` path without overriding restrictions.
Record stable UUID/PCI identity where available and actual logical index; never confuse
Windows display-adapter order with CUDA indices. Distinguish ROCm/HIP from NVIDIA
even though both can expose `torch.cuda` APIs.

Among eligible verified GPUs, use a deterministic preference and document it; do not
claim to select the fastest without measurement. Verify current memory availability.

Prepare the chosen profile once in an app-owned environment with visible progress,
download/disk checks, cancellation and actionable errors. Use fixed commands and
allowlisted package sources with integrity checks. Serialize preparation; use permanent
versioned environment directories and atomically activate their metadata after validation.
Do not rename a built virtual environment and assume embedded paths remain valid.
Interrupted/offline/failed setup must
preserve the last working environment. Avoid deleting anything outside verified
app-owned paths. Handle repository paths containing spaces.

Save policy and machine-local resolution privately. Reuse environments on later
launches. Invalidate qualification after relevant hardware, driver, OS, runtime, model,
fork or adapter changes; do not reinstall unnecessarily. Never copy a qualification
stamp, absolute path or device index as proof for another laptop.

**6. Phase C — verification and admission**

Separate hardware detection, runtime availability and successful model execution.
Use a bounded subprocess in the selected model environment for runtime checks;
do not import Torch into FastAPI or spawn a probe on every health poll.
Cache status and timestamps. Run startup checking without blocking the API event loop.
Keep viewing/export usable; gate manual inference, replay and folder acquisition centrally.

Verify real kernels, then real batch-one model execution with actual input/model device
and dtype evidence. `torch.cuda.is_available()` alone is insufficient. Memory qualification
must include the fork's GPU warm-up and intended input shapes.

Avoid a fresh-install deadlock: when no authorized diagnostic image is available,
open the UI with **Model check pending** and provide **Verify with this scan** using
the existing upload flow. A bounded serial qualification job is allowed in that state;
ordinary acquisition stays blocked. Compare the freshly prepared CPU/GPU runtimes on
the same supplied canonical image when qualifying GPU use. CPU-only or explicit CPU
setup verifies CPU alone and must not require a GPU comparison. Do not require the developer's old environment or
private diagnostic files. Do not ship private scans or fabricate predictions as fixtures.
Under Auto, successful CPU verification can enable CPU if GPU verification fails.
An explicit GPU request stays unavailable until it passes or the user deliberately
selects CPU; qualification must not bypass that policy.
If both outputs are empty, real forward/device/dtype evidence can verify execution and
empty-result compatibility, but not nonempty box correspondence, accuracy or benignness.
Record that limitation and retain nonempty cases in release qualification.

Keep the existing one-worker inference model. Installations happen in setup, never
inside a prediction or health request. Respect existing-server reuse: preparing another
profile must not silently restart or reconfigure a live service.

**7. Phase D — inference, errors and provenance**

Implement configuration-to-resolved-session-to-subprocess device routing. The inference
CLI receives an explicit resolved device, not an unresolved Auto policy. Preserve fixed
argv, no shell, timeouts, fresh output directories and strict run/output validation.

Keep shared `ScanResult` and `predictions.json` keys unchanged. Detection `device_id`
means electronic-device association, not compute hardware. Store full execution evidence
in the private manifest. Pass a separately validated optional outer `Run.execution`
record to the GUI/export; older absent metadata must display **Not recorded**.

Record requested policy, selection reason, profile/backend, resolved/actual device,
GPU identity, Python/Torch/vision/CUDA/cuDNN/driver versions, effective precision,
input shapes, memory and clearly defined timings. Bind evidence to canonical-input,
checkpoint, script/config/profile and prediction-output hashes plus run identity.
Never expose raw manifests, private paths or tracebacks through browser responses.

Use small structured, allowlisted failures for unavailable/incompatible CUDA, OOM,
timeout and invalid output. Do not classify arbitrary stderr with fragile string matching.
Every terminal failure must retain diagnostics, set `result=null` and release the worker.

Fix folder intake's current advance-after-any-failure behavior: persistent compute
failures and GPU timeouts pause acquisition and preserve pending items. Retain the
failed item for deliberate retry. Preserve ordinary per-image recovery and replay's
existing failed-cursor behavior. Never silently change threshold, resolution or precision.

**8. Phase E — minimal UI integration**

Integrate into Source/setup and existing findings without redesigning the dashboard.
Show policy, selected hardware and clear states such as Checking hardware, Preparing
runtime, Model check pending, GPU ready, CPU active with reason, and Setup failed.
Use actual per-run execution evidence for historical results, not current health state.

Replace CPU-only waiting text. Keep capability/readiness consistent across upload,
replay and intake, including direct API calls. Offer actionable verification/retry/CPU
recovery controls, progress and accessible status announcements. Do not add fabricated
GPU usage, readiness, accuracy or speed displays. Preserve existing review, annotations,
responsive layout, theme and eye-animation behavior.

Expected touchpoints include `run-app.ps1`, proposed setup/probe scripts and runtime
profiles; `scripts/infer_generic_yolov10.py`; `app/config.example.json`; backend
`config.py`, `runner.py`, `api.py`, `intake.py`, `demo.py`; frontend types, workspace
hook and source/findings/acquisition components. Inspect current paths and signatures
before editing; add only the modules necessary for clear responsibilities.

**9. Phase F — verification and acceptance**

Run the repository-required checks and relevant GUI checks:

```powershell
uv run --locked ruff check .
uv run --locked python -m pytest
uv run --project app/backend --locked python -m pytest
npm --prefix app/frontend run build
npm --prefix app/frontend run test:e2e
```

Add meaningful synthetic coverage for policy migration; CPU-only/hybrid/multiple-GPU
hosts; visibility masks; unsupported architectures/vendors/OS; missing driver/runtime;
offline/cancelled/interrupted setup; insufficient disk; bad hashes; stale identity/cache;
manual overrides; qualification pending; actual execution metadata; strict result
compatibility; failure/worker release; queue preservation/resume; old exports and rollback.
CPU CI must not need CUDA packages or hardware. Mocks establish software behavior only.

For local development qualification, compare:

- A: existing environment, new runner, CPU, against preserved pre-change canonical CPU outputs.
- B: isolated CUDA environment running on CPU, to expose dependency/build changes.
- C: the same isolated environment running on CUDA, to isolate device behavior.

Use `Train000003.jpg`, `Test000001.jpg` and `Test000034.jpg` as established diagnostics;
retain the positive, known miss and empty result. Freeze input bytes and settings.
Before examining GPU results, freeze these engineering parity gates: exact counts,
classes/namespaces/dimensions/threshold; one-to-one corresponding boxes with maximum
absolute coordinate difference <=0.5 original-image pixel, IoU >=0.99 and confidence
difference <=0.001. Inspect overlays and repeat the positive. Investigate differences;
do not tune thresholds/tolerances against the test examples. This is not accuracy evaluation.

Complete parity before real GPU GUI replay/intake qualification. Verify manual upload,
finite replay, folder failure/recovery, held review, annotation comparison, exports and
restart rollback through the actual application.

After correctness, perform the plan's bounded benchmark: five fresh-process repetitions
for three inputs across A/B/C, 45 runs total. Run serially, stop on failure, retain all
samples and report per-image medians/ranges. Distinguish constructor, synchronized
prediction, full process and request-to-visible-result latency. The fork already
synchronizes stage timers; GPU warm-up repeats per subprocess. Existing API elapsed
time excludes upload, browser delay and final evidence persistence. Replay's deliberate
interval is not inference time. Record memory, power and competing activity; no p95,
FPS or guaranteed-speedup claim from this small experiment.
The full A/B/C study and benchmark are development/release checks, not workloads to
run automatically on each installation or page load.

Cross-laptop acceptance requires real clean setup and model evidence on another supported
NVIDIA laptop and a CPU host. If unavailable, finish local work and provide a reproducible
qualification procedure, marking those checks **not executed**. Do not claim that mocks,
the first laptop or one backend establish universal compatibility.

**10. Handoff and completion criteria**

Document startup, first-run setup, supported/candidate profiles, verification, explicit
overrides, fallback and rollback in `app/README.md`. Update T28 in `docs/tasks.md`,
actual commands/results/ownership/limitations in `docs/progress.md`, and the short
handoff in `docs/status.md`; update architecture/verification references as needed.
Keep private outputs, scans, weights, credentials and personal paths out of commits.
Do not invent student contributions or resolve existing deadline conflicts by assumption.

Rollback must preserve the CPU environment: pause acquisition, finish the active job,
export needed reviews, record pending files, stop only the intended service, restore
CPU configuration, restart and verify the positive. Explain that restart clears in-memory
history/queues and folder startup baselines existing files; saved evidence remains.

Deliver a final report covering implemented behavior/files, checks with actual outcomes,
hardware/runtime/model evidence, measured performance, unsupported combinations, remaining
external validation and exact local startup/recovery instructions. Distinguish documented,
artifact-inspected and executed-and-verified evidence. Do not mark T28 or portability
complete while required human or second-device acceptance remains outstanding.

Start with inspection and the protected CPU baseline, then implement these phases in
small coherent increments. Make routine implementation decisions from the repository
and reviewed plan; ask only when a missing answer materially blocks safe progress.

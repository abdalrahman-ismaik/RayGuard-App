# Portable runtime verification — 26 September 2026

> Historical SDP record from 25–26 September 2026. Commands and service ports
> below describe that original checkout and its private evidence, not an
> automatically available preview or a new verification of this repository.
> Use the [current app setup](../README.md) for the extracted layout.

This record separates software behavior, inspected installation artifacts and actual
model execution. It implements the [accepted GPU plan](gpu-inference-plan.md).
It does not establish accuracy, scanner connectivity, universal GPU support or
completion of T28's human showcase acceptance.

## Protected reference and fixed protocol

Before changing inference behavior, the coordinator saved the original runner,
local configuration, model dependency freeze, Git identity/status and three CPU
outputs in a fresh ignored evidence directory. Source JPEGs were converted with
the application's EXIF-aware RGB canonical PNG function. Original and canonical
SHA-256 hashes are recorded privately. The existing inherited CPU environment
was retained intact.

The checkpoint is `yolov10_generic_exp.pt`, SHA-256
`b484d9a6fb37236f6adcc8c019e6a836f11901dc53a0f71d6cce7262413287ff`;
the original THU-MIG revision is
`453c6e38a51e9d1d5a2aa5fb7f1014a711913397`. Category zero remains **Explosive**
in `iedxray.generic_explosive_detection`. The settings remain FP32, batch one,
confidence 0.25, imgsz 640, max_det 300, no augmentation, original stride-aligned
letterboxing and one-to-one/top-k output without NMS. Boxes remain canonical-image
pixel xyxy. Precision controls explicitly request IEEE FP32.

Before examining GPU results, the engineering gates were fixed: exact count,
category/namespace, dimensions and threshold; one-to-one box matching; maximum
coordinate difference 0.5 original pixel; IoU at least 0.99; confidence difference
at most 0.001. These are numerical compatibility gates, not accuracy tolerances
selected by tuning published test examples.

| Diagnostic | Protected CPU result | Interpretation retained |
|---|---:|---|
| Train000003.jpg | 1 detection | Existing positive; training example, not independent validation |
| Test000001.jpg | 0 detections | Existing known missed threat |
| Test000034.jpg | 0 detections | Empty result, never a benign verdict |

The new runner on the original CPU interpreter reproduced all three saved
predictions exactly. The prepared CPU environment, CUDA environment running on
CPU, and CUDA environment running on the GPU all passed the three-image gates.
The positive was repeated on CUDA and its overlay inspected, alongside both
empty-result overlays. Relative to the original CPU positive, the repeated GPU
result's maximum coordinate difference was **0.00006103515625 pixel** and confidence
difference **0**; the one-to-one IoU gate passed. All cases retained counts 1/0/0.

Executed host pairing: Windows x64, CPython 3.11.9, NVIDIA GeForce RTX 2060
(6 GiB, compute capability 7.5), driver 591.74, Torch 2.9.0+cu126,
torchvision 0.24.0+cu126, CUDA runtime 12.6 and cuDNN 91002. Both actual kernels
and actual model forwards passed on `cuda:0`. The GPU warm-up input was
`[1,3,640,640]`; the diagnostic prediction input was `[1,3,320,640]`. Model and
input were both CUDA FP32. IEEE global/matmul/cuDNN settings were checked at
forward time. Positive peak Torch allocation was 165,239,296 bytes and peak
reservation 192,937,984 bytes; these exclude driver/display and other process
allocations and are not a guaranteed memory requirement on another machine.

The separate CPU profile uses Torch 2.9.0+cpu / torchvision 0.24.0+cpu without
system-site packages. Both managed environments passed dependency checks for
42 installed packages. Their source fork receipts bind the exact hash-checked
archive; uv's installed PEP 610 record omitted that archive hash, so the installer
records a separate proof rather than modifying dependency metadata.

## Actual application and recovery checks

The coordinator used a separate service on **8770** and a task-owned inbox/storage
tree. Existing services on 8765, 8766 and 8767 were preserved. No model weights,
drivers, global Python packages or system CUDA Toolkit were changed.

Executed through the actual app:

- Fresh pending state rejected ordinary manual, folder and replay API requests.
  Upload remained available. **Verify with this scan** completed CPU/GPU model
  qualification without creating an ordinary history record.
- A real browser upload reproduced the positive on CUDA at 0.25. A single
  request-to-visible-completed-result observation was **8.650 seconds**, including
  process startup and polling; model qualification took **43.353 seconds** in that
  application observation. These are single observations, not percentile estimates.
- Finite one-image replay ran Test000001 on CUDA, retained the held positive review
  and note, and exported the known miss: zero predictions, one missed published
  annotation. Review and prediction remained separate. Browser evidence recorded
  no page errors or external network requests.
- Folder reception skipped a malformed PNG and completed the positive and known
  miss on CUDA with counts 1/0. It then paused deliberately.
- After exporting four records, only the task service restarted with a deliberately
  short one-second process timeout. Cached GPU qualification was reused. Three
  accepted folder scans produced one explicit timeout failure and **two preserved
  pending scans**. A deliberate retry failed explicitly at the same configured
  timeout; both failures had `result=null`, and the worker was released. No CPU
  substitution occurred. This tests real process-timeout recovery, not real OOM;
  CUDA OOM and driver-failure branches are synthetic tests.
- Pending source names and exports were saved before a deliberate CPU restart.
  The isolated CPU profile reused its verified cache, reproduced the positive by
  manual upload and by a newly published folder file, and skipped all inbox files
  present at first Start. Restart cleared session history/queues as documented.

The first browser attempt raced server startup; a later test selector needed its
exact-label assumption corrected. Existing successful verification/manual evidence
was retained and the remaining flow resumed on the same run. A brief reference
refresh revealed a stale-running-to-completed UI race; comparison now waits for a
terminal run. Thirteen focused browser checks cover that correction. None of these
test harness fixes altered model thresholds, parity tolerances or predictions.

After the benchmark, the actual launcher restarted task-owned 8770 with Auto and
reused valid GPU qualification. A new GPU positive and one-image known-miss replay
passed and were exported. A GET-only browser check on the final build held **Missed
target** and its cyan reference overlay through two subsequent history polls, with
no API writes or page errors. Ordinary repeated launch returned the existing URL;
an explicit config launch correctly refused to replace the live service.

## Software evidence

- `uv run --locked ruff check .` — passed.
- `uv run --locked python -m pytest` — **138 passed**.
- `uv run --project app/backend --locked python -m pytest app/backend/tests` —
  **203 passed**, with one existing Starlette/httpx deprecation warning. An explicit
  test path is necessary when invoking from the repository root.
- `npm.cmd --prefix app/frontend run build` — passed.
- `npm.cmd --prefix app/frontend run test:e2e -- --config ../../tmp/playwright-runtime.config.ts --reporter=line`
  — **104 passed** on isolated port 18766. The default test port was occupied by
  another session and preserved. After the reference-transition correction,
  **13 focused comparison checks** and the production build passed.

The root total includes 36 installer and 17 model-runtime tests. Backend coverage
includes pending admission, identity/cache mutation, actual-evidence validation,
OOM/timeout worker release, queue/replay recovery, old exports and annotation
comparison. Mobile runtime UI had zero Axe findings and no 320px overflow.

## Interpretation limits

Synthetic unit/API/browser tests exercise migration, hardware inventories,
installation interruption, admission, queue recovery, strict output binding and
historical presentation. They do not execute a GPU or validate model accuracy.
Private manifests contain actual forwards, model/input device and dtype, input
shapes including GPU warm-up, memory, versions, hashes and timings. The browser
receives only a validated execution summary. `ScanResult`/`predictions.json` remain
unchanged and annotation comparison remains separate.

Only Windows x64 CPU and the locally tested NVIDIA pairing can acquire executed
qualification in this increment. A reviewed wheel/architecture candidate is not
a verified laptop. No driver or system CUDA Toolkit is installed by RayGuard.

## Reproduce the bounded development study

Keep the original CPU environment and create an isolated managed CUDA environment
using the [setup instructions](../README.md#portable-cpu-and-nvidia-inference).
Use the same three authorized canonical PNGs for A (original environment/new
runner/CPU), B (isolated CUDA environment/CPU), and C (same environment/CUDA).
Inspect overlays and repeat the positive before testing replay/intake. Keep all
jobs serial and use fresh private output directories. Do not run other benchmarks
or automatic acquisition at the same time.

After parity, the checked-in development harness performs exactly 45 fresh-process
runs, five repetitions for each image and A/B/C target:

```powershell
uv run --project app/backend --locked python scripts/benchmark_generic_runtime.py --cpu-python <original-python.exe> --gpu-python <managed-cuda-python.exe> --checkpoint <authorized-checkpoint.pt> --checkpoint-sha256 b484d9a6fb37236f6adcc8c019e6a836f11901dc53a0f71d6cce7262413287ff --images <Train000003.png> <Test000001.png> <Test000034.png> --output <fresh-private-directory>
```

The harness retains all samples, pre/post NVIDIA power/memory/utilization snapshots,
constructor time, synchronized `predict` call time and complete subprocess time.
The predict call includes model preparation and repeated GPU warm-up; it is not
the same as forward-only time. Browser polling and deliberate replay intervals
belong to separately observed application latency. Five samples support medians
and ranges here, not p95, steady-state FPS or guaranteed speedup. A full A/B/C
study is a development check and never an automatic installation workload.

## Measured development performance

The harness completed **45/45** serial fresh-process runs: five repetitions of
three fixed canonical images for A (original environment/CPU), B (isolated CUDA
environment/CPU) and C (same isolated environment/CUDA). Every trial passed the
fixed parity and actual-forward identity checks. No sample was discarded, including
the first A positive's 16.505-second process time. All raw samples, manifests,
protocol and summaries remain in ignored private evidence.

Values below are **median [minimum–maximum]**, with five samples per row.
Constructor is the checkpoint/model constructor. Predict is the synchronized
complete `model.predict` call, including preparation, warm-up, preprocessing and
postprocessing. Process includes interpreter/imports, validation, logs and output.

| Target / image | Constructor (s) | Predict call (s) | Complete process (s) |
|---|---:|---:|---:|
| A / Train000003 | 0.090 [0.087–0.106] | 0.443 [0.428–0.538] | 8.209 [7.875–16.505] |
| A / Test000001 | 0.098 [0.089–0.106] | 0.466 [0.422–0.509] | 8.188 [7.920–9.533] |
| A / Test000034 | 0.091 [0.088–0.100] | 0.455 [0.439–0.471] | 7.975 [7.862–8.150] |
| B / Train000003 | 0.095 [0.091–0.109] | 0.492 [0.463–0.543] | 7.722 [7.447–8.540] |
| B / Test000001 | 0.104 [0.090–0.116] | 0.468 [0.451–0.490] | 7.667 [7.396–7.998] |
| B / Test000034 | 0.090 [0.088–0.100] | 0.459 [0.446–0.499] | 7.472 [7.323–7.557] |
| C / Train000003 | 0.091 [0.087–0.412] | 0.703 [0.682–0.936] | 8.000 [7.822–10.337] |
| C / Test000001 | 0.100 [0.089–0.116] | 0.756 [0.689–1.037] | 8.173 [7.776–9.296] |
| C / Test000034 | 0.093 [0.088–0.114] | 0.688 [0.679–0.812] | 7.989 [7.764–8.407] |

The original fork's separately timed, synchronized inference stage excludes its
one-time GPU warm-up and surrounding predict-call preparation:

| Image | A forward stage (ms) | B forward stage (ms) | C forward stage (ms) |
|---|---:|---:|---:|
| Train000003 | 191.847 [181.314–230.789] | 215.376 [192.486–228.455] | 54.245 [48.980–71.747] |
| Test000001 | 188.458 [182.939–208.240] | 189.086 [180.268–189.496] | 52.605 [50.730–63.628] |
| Test000034 | 199.963 [191.620–211.016] | 191.838 [188.250–212.671] | 50.428 [46.786–57.603] |

GPU forward execution was faster in this sample, but **there was no consistent
end-to-end speedup over A**, and C was slower than B at every per-image process
median. Startup dominates these single-image subprocess jobs; repeated GPU warm-up
also makes C's full predict call longer. This does not measure a persistent worker,
steady-state throughput, p95, application FPS or another laptop's performance.
The separate 8.650-second browser observation includes polling; finite replay also
has its deliberate three-second inter-run interval, which is absent from this harness.

GPU peak Torch allocation was 165,239,296 bytes throughout; peak reservation ranged
192,937,984–195,035,136 bytes. Free memory after model work ranged
5,134,876,672–5,136,973,824 bytes. Before/after process snapshots showed 1,408 MiB
device memory in use, 0–9% utilization, P3/P8 states and 1.55–19.43 W. These snapshots
are **not** peak inference power or energy measurements. The Windows power scheme
was High performance; battery status/charge and process inventories were retained
privately. Desktop/display activity and pre-existing idle services remained; owned
browser/unit tests and acquisition were stopped during all 45 serial trials.
The original config hash and original CPU dependency freeze still match their
protected copies after the study.

## Workspace CPU/GPU selection follow-up — 26 September 2026

Workspace setup now offers CPU/GPU cards, compatible hardware names and a GPU
default marker. New managed Auto launches prefer an eligible GPU; a saved CPU
preference remains authoritative. Selecting a card does not change the running
session. **Apply and restart** saves an atomic local preference and deliberately
restarts the launcher's own child. Active/unfinished work blocks the action.
The page waits for a different service instance before resetting its session.
Unsupervised services expose save-only behavior. Old services remain readable.

Executed software checks: Ruff passed; 138 root tests, **238 backend tests** and
**119 browser tests** passed, with the frontend production build passing. The
backend retained its existing Starlette/httpx deprecation warning. Focused cases
cover saved preferences, GPU eligibility/default ordering, host/UUID/visibility
changes, concurrent saves, stale tabs, restart admission, dropped responses,
unavailable GPUs and keyboard/mobile behavior. Synthetic Windows inventory is
explicitly isolated from the CI host; unsupported Linux/ARM selection is tested
without importing Torch. The selector passed mobile Axe checks in both themes.

Actual checks used a new, task-owned **8771** service and separate inbox, storage,
qualification cache and configuration. Earlier services on 8765–8767 and 8770
retained their process identities. Existing CPU/CUDA environments were reused;
setup reported zero package downloads and a 1 MiB metadata disk requirement.
The original CPU configuration/environment remained intact.

The first Auto session detected and selected the RTX 2060, then performed real
CPU/GPU qualification on the preserved canonical positive. A fresh ordinary GPU
run passed. Browser **CPU → Apply and restart** created a new session, retained
the GPU as an available choice, reused verified CPU readiness and completed a
real CPU positive. Returning to GPU initially exposed a host-identity mismatch:
Python 3.12 reported Windows 11 while model Python 3.11 reported Windows 10 for
the same OS build. The request failed without changing the active CPU. Preference
identity now consistently uses the backend interpreter; model-probe identity
remains part of qualification. A regression covers differing interpreter hashes
and continued rejection of actual host changes. After a deliberate owned-service
restart, browser **GPU → Apply and restart** succeeded and a fresh CUDA positive
passed with `actual_device=cuda:0`. All three ordinary positives were exported
before subsequent restarts and retained one detection; this training example
does not establish accuracy. The final preview remains on verified GPU execution.

Private launcher logs, session identities and exported model evidence are retained
under the ignored device-choice evidence directory. No new benchmark, model
weights, driver changes or cross-laptop execution were performed for this UI
follow-up. Queue-preserving failure remains deliberate: if failed compute leaves
pending source work that cannot finish, export reviews and record pending filenames
or replay position before the documented terminal CPU rollback. The workspace
does not silently discard that queue to restart.

## External portability acceptance — not executed

The later [model-selection study](model-selection.md) extended the same reviewed
CPU/CUDA environments to the inspected device and specific YOLOv10 task models.
It preserved and exactly reproduced generic CPU predictions, then passed all nine
three-task/three-image CPU/GPU parity checks with the frozen FP32 settings. Each
model now has separate checkpoint/task/class-map/catalog identity in qualification
and run evidence. The earlier generic benchmark remains a generic-model study;
no new cross-model speed comparison or performance guarantee is claimed.

A second supported NVIDIA laptop and a CPU host are still required. On each:

1. Use a clean checkout, supported host and authorized existing checkpoint; do not
   copy a virtual environment, developer config, private fixture or GPU ordinal.
2. Inspect `scripts/setup_model_runtime.py --managed --dry-run`, then prepare the
   managed configuration. Save inventory, profile/lock identities, download/disk
   observations and dependency-check output privately.
3. Launch on a free local port. Confirm pending readiness blocks ordinary manual,
   replay, folder and direct API jobs but permits upload/view/export.
4. Upload an authorized diagnostic scan and choose **Verify with this scan**.
   NVIDIA Auto must show actual qualified GPU execution or an explicit, verified
   CPU fallback reason. CPU policy must verify CPU alone. Explicit unavailable
   CUDA must fail without substitution.
5. Run the scan, inspect actual device/dtype evidence, review/export, and restart
   to verify cache reuse. Change a relevant device/driver/runtime identity in a
   controlled test and confirm stale qualification is rejected.
6. Exercise pause/retry and deliberate CPU rollback; record pending folder work
   before restart. Verify a known positive where authorized. An empty-only match
   cannot establish nonempty box parity or accuracy.

Record actual commands, host/profile/driver identities, results, failures and human
review. Do not mark cross-laptop portability or T28 complete until this evidence
and the outstanding showcase/scanner acceptance exist.

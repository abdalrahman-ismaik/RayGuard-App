# Using the RayGuard inspection app

A local X-ray workspace for **T28's early laptop showcase**. Upload an image or
receive completed exports from a folder, select an inspected YOLOv10 task model,
inspect its boxes and scores, and record review notes. A scan-focused
layout, light/dark themes, zoom/pan, view adjustments, queue/history and JSON
export support the demonstration. Empty detections do not mean safe or benign.

For generic-model IEDXray test replay, **Findings** compares the saved model output with
the published reference: matched annotations, missed targets or extra detections.
Dashed cyan **GT** boxes show the reference; amber boxes remain model predictions.
See [annotation comparison](annotation-comparison.md) for setup and interpretation.

Earlier diagnostic previews and real-model checks were recorded in the
original SDP checkout. They are historical evidence, not running services
included in this clone; see [runtime verification](runtime-verification.md)
and [model evidence](model-selection.md).

The app integrates the three inspected **YOLOv10-M task checkpoints**. The specific lab
laptop/pager demo pairing, complete P1 decisions and P2 fusion remain unfinished.
The scanner/interface is **not confirmed**. Folder reception works; a physical
scanner connection has not been tested. See [airport interface research](scanner-research.md),
[architecture and researched alternatives](architecture.md),
[product scope](PRODUCT.md) and [design rules](DESIGN.md).

The app now uses a continuous **Liquid Glass dashboard**, based on the user's
KU Planner reference. A persistent sidebar connects **Dashboard**, **Inspect**,
**Workspace setup**, **Session** and **Source**. Dashboard shows the current scan,
actual source availability and recent runs. Four labelled icon actions at the top
open upload, replay, folder receipt or saved-run review. **Source details** and
**Workspace notes** expand for secondary guidance; status and warnings stay visible.
Inspection retains Analyst Studio's adjustment dock, viewer, evidence tabs and
filmstrip. Collapse the sidebar for more image space; phones use **Menu**.

Light-mode text now uses a stronger weight for readability. The latest typography
preview uses **Instrument Serif throughout**: headings,
navigation, controls, tables and record details. Select **Appearance → Interface
font** to compare or return to Barlow. Restrained glass controls extend across the app. **Dark mode / Light mode** switches Onyx
and Onyx Light; **Appearance** retains alternate palettes/fonts and remembers
choices on this browser. The scan well stays dark and original pixels remain
unchanged. Fonts are local with [license/source records](../frontend/public/fonts/liquid/README.md).
See the [dashboard contract](dashboard-design.md) and [design system](DESIGN.md).
The [sixteen-layout gallery](design-options.md) remains read-only design history.

## Eye opening and loading

Each fresh page load shows the supplied blue eye as a centered, full-screen background
with the **RayGuard** title. The cleaned 1080p video stays at a fixed 44% scale
throughout playback. Source seconds 0–4 play at 2× speed, followed by
four original-speed seconds (source 4–8), making six seconds of video. A 0.25-second
fade follows immediately, with no final hold (about 6.25 seconds, plus startup).
It can be skipped immediately with
**Skip intro** or **Escape**. It exits even if media or the local service is unavailable.
Reduced-motion preferences bypass video; no model loading percentage is simulated.

A small eye marks actual connection/upload/inference work and stops when that state ends.
The scan remains visible. A lost service connection stops the animation and identifies the
run status as unknown until reconnect. Idle folder intake does not animate continuously.

During inference, **Inspect** temporarily shows two columns: **Processing scan** on
the left, with the eye above the image, and **Latest completed scan** with its
Evidence inspector on the right. An explicitly selected older result stays labelled
**Held review**; replay and folder controls offer **Follow latest** to resume following.
The first run shows an
empty completed pane. When the active run finishes or fails, the normal single-viewer
layout returns. Phones stack the two panes vertically. Review notes, zoom and
reference overlays stay attached to the image being reviewed.

Open **Source → Presentation & motion** to **Replay introduction** or **Pause animations**.
Replay preserves your current scan/review and is disabled while work is active. If an
already-open tab shows the earlier interface, refresh the page after the frontend build.
See the [design and behavior record](eye-animation-plan.md) and
[media provenance](../frontend/public/media/rayguard/README.md).

## Start locally

See [the current clone instructions](../README.md#clone-and-start) first. The
engine submodule must be initialized at its recorded revision.


Prerequisites: Python 3.12, [uv](https://docs.astral.sh/uv/) and Node **22.12+**
(22.14 was used here). On Windows, the single entry point is
[`run-app.ps1`](../run-app.ps1) in the repository root:

```powershell
.\run-app.ps1
```

It installs locked frontend dependencies, builds the UI, prepares the locked API
environment and starts the service. It prefers an existing `config.managed.local.json`,
then `config.local.json`; `-Config` always takes precedence. Open
**http://127.0.0.1:8765**; keep the terminal open and use **Ctrl+C**
to stop. Running the launcher again detects the existing RayGuard session and
shows its URL without starting another server or applying new configuration.

Use `-SkipBuild` for a faster start when the frontend has already been built and
has not changed, `-Port 8766` for another port, or `-Config path/to/config.json`
for an explicit config (relative to your current directory). The launcher itself
finds the repository from its location, so it can be invoked from any directory.
If Windows blocks local scripts, use this process-only invocation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-app.ps1
```

The interface works without weights; inference clearly reports an unconfigured
model. With no local configuration, the Windows launcher now prepares reviewed,
isolated model dependencies and generates `config.managed.local.json` using
Auto policy. It never downloads weights. Existing `config.local.json` files keep
their manual interpreter and CPU behavior unless explicitly changed; use
`-Config config.local.json` to select that reference when a managed config also exists.

## Portable CPU and NVIDIA inference

Managed setup currently supports **Windows x64**, with an isolated CPU profile
and a reviewed PyTorch 2.9.0 / torchvision 0.24.0 CUDA 12.6 candidate. Actual model
qualification is required on each machine. GPU discovery concerns the **Python
backend host**, which can differ from the computer displaying the browser.
AMD/ROCm, Intel/XPU, Apple/MPS, DirectML, Windows ARM and other operating systems
have no qualified managed adapter in this increment. CUDA 12.8 is a disabled
review candidate. See [profiles, sources and locks](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4/environments/README.md)
and the [execution record](runtime-verification.md).

For an existing checkout, inspect the package sources and disk estimate, then
prepare a separate configuration while retaining the original CPU environment:

```powershell
uv run --project engine --locked python engine/scripts/setup_model_runtime.py --root engine --managed --source-config config.local.json --config config.managed.local.json --dry-run
.\run-app.ps1 -SetupModel -Config config.managed.local.json -Port 8770
```

If no original config exists, omit `--source-config` from the inspection command.
Set the authorized checkpoint path and SHA-256 in the generated local config;
do not copy another laptop's interpreter paths. Setup discovers adapters through
Windows and NVIDIA tools before importing Torch. It downloads only allowlisted,
hash-locked dependencies into permanent project-owned environments. Ctrl+C cancels
preparation; interrupted/offline setup leaves the previous config and environment
available. Retry the same command. A stale setup lock after a hard crash requires
checking that its installer has stopped before removing the lock, as described in
the environment guide. Browser loads, health polling and inference never install
packages. Setup progress appears in the launching terminal.

On first launch, **Source** shows runtime checks and then **Model check pending**.
Upload an authorized image and select **Verify with this scan**. Upload/view/export
remain available while ordinary detection, replay and folder dispatch are gated.
CPU setup checks real CPU execution. GPU setup checks kernels and compares CPU/GPU
model outputs on the same canonical PNG at FP32, batch one and confidence 0.25.
An empty match establishes execution compatibility only; it does not establish
nonempty box correspondence, accuracy or benignness. Annotation comparison is
independent of hardware qualification.

Policies are `auto`, `cpu`, and `cuda:N`. New managed configs default to `auto`;
old configs without a policy retain CPU execution. Auto tries compatible visible
GPUs, then enables independently verified CPU with a reason if GPU qualification
fails. Explicit `cuda:N` fails rather than silently substituting CPU. `N` means the
logical CUDA index **inside the model process**, respecting `CUDA_VISIBLE_DEVICES`;
Windows display order is not a CUDA index. Among visible GPUs, selection prefers
larger total memory, then stable identity/name and logical index. This deterministic
order does not claim to find the fastest GPU; actual free memory and model warm-up
must pass qualification. An advanced `model_python` override is never implicitly
modified by managed setup.

The interpreter/profile/device remain fixed after startup qualification resolves.
Driver, device, runtime, checkpoint, adapter or visibility changes invalidate cached
qualification. Preparing another environment does not replace a running service;
stop and deliberately restart that service to adopt it. Findings and exports use
the completed run's execution evidence. Old records show **Not recorded**.

### Choose CPU or GPU in the workspace

Open **Workspace setup → Inference device**. CPU and GPU are explicit choices;
the panel names the detected compatible GPU and separately shows the current
service's device. New managed Auto configurations prefer an eligible GPU. A saved
CPU choice and an explicit launch override take precedence. If there is more than
one eligible GPU, choose from the model process's visible devices. A CPU-only
interpreter cannot establish that the machine has no GPU: an unavailable GPU
option can mean its compatible runtime still needs setup.

The **Model** menu above CPU/GPU lists three YOLOv10-M tasks with their exact
trained classes. Generic Explosive predicts **Explosive**; Electronic Devices
predicts **Laptop, Mobile, Pager, Walkie-Talkie**; Specific Explosives predicts
**IED Explosive, Laptop Explosive, Mobile Phone Explosive, Pager Explosive,
Walkie-Talkie Explosive**. Device boxes are localization, not a threat verdict.
Five historically inspected families remain disabled with reasons under
**Unavailable models**. They are not downloaded or executed by this selector.

Model and device are saved atomically and take effect together after restart.
Each checkpoint/task/class map has separate readiness; changing the model cannot
reuse another model's qualification. Complete **Verify with this scan** when
requested. Findings and exports retain the generating model and its classes.
Only generic test replay currently supports reference comparison; other tasks
explicitly show it as unavailable instead of comparing against generic GT.

Choose a device, export needed reviews, then select **Apply and restart**.
The launcher restarts only its own child, and only after this explicit request.
Radio selection, opening the workspace and ordinary page loads never restart the
service or install packages. Active inference, verification, intake, queued scans
and unfinished replay block the change. Finish the pending source work first.
After restart, the app waits for the new session and reports model verification
separately; detection of a GPU does not establish model readiness.

The model/device choice is saved in an ignored `*.device.local.json` sidecar beside the chosen
config, without replacing model paths or qualification records. An explicit GPU
choice is strict, with no silent CPU substitution. Its saved UUID, backend host
and visibility context prevent an old CUDA index from selecting a different GPU.
An invalid or changed identity requires a fresh choice. A direct, unsupervised
`rayguard-gui --config ...` launch offers **Save for next launch**; stop and relaunch
that service manually. Older running services need a deliberate relaunch before
they support these controls.

Restart clears the in-memory scan/history/review session and queue; private saved
evidence remains. Folder startup baselines existing files. For recovery, launch
with `-InferenceDevice cpu` as below; this bypasses a stale saved preference for
that session. A subsequent explicit workspace change can save a replacement.

GPU OOM/timeouts and persistent runtime failures pause automatic folder acquisition;
pending scans remain queued and the failed scan stays in history for deliberate
retry. Free GPU resources before retrying. No automatic CPU retry, threshold change
or resolution reduction occurs. Fatal runtime/device changes require setup review
and restart. Replay retains its failed position.

For CPU rollback: pause both acquisition sources, let the active run finish,
export needed reviews and record pending source filenames. Stop only the service
you intend to replace, then launch the same configuration with an explicit override:

```powershell
.\run-app.ps1 -Config config.managed.local.json -Port 8770 -InferenceDevice cpu -SkipBuild
```

Verify with an authorized positive scan if required, then run it and inspect the
result. This uses the separately prepared CPU interpreter without changing saved
policy. Restart clears in-memory history/queues; saved evidence remains on disk.
Folder intake baselines files already present on its first Start, so deliberately
upload unfinished files or republish them with new names after Start. There is no
automatic crash recovery of queued source work.

## Manual development launch

For manual launch, Linux/macOS, or development:

```text
npm --prefix frontend ci
npm --prefix frontend run build
uv run --project backend --locked rayguard-gui
```

Once built, the backend serves all assets; no Node server, CDN fonts or internet
connection is required at runtime. Dependency installation may require internet.

### Connect the verified YOLO backend

First follow the [separate model environment instructions](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/first-inference.md).
This setup installs only the app; it does not install Torch, download weights or
upgrade Ultralytics. The existing checkpoint needs the pinned original YOLOv10
fork. A current stock Ultralytics install is not an established replacement.

```powershell
Copy-Item config.example.json config.local.json
# Edit config.local.json for this machine, then:
.\run-app.ps1
```

Paths in the config are relative to the **config file's directory**. The example
uses Windows's `.venv-yolov10/Scripts/python.exe`; on Linux/macOS the model
interpreter is normally `.venv-yolov10/bin/python`. Use only an authorized,
inspected checkpoint with its actual SHA-256. The generic class/task is checked
by the runner. The three allowlisted checkpoints are discovered by their known
filenames beside the configured checkpoint and checked against the catalog hashes.
For other local locations, add `model_checkpoints`, mapping supported model IDs
to paths relative to this config. `model_id` defaults to `author-yolov10m-generic`.
The catalog selects each task's exact hash and class map; arbitrary filename swaps
and other weights are rejected. See [the model configuration example](model-selection.md#configuration).

Keep `config.local.json`, scans, weights and generated output outside Git.
`configured` means configured paths exist; the real run verifies model compatibility.

## Use the workspace

The app opens on **Dashboard** after the introduction. Continue the current
inspection, select a recent run, or open **Workspace setup**. Setup offers
**Upload a scan**, **Dataset replay**, **Folder receiver** and **Review saved runs**,
then Analyst Studio / Focused review, panels, future-run threshold and following.
**Open workspace** applies those choices without starting acquisition or inference.
Use **Run inference**, **Start demo** or **Start intake** when ready. Paused replay
resumes its captured batch threshold. Dashboard separates dataset size from batch
progress; a completed batch is not completion of the whole published test split.

The sidebar remains available on every page. Desktop can **Collapse navigation**;
on phones, **Menu** exposes the same links and Escape closes it. Page navigation
preserves scan zoom and unsaved review. Setup's **Return to workspace** resumes
without applying its draft choices. Active acquisition continues during navigation;
its status and errors link back to Inspect. Pausing acquisition does not cancel
an active inference. Source configuration still uses the local config file.

| Page | Local route |
|---|---|
| Dashboard | `/` or `/#dashboard` |
| Workspace setup | `/#main-menu` |
| Inspect | `/#workspace` |
| Session | `/#session` |
| Source | `/#source` |

Real sidebar links support direct entry, refresh, new tabs and browser Back/Forward.
Setup and unsaved reviews last for the current tab; appearance persists locally,
and service history clears on restart. Opening a new tab does not copy unsaved drafts.

1. Choose or drop one PNG/JPEG. The service checks and normalizes the image;
   the displayed image is exactly the coordinate space used for inference.
2. Run detection. To change confidence, open **Source** first.
   The default 0.25 is an untuned diagnostic setting. Controls prevent conflicting
   changes during a run.
3. Select a finding to highlight its box. Zoom/pan, fit, hide overlays or open
   the **Image adjustments** dock for brightness, contrast, grayscale and inversion.
   These change only the display, never model input. **Reset image display** restores
   original viewing settings. Scores are not calibrated risk.
4. Open the inspector’s **Review** tab, add a note and **Mark reviewed** or **Flag for follow-up**. These
   record review status, not an item clearance or classification. Saving includes
   a timestamp; authenticated operator identity and revision history are not implemented.
5. Use the filmstrip or **Session** to revisit actual runs. Open **Provenance**
   in the inspector for metadata and JSON download. Changing settings for
   a new run never changes an earlier result's threshold.

The measured run duration includes process/model startup and execution overhead.
It is not model-only latency, FPS, accuracy, or an evaluation benchmark.

### Inspect image details

- **Scroll over the viewer** to zoom toward the pointer, from 100% to 500%.
  Outside the viewer, scrolling behaves normally; Ctrl/Command-wheel is left to
  the browser. The **+ / −** buttons also change zoom.
- **Drag while zoomed in** to pan. Movement stays bounded so the image remains
  reachable; clicking a detection still selects it. **Fit image** or **0** resets
  the view. With the image focused, use **+ / −** and the **arrow keys** too.
- Enable **Magnifier**, then hover over the image for a **3×** local enlargement
  relative to the current view. It includes the visible prediction/reference
  layers and display adjustments. Move away or press **Escape** to dismiss it.
  The lens uses mouse/pen hover; touch users can use **+ / −** and drag to pan.

These controls only change viewing. Original pixels, inference inputs, saved
predictions and reference coordinates are unchanged.

## Replay the published test images

Choose **Dataset demo** in the dashboard, then **Start demo**. The default batch
uses three consecutive images in filename order, runs the configured detector
once per image, and waits three seconds after each completed result. It stops
after the batch. **Pause demo** prevents the next dispatch; an active inference
finishes. **Resume demo** keeps the remaining batch and its original threshold.
**Follow latest** advances the image; selecting history or reviewing holds it.

Open **Replay settings** to choose a starting image (one-based position) and a
batch size of 1, 3, 5, 10 or 20. Batches clip at the dataset end and never loop.
Errors stop playback visibly. A new batch can retry the failed position. At the
end of the dataset, explicitly choose an earlier starting image to replay again.

Add these fields to ignored `config.local.json`, then restart the service:

```json
{
  "demo_dir": "data/IEDXray/Test",
  "demo_annotations": "data/IEDXray/annotations/binary_explosive_det_test.json",
  "demo_interval_seconds": 3.0
}
```

The directory must be the authorized **IEDXray test image directory**, with PNG/JPEG
files directly inside. Configuration labels the source; it does not authenticate
the publisher. With `demo_annotations` configured, the app verifies exact filename,
source/canonical image hashes, dimensions and generic task pairing for comparison. The
local directory inspected here has 5,136 filenames matching the four test annotation
image tables. Source images stay read-only. Each run/export records `dataset_demo`,
the dataset/split, zero-based source index, original file hash and normalized image
hash. The app does not load annotations to manufacture predictions.

In **Inspect → Findings**, read the reference comparison above the model output.
The viewer's **Reference** control toggles the separate cyan layer. A successful
inference may still show **Missed target**. Counts use one-to-one box matching at
**IoU ≥ 0.50** and the **saved run's threshold**; this is not full-test accuracy.
No annotations plus no predictions is **No annotated targets**, never a safety
verdict. **Reference & limits** exposes provenance and dataset caveats; JSON export
includes the comparison. Upload/folder sources or unverified pairings show no
reference verdict. See the [protocol](annotation-comparison.md).

Folder intake and dataset replay cannot run together; finish any queued exports
first. The existing session limits still apply. Restarting begins a new paused
session and resets the replay position; saved run files remain on disk.

This is **fresh inference on recorded test images**, not scanner acquisition, an
accuracy evaluation or training data collection. Retain misses and do not tune the
model/threshold from the test demonstration. The known first-image miss remains
part of the deterministic sequence. A missing/incorrect local path is a setup error,
not a reason to download data automatically.

## Receive new scan exports automatically

This is the first integration route while the lab identifies its scanner and
export interface. It accepts completed **PNG/JPEG/BMP** files directly inside an
inbox; it does not read proprietary scanner files, CT volumes or video streams.

Create a dedicated inbox and add these settings to the existing model configuration
in ignored `config.local.json` (paths are relative to that file):

```json
{
  "incoming_dir": "runs/scanner-inbox",
  "source_label": "Lab export folder",
  "max_pending": 10,
  "settle_seconds": 2.0
}
```

These are fields to merge, not a replacement for the model settings. Create
`runs/scanner-inbox`, then restart the app to load configuration. `incoming_dir: null`
keeps folder intake unconfigured and manual upload available.

1. Open **Source** and click **Start intake before publishing new images**.
   Active intake controls then remain visible above the scan. The first start in each
   server session skips existing inbox files. One-second polling waits for stable
   file metadata and successful decoding before copying a canonical image locally.
2. Export completed images to the inbox. Prefer a producer that writes a temporary
   extension and atomically renames to `.png`, `.jpg` or `.bmp` when finished.
   Stability checks alone cannot prove that the scanner has finished writing.
   Use unique filenames and retain exports until their runs are accounted for.
3. New images queue and run automatically, one at a time. A full queue leaves
   further exports in the inbox while accepted jobs continue. The threshold is
   captured when each scan enters the queue. Source/decoding/model failures remain visible.
4. **Follow latest** selects new arrivals. Selecting history, inspecting the canvas
   or editing a note holds the current scan; enable Follow latest to resume tracking.
5. **Pause intake** stops new reception and queued dispatch. A running job finishes;
   queued scans remain. Resume processes that queue and discovers exports that
   accumulated during the pause. Pause has no effect on scanner hardware.

For a local rehearsal, copy authorized published images after starting intake and
label the source as a replay. This tests the software path, not a physical scanner.
The configured folder must be readable; subfolders are not scanned. The producer
must not overwrite/delete unseen exports when the app is paused or busy.

**Restart limit:** pending queue, source fingerprints and browser history are held
in memory. Drain and record the queue before closing the app. A restart starts
paused and its first Start skips existing exports again; unfinished exports require
deliberate manual upload or republishing under a new filename after Start. Saved
scan/run files remain on disk, but there is no automatic queue recovery.

To establish a genuine connection, confirm the scanner make/model, workstation
software, export format, completion signal, naming and arrival rate with the lab.
Then observe one real scan travel through export, intake, inference and review.
The [research record](scanner-research.md) separates vendor claims from verified features.

## Organization

- `frontend/`: React/TypeScript UI, local assets, browser tests and npm lock.
- `backend/`: FastAPI service/adapter, synthetic tests and separate uv lock.
- `engine/`: pinned SDP submodule with shared contracts, model catalog,
  inference scripts and reviewed model runtime profiles.
- `docs/`: app decisions, usage and dated evidence; the SDP backlog stays upstream.
- `run-app.ps1`, `config.example.json`: local Windows launch and configuration.

The backend imports the engine package and invokes its scripts in the separate
model environment. Only the app adapter is maintained here. Preserve the engine
pin and use [the contribution workflow](../CONTRIBUTING.md) for changes.

## Compare workstation designs

Open `/design-studio/` on your running app (at the default port:
**http://127.0.0.1:8765/design-studio/**). The gallery leads with six advanced
workstations (11–16); the original ten compact options remain available through
the group filter. **Open preview** expands
an option; use the design selector or previous/next controls to compare them.
**Focus preview** reduces surrounding studio text; Escape exits focus view.
**Save option** stores a shortlist in this browser; **Copy my choice** produces text
to paste into the project conversation. Nothing is published or sent automatically.

Advanced layouts partition navigation, saved scans, the viewer, evidence and
context. Try the session/source views, scan search and review filters, evidence
tabs, panel visibility and display options. The available controls vary by layout.
Session summaries describe only the loaded saved records, not live scanner traffic.

The studio only reads saved local runs and their images. Zoom, overlay, details and
image selection affect the preview alone; it cannot run inference or save operator
review. If there is no saved evidence, it displays an empty state. The comparison
layout shows two renderings of the same image, not two acquired scanner views.
The working app implements the selected Analyst Studio composition; use Appearance there to compare fonts and palettes.
See the [design guide](design-options.md) for each layout's purpose and tradeoff.

## Development and checks

Start the backend as above. In a second terminal:

```powershell
npm --prefix frontend run dev
```

Open the Vite URL, normally http://127.0.0.1:5173. `/api` is proxied to 8765.
Rebuild the frontend and restart the backend to test the production launch path.

```powershell
uv run --project backend --locked ruff check backend
uv run --project backend --locked python -m pytest backend/tests
npm --prefix frontend run build
# Use an installed Chrome for these tests (omit this line to use Playwright Chromium):
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm --prefix frontend run test:e2e
```

Browser tests use synthetic inputs/responses to exercise interface behavior;
they do not load a real checkpoint. Actual model/browser rehearsal evidence is
recorded separately in [verification](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/verification.md).
For Playwright Chromium, run `npx playwright install chromium` from `frontend`
once. CI installs its own browser; the local checks used installed Chrome.

## Storage, recovery and limits

Each server start creates a private session folder below `runs/gui/`. Uploads,
model outputs, logs and manifests stay there. Browser history covers the current
server session only; restarting retains files but clears that session list.
Exports contain useful result metadata without machine-specific paths.

Default limits: 20 MiB upload, 20 million pixels, 100 scans/runs per session,
180 seconds per model run, and a 2 GiB storage admission threshold. The threshold
blocks new work when reached; it is not a hard quota on files written by a running
model. A full store needs deliberate review of old evidence before retrying.
Nothing deletes old scans automatically.

If the backend is unavailable, restart it and use the connection retry control.
If inference fails, the selected run shows the failure; inspect its private log
for the detailed cause. Never substitute an earlier result as a new live prediction.
No sample scans or precomputed predictions are bundled into the product.

This is a loopback, single-user research app. Network deployment, authentication,
direct scanner SDK/control, durable queues/cross-session history, task switching,
model training and an installable desktop package are not implemented.

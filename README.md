# RayGuard App

A local X-ray inspection interface for the RayGuard research project: upload or
receive images, inspect real model detections, compare eligible test references,
record review notes and export evidence. Empty detections do not mean safe or benign.

GUI direction and repository maintenance: **Abd Alrahman Basim Ismaik**
([@abdalrahman-ismaik](https://github.com/abdalrahman-ismaik)). Development includes
AI-assisted implementation and verification. See [credits and provenance](CREDITS.md)
for the distinction between app work, team research and upstream models/assets.

The [SDP-I-RayGuard project](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard)
remains the source of research requirements, the team backlog, prediction contracts
and detector tooling. This repository owns the application. Its `engine/` submodule
pins the compatible SDP dependency; do not maintain another copy of that code.

## Clone and start

Install Git, Python 3.12, [uv](https://docs.astral.sh/uv/) and Node.js 22.12 or newer.

```powershell
git clone --recurse-submodules https://github.com/abdalrahman-ismaik/RayGuard-App.git
cd RayGuard-App
```

For an existing clone, initialize the recorded engine revision:

```powershell
git submodule update --init --recursive
```

On Windows, run `./run-app.ps1` from PowerShell. It builds the locked frontend and
starts one local API service. The normal address is <http://127.0.0.1:8765>;
Ctrl+C stops the service. An existing service is preserved. `-Port`, `-Config`
and `-SkipBuild` support another port, an explicit local config and a previously
built frontend. Model/device changes use the app's deliberate restart flow.

For a UI-only launch without preparing a model environment:

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
uv run --project backend --locked rayguard-gui
```

The interface opens with inference unavailable until a model is configured.
Weights, datasets, private configuration and prior sessions are not in this repository.

## Portable CPU and NVIDIA inference

The Windows launcher can prepare the reviewed isolated CPU/NVIDIA environments
through the pinned engine. With no local configuration it follows the managed
setup path; `-SetupModel` explicitly prepares it again. This can download model
dependencies, but never checkpoints or datasets. Other platforms/vendors need
independent qualification; web/API installation alone does not qualify inference.

Copy [config.example.json](config.example.json) to ignored `config.local.json`
and provide authorized checkpoint and model-interpreter paths, or configure the
managed local file produced by setup. Paths resolve relative to the config file.
Use the pinned original YOLOv10 backend and exact catalog-bound artifacts.
The three supported task models are Generic Explosive, Electronic Devices and
Specific Explosives; their class meanings remain distinct.

In **Workspace setup → Model & compute**, select the model and CPU/GPU together,
then **Apply and restart**. Real model verification is a separate explicit action.
Changed paths, code, devices or dependencies can invalidate earlier qualification.
Saved history and queues are session-only; export needed reviews before restarting.
See [runtime evidence and limits](docs/runtime-verification.md),
[model selection](docs/model-selection.md) and the [usage guide](docs/usage.md).

## Use and develop

The [usage guide](docs/usage.md) covers navigation, viewing, folder reception,
dataset replay, reference comparison, review/export and restart recovery.
The [architecture](docs/architecture.md), [contribution guide](CONTRIBUTING.md)
and [current status](docs/status.md) describe the implementation and checks.

| Path | Responsibility |
|---|---|
| `run-app.ps1` | Single Windows launch entry point |
| `frontend/` | Dashboard, scan viewer, styles and browser tests |
| `backend/` | Local API, acquisition, model adapter and API tests |
| `engine/` | Pinned SDP contracts, detector tooling and runtime profiles |
| `docs/` | Architecture, usage, design decisions and verification |
| `config.example.json` | Portable configuration template; local copies stay ignored |

The [extraction record](docs/migration.md) documents the dependency pin, preserved
source history, 149 browser checks and real inference from this checkout.

This is a loopback research application. A physical scanner handoff, full P1/P2,
model accuracy and human showcase acceptance are not established by GUI tests.
The dated records in `docs/` preserve earlier SDP evidence; they do not imply
new model execution in this extracted checkout. Research deadlines and task
ownership remain in the [SDP backlog](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md).

# Application extraction — 27 September 2026

The owner requested a separate public application repository immediately, before
the poster deadline. This is a repository decision, not a change to advisor
requirements, research ownership or the 30 September submission obligation.

## Boundary and reproducibility

RayGuard-App owns the React frontend, FastAPI service, launcher, app tests and
usage/design documentation. SDP-I-RayGuard owns the research backlog, meeting
records, CPU audits, shared prediction contracts, model catalog, detector scripts,
runtime profiles and P1/P2 work. The app consumes that code through one `engine/`
Git submodule pinned initially to
`b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4`.

Clone with `--recurse-submodules`, or run `git submodule update --init --recursive`.
Startup checks the recorded gitlink, actual engine revision, tracked changes and
installed package origin. Backend dependencies use the editable `../engine`
source. Core changes belong in SDP first; an app dependency update requires an
explicit gitlink change and corresponding checks.

The app was unpublished working-tree content in the original checkout. A private
snapshot preserved all 242 Git-visible source files, their sizes and hashes,
working/index patches and a Git history bundle before extraction. The initial
app copy contained 140 source files, about 7.4 MB. Existing app files, source media,
local configurations, environments and running services were preserved in place.
The old app is now ignored and is a recovery copy; edit this repository going
forward. No Git history was rewritten or earlier GUI commits fabricated.

## Executed checks

| Check | Actual result | Meaning |
|---|---|---|
| SDP `uv run --locked ruff check .` | Passed | Shared core lint |
| SDP `uv run --locked python -m pytest` | 143 passed | Synthetic CPU software checks |
| App `uv run --project backend --locked ruff check backend` | Passed | API/launcher integration lint |
| App `uv run --project backend --locked python -m pytest backend/tests` | 280 passed | Synthetic API/runtime checks, including engine extraction and PowerShell launcher routing |
| Frontend `npm ci` | Passed; 0 reported vulnerabilities | Locked app dependencies installed; no model packages |
| Frontend `npm run build` | TypeScript and Vite passed | Production asset build |
| Frontend `npm run test:e2e -- --config playwright.migration.local.ts --reporter=line` | 149 passed in 4.8 minutes | Isolated ignored local config on 19065 using installed Chrome; real bundled media, synthetic API/model fixtures |
| New launcher with existing local model config | Passed on a separate local port | New app root and pinned engine run independently of the former app layout |
| Fresh model qualification | CPU/GPU FP32 parity passed; selected `cuda:0` | Real existing generic YOLOv10-M checkpoint/runtime on this RTX 2060 host |
| Ordinary upload: `Train000003.jpg`, threshold 0.25 | One Explosive detection | Real training-image diagnostic, not held-out performance |
| Ordinary replay: `Test000001.jpg`, threshold 0.25 | Zero detections; reference outcome **missed** | Known missed threat preserved and displayed separately from execution success |
| GET-only browser review of those two saved runs | Desktop and 390px mobile passed; two runs unchanged | Actual images, correct GPU/FP32 provenance, positive box and known-miss reference; no new inference |
| Fresh public `git clone --recurse-submodules` | Passed at app commit `22ab909`; engine pin matched | Remote source retrieval, independent checkout and package-origin validation |
| Fresh clone backend tests and frontend install/build | 280 passed in 23.90 seconds; build passed | New local app environment; no dependency on the old app source directory |

Model qualification was regenerated for the extracted adapter and engine paths;
an old readiness cache was not reused. The authorized dataset, checkpoint and
separate model interpreters stayed in their existing local locations. No dataset
or checkpoint download, training or split modification occurred. Private logs,
exports and machine paths are ignored. Bounded diagnostics establish execution
and provenance only; they do not estimate accuracy or establish safe baggage.

Public staging review covered 155 regular files plus the engine gitlink, with no
credentials, private paths, datasets, checkpoints or local configs found. All
upstream font-license bytes were retained to preserve their recorded hashes.
The initial publication is `22ab9093019a022e379716480f2f5cd8a48c7b27`.
The [GitHub workflow](https://github.com/abdalrahman-ismaik/RayGuard-App/actions/workflows/ci.yml)
runs Linux/Windows API checks and Chromium browser checks; its results are software
evidence, never hosted model qualification.

## Remaining acceptance

Human showcase rehearsal, the intended lab laptop/pager model pairing, physical
scanner/export handoff and qualification on another computer remain open. Full
P1 association/decisions, distributed P2 fusion, persistent multi-session history
and network deployment are not implemented. See the
[shared backlog](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md)
for research obligations and the [credits](../CREDITS.md) for attribution.

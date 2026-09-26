# App engineering record

## Repository extraction — 27 September 2026

The owner requested immediate separation and public visibility. Automated
implementation coordinated the migration, shared dependency and Git operations;
separate agents adapted the backend/launcher and reviewed documentation, browser
behavior, portability, privacy and attribution. No student hours or unrecorded
individual authorship are inferred.

The app now owns `frontend/`, `backend/`, `run-app.ps1` and its documentation.
`engine/` pins the existing SDP source at
`b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4`; no second contract or model catalog was
created. Startup detects an uninitialized, mismatched or modified engine and an
incorrect installed package origin. Launcher setup passes the chosen config
explicitly. Local paths resolve from that config; generated app evidence stays
under this checkout. The 27 locked backend dependency versions were preserved.

[Migration verification](migration.md) records the actual commands: shared CPU
lint/143 tests, app lint/280 tests, locked frontend installation/build and all
149 browser checks passed. Browser results use synthetic API/model fixtures and
real bundled media. Separately, fresh real CPU/GPU qualification and two normal
generic YOLO runs passed: a training-image positive and a test-image known miss
with reference comparison. No training, dataset changes or model downloads ran.

Existing source/history was backed up before copying; original app files and
services remain available. Datasets, weights, local settings, environments and
generated evidence are excluded from commits. Public attribution distinguishes
the owner's GUI direction and maintenance, assisted implementation, shared SDP
research and upstream artifacts. The research backlog remains in SDP; this
extraction does not complete human showcase acceptance or alter deadlines.

The initial app commit `22ab909` was published publicly. A fresh recursive clone
from GitHub resolved the exact engine pin and passed package-origin validation,
all 280 backend tests (23.90 seconds) and locked frontend install/build. A separate
GET-only browser review inspected both genuine saved runs at desktop and 390px:
the positive box, missed-reference result and GPU/FP32 provenance were correct,
without creating more runs. Final independent review resolved all 90 local app
document links and 222 SDP links/anchors, including 69 links into this repository.

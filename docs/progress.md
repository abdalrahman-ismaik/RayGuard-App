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

## Hosted browser recovery test — 27 September 2026

The [initial hosted app check](https://github.com/abdalrahman-ismaik/RayGuard-App/actions/runs/36271955691)
passed both API operating-system jobs. Its browser job passed 148 of 149 tests;
the processing-split recovery case timed out clicking **Reconnect service** after
the active-run poll had already restored the connection and removed that button.
The same timing assumption existed in the active-run eye test.

Those two tests now wait for automatic recovery and retain their completion,
image-identity, no-intro and no-resubmission assertions. Separate offline-start
tests still click the manual reconnect control. Application behavior is unchanged;
no exception swallowing, retries or longer timeouts were added.

From `frontend/`, the exact targeted command was:

```text
npm.cmd run test:e2e -- --config playwright.migration.local.ts --reporter=line --grep "offline processing preserves|losing the service during a run|offline service exposes recovery|network failure during start" --repeat-each 5
```

**20 passed in 40.5 seconds** using installed Chrome on isolated port 19065.
This repeats both automatic-recovery cases and both manual-reconnect cases five
times with synthetic API/model fixtures. A new hosted check is required for the
fixed commit; these local results do not claim that hosted result in advance.
No new inference or dataset operation was performed for the test correction.

The initial app commit `22ab909` was published publicly. A fresh recursive clone
from GitHub resolved the exact engine pin and passed package-origin validation,
all 280 backend tests (23.90 seconds) and locked frontend install/build. A separate
GET-only browser review inspected both genuine saved runs at desktop and 390px:
the positive box, missed-reference result and GPU/FP32 provenance were correct,
without creating more runs. Final independent review resolved all 90 local app
document links and 222 SDP links/anchors, including 69 links into this repository.

## README graphical title and walkthrough — 27 September 2026

The owner requested a graphical name/title and a short demo like his reference
project. Automated implementation produced an original graphite/Barlow SVG and
a 34-second recording of the actual app, published as an inline GIF with a
sharper, smaller MP4 alternative. Separate agents owned the banner and browser
capture; the coordinator owned the edit, documentation, verification and Git.
An independent reviewer checked the finished presentation. No student hours or
additional individual authorship are inferred.

The app code and engine pin are unchanged. The capture used its own local
service/storage and two original, visibly labelled synthetic drawings. Fresh
CPU/GPU qualification and two real generic YOLO runs succeeded; both returned
zero detections at 0.25. Recorded run elapsed times were 8.848 and 17.939 seconds.
The 12-second idle-wait cut is disclosed beside the demo and in
[the asset record](images/README.md). This is actual model execution on synthetic
inputs, not real-data validation, accuracy measurement or a safe/benign verdict.
No dataset photographs, checkpoints or private settings entered the public media.

Verification commands and actual outcomes:

- In the ignored local composition, `npx.cmd --yes hyperframes@0.8.79 check --json`
  passed with zero lint/runtime/layout findings and 20/20 caption contrast checks.
  `snapshot --at 3,10,18,25,31 --no-end --describe false` produced five inspected
  frames. The app recording itself reported zero browser console errors/warnings.
- `npx.cmd --yes hyperframes@0.8.79 render --quality looks --fps 25 --workers 2
  --output ../../../docs/images/gui-demo.mp4` produced all 848 frames. The source
  WebM triggered a sparse-keyframe advisory; the renderer extracted all 848
  required frames with full coverage. Final frames show the intended processing,
  zoom, pan, magnifier and review states.
- The ignored `python output/readme-demo/finish_media.py` used locally resolved
  FFmpeg/FFprobe executables to encode the GIF, decode both entire final streams
  without errors and confirm their metadata. MP4: 1440 × 988, 25 fps, 33.92 s;
  GIF: 1000 × 686, 10 fps, 33.90 s. Exact sizes and SHA-256 hashes are in the asset
  record. Final contact-sheet and magnifier-frame inspection passed.
- `python output/readme-demo/check_links.py` resolved all 93 local targets in
  README, credits and `docs/`, including HTML image sources; none were missing.
  The one Impeccable mechanical detector pass returned no findings. The header
  passed desktop/mobile checks and contains no scripts or external resources.
- `git diff --check` passed. Git ignore checks confirmed raw capture, local
  configuration, generated inputs, composition and helper tools remain ignored.
- Independent README browser review at 1440px and 390px found no horizontal
  overflow; both images loaded. GIF/MP4 samples around the edit boundary and all
  inspection/review stages agreed, without frozen frames. The GIF had 335
  changing frame transitions. The staged-file review accepted exactly nine
  documentation/media files, matched the published-asset hashes to Git's index
  and found no unexpected private paths or credential patterns.

These are documentation/media changes; no new app behavior, training, model or
dataset download is claimed. Existing application checks remain separately
recorded: the hosted run for `3cd38d1` passed both API operating-system jobs and
all 149 browser checks
([run 36272488630](https://github.com/abdalrahman-ismaik/RayGuard-App/actions/runs/36272488630)).
Research tasks and showcase acceptance remain open in the linked SDP backlog.
Next action: use the new walkthrough to introduce the app, then rehearse with
the authorized research diagnostics on the actual presentation laptop.

# App engineering record

## Report screenshots — 23 November 2026

Claude (AI agent) captured 12 synthetic-fixture screenshots for the final report at
Mohammad's request; Mohammad reviewed and committed them. Files and captions:
`docs/images/report/`. Six states (intake, explicit run, prediction vs reference,
empty result, failed run with model unavailable, session history), each in Onyx and
Onyx Light. Captured with a git-ignored Playwright script (installed Chrome, 1440x900,
2x) and API routes fulfilled by fixtures; all 12 captures passed and each image was
visually inspected. Limitations: synthetic UI states only; no scans, inference, model
performance, hardware or human-acceptance evidence.

## T43 publication preparation — 23 November 2026

Codex (AI agent) drafted the four T43 app files and docs at Mohammad's request.
Mohammad reviewed the diff and committed and pushed it under his own account on
`mohammad/gui-acceptance`, then opened a PR against main. This records authorship
of the commit only, not joint technical acceptance.

Branch: `mohammad/gui-acceptance`, based on
`3488abdd60e9b68ac62cc4d35ce85245c0f9bdf9` (matching origin/main at preparation).
Scope: `frontend/tests/e2e/t43-acceptance.spec.ts`,
`docs/t43-gui-acceptance.md`, `docs/progress.md`, `docs/status.md`.
No production code, dependency lock or engine pin changes.

Fresh checks on 23 November:
- App root: `npm.cmd --prefix frontend run build` passed.
- Frontend: `$env:PLAYWRIGHT_CHANNEL='chrome'; npm.cmd run test:e2e -- t43-acceptance.spec.ts`
  passed all eight checks in 12.8 seconds.
- Frontend: `npx.cmd tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types node tests/e2e/t43-acceptance.spec.ts`
  passed. An initial invocation from the app root could not resolve the frontend
  Node types; running from the documented frontend directory resolved it.
- `git diff --check` passed; the four-file scope and synthetic evidence labels were reviewed.

The 157-browser/280-backend results below are the earlier 15 November run, not
a new full-suite result. Hosted checks and human review of the published head are
separate gates. Mohammad has since confirmed the GUI opens successfully; no joint
walkthrough with Abd, model qualification or completed personal checklist is inferred.
Next: obtain human review of the app PR, walk through the demo with Abd and record
actual acceptance outcomes and the app commit/PR link in the research handoff.


## T43 GUI acceptance slice — 15 November 2026

Mohammad requested this T43 scope. Automated implementation/verification prepared
the isolated test/documentation slice; student understanding, hours, personal
acceptance and Abd's integration review are not inferred. The app checkout was
clean at `3488abdd60e9b68ac62cc4d35ce85245c0f9bdf9`; engine remains
`b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4`.

Added `frontend/tests/e2e/t43-acceptance.spec.ts` and
[the acceptance record](t43-gui-acceptance.md), with this progress entry and the
status handoff. Eight focused checks fill gaps in saved-session search/filter/sort,
keyboard entry, selected image/unsaved draft retention across routes/themes,
saved versus current model identity, empty/failed results and Session/Review
accessibility at 320/1366px in Onyx/Onyx Light. The test image, names and provenance
are explicitly synthetic; every API mutation is rejected and checked. No production
component, model adapter, dependency pin or engine source was changed.

Executed on Windows with Node 24.16.0, npm 11.13.0, installed Chrome 157.0.8103.51
and CPython 3.14.0. Results:

| Directory | Exact command | Outcome |
|---|---|---|
| App root | `npm --prefix frontend ci` | Passed, 32 packages installed; npm reported two high-severity dependency advisories. No lock change or automatic dependency upgrade. |
| App root | `npm --prefix frontend run build` | Passed. |
| App frontend | `npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --types node tests/e2e/t43-acceptance.spec.ts` | Passed; separately checks the new tests excluded from the app build's source list. |
| App frontend | `$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:e2e -- t43-acceptance.spec.ts` | 8 passed (23.3 seconds). |
| App frontend | `$env:PLAYWRIGHT_CHANNEL='chrome'; npm run test:e2e` | 157 passed (6.8 minutes), including all 149 pre-existing checks and the eight new checks. |
| App root | `uv run --project backend --locked ruff check backend` | Passed. |
| App root | `uv run --project backend --locked python -m pytest backend/tests` | 280 passed; one existing Starlette/httpx deprecation warning. |
| Research root | `uv run --locked ruff check .` | Passed. |
| Research root | `uv run --locked python -m pytest` | 187 passed, 9 skipped because this Windows account cannot create the test symlinks. |

Setup: `uv` was initially absent. A temporary standalone official uv 0.9.7 executable
was added to the checking process's PATH only; locked isolated environments were
created. No model environment or global settings were changed.
`npx playwright install chromium` failed after download timeouts, so the documented
installed-Chrome alternative was used. Bundled Playwright Chromium was not verified.
Some existing browser cases emitted local proxy connection-refused messages;
the full suite nevertheless completed with no failed assertions.

Reviewed generated synthetic processing-split screenshots at 320px Onyx Light and
1366px Onyx: active/held scan identities and reference/result labels remain separate.
The acceptance page's relative links resolve; final whitespace checks passed.
Generated screenshots, environments and browser outputs remain ignored.

Limitations: this is synthetic software verification, not model execution,
accuracy, accessibility certification or human showcase acceptance. Dependency
advisory remediation is outside this T43 slice and still needs maintainer review.
Intended lab model pairing, screen-reader/presentation-laptop rehearsal and physical
scanner export acceptance remain open. Historical schedule conflicts remain unchanged.

Next: Mohammad reviews/explains this diff, performs the pending personal checklist
with Abd and the relevant model/evaluation owners, then personally publishes the
reviewed increment and adds its app commit/PR link to the team progress record.
No commit, push, PR or student sign-off was made by this session.

### Manual launch repair — 15 November 2026

The user's terminal could not resolve the profile-level Python path embedded in
`backend/.venv`. That path still resolved in the checking environment, so terminal
visibility differed. Installed CPython 3.14.0 under ignored `backend/.venv-python`
using `uv python install 3.14.0 --install-dir backend/.venv-python --no-bin --no-registry`.
Preserved the old environment as ignored `backend/.venv-before-t43-repair` and ran
`uv sync --project backend --locked --python <project-local-python.exe>` to rebuild
against the project-local interpreter. No dependency lock or global setting changed.

Verified `backend/.venv/Scripts/rayguard-gui.exe --help`, then started the GUI:
startup completed, `GET /` returned HTTP 200 and `/api/health` reported the model
unconfigured. The service was left running on loopback port 8765 for manual review.
All three environment directories are ignored. The user's own terminal retry
remains to be observed; no model execution or manual acceptance is inferred.

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

## Self-contained repository and tuned model — 27 November 2026

The owner asked for the app to be independent of the SDP repository and for the
tuned model to be available to examiners.

- Replaced the `engine/` submodule with a regular folder: SDP revision `b7ec59e`
  plus the tuned catalogue entry from `83961d2`. Research docs, agent skills and
  SDP CI were not copied. `rayguard_gui.engine` now checks the bundled files and
  package origin instead of a gitlink; CI runs engine lint and tests.
- Catalogue entry `author-yolov10m-generic-tuned` (`epoch-084.pt`, SHA-256
  `097ff71e…f65f8`). Model-policy tests now expect four selectable YOLOv10-M entries.
- Published `epoch-084.pt` as release asset `tuned-model-v1` (IEDXray, CC BY 4.0).
  `scripts/get-tuned-model.ps1` downloads it to ignored `models/` and checks the hash.
  The untuned author checkpoints are not redistributed.
- Launcher stops only this checkout's earlier RayGuard processes (PR #2).

Checks: backend Ruff passed, 283 backend tests passed; engine Ruff passed, 143
engine tests passed. Real CPU run on the owner's laptop: release download hash
matched, app model verification passed, Test001489 one detection (0.954),
Test000001 and Test003370 none. Browser checks were left to CI.

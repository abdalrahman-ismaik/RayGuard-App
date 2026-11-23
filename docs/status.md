# App status

**T43 review preparation — 23 November 2026:** Mohammad's isolated acceptance slice
adds eight synthetic saved-review/accessibility checks and an
[acceptance checklist](t43-gui-acceptance.md). Build, 157 browser checks, backend
lint/280 tests and the new test's type check passed. Shared-project lint passed;
187 tests passed and nine Windows symlink checks were skipped.
See [commands and limitations](progress.md#t43-gui-acceptance-slice--15-november-2026).
Fresh 23 November checks passed: build, eight T43 browser checks and test type check.
The full-suite counts above are the 15 November results. Mohammad authorized
publication on `mohammad/gui-acceptance` (Codex-drafted, reviewed and committed by Mohammad).
Production GUI/model code and the engine pin are unchanged. Human acceptance,
explain-back and Abd's integration review remain open.

Updated 27 September 2026. The application has been extracted into its own public
repository, with SDP engine commit `b7ec59e` pinned as a submodule. Original local
files and services are preserved; GUI development now belongs here.

Upload, folder receipt, finite IEDXray replay, inspection/reference overlays,
zoom/pan/magnifier, processing/completed split view, model/device selection,
review and export are implemented. The Windows entry point is `run-app.ps1`.
Inference needs separately authorized weights, datasets and a qualified runtime.

The README now includes an original graphical title and a 34-second app
walkthrough in GIF/MP4 formats. The demo uses visibly synthetic inputs with actual
model execution; it is not accuracy evidence. [Capture notes](images/README.md)
record the omitted wait, results, asset provenance and media verification.

Backend lint and 280 tests, frontend build and 149 browser checks passed. Fresh
CPU/GPU qualification and two ordinary generic YOLO runs passed from this folder:
one training-image positive and the retained known test-image miss. See the
[migration record](migration.md) for commands and evidence boundaries.

Human showcase acceptance, intended lab model pairing and physical scanner
integration remain open. Full P1/P2 and persistent session history are unfinished.
Keep the 30 September poster obligation and collection milestones in the
[SDP team backlog](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md).
Next: rehearse this app on the presentation laptop with the verified diagnostics,
then confirm the lab pairing and observe a real scanner export handoff.

# App status

Updated 27 September 2026. The application has been extracted into its own public
repository, with SDP engine commit `b7ec59e` pinned as a submodule. Original local
files and services are preserved; GUI development now belongs here.

Upload, folder receipt, finite IEDXray replay, inspection/reference overlays,
zoom/pan/magnifier, processing/completed split view, model/device selection,
review and export are implemented. The Windows entry point is `run-app.ps1`.
Inference needs separately authorized weights, datasets and a qualified runtime.

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

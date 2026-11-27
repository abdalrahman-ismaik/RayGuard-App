# RayGuard App

Read README.md, docs/status.md and docs/architecture.md before changing the app.
This application was extracted from SDP-I-RayGuard. Research requirements and the
team backlog remain authoritative in the linked SDP repository; do not invent a
new advisor requirement or student contribution.

- engine/ is this repository's own inference engine (copied from SDP on
  27 November 2026; no submodule). Change contracts, model catalog, scripts and
  environment locks there with engine tests; do not keep a second copy elsewhere.
- Keep image/run/model identity and published annotations separate. Empty
  detections never imply a safe item. No training, dataset changes or hardware
  claims are implied by a browser feature or synthetic test.
- Keep credentials, local settings, scans, checkpoints, environments, generated
  runs and private source documents out of Git. Source PDFs remain external.
- Run backend Ruff/pytest and frontend build/browser checks appropriate to edits.
  Use locked dependencies; model packages stay in a separate environment.
- Preserve review drafts, accessibility, themes, bounded acquisition and explicit
  inference starts. Keep modules small enough for a contributor to explain.
- Record actual changes, commands/outcomes and limitations in docs/progress.md;
  maintain docs/status.md as the handoff. Do not invent student authorship/hours.
- One coordinator owns dependency pins, shared status, Git operations and model
  jobs. Parallel work must have separate file ownership and be reviewed.

# Report screenshots (synthetic)

Captured 23 November 2026 from the RayGuard-App frontend with Playwright and installed
Chrome at 1440x900 (2x). Every record, box and pixel is a **synthetic fixture**: drawn
shapes labelled "SYNTHETIC UI FIXTURE", made-up run records, no real scans, no checkpoint
and no model inference. They show interface states only, not detector performance,
hardware integration or human acceptance. Each state has a dark (Onyx) and light
(Onyx Light) version.

| File | State shown |
| --- | --- |
| `01-intake-source-*.png` | Folder intake waiting for exports; scanner connection shown as unverified. |
| `02-explicit-run-ready-*.png` | Uploaded image awaiting an explicit "Run inference"; nothing starts automatically. |
| `03-prediction-vs-reference-*.png` | Prediction (solid amber, "1") shown separately from a reference box (dashed cyan, "GT1") with Matched/Missed/Extra counts. The "IEDXray test reference" label is the app's label for dataset-demo records; here the reference box is synthetic, not dataset data. |
| `04-empty-result-not-safe-*.png` | No detections, reported as "not a safe or benign verdict". |
| `05-failed-run-model-unavailable-*.png` | Failed run with the current model unconfigured; Run inference disabled. |
| `06-session-history-*.png` | Saved session records with search, filter, sort, status and review state. |

Report captions should keep the word "synthetic".

# Airport screening interfaces and scanner input

Research date: **25 September 2026**. Scope: [T28](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md), the user's
request for an airport-style interface and automatic inference on arriving scans.
M02 requires an existing-model laptop showcase; it does not establish a working
scanner connection. This document informs the [app architecture](architecture.md),
not a second task backlog.

**Recommended first connection:** receive complete, authorized image exports into
a local inbox, queue them, run the existing detector, and present each result for
review. This can become a real scanner link only after the lab verifies that its
particular scanner/software can supply those exports. A folder replay demonstrates
the software path; it is not evidence of hardware connectivity or airport throughput.

## What was actually studied

“Documented” below means a manufacturer's public claim. “Visually inspected” means
the linked public image was opened and examined. Neither means the commercial
software was installed or independently performance-tested.

| Product / primary source | Evidence and useful functionality | Implication for RayGuard |
|---|---|---|
| [Smiths HI-SCAN 6040 CTiX interface](https://www.smithsdetection.com/insights/red-dot-design-award-for-the-hi-scan-6040-ctix-graphical-user-interface/) | Documented operator interviews and iterative testing; frequently used controls at the bottom, extra information shown on request. Its [public GUI image](https://www.smithsdetection.com/media/yi0cubpe/red-dot-award-gui-2048x1254.jpg) was visually inspected: scan-dominant panes, compact tool strip, yellow marked regions and separate disposition controls. | Keep the scan dominant, tools close together and technical detail collapsible. Do not copy CT panes, bag-clearance controls or product branding into an app that cannot support their meaning. |
| [Smiths HI-SCAN 7555 DV datasheet](https://www.smithsdetection.com/media/5ubb5z1b/hi-scan-7555-dv_datasheet_smiths_detection.pdf) | Documented dual-view imaging, zoom, recent-image recall, time/mode information, counters, stored-image retrieval and system diagnostics. | Show real source/job state and recent work; retain zoom/fit/overlays. A network port in a datasheet does not establish an available image API. |
| [Smiths iCMORE](https://www.smithsdetection.com/icmore/) | Manufacturer describes scan, analysis and framed suspicious-object alerts, including integrations with its own scanners. The site's image named “UI Prohibited Items” was inspected and is an illustration of objects, **not a GUI screenshot**. | Region overlays support attention and review. Commercial speed, detection and certification claims do not transfer to our generic YOLO baseline. |
| [Rapiscan ORION / ScanOS](https://www.rapiscansystems.com/orion/) | Documented image-processing and detection tools. The [published scan example](https://www.rapiscansystems.com/orion/images/bag3.png) was visually inspected: a color X-ray with localized red alert outlines. It is an image example, not a full operator-screen capture. | Preserve the original scan colors; use visible numbered regions. Cosmetic filters must not be represented as material analysis or feed silently into the model. |
| [Rapiscan NETView](https://www.rapiscansystems.com/en/products/rapiscan-netview) | Documented centralized archive, scanner-to-archive synchronization, review and filtering by site, scanner, operator and time. The linked product image could not be fetched; no visual-layout claim is made for it. | Distinguish acquisition, inference and review. Keep source identity, arrival history and failures accessible. Start with one real source instead of imaginary multi-lane dashboards. |
| [Rapiscan image archiving](https://www.rapiscansystems.com/en/products/rapiscan-image-archiving) | Documented manual/automatic archive, remote shared-folder monitoring and BMP export. The vendor explicitly distinguishes its proprietary image format from ordinary bitmap exports. | Export ingestion is a plausible route **for a verified installation**. Native proprietary files require a documented exporter/decoder; changing an extension is not conversion. |
| [Leidos ClearScan fact sheet](https://www.leidos.com/sites/leidos/files/2020-11/PDF-FS-Leidos-ClearScan-HS-Digital-207101.pdf) and [ProSight](https://www.leidos.com/markets/aviation/security-detection/aviation-checkpoint/machsecure) | Published text describes CT 2D/3D review, remote screening and image archives; ProSight integrates screening equipment, algorithms and operational data. Fact-sheet text was indexed, but direct PDF retrieval failed; its GUI was not visually inspected. | Useful separation between inspection and fleet/operations management. Neither page supplies a usable public SDK or confirms compatibility with the lab scanner. |

Manufacturer figures remain linked references; they are not redistributed as app
assets. Search snippets alone were not treated as visual inspection. No restricted
operator portal, private manual or service account was accessed.

## What “live” means here

Conventional baggage X-ray images, CT volumes and camera video are different inputs.
The [CTiX explanation](https://www.smithsdetection.com/insights/red-dot-design-award-for-the-hi-scan-6040-ctix-graphical-user-interface/)
explicitly contrasts CT's 3D image analysis with conventional 2D images. Rapiscan's
[935DX description](https://www.rapiscansystems.com/en/products/orion-935dx)
describes a detector line and conveyor geometry. Neither is evidence of a webcam or
RTSP endpoint. A scrolling scanner screen also does not establish access to raw lines.

For the current complete-image detector, use **automatic processing of completed
scan images**. Incremental line-by-line inference, reconstructed CT volumes and
dual-view pairing require different acquisition contracts and validation. The
existing CPU subprocess takes seconds including model startup; this is not
video-rate inference or a proven operational checkpoint latency.

Public [Smiths open-architecture information](https://www.smithsdetection.com/digital-innovation/open-architecture/)
describes third-party integration programs. [NEMA's DICOS scope](https://www.nema.org/docs/default-source/standards-document-library/nema_iic_v03-contents-and-scope.pdf?sfvrsn=39c7fb9_1)
describes security-imaging information objects. These are possible future
integration routes, **not proof of enabled interfaces, SDK access or supported
formats on the lab machine**. DICOS is not implemented in this draft.

## Recommended working behavior

1. Clearly identify **manual upload** or **folder intake**, the source's accessibility,
   intake running/paused state, last observed arrival and queue depth. A readable
   directory means the inbox is available, not that a physical scanner is connected.
2. Accept complete files through a bounded inbox. Prefer producer-side atomic rename
   from a temporary name after writing; stability/decode checks are a fallback,
   not a substitute for a verified scanner completion signal.
3. Keep one inference active, a bounded queue and visible failures/backpressure.
   Separate arrival time, inference start/completion and selected historical review.
   Do not silently overwrite a scan being inspected when another arrives.
4. Preserve original image/model inputs; provide working zoom, pan, fit and overlay
   tools. Link list selections to boxes. Any future display-only adjustment must
   say what it changes and offer reset.
5. Record actual model/task identity and outputs. “No detections at this threshold”
   remains distinct from a clearance. Human review notes, if later added, must stay
   separate from model results; a queue completion is not an operational decision.
6. Pause/resume acts on RayGuard intake/dispatch only. Belt motion, radiation,
   emergency stop, diverters and scanner calibration remain with the scanner's
   own approved controls; no decorative controls should imply otherwise.

These are project recommendations derived from the published workflows, not
advisor-approved airport operating procedures. Current implementation and actual
tests belong in [verification](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/verification.md).

## Lab details still needed for genuine connection

- Exact **scanner model, workstation software/version and available export option**.
  The dataset's ANER K8065 provenance does not prove that this is the connected lab
  machine. No authoritative public K8065 SDK/export interface was verified here.
- One authorized native/exported example, supported pixel format/color mode,
  dimensions, orientation, single/dual-view association and available scan ID/time.
- Whether new scans can be automatically exported; destination access, completion
  signal/atomicity, naming/reuse behavior and expected arrival rate.
- Agreed observation test: one real lab scan creates a completed export, RayGuard
  receives it once, inference completes, and the displayed image/boxes/run evidence
  are checked against that exact source. This establishes one hardware path, not
  accuracy, certification or throughput acceptance.

Until these are known, continue local inbox tests and labeled replay with authorized
existing images. Do not claim a physical scanner link from a successful replay.

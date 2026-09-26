# Workspace design options

Updated 26 September 2026. The user selected **15 — Analyst Studio** for the
working app. Its adjustment dock / viewer / inspector / filmstrip composition
is now the implementation direction. After rejecting the initial appearance choices,
the user selected a **premium airport console**: dark, precise, restrained and
centered on the scan. The working app implements **Onyx / Barlow**, with earlier
comparisons behind Appearance. Human review of the new treatment remains open.

The gallery retains **six advanced workstations** and **ten compact alternatives**
as read-only design references. The descriptions below concern those previews;
actual inference, review saving and exports belong to the working app.

Start the app, then open **`/design-studio/`** on the same local service address.
The [gallery implementation](../frontend/public/design-studio/index.html) shares data and
controls across two small renderers: the original compact compositions and the richer
[advanced partitions](../frontend/public/design-studio/advanced.js). It does not fork the
working app into sixteen implementations. The category selector offers Advanced,
Compact and All; advanced previews use larger, two-column gallery thumbnails.

## Advanced workstations

| Option | Theme / typography | Main composition | Best suited to |
|---|---|---|---|
| 11 Operations Console | Graphite and ice blue / IBM Plex Sans | Section navigation, saved-run list, dominant viewer, tabbed inspector, recorded activity | A complete inspection workstation; recommended richer starting point |
| 12 Review Bench | Steel blue / IBM Plex Sans | Synchronized original and overlay of the same scan, inspector and session ledger below | Comparing pixels with saved detector evidence |
| 13 Session Overview | Porcelain and navy / Segoe UI | Actual loaded-record summary, searchable ledger, selected scan and evidence | Organizing a saved session |
| 14 Triage Desk | Pale slate and indigo / IBM Plex Sans | Filterable review list, image, review/provenance inspector, source context | Deliberate follow-up; review state is not a safety judgment |
| 15 Analyst Studio | Deep teal / IBM Plex Sans | Display-adjustment dock, viewer, adjustable inspector, saved-image filmstrip | Detailed image inspection and adjustable partitions |
| 16 Briefing Room | Ink and cobalt / IBM Plex Sans | Large viewer, legible evidence panel, distinct source/model partitions and filmstrip | Visitor briefings with traceable evidence |

Each advanced preview has working **Inspect**, **Session** and **Source** sections.
Session exposes a searchable ledger and selected image; Source explains the selected
record's input method, model/task, threshold, dimensions and recorded provenance.
Search, review-state filters and chronological/filename sorting operate on the loaded
records. Filtering never switches the selected scan; an explicit message identifies
when that scan is outside the filter. Summary counts describe only the loaded session
records, not the dataset or model accuracy. The saved list is not an active intake queue.

The inspector has keyboard-accessible **Findings**, **Review** and **Provenance** tabs.
Arrow keys, Home and End move between tabs; active focus survives rerendering. Review
notes and status are read-only. Real review actions remain in the working app.

**Layout options** hides/restores only applicable partitions, with a reset control.
The primary image stays visible. Analyst Studio additionally adjusts inspector width,
brightness and contrast, and toggles grayscale/inversion. These transformations affect
the displayed image only: source pixels, image coordinates and saved results stay intact.
The comparison views show the same scan, not different scanner angles. Source view does
not expose image controls that have no visible target. On mobile, controls wrap and the
image, evidence and saved records stack; tables retain their own horizontal scroll area.

## Compact alternatives

| Option | Theme / typography | Main composition | Best suited to |
|---|---|---|---|
| 01 Integrated Console | Graphite / IBM Plex Sans | Dominant image, integrated tools, narrow right review | Balanced compact inspection |
| 02 Daylight Desk | Cool white / Segoe UI | Slim source rail, wide viewer, right findings | Lit labs and longer reading sessions |
| 03 Image Wall | Carbon / IBM Plex Sans | Full-width image with bottom evidence dock | Maximum image emphasis |
| 04 Comparison Bench | Slate blue / IBM Plex Sans | Original and saved overlay of the **same scan** | Explaining detector output; never a second scanner view |
| 05 Queue First | Midnight / IBM Plex Sans | Left saved-run filmstrip, central image, narrow findings | Moving through a recorded dataset sequence |
| 06 Evidence Desk | Paper and navy / Segoe UI | Equal image and evidence panes | Technical review and detailed discussion |
| 07 Focus Station | Deep teal / IBM Plex Sans | Large viewer with collapsible right evidence panel | Close visual inspection |
| 08 Compact Workstation | Titanium / Segoe UI | Compact tool rows, image, bottom evidence/history strips | Smaller laptop displays |
| 09 Presentation Studio | Ink and cobalt / IBM Plex Sans | Large image above broad, legible evidence panel | Visitor demonstrations and presentations |
| 10 Review Workspace | Warm gray and indigo / IBM Plex Sans | Saved-run timeline beside centered inspection | Deliberate review and handoffs |

Open a preview to compare it at full size. **Focus preview** hides the surrounding
gallery explanation while retaining design navigation and an explicit preview
label. Use **Exit focus view** or **Escape** to return. Zoom, Fit, Overlays, Details
and saved-image selection work within the preview. They never start inference or
change a review record. Mobile layouts stack the same information in reading order.
Operations Console and Analyst Studio fit their main partitions into a desktop
focus viewport, keeping lower activity/filmstrip docks visible while longer lists,
evidence and adjustment controls scroll independently. Inspector-width adjustment
is available while the inspector sits beside the image; it is hidden when the
responsive layout stacks that panel below the viewer.

**Save option** stores favorites in this browser only. **Copy my choice** copies the
design number, name, layout and theme for the user to share in the project conversation.
Saving does not apply a theme or send a message. The final design remains undecided.

## Preview controls and evidence boundary

The gallery makes a read-only same-origin `GET /api/runs` request. If local saved
runs exist, it displays their actual scans, predictions, threshold, duration and
review state. Every finding in the selected result remains in the scrollable list;
the history selector includes every loaded run. For a long session, at most 50 runs
are loaded and the source note explicitly reports the displayed and available counts.
No dataset asset is copied into the frontend or repository. Empty
history or an unavailable service produces clearly labeled empty previews; no
sample detections, accuracy, operator identity, scanner connection or metrics are
invented. The renderer accepts only local scan-image routes and escapes dynamic
text. No external scripts, fonts or image services are used. IBM Plex is hosted
locally; Segoe UI falls back to the available system sans-serif.

The gallery is session evidence, not a live acquisition or evaluation interface.
Reload it to refresh saved runs. A saved result with no detections remains explicitly
different from a safe or benign verdict. Private visual verification artifacts belong
under ignored `output/` and `runs/`; shared verification is recorded in the main docs.

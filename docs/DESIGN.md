---
name: RayGuard — Liquid Glass dashboard
description: A continuous inspection dashboard inspired by the user-supplied KU Planner reference.
---

# RayGuard design system

## Approved reference and scope

On 26 September 2026 the user requested the whole app as a dashboard, using the
KU Planner Liquid Glass landing and planner design documents, actual dashboard
and workspace navigation as the reference. This supersedes the separate entry
screen and narrow navigation-rail composition. It is a user design direction,
not a new advisor requirement or scientific result.

The reference contributes its persistent sidebar, current-work overview, grouped
service rows, black canvas, serif page headings and quiet glass controls. Its
landing videos and character interaction remain reference context; RayGuard's
existing opening media remains separate from the operational dashboard. No
planner accounts, courses or personal data enter this app.

## Use scene and hierarchy

Operate mode: students inspect local X-ray output on a laptop in the lab and at
the visitor showcase. Dark chrome frames original scans; the matching light
option supports brighter rooms. Both retain readable opaque data surfaces.

The whole app shares one sidebar and page header. A compact row of four labelled
icon actions opens upload, dataset replay, folder receipt or saved-run review.
Current inspection sits beside acquisition activity. Recent session records and
source configuration share the next row. Secondary source explanations and
workspace guidance use native, keyboard-accessible disclosures.
Keep the selected scan preview visible at every width. A held scan and another
active run remain distinct; catalog availability and finite batch progress have
separate labels and sections. Setup is a dedicated page within this
shell. Inspection, Session and Source each show one task, with their own controls.
Navigation never starts acquisition, changes following or discards inspection.

Desktop uses a labelled sidebar around 220px wide, with an explicit compact
option for more scan space. At narrow widths an inline Menu disclosure exposes
the same real links. Hash URLs support direct entry, Back/Forward and refresh
without a new routing dependency. Existing #main-menu and #workspace links work.
Hidden inspection regions stay mounted to preserve transforms and review drafts.

## Visual language

Dark palette: near-black #080b10 canvas, #10151b panels, white principal text,
cool muted #aeb8c4 copy. Controls use a restrained white/silver treatment in Onyx.
Onyx Light uses cool gray surroundings, white panels and dark controls. Earlier
palette comparisons remain available; font and palette storage are preserved.

The latest user request previews locally served **Instrument Serif throughout**:
headlines, navigation, body text, controls, tables, scores, coordinates and hashes.
It is the fresh-browser default and is selectable under Appearance. Existing saved
choices remain available; Barlow and the earlier fonts allow comparison/reversal.
Font specimens deliberately retain their named typeface. Instrument Serif supplies
regular and italic. The user's light-mode readability request now applies 600 weight
throughout navigation and content, allowing browser weight synthesis for this
regular-only face. Fonts with available heavier faces use those files. Dark mode
and the permanently dark intro keep their original weights. This adds no font
files; hierarchy still relies on size, spacing and tone. Page headlines typically
use 36–44px. Dense UI text retains its role
scale; regular operational controls and all five routes need visual verification.
The all-serif choice also overrides native code styling. Other font choices retain
their usual monospace record fields.

Glass is confined to action controls: translucent fill, 4px backdrop blur, faint
inset highlight and a masked gradient edge. Solid data panels ensure stable
contrast. Pill actions, modestly rounded overview panels, flat service rows and
generous separation establish hierarchy. The original scan and overlays remain
unfiltered by the theme. Amber detections and explicit status text retain their
meaning; no color denotes a safe bag.

## Behavior and accessibility

- While inference is active, put the processing image left and the latest completed
  viewer with its inspector right. The eye/status strip sits above the active image,
  never over its pixels. Keep the existing completed viewer and inspector mounted;
  explicit held reviews retain their draft and a **Held review** label. A first run
  has an honest empty completed pane. On completion/failure, restore the single
  viewer and existing panel preferences. At phone widths stack active then completed
  panes. Disconnection keeps last-known context with static eye and unknown status.
- The scan viewer supports pointer-centred wheel zoom (1–5×), bounded dragging
  when zoomed and a labelled Magnifier icon toggle for a 3× hover lens. Image and
  visible overlays use the same source coordinates. Keep keyboard zoom/pan/Fit,
  Escape dismissal and ordinary scrolling outside the viewer; touch scrolling
  remains available at Fit. A local enlargement changes viewing only.
- For verified IEDXray test replay, show published reference boxes as dashed cyan
  with GT labels, separate from solid amber predictions. Findings prioritizes the
  per-image comparison and annotated/matched/missed/extra counts. Keep independent
  layer toggles, saved-threshold/IoU labels and expandable provenance. Execution
  completion must not imply a matched detection; empty references imply no safety
  verdict. See [matching and limitations](annotation-comparison.md).

- Descriptive Lucide icons accompany short visible labels. Upload uses an image
  with an arrow, replay a stack of images, folder receipt an incoming folder,
  session history a clock, detector a processor and source setup a cable. Icons
  supplement text; no new icon-only workflow controls. Decorative SVGs are hidden
  from assistive technology. Dashboard action targets are at least 44px high.
- Remove repeated introductory copy and navigation-persistence footnotes from
  the initial view. Keep research/no-safety-decision, scanner-unverified, offline
  and error states visible. Empty predictions use a neutral scan symbol, never
  a checked document or clearance badge. Human usability acceptance is pending.
- Dashboard summaries use actual loaded runs and service state, including empty,
  offline, unconfigured and active cases. Configuration is not execution proof.
- Setup changes only future-run parameters and visible panels. A paused replay
  resumes its captured threshold. Acquisition still requires explicit Start.
- Errors and active acquisition remain discoverable from every page, with a
  return to the relevant controls. Pausing intake does not cancel inference.
- Page navigation moves keyboard focus after rendering. Real anchors retain
  browser link behavior; mobile Menu supports Escape and focus return.
- Inspection zoom, selected scan and review drafts survive page/theme changes.
  No inferred benign outcome from empty detections, fabricated counts or metrics.
- Honor reduced motion. No new decorative background video or idle animation.
  Theme changes persist; dashboard navigation does not persist unsaved notes.

Verify all routes, state retention, keyboard/mobile navigation, both principal
palettes and saved real-scan presentation. Synthetic browser checks remain
software evidence, separate from detector accuracy and human showcase acceptance.

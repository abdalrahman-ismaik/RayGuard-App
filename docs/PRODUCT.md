# RayGuard application

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The SDP team demonstrates and inspects X-ray detector output on a local laptop
with advisors and visitors. Meeting 02 requires an early working demonstration;
the user requests a modern, well-organized GUI with a clear YOLO integration path.

## Product Purpose

Select an authorized X-ray image, execute the configured detector, and inspect
its localized predictions and the evidence of that run. T28 is the task authority;
this file describes the application, not an additional backlog.

The user's 25 September extension adds an operator workflow for automatically
receiving completed image exports, queuing inference and recording human review.
The scanner/interface is explicitly **not confirmed**. A folder receiver and
replayed dataset images do not establish a physical scanner connection.

The same day's dataset-demo request adds direct read-only replay of the local
IEDXray test images through fresh detector execution. Batches are finite and start
only on request. A later design request asks for ten distinct professional baggage
workstation concepts to choose from; preview interactions must remain separate
from the working app and never initiate inference.

On 26 September the user requested richer dashboards with stronger organization,
more options and distinct partitions. Extend the design gallery with six advanced
workstations, retaining the ten compact alternatives. Separate navigation, saved
scan selection, image tools, evidence and provenance into purposeful regions;
additional controls must work locally and preserve the selected scan's identity.
This is a user design request, not a new advisor requirement or approval of one
final layout. Saved session summaries are not live scanner telemetry.

## Operating Context

On 26 September the user selected **15 — Analyst Studio** for the working app:
adjustment dock, central viewer, evidence inspector and saved-scan filmstrip.
The subsequent request explicitly reopens typography and colors: provide several
independently selectable local fonts and light/dark palettes on the real workspace.
The layout is selected; the final font/palette is not. Appearance preferences must
not start inference, change its inputs or discard an unsaved review.

The SLG showcase is ASAP with date unconfirmed. The poster concerns Embedded
Explosive Detection in Electronic Devices. The specific lab laptop/pager pairing
is unresolved. The existing IEDXray generic YOLOv10-M runner has genuine CPU
diagnostic evidence and is the initial integration target.

## Capabilities and Constraints

- Local browser UI and loopback Python service; this stack is a project decision.
- Use the separate pinned model environment and existing shared scan-result contract.
- Model scores are not calibrated threat probabilities. An empty result is never
  a benign or safe verdict. Record failures and actual inference provenance.
- Preserve original scan coordinates after any explicit orientation normalization.
- Separate source receipt, inference progress and human review; new arrivals must
  not interrupt a scan the operator has chosen to inspect.
- Keep intake paused until explicitly started. Pausing the receiver never controls
  hardware; files may accumulate for processing on resume.
- Display adjustments affect only viewing; original canonical pixels reach the model.
- Review notes and follow-up flags are operator observations, never clearances.
- Keep scans, checkpoints, local configuration and generated runs out of Git.
- Full P1 device association/decisions, P2 fusion, scanner control, colorization,
  model training, authenticated network service and desktop installer are outside
  this draft. Do not imply they are implemented through inactive controls.

## Latest visual feedback — 26 September

The user rejected every initial palette/font option, then explicitly chose
**Premium airport console — dark, precise, restrained, with a dominant scan viewer**.
Keep Analyst Studio's adjustment/viewer/inspector/filmstrip composition. The next
refinement must change hierarchy, proportions, typography and surface boundaries,
rather than treating new color combinations as sufficient. This is user direction,
not an advisor requirement or human acceptance of the subsequent implementation.

The user subsequently liked **Onyx and Barlow** and requested a light version.
Provide **Onyx Light** as the matching palette without changing the selected
layout or typography. This is visual preference feedback, not showcase sign-off.

The next requested organizational change is a **main menu as the entry point**.
Users choose upload, dataset replay, folder receipt or saved-run review, then
configure relevant workspace settings before entering Analyst Studio. These are
existing capabilities, not new scanner or model integrations. Applying a setup
does not start a run or receiver. Keep the current workspace and unsaved review
mounted when returning to the menu; active work remains visible as an explicit
status with a return path. Retain both accepted Onyx variants and Barlow.

The latest request makes the **whole app a continuous dashboard**, using the
supplied KU Planner Liquid Glass theme and dashboard/navigation implementation
as a direct reference. A shared sidebar and header surround Dashboard, workspace
setup, Inspection, Session and Source. Preserve the existing inspection tools,
dark/light choice, no-automatic-start behavior and mounted drafts. This supersedes
the isolated main-menu composition; it does not add planner/account functionality.

The user next requested trying **Instrument Serif on all interface text**. Apply
it across all operational pages, including controls and record fields, and make
it a reversible Appearance choice. This is a typography preview, not final human
acceptance. Preserve palette choice and keep earlier fonts available.

The next refinement requests more descriptive icons and less text for easier
dashboard use. Keep short labels alongside unfamiliar workflow icons, bring
the four existing scan/review entry points near the top and consolidate repeated
guidance into expandable details. Preserve visible execution limits, errors and
source status. This is user direction, not measured usability improvement or
human acceptance of the resulting draft.

The user subsequently reported light-mode text was unclear and requested bold
text. Apply a stronger weight across light-mode interface text while preserving
the chosen typeface and existing dark-mode typography.

The latest user request asks to show the actual IEDXray test reference and whether
the detector succeeded. Implement separate published annotation and prediction
layers with per-image matched/missed/extra results. A completed subprocess and a
correct detection are distinct. Reference agreement is not full-test accuracy;
unverified or empty references cannot imply clearance. The project diagnostic
rule and evidence boundaries are in [annotation comparison](annotation-comparison.md).

The user also requests mouse-wheel zoom, dragging to pan a zoomed image and a
magnifier option for inspecting the region under the pointer. These are display
tools: preserve original image pixels, saved detections and published reference
coordinates. Keep the existing dashboard theme and keyboard alternatives.

The subsequent user request adds a temporary split during inference: active image
left with the eye above it, latest completed image and its evidence right, returning
to the usual single viewer when inference ends. Preserve a deliberately held review
and its unsaved note, clearly labelled as held. No prior completion means an empty
result pane, not a substitute prediction. Stack the panes on narrow screens and
pause the activity eye when the service connection is lost.

## Brand Commitments

Use the existing RayGuard name and clear research language. No approved logo,
institutional brand kit or prescribed visual theme was supplied.

## Evidence on Hand

See [first inference](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/first-inference.md),
[contracts](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/contracts.md)
and the [meeting companions](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/meeting_minutes/README.md).
Authorized real scans and weights are local-only. Diagnostic examples
are not an accuracy evaluation or proof of the completed prototype.

## Product Principles

Keep the image central; make every visible control work; distinguish execution
from scientific validation; preserve useful evidence without inventing decisions.

## Accessibility & Inclusion

Project recommendation: keyboard-operable controls, explicit focus, text labels
alongside color, reduced motion and responsive laptop/mobile layouts. There is
no claim of formal accessibility certification.

# RayGuard visual direction research

Reviewed 25 September 2026 for the user's request to improve themes, typography and
navigation. This is a **project recommendation**, not an advisor requirement or a
usability study. [T28](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md) remains the task authority; the required
simple laptop demonstration and its unresolved model/rehearsal dependencies remain.
See [scanner workflow research](scanner-research.md) for the airport-product evidence
and [DESIGN.md](DESIGN.md) for the implemented visual specification.

## Recommended direction

Refine the existing image-inspection workspace with **IBM Plex Sans**, cool neutral
light surfaces and a graphite dark theme. Retain RayGuard's blue actions, amber
model overlays, dominant scan canvas and clear research status. Use Carbon's
productive hierarchy and Fluent's restrained surfaces as references. These choices
fit the current task and laptop context; no source establishes an objectively best
font or theme for X-ray inspection.

The aim is a clear **choose, run and review** sequence, with source/model details
and history available when needed. Controls follow that reading order and expose
their keyboard focus state. Visual polish must not introduce invented
scanner connections, safety decisions, analytics or inactive dashboard destinations.

## Design systems compared

| Reference | Documented guidance | RayGuard recommendation |
|---|---|---|
| **IBM Carbon** | Productive typography supports repeated, control-heavy tasks; its base is 14px with fixed headings. Color layers and theme tokens separate backgrounds, fields and overlays. [Type strategy](https://carbondesignsystem.com/elements/typography/style-strategies/), [type sets](https://carbondesignsystem.com/elements/typography/type-sets/), [color usage](https://carbondesignsystem.com/elements/color/usage/) | Strongest fit for the inspection workspace. Apply a small type scale, consistent neutral layers and compact controls. Keep scan space dominant. Adopt principles in existing CSS, without replacing the working React components. |
| **Microsoft Fluent 2** | Uses Segoe/native fonts, a semantic type ramp and sentence case. Neutral surfaces build hierarchy; brand colors should be used sparingly. [Typography](https://fluent2.microsoft.design/typography), [color](https://fluent2.microsoft.design/color) | Useful for familiar Windows controls and calm light mode. Preserve native keyboard expectations and system-font fallbacks. Reserve blue for interactive emphasis rather than painting whole panels. |
| **Atlassian Design System** | Colors carry explicit roles and states. Elevation distinguishes default, raised and overlay surfaces; excessive raised surfaces add visual noise. [Color](https://atlassian.design/foundations/color/), [elevation](https://atlassian.design/foundations/elevation/) | Useful for history rows, selection, errors and the adjustment popover. Prefer whitespace/borders between ordinary regions; use shadows when controls actually float. A project-management dashboard shell would add little to the current workflow. |

These are primary documentation comparisons. Vendor guidance informs the design;
it does not validate this app's accessibility, operator performance or model quality.
No vendor UI artwork or trademark is needed in the application.

## Font shortlist

| Family | Evidence and practical fit | Decision |
|---|---|---|
| **IBM Plex Sans** | IBM documents Sans/Mono families, multiple weights and language variants. Its official web package provides WOFF2 subsets for local serving. [Typeface](https://www.ibm.com/design/language/typography/typeface/), [web distribution](https://github.com/IBM/plex/blob/763c36ef9117782905ae010056dfbe8fd2653a25/packages/plex-sans/README.md), [OFL 1.1 license](https://github.com/IBM/plex/blob/763c36ef9117782905ae010056dfbe8fd2653a25/LICENSE.txt) | Recommended: a distinct technical character with one consistent UI family. Regular, Medium and SemiBold cover the current hierarchy. Readability on our actual panels still needs browser inspection. |
| **Inter** | The author's documentation describes a tall x-height in text optical sizes, tabular figures and optional glyph disambiguation. [Official family/features](https://rsms.me/inter/), [OFL 1.1 license](https://github.com/rsms/inter/blob/master/LICENSE.txt) | Strong alternative when a more neutral appearance is preferred. Its feature set is useful for scores/tables, but does not demonstrate superior usability in this app. |
| **Source Sans 3** | Adobe describes it as designed for UI environments and distributes static/variable fonts plus WOFF2 assets. [Official project](https://github.com/adobe-fonts/source-sans), [OFL 1.1 license](https://github.com/adobe-fonts/source-sans/blob/release/LICENSE.md) | Credible alternative for a softer reading texture. No additional family is needed alongside Plex for the current workspace. |

All three official licenses permit bundling under their stated conditions, including
retaining the copyright and license. Keep selected original font files and their
license together; do not relabel a modified font under a reserved name. Font choice
does not imply endorsement by its publisher.

### Local distribution

Recommended IBM source revision: `763c36ef9117782905ae010056dfbe8fd2653a25`, inspected
through the official GitHub repository. The implementation uses three complete
upstream files (196,820 bytes total):

```text
packages/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2
packages/plex-sans/fonts/complete/woff2/IBMPlexSans-Medium.woff2
packages/plex-sans/fonts/complete/woff2/IBMPlexSans-SemiBold.woff2
```

They are served with the app; the [asset record](../frontend/public/fonts/README.md)
retains source, hashes and license. Segoe UI/system fallbacks remain. No runtime
font CDN or additional UI package is required. Complete fonts avoid managing
several subsets for ordinary symbols, at a small fixed transfer cost.
The [upstream subset map](https://github.com/IBM/plex/blob/763c36ef9117782905ae010056dfbe8fd2653a25/scripts/data/unicodes/index.js)
includes common Latin text, multiplication, dashes and ellipsis in Latin1; it does
not make that subset support Arabic or all symbols. Dynamic filenames and notes
must retain fallback glyphs. Future Arabic localization needs deliberate font,
layout and right-to-left review rather than a claim based on the family name.

## Implementation criteria

### Baggage workstation design study

The user's later request calls for ten distinct themes/layouts to choose from.
The prior hierarchy remains functional; the final visual choice is pending.
The design studio explores integrated, image-first, queue-first, comparison,
evidence-review and presentation arrangements with clearly separate preview actions.
Three initial generated composition studies used a labeled blank scan placeholder;
they are design references and are not bundled into the model demo or dataset.

Primary sources checked again on 25 September:
[Rapiscan Network Display Station](https://www.rapiscansystems.com/en/products/rapiscan-network-display-station)
describes image transfer with marked suspicious objects for secondary inspection;
[Smiths iCMORE](https://www.smithsdetection.com/icmore/) describes targeted object
detection integrated with its scanner products. These inform attention, annotation
and review grouping. They do not establish RayGuard's hardware compatibility,
certification or performance. Comparison previews show the same 2D scan in original
and overlay modes, not acquired dual-view or CT data.

### Shared checks

**26 September extension:** the user requested richer, more partitioned dashboard
options. Six additional workstation proposals separate navigation, saved scans,
the image, evidence tabs and contextual docks. This applies to the design gallery;
the working application's simplified workflow remains pending the user's selection.
The [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), checked on
26 September, specifies active-tab focus, arrow navigation and explicit tab/panel
relationships. Apply that behavior when a preview uses tabs; ordinary filter and
visibility controls use native buttons and their actual pressed state. These are
interaction implementation references, not evidence of human usability results.
Carbon's [data-table guidance](https://carbondesignsystem.com/components/data-table/usage/),
checked the same day, groups search/filter/display actions in a toolbar and favors
enough table width to read the records. The session view uses that organization
with locally computed saved-run counts; it does not introduce operational
throughput, accuracy charts or live scanner analytics.

- **Type:** approximately 14px body/control text, 12–13px secondary details, 16px
  task/region headings and 24px page title. Use weights 400/500/600. Reserve a local
  monospace fallback for IDs/coordinates; tabular digits help align changing numbers.
- **Theme:** cool gray page, clean light panels and a dark image well; matching
  graphite panels in dark mode. Keep blue interactive and amber tied to detections.
  Empty results and reviewed status never receive a visual clearance meaning.
- **Density:** reduce repeated explanatory text and unnecessary borders. Put model
  setup, provenance and history behind labeled disclosures. Errors, pending work,
  unseen arrivals during held review and recovery controls remain visible.
- **Navigation:** follow Choose scan → Run detection → Review result. Keep the
  primary action and canvas prominent, with review beside or below the image.
  Disclosures work by keyboard and on narrow screens; scan selection and intake
  behavior remain intact.
- **Verification:** inspect empty, positive, missed-threat, processing and error
  states in both themes; check laptop and narrow layouts, focus, contrast, text zoom
  and font loading without external requests. Re-run relevant browser regressions.

**25 September follow-up:** the user reported difficulty knowing where to look first.
This supersedes the initial header-anchor/left-settings arrangement. The implemented
hierarchy removes the settings rail and empty findings panel; settings, history and
technical details start closed. This is a project design response, not a new advisor
requirement or measured improvement in operator performance.

This document records design research and acceptance criteria. Actual implementation
and test outcomes belong in [verification](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/verification.md) and
[progress](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/progress.md). A human operator rehearsal remains necessary; browser
checks cannot establish screening performance or physical scanner integration.

## Analyst Studio appearance choices — 26 September

The user selected layout 15 but explicitly reopened fonts and colors. The current
implementation therefore separates the chosen composition from eight palettes
(Graphite, Midnight, Slate, Forest, Daylight, Pearl, Sand, Lavender) and seven
font choices (Geist, Inter, Manrope, Public Sans, Source Sans 3, IBM Plex Sans,
System). These are comparative interface preferences, not measured readability
findings. Current design rules are in [DESIGN.md](DESIGN.md).

The [font provenance catalog](../frontend/public/fonts/choices/README.md) records
primary repositories, exact revisions, source/output hashes and bundled licenses.
Five new upright variable fonts total 688,100 bytes. Public Sans was repackaged
losslessly from upstream TTF to WOFF2; other new font binaries are unchanged.
Fonts remain local at runtime. Primary repositories were inspected directly over
HTTPS when the web-search connector was unavailable. Final palette/font selection
and human presentation-laptop acceptance remained open at that point.

## Selected premium airport console — 26 September follow-up

The user rejected the initial appearance set and selected a dark, precise,
restrained airport console with a dominant scan viewer. This is a user design
direction, not an advisor requirement or published finding. The previous laptop
render gave the scan stage only about 220px vertically; prominent panel borders
competed with the image. The response changes proportions, surfaces and type
hierarchy alongside the palette: Onyx neutrals, a restrained blue action accent,
Barlow controls and Barlow Semi Condensed headings, compact source actions and
a shallow filmstrip. Earlier comparisons remain optional behind Appearance.

**Artifact inspected:** the [author's Barlow repository](https://github.com/jpt/barlow/tree/dc2940e2e04ef4ec96c07e23e0f02aefbddd343b)
provides the four upright WOFF2 assets and
[OFL license](https://github.com/jpt/barlow/blob/dc2940e2e04ef4ec96c07e23e0f02aefbddd343b/OFL.txt).
Their names, weights, byte lengths and hashes are recorded in the
[local provenance catalog](../frontend/public/fonts/console/README.md).
The unchanged bundle is 242,520 bytes and needs no new runtime dependency.
These primary source checks establish asset provenance; they do not prove that
this font is best for screening. Actual presentation checks are recorded in
[verification](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/verification.md); human review of the new treatment remains open.

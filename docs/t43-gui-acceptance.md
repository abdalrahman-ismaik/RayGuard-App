# T43 — GUI acceptance and accessibility

Prepared 15 November 2026. Scope requested by Mohammad: GUI flow, accessibility
and acceptance only. This is an acceptance record under the
[team backlog](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/tasks.md),
not a second backlog or a claim of student rehearsal, hours or authorship.

## Scope and inspected baseline

Inspected app revision: `3488abdd60e9b68ac62cc4d35ce85245c0f9bdf9`.
Pinned engine: `b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4`.
The fresh separate app checkout was clean before this work. No existing local app
changes were replaced. The old research-repository app is not an active source.

[Product](PRODUCT.md), [design](DESIGN.md) and [architecture](architecture.md)
retain the continuous dashboard, original scan coordinates, explicit execution
controls, separate result/reference layers and session-only history.
The meeting's early GUI demonstration remains distinct from full P1/P2.

The isolated implementation slice is
[`t43-acceptance.spec.ts`](../frontend/tests/e2e/t43-acceptance.spec.ts) and this
record, with required app/team progress and status bookkeeping. Existing production
components, model adapters, dependency pins and other students' work are unchanged.
Integration review with Abd remains pending; no agreement by another person is inferred.

## Findings ranked by user impact

| Priority | Finding | Evidence and disposition |
|---|---|---|
| High, acceptance gate | Model pairing and a real scanner handoff are still unverified in the current handoff. Automated UI checks cannot establish either. | Documented in [status](status.md); retain a human/model-review gate. Folder receipt and replay must not be presented as physical scanner control. |
| Medium, coverage gap | Saved-session search/filter/sort behavior lacked dedicated regression coverage, including a selected scan excluded by a filter and an unsaved note. | Source and tests inspected; added focused executable checks. No production defect was reproduced by these checks. |
| Medium, coverage gap | Existing accessibility checks cover many app states, but do not directly audit both the session table and open Review panel in both Onyx themes at phone/laptop widths. | Added four cases, each checking both views, page overflow and WCAG-tagged automated rules including contrast. No rules disabled. |
| Medium, acceptance gap | Human keyboard/screen-reader comfort, real-scan readability and presentation rehearsal are not established by browser automation. | Manual checklist below remains pending. Automated results are not accessibility certification. |
| Unresolved requirement | Historical 8/15 October prototype targets conflict with adaptation after Batch 1; the supplied records do not supply replacement dates. | Preserved in the team backlog; no new T43 deadline or completed milestone is inferred. |

## New automated acceptance checks

All new test records, model labels, provenance and images explicitly say synthetic.
The displayed image says **SYNTHETIC UI TEST — No model inference or scan data**.
Every API write is rejected and recorded; tests assert no mutations, unexpected
API routes or browser runtime errors. No backend, weights or research scans are needed.

1. Search ignores surrounding whitespace/case and can identify a full run ID.
   Filters distinguish unreviewed, reviewed, follow-up and failed runs. Empty search
   results give recovery guidance. Failed records do not display zero findings.
2. Oldest/newest/name sorting preserves exact run IDs and saved thresholds.
3. Keyboard entry into a saved run and evidence-tab navigation preserve the chosen
   image and unsaved review through history filtering, Source/Dashboard navigation
   and a theme change. A filter excluding that run says so explicitly.
4. With the current model unavailable, saved empty and failed records retain distinct
   messages. An empty result says it is not a safe/benign verdict; failure has no
   detection overlay. Saved model provenance remains distinct from the current model.
5. At 320×844 and 1366×768, both Onyx and Onyx Light keep the Session and Review
   views within the page width and pass the selected automated accessibility rules.
   The session table may scroll within its labelled, keyboard-focusable region.

## Existing coverage retained for the wider T43 review

Paths below are under `frontend/tests/e2e/`. A mapped test is software coverage,
not proof of real inference or human acceptance.

| Requirement | Existing suites and expected behavior |
|---|---|
| Upload and explicit inference | [workspace](../frontend/tests/e2e/workspace.spec.ts), [main-menu](../frontend/tests/e2e/main-menu.spec.ts): selection/setup alone never starts inference; invalid files and disconnected starts show recovery. |
| Finite replay | [demo](../frontend/tests/e2e/demo.spec.ts): explicit Start, pause/resume with captured threshold, failed cursor and visible retry. Published test inputs remain read-only. |
| Folder receipt | [intake](../frontend/tests/e2e/intake.spec.ts): queue, pause, unavailable source, backpressure and held review; hardware remains unverified. |
| Saved evidence and task identity | [runtime-model](../frontend/tests/e2e/runtime-model.spec.ts), [runtime](../frontend/tests/e2e/runtime.spec.ts): historical model/task/execution evidence belongs to the saved run; missing evidence stays explicit. |
| Reference versus result | [comparison](../frontend/tests/e2e/comparison.spec.ts): independent overlays, verified response/run pairing, missed/extra/matched counts and unavailable comparison. Per-image agreement is not test-set accuracy. |
| Active and held review | [processing-split](../frontend/tests/e2e/processing-split.spec.ts): separate image identities, first-run empty pane, held draft through completion/failure, disconnect and responsive layout. |
| Keyboard and viewing | [viewer-controls](../frontend/tests/e2e/viewer-controls.spec.ts), [dashboard](../frontend/tests/e2e/dashboard.spec.ts), [appearance](../frontend/tests/e2e/appearance.spec.ts): keyboard zoom/pan/reset, Menu/Escape focus, routes, themes, reduced motion and retained drafts. |

## Run the checks

From the app root, install exactly the locked dependencies and build:

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
```

From `frontend/`, use installed Chrome or install the matching Playwright Chromium:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e -- t43-acceptance.spec.ts
npm.cmd run test:e2e
```

For Playwright Chromium instead, run `npx.cmd playwright install chromium` and remove
`PLAYWRIGHT_CHANNEL` from that shell. Generated test evidence stays ignored.
Actual outcomes and setup limitations are in [progress](progress.md).

## Pending personal acceptance

Record actual results, app revision, browser/OS and reviewer only after performing
these checks. Keep real scan IDs, outputs and local paths in authorized private evidence.

- [ ] Mohammad inspects the diff and can explain the fixture, read-only API guard,
  saved/current model distinction and why passing tests do not establish model quality.
- [ ] Abd reviews this separate test/documentation slice and agrees integration.
  Link the reviewed app commit/PR in the team progress record after publication.
- [ ] Use keyboard only on the presentation laptop: enter all four workflows, verify
  explicit starts, reach every relevant control, check visible focus, mobile Menu/Escape,
  browser Back/Forward and review-save error/retry.
- [ ] Check real scan/result/reference readability, focus visibility, text zoom and
  narrow-screen scrolling in both Onyx themes; check status/error announcements with
  a screen reader. Do not treat automated contrast results as a full human assessment.
- [ ] With authorized model evidence, jointly review exact model/task/run identity and
  reference provenance with Abd and the model/evaluation owners. Keep the known miss,
  empty result, unavailable model and failed-run cases visible.
- [ ] Rehearse active inference while holding another review, unsaved notes through
  route/theme changes, paused folder/replay behavior and session-only restart limits.
- [ ] Confirm intended lab pairing and observe a real scanner export handoff before
  making any hardware claim. Record actual outcome or leave the gate pending.

No human acceptance, new model execution, accuracy result, scanner integration or
full T43 completion is claimed by this document.

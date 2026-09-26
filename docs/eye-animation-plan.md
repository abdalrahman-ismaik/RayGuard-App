# RayGuard eye introduction and loading plan

> Historical SDP record from 25–26 September 2026. Commands and service ports
> below describe that original checkout and its private evidence, not an
> automatically available preview or a new verification of this repository.
> Use the [current app setup](../README.md) for the extracted layout.

26 September 2026 · T28 · Implemented locally; human showcase acceptance remains open.

## Implemented treatment

The user requested the eye as the opening page background, then refined the layout
to place the video **in the upper part of the page** and the RayGuard title **just
below the page midpoint**. This replaces the earlier centered-eye/bottom-title layout.
The six-second local video now sits around 30% down the viewport (26% on short screens),
with the RayGuard heading around 56–58% down and its project subtitle directly below,
Skip/Escape available immediately and a 0.25-second fade when playback ends, without
a final-frame hold. Normal playback presents for about 6.25 seconds plus startup time.
The watchdog bounds the introduction at about seven seconds from mount under normal
foreground scheduling, including failed/stalled playback. It runs
on every fresh load. Reduced motion enters the workspace without requesting video.

Following the user's latest refinement, video and fallback poster stay at the previous
final scale of 44% throughout the introduction. CSS applies this size from first paint;
the added scale animation and animation-frame loop have been removed. The video remains
horizontally centered in the upper part, with fixed text and controls and the existing portrait framing. Natural motion
within the footage remains. The intro uses the original 1080p resolution, mild denoising and sharpening,
and a higher-quality encode with a matching full-HD poster. The source is unchanged.

The small eye loop follows actual connection/upload/inference activity. Hidden scan panels
and disconnected runs stop animating; a disconnected running record explicitly reports
unknown status. Replay and Pause animations are in **Source → Presentation & motion**.
Replay preserves the current scan/review and is disabled during active work; it does not
change the workspace or appearance selection.

The [runtime media record](../frontend/public/media/rayguard/README.md) contains actual encoding
commands, sizes and hashes. Twelve targeted browser checks passed, with real media playback
and synthetic API responses. Desktop/mobile/zoom-equivalent opening screenshots and Axe
checks were inspected separately; see [verification](https://github.com/abdalrahman-ismaik/SDP-I-RayGuard/blob/main/docs/verification.md#rayguard-eye-introduction--26-september-2026).
The remainder records the original plan and its evidence boundaries; completed execution
is established by those newer verification records, not by the original recommendations.

**Confirmed user preference:** show a brief eye animation every time the website opens.
Apply this to each fresh page load/refresh, not to uploads, theme changes, reconnects,
React renders or browser history restoration. Do not suppress it with a first-visit flag.
The original timing and implementation recommendations below are retained with the user's
later composition amendment applied.

## Direction

Use the supplied blue fiber-optic eye as RayGuard's opening signature: strands assemble
into an iris, the project identity stays readable, then the inspection workspace appears.
The audience is the team, advisors and showcase visitors opening the existing local GUI.
The introduction presents the project; the workspace supports scan selection and review.

Keep the original black field, blue fibers and white highlights. Pair them with the
app's locally hosted interface typography. Use **RayGuard** as one word, with its current
capitalization. Put text below the centered eye, with a darkened lower field for legibility.
The screen reads:

> **RayGuard**
>
> Embedded Explosive Detection in Electronic Devices
> Research preview

The eye is brand imagery, not a scan, detector visualization, progress meter or evidence
of a threat. Retain the current research scope and review language. This addition can
join any of the pending workstation designs without selecting a new workspace design.

## What was inspected

| Asset/evidence | Finding and use |
|---|---|
| `assets/scroll-eye/assets/scroll-video.mp4` | 5,255,093 bytes. Manifest documents 1280×720 H.264, 24 fps, 8.0417 s, silent and all-intra. Suitable for the supplied scroll interaction; larger than necessary for repeated linear playback. |
| `assets/scroll-eye/assets/poster.jpg` | 53,672 bytes; completed eye at source time 5.5 s. Visually inspected; use for reduced motion and media fallback. |
| `assets/scroll-eye/original/contact-sheet.jpg` | Visually inspected: close-up fibers become a complete blue iris, followed by a resolved-eye hold. |
| `assets/scroll-eye/original/source.mp4` | Preserved 1080p source, documented in the manifest. Keep as the source for derivatives. |
| `component/scroll-eye.js`, `.css`, `.d.ts`, `ScrollEye.tsx` | Inspected native scroll seeking, caption threshold, pause, poster/error fallback and React cleanup. The default section uses 300svh desktop / 270svh mobile. It is not a timed startup loader. |
| `index.html`, `prompts/`, original implementation notes | The demo contains KU Planner/course copy and Instrument Serif styling. Prompts are reconstructions/reuse instructions, not a recovered generation prompt. |
| Manifest integrity | Executed SHA-256 and byte-length checks: all 20 listed files match. This checks this package against its own manifest, not publisher identity or media licensing. |
| `VALIDATION.md` | Documents 19 earlier package checks across Chromium, Firefox and WebKit in the source project. Those checks were not rerun here and do not verify RayGuard integration. |

Media metadata above is **documented**; source/code and the two visual references are
**artifact inspected**; manifest comparison is **executed and verified**. No new playback,
encoding, inference or browser integration result was claimed at the planning stage. The package records no separate
media-license document; retain that provenance limit when preparing any public distribution.

## Opening sequence (updated): approximately 6.25 seconds

| Time from playback start | Visual and behavior |
|---|---|
| 0–2.0 s | Source 0–4 s plays at 2×. RayGuard and subtitle remain readable; **Skip intro** is available immediately. |
| 2.0–3.5 s | Source 4–5.5 s plays at original speed as the iris assembles. Keep text stable. |
| 3.5–6.0 s | Source 5.5–8 s continues at original speed, retaining the resolved-eye motion. |
| 6.0–6.25 s | Immediately dissolve to the app in the user's existing theme; move keyboard focus to its main heading/container. No final hold. |

Implemented media cut: source 0–4 s at 2×, then source 4–8 s at 1×, from the
8.0417-second original. This supersedes the earlier uniformly sped-up cut.
The normal-speed source section is moving footage; no extra ending hold is added.
Keep naming/subtitle visible from the beginning so they do not depend
on the ending. The sequence is an introduction, not a statement that loading
takes six seconds. The connection begins underneath it immediately.

Use a single viewport, without a scroll runway. Center the video horizontally in the
upper part and place the title just below the midpoint, with its subtitle underneath.
Keep copy in natural flow so wrapping and zoom retain footer space. Reframe portrait media to keep the resolved iris
visible, with safe padding and no stretch. The introduction's black stage
is local to that surface; it does not change the stored workspace theme.

Always allow Skip and Escape. Add **Replay introduction** to a secondary disclosure for
presentations; replay must preserve the selected scan, history and intake state. If a
run is active, disable manual replay and require a fresh explicit click after completion;
do not queue an automatic replay that could cover the newly arrived result.

The timed intro exits even if the service is still connecting. Put any remaining loading
or recovery in the workspace. A connection failure should dismiss the intro and expose
the existing error/reconnect controls immediately. If video playback has not started
within roughly one second, use the still and continue. A 6.75-second watchdog begins
the 0.25-second exit fade if playback has not completed. Normal completion starts the
same fade immediately; cleanup cancels the watchdog. These are media bounds,
not an inference timeout. Playback rejection or a missing file also falls back.

## Loading during actual work

Use a small, approximately 40–56 px eye next to the status text. Prefer a compact strip
at the edge of the image workspace so the scan, findings and controls remain visible.
Show only one moving eye for the relevant activity. It disappears as soon as work ends;
never wait for a loop to finish before showing the result.

Make a small loop from the resolved-eye portion, starting around source 5.5 s. Inspect
the end/start seam before choosing exact in/out points; a seamless loop is not established
by the contact sheet. Do not repeatedly play the full assembly, which resets to unrelated
close-up fibers. Use the poster if a clean, subtle loop is unavailable or motion is paused.

| Actual app state | Visible text / eye behavior |
|---|---|
| `connecting` | “Connecting to local service”; use the small eye if this continues after the intro. |
| Connected, model configured | “Workspace available”; stop loading motion. Configuration is not model warm-up. |
| Connected, model unconfigured | “Model configuration required”; static state and existing settings/recovery. |
| `uploading` | “Preparing your scan”; small eye. |
| `starting` | “Starting inference”; small eye. |
| Selected `run.state === 'running'` | “Running local inference”; small eye. |
| Another run active while an older result is held | Inspect shows the active image with eye above it on the left and Held review/evidence on the right. Other pages retain source activity status. Never mark the held scan as processing. |
| Intake enabled but waiting / queue paused | Static waiting/paused indicator; no perpetual loading eye. |
| Failed or disconnected | Stop motion and expose the actual error/recovery. |
| Succeeded | Stop motion and show actual results. Preserve “No detections reported” and its existing explanation when output is empty. |

Do not derive motion from `workspace.busy`: it also covers idle enabled intake/demo.
`/api/health` checks configuration/file availability; the runner starts a subprocess per
inference. There is no startup model-loading telemetry or percentage-complete API. Keep
the eye indeterminate and do not map iris completion to a percentage, safety verdict,
scanner connection, model accuracy or completed P1/P2 capability.

## Small integration boundary

| File/location | Planned change |
|---|---|
| `frontend/public/media/rayguard/` | Only reviewed `eye-intro.mp4`, `eye-loop.mp4` and `eye-poster.jpg` derivatives. Preserve the supplied package untouched. Do not copy source archives, provenance URLs, old demo text or unused fonts into the public bundle. |
| `frontend/src/components/RayGuardIntro.tsx` (new) | Intro playback, immediate skip, time bounds, focus handoff and replay. Keep presentation state separate from workspace connection and run state. |
| `frontend/src/components/EyeMotion.tsx` (new) | Small native video/poster helper for motion preference, pause, failure and cleanup; no new animation framework. |
| `frontend/src/App.tsx` | Mount the intro alongside the existing workspace hook; own once-per-page-load visibility. Do not remount the workspace when replaying. |
| `frontend/src/components/ScanCanvas.tsx` | Replace the existing `LoaderCircle` inside the true processing/upload status slot; retain its accessible text. |
| `frontend/src/components/IntakeBar.tsx`, `DatasetDemo.tsx` | Only if needed, put the single activity indicator here for a background run while review is held. |
| `frontend/src/styles.css` | Scoped intro/loading layouts using current font, focus and theme tokens. |
| `frontend/tests/e2e/` | Extend relevant workspace, intake and demo browser behavior checks. |

The supplied `ScrollEye` component stays available for a future dedicated scroll
presentation, but its seeking controller and tall layout are unnecessary for this timed
opening. Its reuse prompt describes the original scroll experience; the user's present
startup requirement selects a different playback treatment of the same footage.

Use locally served H.264 MP4 and ordinary HTML video. Initial delivery targets, to be
measured after encoding: intro under roughly 1.5 MB, small loop under 250 KB, poster no
larger than the current 54 KB. These are budgets, not achieved results. Encode derivatives
for linear playback with fast-start metadata; preserve all-intra footage for scroll use.
Load the intro only where displayed and the loop only for real activity. Suppress the
covered workspace's eye video while the intro is visible so only one eye plays. No remote media
or font requests. The existing Vite build/static serving path is sufficient.

The browser animation starts only after the page is served. It cannot cover the launcher's
dependency installation, frontend build or server startup before a browser can connect.

## Accessibility and verification

For reduced motion, show the still/identity and enter the workspace without the timed
motion sequence or a video request. Observe preference changes as well as the initial
setting; CSS alone does not stop video playback. Keep a pause-motion control reachable
for a loading loop, and pause/release media when hidden or unmounted. Handle muted inline
playback failure explicitly. See [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion),
[MDN autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
and [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

Keep decorative video out of the accessibility tree; announce only actual status changes.
Give the intro accessible identity and keyboard controls and prevent keyboard focus entering
the covered workspace. On initial skip/end, focus the workspace; on manual replay skip/end,
return focus to the replay control or preserved prior control. Verify 320 px width, laptop screens,
200% zoom, contrast and long subtitle wrapping. Preserve the existing skip-to-workspace path.

Implementation acceptance under T28 should check fresh load and refresh replay; ordinary
rerenders do not replay; Skip/Escape and manual replay; reduced motion without video fetch;
autoplay rejection/missing/stalled video; offline/unconfigured service; fast and slow real
state transitions; held review during another active run; no idle looping; no external
requests; and React StrictMode cleanup. Inspect the intro pacing and loop seam on the
presentation laptop. Browser/software checks do not establish detector performance.

After code changes run `uv run --locked ruff check .`, `uv run --locked python -m pytest`,
and the applicable frontend build/browser checks from `app/README.md`. This planning pass
does not warrant re-running the model or claiming integration tests have passed.

## Handoff

Root agent coordinates this plan and shared documentation; a separate read-only agent
reviewed app integration and readiness/held-review claims. Student authorship, hours and
human GUI/model ownership remain unreported. T28 remains in progress; the eye is now
implemented and software-checked. Its remaining showcase action is human review on the
presentation laptop. `docs/tasks.md` remains the backlog.

This branding work does not amend the 30 September poster obligation, the ASAP showcase
requirement, or T10/Q9's unresolved 8/15 October prototype versus collection-first conflict.

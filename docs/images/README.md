# README artwork and walkthrough

Created 27 September 2026 for the app README. These are presentation assets;
they do not add a detector, validate accuracy or establish scanner integration.

## Graphical title

[readme-header.svg](readme-header.svg) is original RayGuard artwork: a dark
graphite terminal frame, an outlined wordmark, restrained teal accents and the
Receive / Inspect / Review / Export workflow. The owner's reference informed the
composition; none of that project's artwork or recordings were copied.

The wordmark uses outlined glyphs from the app's existing Barlow files.
[Font provenance](../../frontend/public/fonts/console/README.md) and the
[SIL Open Font License](../../frontend/public/fonts/console/OFL.txt) remain
applicable. The SVG has an accessible title/description, no scripts and no
external resources. It scales from its 1200 × 350 viewBox.

## What the recording shows

[The GIF](gui-demo.gif) loops inline in the README. [The MP4](gui-demo.mp4)
provides a sharper, smaller, pausable alternative. Both are silent.

The actual app was recorded at commit
`3cd38d16bc2db4f9f8e7abcadfc3f0eafae31ce5`, with engine
`b7ec59ecf5aa2f63ddeb580a7f232da0906abbd4`, in the Onyx theme with Barlow.
The workflow opens inspection, loads a local synthetic image, runs the detector,
shows processing beside the previous completed image, zooms, pans, uses the
magnifier, records a review note and opens the session list. Export is supported
by the app but is not demonstrated in this clip.

Both input images are original geometric drawings made for this recording and
visibly marked **SYNTHETIC DEMO**. No research scans, dataset photographs,
checkpoints, configuration files or private filesystem paths are distributed in
these assets. The configured detector was actually executed; API responses and
model predictions were not mocked or drawn onto the footage.

The two generic YOLOv10 runs both succeeded with **zero reported detections** at
confidence 0.25. Their recorded elapsed times were 8.848 and 17.939 seconds.
Fresh CPU/GPU qualification used the first drawing; the recorded runs used
`cuda:0`. This is synthetic-input execution evidence, not real-data validation,
model accuracy, a latency benchmark or a safety assessment. Empty detections do
not establish a safe or benign item. The visible review note says:
“Synthetic interface demo. No safety conclusion.”

Model catalog identity: `author-yolov10m-generic`. Checkpoint SHA-256:
`b484d9a6fb37236f6adcc8c019e6a836f11901dc53a0f71d6cce7262413287ff`.
The checkpoint remains external; this hash records the executed pairing.

## Editing and encoding

The original browser recording was 1440 × 900 at 25 fps. A separate 88-pixel
caption rail was added above the footage. The chronological source intervals
were 11.036–23.836 seconds and 35.836–56.956 seconds, both at original speed.
Setup/tail footage and **12 seconds of idle inference waiting** were omitted.
The resulting playback duration must not be interpreted as model latency.
Application pixels, detections and review text were not retouched.

Playwright recorded the browser. HyperFrames 0.8.79 rendered the captioned edit
with local Barlow fonts; FFmpeg produced the GIF using Lanczos scaling, a
global 256-color palette and Bayer dithering. The source recording, generated
drawings, local configuration, capture scripts and composition remain in ignored
`output/`; opening the README requires none of those tools.

| Asset | Format | Dimensions | Duration / frames | Bytes |
|---|---|---|---|---:|
| [Title](readme-header.svg) | Self-contained SVG | 1200 × 350 viewBox | Static | 70,456 |
| [Inline walkthrough](gui-demo.gif) | Looping GIF | 1000 × 686 | 33.90 s / 339 at 10 fps | 8,856,054 |
| [Sharper walkthrough](gui-demo.mp4) | H.264 MP4, no audio | 1440 × 988 | 33.92 s / 848 at 25 fps | 3,410,529 |

SHA-256:

```text
readme-header.svg  56561d83a661163b7f39b601ddf680b4e7b0f0794a49a5d06ffa527267e5e0ac
gui-demo.gif       b0db724421491e94dd6b7ebe7ca6ff7ffc74afefcc042a0b5f8931f6afee8017
gui-demo.mp4       72c7fc412c77867b6b263d375d3ca18c7793c6a0ff16b09854fb67512a7cc8f0
```

Verification: HyperFrames lint, runtime and sampled layout checks reported no
findings; all 20 caption contrast checks passed. FFmpeg decoded every final GIF
and MP4 frame without errors. FFprobe confirmed dimensions, timing, frame counts
and the absence of audio. The browser capture reported no console errors or
warnings. These checks establish presentation/software behavior only.

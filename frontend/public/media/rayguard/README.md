# RayGuard eye media

Local derivatives of the user-supplied `assets/scroll-eye` package, prepared
26 September 2026 for T28. The source package is unchanged. These are decorative
brand assets; they contain no scan, model prediction or inference progress.

| File | Encoded form | Bytes |
|---|---|---:|
| `eye-intro.mp4` | H.264 High, yuv420p, 1920×1080, 24 fps, 144 frames / 6.000 s | 4,677,496 |
| `eye-loop.mp4` | H.264 High, yuv420p, 256×256, 24 fps, 94 frames / 3.917 s | 117,251 |
| `eye-poster.jpg` | Final frame 143 of the cleaned intro, 1920×1080 | 109,223 |

Both videos are silent and have fast-start metadata (`moov` before `mdat`).
The intro uses source 0–4 s at 2× speed (2 s), followed by source 4–8 s at
normal speed (4 s). Its six seconds contain no padded hold; the UI starts a
0.25-second fade immediately on completion. The loop uses source frames
132–179 (5.5–7.5 s), a centered 900×900 crop, then a reversed return with the two
endpoints omitted. This avoids cutting from the later eye position to the earlier
one. The eye's natural motion reverses; it is not a continuous rotation.

The quality refinement retains the source's native 1080p resolution and uses CRF17,
mild spatial denoising, near-zero temporal filtering and subtle luma sharpening.
This replaces the initial 720p/CRF23 intro; the compact loading loop is unchanged.
Matched-frame comparisons show finer strand separation, with no obvious new halos
or smearing in inspected frames. The source's intentional fibers and glow remain.

## Reproduction

Executed with existing FFmpeg `7.1-essentials_build-www.gyan.dev` / libx264.
From the repository root, use your installed FFmpeg executable for `ffmpeg`:

```powershell
ffmpeg -hide_banner -loglevel warning -y -i assets/scroll-eye/original/source.mp4 -filter_complex '[0:v]split[fast][normal];[fast]trim=start_frame=0:end_frame=96,select=not(mod(n\,2)),setpts=N/(24*TB)[fastout];[normal]trim=start_frame=96:end_frame=192,setpts=N/(24*TB)[normalout];[fastout][normalout]concat=n=2:v=1:a=0,hqdn3d=1.0:0.75:0.001:0.001,unsharp=3:3:0.18:3:3:0,format=yuv420p[out]' -map '[out]' -an -r 24 -fps_mode cfr -c:v libx264 -preset slow -crf 17 -movflags +faststart -map_metadata -1 app/frontend/public/media/rayguard/eye-intro.mp4

ffmpeg -hide_banner -loglevel warning -y -i assets/scroll-eye/original/source.mp4 -filter_complex '[0:v]trim=start_frame=132:end_frame=180,setpts=N/(24*TB),crop=900:900:510:90,scale=256:256:flags=lanczos,format=yuv420p,split[forward][backward];[backward]reverse,trim=start_frame=1:end_frame=47,setpts=N/(24*TB)[return];[forward][return]concat=n=2:v=1:a=0[out]' -map '[out]' -an -r 24 -fps_mode cfr -c:v libx264 -preset slow -crf 24 -movflags +faststart -map_metadata -1 app/frontend/public/media/rayguard/eye-loop.mp4

ffmpeg -hide_banner -loglevel error -y -i app/frontend/public/media/rayguard/eye-intro.mp4 -vf 'select=eq(n\,143)' -frames:v 1 -q:v 3 -update 1 app/frontend/public/media/rayguard/eye-poster.jpg

ffmpeg -hide_banner -i app/frontend/public/media/rayguard/eye-intro.mp4 -f null -
ffmpeg -hide_banner -i app/frontend/public/media/rayguard/eye-loop.mp4 -f null -
```

## Checks and provenance

**Executed and verified:** both complete videos decode without errors; stream
metadata, frame counts, file lengths and fast-start box order match the table.
**Artifact inspected:** source contact sheet/poster, five intro frames and eight
loop frames spanning both joins. The full iris remains inside the crop; sampled
seam frames show no position jump. For the decoded 256×256 grayscale loop, the
last/first frame mean absolute difference is 3.4542 on the 0–255 scale, versus
1.9618 for the median adjacent pair and 13.0029 for the largest adjacent pair.
This is a media continuity check, not a browser playback or human rehearsal claim.

The revised intro has continuous 1/24-second frame timestamps. Sampled output
frames 45–51 and 142–143 match source frames 90/92/94/96/97/98/99/190/191;
the normal-speed section retains all source frames 96–191. Join/final frames
were visually inspected. This verifies the requested speed change and source range.

| Artifact | SHA-256 |
|---|---|
| Original source | `9c6a28ba06499df3b66ce6cb5efe8f78a0b3aa305a9f4976a1eb64c5fa3d7d33` |
| Intro | `bfbd21c3b0946bac2f86a3460ceb0cb070459dc625d14081a94bcfd2a3fa13e1` |
| Loop | `ff9e4b9f7215e3a29e1712567d731e294688e335703d0e3f0c3759cd893d86fc` |
| Runtime poster | `2cfca62f7122d2cf1ea2f8e57007d6ecb712afeb5d8d076b84b922b2c1d72c34` |
| Supplied original poster (unchanged) | `a3a4d79f07e38188954d6b73c30186b76ebc09af8cfa005c622fbe13f2502ab8` |

The source manifest records no separate media-license document. These local
derivatives do not establish public-distribution rights or a new license.

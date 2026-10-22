# trqsh X ad

A 56-second, 1920x1080, 30 fps H.264 + AAC cinematic ad for X (Twitter), `trqsh-x-ad.mp4`.

Everything is generated from code. There is **no footage, no screen recording,
no stock media, no music or sound library and nothing reused from `ADS/`**:

- **Picture** is drawn frame by frame with NumPy, OpenCV and Pillow (anti-aliased
  shapes, text set in system fonts, bloom, camera shake, film grain). Frames are piped
  straight into ffmpeg, so no PNG sequence is written to disk.
- **Sound** is synthesised sample by sample (oscillators, noise, state-variable
  filters, envelopes, convolution reverb, a glue compressor and a true-peak limiter).
- **Timing** lives in one file, `timeline.py`. The renderer and the synthesiser both
  import it, so every key click, hit and cut is timed from the same numbers.

The look follows the site: near-black `#0c0c0e`, white and greys only, the `>_`
rounded-square mark and tight-tracked `trqsh` wordmark from
`web/site/components/logo.tsx`, mono for commands and URLs. Copy and facts come from
`web/site/app/(marketing)/page.tsx`, `web/site/lib/site.ts` and `docs/content/`.

## Storyboard

| Time | Scene | What happens |
| --- | --- | --- |
| 0 - 4 s | Void | Black, a blinking cursor, a low drone. `localhost:3000` is typed. "Only you can see it." |
| 4 - 8 s | Command | `$ trqsh http 3000` is typed with key clicks while a heartbeat speeds up and a riser builds. |
| 8 - 14 s | Tunnel | Enter. The command line becomes a beam, then rounded squares (the logo shape) rush past, light builds to a white-out and the **hit** lands at 12.0 s. `https://your-app.trqsh.uz` decodes into place. |
| 14 - 20 s | Share | "Share what you're building." A browser window and a phone load the same URL. |
| 20 - 26 s | Webhooks | "Bring webhooks to your desk." Packets land in the request inspector, a request is opened, then replayed to localhost. |
| 26 - 31 s | Protocols | HTTP, HTTPS, TCP, UDP, TLS slam in. `trqsh tcp 22` (SSH) and `trqsh tcp 5432` (database). UDP and TLS are marked as paid plans. |
| 31 - 35 s | Domains | "Make it yours." `trqsh http 3000 --subdomain myapp`, then a reserved subdomain and a custom domain morph into the address bar. |
| 35 - 40 s | Remote | "Control it from your phone." `/qr` prints a QR code, the phone pairs and runs `/status` and `/http 3000`. |
| 40 - 44 s | Montage | One word per beat: QUIC. TCP fallback. macOS. Windows. Linux. Free. No credit card. Then a cut to silence. |
| 44 - 56 s | Outro | A square collapses into the `>_` mark (hit at 45.0 s), the wordmark, "Your localhost, live on the internet.", `trqsh.uz`, the typed install command, a final impact at 52.0 s and a reverb tail. |

X plays video muted by default, so every beat is carried by on-screen text first and
sound second.

## Re-render

Requirements: Python 3.10+, `numpy`, `scipy`, `numba`, `opencv-python` (or
`opencv-python-headless`), `Pillow`, and an `ffmpeg` with `libx264` and `aac`.
ffmpeg is found through `$FFMPEG`, then `PATH`, then the `imageio-ffmpeg` wheel
(`pip install imageio-ffmpeg` is enough if you have no system ffmpeg).

Fonts are the Windows system fonts the site already falls back to: Segoe UI
(headlines) and Consolas (commands). On other systems the code falls back to DejaVu
and the metrics change slightly.

```bash
cd promo/x-ad
pip install numpy scipy numba opencv-python Pillow imageio-ffmpeg
python build.py              # audio -> picture -> mux -> verify, writes trqsh-x-ad.mp4
```

About two to four minutes on a 12-core machine; it needs roughly 1 GB of free RAM and
only about 15 MB of disk for `build/audio.wav` plus the final file.

Useful variants:

```bash
python build.py --audio-only                 # just build/audio.wav
python build.py --still 12.4 45.2 50.0       # PNG stills in build/stills (fast look-dev)
python build.py --workers 4 --no-verify      # fewer render processes, skip the checks
python verify.py trqsh-x-ad.mp4              # container, loudness, peak and sync report
```

## Files

| File | Role |
| --- | --- |
| `timeline.py` | Scene bounds, typing times, hit times and every other event. Edit timing here. |
| `gfx.py` | Drawing toolkit: fonts, anti-aliased shapes, text, glow, camera, grain, the logo. |
| `render_video.py` | The ten scenes and the ffmpeg pipe. |
| `synth_audio.py` | Score, SFX, reverb, compressor and limiter. Targets -14 LUFS and a true peak under -1.5 dBTP. |
| `build.py` | One command to run everything. |
| `verify.py` | Reads the finished MP4 and prints duration, codecs, loudness, peak and an audio/picture sync table. |
| `ffmpeg_path.py` | Finds ffmpeg. |

## Changing things

- Retime a moment: change it in `timeline.py`; picture and sound follow.
- Change copy: the strings are at the top of `timeline.py` (typed text) and inside the
  `scene_*` functions in `render_video.py` (headlines).
- Re-balance the sound: levels are the numeric gains in `build()` in `synth_audio.py`.
  The final gain is found automatically, so only the balance between sounds matters.
- Another aspect ratio: set `W` and `H` in `timeline.py`. The layouts are written for
  1920x1080 and would need adjusting.

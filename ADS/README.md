# trqsh — Build local. Go global.

**Revision 3:** a new, smooth motion design with **sound effects only**. There is no background music. Format: vertical 1080 × 1920, 32 seconds, 60 fps, H.264 MP4 with 48 kHz stereo AAC. Created and rendered with Hyperframes 0.8.164.

The old chrome rings and rotating globe were replaced by a single persistent card that changes shape and purpose: local project → connection endpoint → terminal → protocol hub → HTTP inspector → brand tile. Longer easing curves, masked text reveals, and a circular closing transition replace the earlier cuts and flashes. The new palette is soft ivory, deep green, and a restrained lime signal accent.

## Deliverables

- `output/trqsh-cinematic-vertical-v3.mp4` — latest video, without background music.
- `output/trqsh-cinematic-vertical.mp4` — matching primary delivery copy.
- `output/poster.jpg` and `output/storyboard.jpg` — decoded final-video images.
- `output/verification.json` — frame count, codecs, decode results, motion checks, and an encoded-audio silence check.
- `output/hyperframes-check-v3.json` — runtime, layout, and text-contrast validation.
- `assets/audio/effects-v3.wav` — sound-effects-only master.
- `assets/audio/source-manifest.json` — source IDs, licenses, effect cue times, and proof of silence outside cues.

Files named `v2` are older versions with the previously requested music. The active composition and version 3 do not reference that music. The older `film.css` and `film.mjs` are inactive; version 3 uses `flow-v3.css` and `flow-v3.mjs`.

## Edit and rebuild

Use Node.js 22+ and Chrome. Python with NumPy and SciPy is needed to rebuild the effects track. Rendering dependencies are installed locally under `ADS/node_modules`.

```powershell
npm install
npm run assets
npm run audio:fetch   # only needed if the licensed working source effects are missing
npm run audio
npm run check
npm run preview
npm run render
npm run qa
```

`npm run preview` starts the Hyperframes editor; open the local URL it prints. The editable composition is `index.html`, `flow-v3.css`, and `flow-v3.mjs`. Local fonts and animation libraries are shipped with the project, so rendering needs no CDN requests.

The render uses one streaming worker to avoid storing thousands of temporary frames. The wrapper discovers local FFmpeg/ffprobe and Chrome at its standard Windows location. Set `HYPERFRAMES_BROWSER_PATH` for another Chromium executable. Temporary files remain under `ADS/.cache`.

The current audio script reads only three licensed sound-effect recordings. It does not load, synthesize, or mix music. Its output is exactly silent outside the listed cues; the final AAC is checked separately with a small margin for codec ringing. Do not normalize the whole sparse track to music loudness, which would make the effects too loud.

Delivery verification passed: 1920 frames at 60 fps, 32.0 seconds, full decode without errors, motion in all six scenes, no runtime/layout findings, and 90/90 sampled text-contrast checks. The encoded audio measures below −120 dBFS RMS outside the sound-effect cues, confirming that no background audio bed remains.

See `CREDITS.md` for sources and licenses. Raw third-party recordings are local edit assets, ignored by Git; share the finished video rather than the raw effects library.

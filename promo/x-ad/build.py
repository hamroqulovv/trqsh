"""Build the trqsh X ad end to end: synthesise the audio, render the picture, mux, verify.

  python build.py                 # audio + video -> trqsh-x-ad.mp4, then verify
  python build.py --audio-only    # just build/audio.wav
  python build.py --still 12.4 45.2   # PNG stills into build/stills for look-dev
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
OUT = os.path.join(HERE, "trqsh-x-ad.mp4")
WAV = os.path.join(BUILD, "audio.wav")


def run(*args):
    print("+", " ".join(args), flush=True)
    subprocess.run([sys.executable, *args], cwd=HERE, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--still", nargs="*")
    ap.add_argument("--workers", default=None)
    a = ap.parse_args()
    os.makedirs(BUILD, exist_ok=True)
    if a.still:
        run("render_video.py", "--still", *a.still, "--outdir", os.path.join(BUILD, "stills"))
        return
    run("synth_audio.py", WAV)
    if a.audio_only:
        return
    cmd = ["render_video.py", "--encode", OUT, "--audio", WAV]
    if a.workers:
        cmd += ["--workers", a.workers]
    run(*cmd)
    if not a.no_verify:
        run("verify.py", OUT)


if __name__ == "__main__":
    main()

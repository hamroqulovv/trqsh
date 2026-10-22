"""Check the finished MP4: container facts, loudness, true peak and audio/picture sync.

  python verify.py trqsh-x-ad.mp4

Sync is measured, not assumed: for each key moment it finds the audio onset
(steepest rise of the loudness envelope) and the picture flash (steepest
rise of mean luminance) near the planned time and prints both offsets.
"""
import re
import subprocess
import sys

import numpy as np

from ffmpeg_path import find_ffmpeg
from timeline import CUTS, FPS, SPEC_TIMES, T_ENTER, T_FINAL_HIT, T_HIT_URL, T_LOGO_HIT

FF = find_ffmpeg()


def info(path):
    r = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True)
    txt = r.stderr
    dur = re.search(r"Duration: (\d+):(\d+):([\d.]+)", txt)
    secs = int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3])
    vid = re.search(r"Video: (\w+).*?, (\d+)x(\d+).*?, ([\d.]+) fps", txt)
    aud = re.search(r"Audio: (\w+).*?, (\d+) Hz, (\w+)", txt)
    print(f"duration   {secs:.2f} s")
    print(f"video      {vid[1]} {vid[2]}x{vid[3]} @ {vid[4]} fps")
    print(f"audio      {aud[1]} {aud[2]} Hz {aud[3]}")
    return secs


def loudness(path):
    r = subprocess.run([FF, "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    I = float(tail.split("I:")[1].split("LUFS")[0])
    lra = float(tail.split("LRA:")[1].split("LU")[0])
    tp = float(tail.split("Peak:")[1].split("dBFS")[0])
    print(f"loudness   {I:.1f} LUFS integrated, LRA {lra:.1f} LU, true peak {tp:.1f} dBTP")
    return I, tp


def decode_audio(path):
    r = subprocess.run([FF, "-v", "error", "-i", path, "-vn", "-f", "f32le", "-ac", "2", "-ar", "48000", "-"],
                       capture_output=True)
    x = np.frombuffer(r.stdout, np.float32).reshape(-1, 2)
    return x


def decode_frames(path):
    r = subprocess.run([FF, "-v", "error", "-i", path, "-an", "-vf", "scale=96:54,format=gray", "-f", "rawvideo", "-"],
                       capture_output=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(-1, 54 * 96).astype(np.float32)


def thump_onset(low_env, t, win=0.12, hop=0.005):
    """Steepest rise of the low-frequency (<200 Hz) dB envelope within +-win of t: the kick / sub boom."""
    i0, i1 = int((t - win) / hop), int((t + win) / hop)
    seg = low_env[max(0, i0):i1]
    return (max(0, i0) + int(np.argmax(np.diff(seg))) + 1) * hop


def main(path):
    from scipy import signal as sg
    secs = info(path)
    I, tp = loudness(path)
    x = decode_audio(path)
    clip = float(np.abs(x).max())
    print(f"sample pk  {20 * np.log10(clip + 1e-12):.2f} dBFS ({'clipping!' if clip >= 0.999 else 'no clipping'})")
    mono = x.mean(axis=1)
    low = sg.sosfilt(sg.butter(4, 200, "low", fs=48000, output="sos"), mono)
    hop = 0.005
    n = int(hop * 48000)

    def env_db(sig):
        m = sig[: len(sig) // n * n].reshape(-1, n)
        return 10 * np.log10((m ** 2).mean(axis=1) + 1e-12)

    low_env = env_db(low)
    frames = decode_frames(path)
    luma = frames.mean(axis=1)
    diff = np.abs(np.diff(frames, axis=0)).mean(axis=1)
    print(f"frames     {len(luma)} ({len(luma) / FPS:.2f} s of picture)")
    print()
    print("sync check (planned | audio thump | picture | audio minus picture)")
    # kind: 'peak' = brightest frame (white-out hits), 'cut' = largest frame-to-frame change
    events = [("enter", T_ENTER, "peak"), ("URL hit", T_HIT_URL, "peak"), ("cut 14", CUTS[0], "cut"),
              ("cut 20", CUTS[1], "cut"), ("cut 26", CUTS[2], "cut"), ("cut 31", CUTS[3], "cut"),
              ("cut 35", CUTS[4], "cut"), ("cut 40", CUTS[5], "cut"), ("word 'Free.'", SPEC_TIMES[5], "cut"),
              ("logo hit", T_LOGO_HIT, "peak"), ("final hit", T_FINAL_HIT, "peak")]
    worst = 0.0
    for name, t, kind in events:
        ta = thump_onset(low_env, t)
        i0, i1 = int((t - 0.2) * FPS), int((t + 0.2) * FPS)
        if kind == "peak":
            seg = luma[max(0, i0):i1]
            tv = (max(0, i0) + int(np.argmax(seg))) / FPS
        else:
            seg = diff[max(0, i0):i1]
            tv = (max(0, i0) + int(np.argmax(seg)) + 1) / FPS
        worst = max(worst, abs(ta - tv))
        print(f"  {name:<13} {t:6.2f} s | {ta:6.3f} s ({(ta - t) * 1000:+4.0f} ms) | "
              f"{tv:6.3f} s ({(tv - t) * 1000:+4.0f} ms) | {(ta - tv) * 1000:+4.0f} ms")
    print(f"worst audio/picture offset: {worst * 1000:.0f} ms (one frame = {1000 / FPS:.0f} ms)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "trqsh-x-ad.mp4")

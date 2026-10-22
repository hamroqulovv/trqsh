"""Locate an ffmpeg binary: $FFMPEG, then PATH, then the imageio-ffmpeg wheel."""
import glob
import os
import shutil


def find_ffmpeg():
    env = os.environ.get("FFMPEG")
    if env and os.path.exists(env):
        return env
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass
    for root in os.environ.get("PYTHONPATH", "").split(os.pathsep):
        hits = glob.glob(os.path.join(root, "imageio_ffmpeg", "binaries", "ffmpeg*"))
        if hits:
            return hits[0]
    raise SystemExit("ffmpeg not found. Install it, set FFMPEG=<path>, or `pip install imageio-ffmpeg`.")

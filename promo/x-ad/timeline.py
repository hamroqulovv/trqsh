"""Single source of truth for timing.

Both the picture (render_video.py) and the sound (synth_audio.py) import
this file, so every key click, hit and cut is timed from the same numbers.
All times are in seconds on the final video timeline.
"""
import math
import random

W, H = 1920, 1080
FPS = 30
SR = 48000
DURATION = 56.0
N_FRAMES = int(round(DURATION * FPS))

BPM = 120.0
BEAT = 60.0 / BPM  # 0.5 s


# --- scenes -----------------------------------------------------------------
SCENES = {
    "void":   (0.0, 4.0),     # localhost:3000, only you can see it
    "type":   (4.0, 8.0),     # `trqsh http 3000` is typed
    "tunnel": (8.0, 14.0),    # enter -> light tunnel -> public URL
    "share":  (14.0, 20.0),   # share a preview
    "hooks":  (20.0, 26.0),   # webhooks, inspector, replay
    "proto":  (26.0, 31.0),   # HTTP / HTTPS / TCP / UDP / TLS
    "domain": (31.0, 35.0),   # reserved subdomains + custom domains
    "remote": (35.0, 40.0),   # QR remote control
    "specs":  (40.0, 44.0),   # QUIC, platforms, free
    "outro":  (44.0, 56.0),   # logo, tagline, install
}
CUTS = [14.0, 20.0, 26.0, 31.0, 35.0, 40.0]


def keystrokes(t0, n, cps, seed, jitter=0.38, pauses=None):
    """Deterministic, human-ish key times for n characters."""
    rng = random.Random(seed)
    pauses = pauses or {}
    t, out = t0, []
    for i in range(n):
        out.append(t)
        t += (1.0 / cps) * (1.0 + rng.uniform(-jitter, jitter)) + pauses.get(i, 0.0)
    return out


# --- strings that are typed on screen ----------------------------------------
STR_LOCAL = "localhost:3000"
STR_CMD = "trqsh http 3000"
STR_URL = "https://your-app.trqsh.uz"
STR_SUB_CMD = "trqsh http 3000 --subdomain myapp"
STR_TCP1 = "trqsh tcp 22"
STR_TCP2 = "trqsh tcp 5432"
STR_QR = "/qr"
STR_PHONE1 = "/status"
STR_PHONE2 = "/http 3000"
STR_INSTALL = "curl -fsSL https://trqsh.uz/install.sh | sh"

TYPING = {
    "local": keystrokes(0.95, len(STR_LOCAL), 9.0, 3),
    "cmd": keystrokes(4.30, len(STR_CMD), 7.0, 7, pauses={4: 0.30, 9: 0.22}),
    "tcp1": keystrokes(28.15, len(STR_TCP1), 13.0, 21),
    "tcp2": keystrokes(28.95, len(STR_TCP2), 13.0, 22),
    "sub": keystrokes(31.45, len(STR_SUB_CMD), 28.0, 23),
    "qr": keystrokes(35.55, len(STR_QR), 6.0, 24),
    "phone1": keystrokes(38.35, len(STR_PHONE1), 11.0, 25),
    "phone2": keystrokes(38.95, len(STR_PHONE2), 11.0, 26),
    "install": keystrokes(49.05, len(STR_INSTALL), 19.0, 11, jitter=0.45),
}
ENTER = {"cmd": 8.0, "tcp1": 28.75, "tcp2": 29.55, "sub": 32.75, "qr": 36.05}

# --- big moments --------------------------------------------------------------
T_ENTER = 8.0           # the command is sent
T_RISER_START = 8.35    # tunnel starts accelerating
T_HIT_URL = 12.0        # white-out, the public URL lands
T_LOGO_HIT = 45.0
T_FINAL_HIT = 52.0
T_FADE_OUT = 55.0

DECODE_URL = [12.10 + i * 0.035 for i in range(len(STR_URL))]

# scene 4: share a preview
T_SHARE_ADDR = 14.55
T_PHONE_IN = 15.45
T_SHARE_PINGS = [16.15, 16.70, 17.25]

# scene 5: webhooks
PACKET_ARRIVALS = [21.50, 22.00, 22.50]   # packet lands on localhost
PACKET_TRAVEL = 0.85
T_SELECT_ROW = 23.05
T_REPLAY_PRESS = 24.50
REPLAY_ARRIVAL = 25.05

# scene 6: protocols
CHIP_TIMES = [26.55, 26.80, 27.05, 27.30, 27.55]
T_PROTO_SWEEP = 27.85

# scene 7: domains
T_DOMAIN_URL1 = 31.30
T_DOMAIN_URL2 = 32.85
T_DOMAIN_URL3 = 33.85

# scene 8: remote control
T_QR_BUILD = (36.15, 36.95)
T_PHONE_SLIDE = 36.75
T_QR_SCAN = (37.15, 37.80)
T_PAIRED = 37.90

# scene 9: spec montage (one word per beat)
SPEC_WORDS = ["QUIC.", "TCP fallback.", "macOS.", "Windows.", "Linux.", "Free.", "No credit card."]
SPEC_TIMES = [40.0 + BEAT * i for i in range(len(SPEC_WORDS))]

# outro
T_LOGO_LETTERS = 45.22
T_TAGLINE = 46.55
T_SITE = 48.05
T_PILL = 48.75

T_GLITCH = {3.88: 0.22, 13.9: 0.0}  # extra glitch bursts (time -> length)


def revealed(times, t):
    """How many characters have been typed by time t."""
    n = 0
    for x in times:
        if t >= x:
            n += 1
        else:
            break
    return n


def tunnel_flow(t):
    if t < 12.0:
        a = max(0.0, t - 8.2)
        return 0.4 * a + 0.30 * a ** 3, 0.4 + 0.9 * a * a
    a12 = 12.0 - 8.2
    u12 = 0.4 * a12 + 0.30 * a12 ** 3
    v12 = 0.4 + 0.9 * a12 ** 2
    b, tau = t - 12.0, 0.45
    return u12 + v12 * tau * (1 - math.exp(-b / tau)) + 0.25 * b, v12 * math.exp(-b / tau) + 0.25



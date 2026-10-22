"""Tiny procedural 2D toolkit: everything on screen is drawn from code.

A frame is an 8-bit grey "sharp" layer (painter's algorithm, anti-aliased
shapes and text) plus a low-resolution float "light" layer for soft glows and
lens flares. `finish()` adds bloom, camera, vignette and film grain and
returns raw RGB bytes. The picture is strictly monochrome: R = G = L and the
blue channel only carries the 2-level tint of the brand's #0c0c0e background.
"""
import math
import os
import random
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from timeline import H, W

BG = 12  # #0c0c0e, brand background (blue gets +2 in finish())
LW, LH = W // 4, H // 4

# --- easing ------------------------------------------------------------------


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def out_cubic(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def out_quint(x):
    x = clamp(x)
    return 1 - (1 - x) ** 5


def out_expo(x):
    x = clamp(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def in_cubic(x):
    x = clamp(x)
    return x ** 3


def inout_cubic(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def out_back(x, s=1.70158):
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def prog(t, t0, d):
    return clamp((t - t0) / d)


def pulse(t, t0, decay):
    """1 at t0, exponential decay afterwards, 0 before."""
    return 0.0 if t < t0 else math.exp(-(t - t0) / decay)


# --- fonts and text ----------------------------------------------------------
_WIN = os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts")
_FONT_FILES = {
    "sans_b": ["segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"],
    "sans": ["segoeui.ttf", "arial.ttf", "DejaVuSans.ttf"],
    "sans_l": ["segoeuisl.ttf", "segoeuil.ttf", "arial.ttf", "DejaVuSans.ttf"],
    "mono": ["consola.ttf", "cour.ttf", "DejaVuSansMono.ttf"],
    "mono_b": ["consolab.ttf", "courbd.ttf", "DejaVuSansMono-Bold.ttf"],
}


@lru_cache(maxsize=None)
def get_font(name, size):
    for fn in _FONT_FILES[name]:
        for base in (_WIN, "/usr/share/fonts/truetype/dejavu", "/Library/Fonts"):
            p = os.path.join(base, fn)
            if os.path.exists(p):
                return ImageFont.truetype(p, int(size))
    return ImageFont.load_default()


@lru_cache(maxsize=2048)
def _layout(s, font, size, tracking):
    f = get_font(font, size)
    xs, x = [], 0.0
    for i, ch in enumerate(s):
        xs.append(x)
        adv = f.getlength(ch)
        if i + 1 < len(s):
            adv = f.getlength(ch + s[i + 1]) - f.getlength(s[i + 1])
        x += adv + tracking * size
    return xs, x


def text_width(s, font, size, tracking=0.0):
    return _layout(s, font, size, tracking)[1]


@lru_cache(maxsize=700)
def _mask(s, font, size, tracking):
    f = get_font(font, size)
    xs, total = _layout(s, font, size, tracking)
    asc, desc = f.getmetrics()
    pad = 10
    im = Image.new("L", (int(total) + 2 * pad + 4, asc + desc + 2 * pad), 0)
    d = ImageDraw.Draw(im)
    for ch, px in zip(s, xs):
        if ch != " ":
            d.text((pad + px, pad), ch, font=f, fill=255)
    return np.asarray(im), pad, asc, total


def char_xs(s, font, size, tracking=0.0):
    return _layout(s, font, size, tracking)[0]


# --- the frame ---------------------------------------------------------------


def _make_bg(grid):
    bg = np.full((H, W), BG, np.uint8)
    if grid:
        ys, xs = np.mgrid[0:H:48, 0:W:48]
        r = np.hypot((xs - W / 2) / (W / 2), (ys - H / 2) / (H / 2))
        v = (BG + 11 * np.clip(1.15 - r, 0, 1)).astype(np.uint8)
        bg[ys, xs] = v
        bg[ys + 1, xs] = v
        bg[ys, xs + 1] = v
    return bg


BG_PLAIN = _make_bg(False)
BG_GRID = _make_bg(True)


def _v(val, alpha):
    return int(round(BG + (val - BG) * clamp(alpha)))


class Frame:
    def __init__(self, grid=False):
        self.sharp = (BG_GRID if grid else BG_PLAIN).copy()
        self.lo = np.zeros((LH, LW), np.float32)

    # shapes ---------------------------------------------------------------
    def line(self, x0, y0, x1, y1, th=2.0, val=255, alpha=1.0):
        if alpha <= 0:
            return
        if th < 1:
            alpha, th = alpha * th, 1
        cv2.line(
            self.sharp,
            (int(x0 * 16), int(y0 * 16)),
            (int(x1 * 16), int(y1 * 16)),
            _v(val, alpha),
            int(round(th)),
            cv2.LINE_AA,
            4,
        )

    def poly(self, pts, th=2.0, val=255, alpha=1.0, closed=False):
        if alpha <= 0:
            return
        a = (np.asarray(pts, np.float64) * 16).astype(np.int32).reshape(-1, 1, 2)
        cv2.polylines(self.sharp, [a], closed, _v(val, alpha), max(1, int(round(th))), cv2.LINE_AA, 4)

    def circle(self, cx, cy, r, th=2.0, val=255, alpha=1.0, fill=False):
        if alpha <= 0 or r <= 0:
            return
        cv2.circle(
            self.sharp,
            (int(cx * 16), int(cy * 16)),
            int(r * 16),
            _v(val, alpha),
            -1 if fill else max(1, int(round(th))),
            cv2.LINE_AA,
            4,
        )

    def rrect(self, cx, cy, w, h, r, th=2.0, val=255, alpha=1.0, fill=None, fill_alpha=1.0):
        pts = rrect_path(cx, cy, w, h, r)
        a = (pts * 16).astype(np.int32).reshape(-1, 1, 2)
        if fill is not None and fill_alpha > 0:
            cv2.fillPoly(self.sharp, [a], _v(fill, fill_alpha), cv2.LINE_AA, 4)
        if th > 0 and alpha > 0:
            cv2.polylines(self.sharp, [a], True, _v(val, alpha), max(1, int(round(th))), cv2.LINE_AA, 4)

    # light ----------------------------------------------------------------
    def emit(self, cx, cy, sx, sy, gain):
        """Add an anisotropic gaussian of light (sigma in full-res pixels)."""
        if gain <= 0.0005:
            return
        lx, ly = cx / 4.0, cy / 4.0
        sxl, syl = max(sx / 4.0, 0.5), max(sy / 4.0, 0.5)
        x0, x1 = max(0, int(lx - 3.3 * sxl)), min(LW, int(lx + 3.3 * sxl) + 1)
        y0, y1 = max(0, int(ly - 3.3 * syl)), min(LH, int(ly + 3.3 * syl) + 1)
        if x1 <= x0 or y1 <= y0:
            return
        xs = np.arange(x0, x1, dtype=np.float32)
        ys = np.arange(y0, y1, dtype=np.float32)
        gx = np.exp(-0.5 * ((xs - lx) / sxl) ** 2)
        gy = np.exp(-0.5 * ((ys - ly) / syl) ** 2)
        self.lo[y0:y1, x0:x1] += gain * np.outer(gy, gx)

    # text -----------------------------------------------------------------
    def text(self, s, x, y, font="sans_b", size=64, val=255, alpha=1.0, ax="l", ay="b",
             tracking=0.0, scale=1.0, sx=1.0, clip=None):
        if not s or alpha <= 0.004:
            return
        mask, pad, asc, total = _mask(s, font, size, tracking)
        ox = {"l": 0.0, "m": total / 2, "r": total}[ax]
        oy = {"b": asc, "c": asc - 0.34 * size, "t": asc - 0.74 * size}[ay]
        X0 = x - (pad + ox) * scale * sx
        Y0 = y - (pad + oy) * scale
        mh, mw = mask.shape
        bx0, by0 = int(math.floor(X0)), int(math.floor(Y0))
        bw, bh = int(math.ceil(mw * scale * sx)) + 3, int(math.ceil(mh * scale)) + 3
        cx0, cy0, cx1, cy1 = 0, 0, W, H
        if clip:
            cx0, cy0, cx1, cy1 = max(0, clip[0]), max(0, clip[1]), min(W, clip[2]), min(H, clip[3])
        x0, y0 = max(bx0, cx0), max(by0, cy0)
        x1, y1 = min(bx0 + bw, cx1), min(by0 + bh, cy1)
        if x1 <= x0 or y1 <= y0:
            return
        if scale == 1.0 and sx == 1.0 and X0 == bx0 and Y0 == by0:
            patch = np.zeros((bh, bw), np.uint8)
            patch[:mh, :mw] = mask
        else:
            M = np.float32([[scale * sx, 0, X0 - bx0], [0, scale, Y0 - by0]])
            patch = cv2.warpAffine(mask, M, (bw, bh), flags=cv2.INTER_LINEAR)
        m = patch[y0 - by0:y1 - by0, x0 - bx0:x1 - bx0].astype(np.float32) * (alpha / 255.0)
        sub = self.sharp[y0:y1, x0:x1]
        sub[:] = np.clip(sub + (val - sub.astype(np.float32)) * m, 0, 255).astype(np.uint8)

    def mask_line(self, s, x, y, t, t0, dur, size, font="sans_b", val=255, alpha=1.0,
                  tracking=-0.04, ax="l"):
        """Headline line that rises out of its own mask (like the site's .mask-line)."""
        k = out_expo(prog(t, t0, dur))
        if k <= 0:
            return
        top, bot = int(y - 0.98 * size), int(y + 0.30 * size)
        total = text_width(s, font, size, tracking)
        left = x - {"l": 0, "m": total / 2, "r": total}[ax]
        self.text(s, x, y + (1 - k) * size * 1.05, font, size, val, alpha, ax, "b", tracking,
                  clip=(int(left) - 20, top, int(left + total) + 40, bot))

    # post -----------------------------------------------------------------
    def glitch(self, strength, rng):
        n = 3 + int(strength * 12)
        for _ in range(n):
            y0 = rng.randrange(0, H - 8)
            hh = rng.randrange(4, 10 + int(90 * strength))
            dx = int(rng.uniform(-1, 1) * (30 + 260 * strength))
            self.sharp[y0:y0 + hh] = np.roll(self.sharp[y0:y0 + hh], dx, axis=1)


def rrect_path(cx, cy, w, h, r):
    r = max(0.5, min(r, w / 2, h / 2))
    n = max(4, min(24, int(r / 4)))
    pts = []
    for ox, oy, a0 in (
        (cx + w / 2 - r, cy - h / 2 + r, -90),
        (cx + w / 2 - r, cy + h / 2 - r, 0),
        (cx - w / 2 + r, cy + h / 2 - r, 90),
        (cx - w / 2 + r, cy - h / 2 + r, 180),
    ):
        for k in range(n + 1):
            a = math.radians(a0 + 90.0 * k / n)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return np.asarray(pts, np.float64)


# --- motes (dust in the light) ----------------------------------------------
class Motes:
    def __init__(self, n=90, seed=5):
        rng = np.random.default_rng(seed)
        self.x = rng.uniform(0, W, n)
        self.y = rng.uniform(0, H, n)
        self.vx = rng.uniform(-6, 6, n)
        self.vy = rng.uniform(-14, -2, n)
        self.z = rng.uniform(0.3, 1.0, n)
        self.ph = rng.uniform(0, 6.28, n)

    def draw(self, F, t, gain=1.0):
        for i in range(self.x.size):
            x = (self.x[i] + self.vx[i] * t * self.z[i]) % W
            y = (self.y[i] + self.vy[i] * t * self.z[i]) % H
            tw = 0.55 + 0.45 * math.sin(t * (0.8 + self.z[i]) + self.ph[i])
            a = gain * self.z[i] * tw
            cv2.circle(F.sharp, (int(x * 16), int(y * 16)), int((0.9 + self.z[i]) * 16),
                       _v(150 + 80 * self.z[i], a * 0.55), -1, cv2.LINE_AA, 4)


# --- brand logo ---------------------------------------------------------------
def logo_mark(F, cx, cy, size, draw=1.0, alpha=1.0, val=255, cursor=1.0, pad_scale=1.0):
    """The `>_` rounded-square mark from web/site/components/logo.tsx (32 x 32 viewBox)."""
    s = size / 32.0
    ox, oy = cx - size / 2, cy - size / 2
    F.rrect(cx, cy, size, size, 8 * s, th=0, fill=val, fill_alpha=alpha)
    ink = BG
    th = max(1.0, 2.3 * s)

    def P(u, v):
        return (ox + u * s, oy + v * s)

    chev = [P(8, 10), P(14, 16), P(8, 22)]
    p = clamp(draw)
    seg = [(chev[0], chev[1]), (chev[1], chev[2])]
    done = p * 2
    for i, (a, b) in enumerate(seg):
        f = clamp(done - i)
        if f <= 0:
            continue
        q = (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
        F.line(a[0], a[1], q[0], q[1], th, ink, alpha)
        F.circle(a[0], a[1], th / 2, val=ink, alpha=alpha, fill=True)
        F.circle(q[0], q[1], th / 2, val=ink, alpha=alpha, fill=True)
    if cursor > 0:
        a, b = P(18, 22), P(24, 22)
        q = (a[0] + (b[0] - a[0]) * clamp(cursor), a[1])
        F.line(a[0], a[1], q[0], q[1], th, ink, alpha)
        F.circle(a[0], a[1], th / 2, val=ink, alpha=alpha, fill=True)
        F.circle(q[0], q[1], th / 2, val=ink, alpha=alpha, fill=True)


# --- finishing ----------------------------------------------------------------
def _vignette():
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    r2 = ((xs - W / 2) / (W / 2)) ** 2 * 0.85 + ((ys - H / 2) / (H / 2)) ** 2 * 0.95
    return np.clip(1.0 - 0.40 * r2, 0.25, 1.0).astype(np.float32)


_VIG = _vignette()
_rng = np.random.default_rng(1234)
_GRAIN = [(_rng.standard_normal((H, W)) * (1.25 / 255.0)).astype(np.float32) for _ in range(6)]


def finish(F, cam=(1.0, 0.0, 0.0, 0.0), bloom=0.55, halo=0.55, expo=1.0, fade=1.0, flash=0.0,
           grain=1.0, seed=0):
    """Compose the layers. cam = (zoom, roll_degrees, shift_x, shift_y). Returns RGB bytes."""
    sharp = F.sharp
    small = cv2.resize(sharp, (LW, LH), interpolation=cv2.INTER_AREA).astype(np.float32) * (1 / 255.0)
    hi = np.clip(small - 0.22, 0, 1) * 1.35
    b1 = cv2.GaussianBlur(hi, (0, 0), 3.2)
    tiny = cv2.resize(hi, (LW // 4, LH // 4), interpolation=cv2.INTER_AREA)
    b2 = cv2.resize(cv2.GaussianBlur(tiny, (0, 0), 3.5), (LW, LH), interpolation=cv2.INTER_LINEAR)
    glow = b1 * bloom + b2 * halo + F.lo
    L = sharp.astype(np.float32) * (1 / 255.0)
    L += cv2.resize(glow, (W, H), interpolation=cv2.INTER_LINEAR)

    z, rot, tx, ty = cam
    if z != 1.0 or rot != 0.0 or tx != 0.0 or ty != 0.0:
        M = cv2.getRotationMatrix2D((W / 2, H / 2), rot, z)
        M[0, 2] += tx
        M[1, 2] += ty
        L = cv2.warpAffine(L, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    L *= _VIG
    if expo != 1.0:
        L *= expo
    if flash > 0:
        L += flash * (0.55 + 0.45 * _VIG)
    gr = random.Random(seed * 7919 + 11)
    g = _GRAIN[gr.randrange(6)]
    if gr.random() < 0.5:
        g = g[::-1]
    if gr.random() < 0.5:
        g = g[:, ::-1]
    L += g * grain
    np.clip(L, 0, 1, out=L)
    if fade < 1.0:
        L *= fade
    out = np.empty((H, W, 3), np.uint8)
    L255 = L * 255.0
    u8 = (L255 + 0.5).astype(np.uint8)
    out[..., 0] = u8
    out[..., 1] = u8
    out[..., 2] = np.minimum(L255 + 2.0 * (1.0 - L) * fade + 0.5, 255).astype(np.uint8)
    return out.tobytes()

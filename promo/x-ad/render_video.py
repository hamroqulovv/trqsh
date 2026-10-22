"""Procedural renderer for the trqsh X ad. No footage, no images: every frame is drawn from code.

  python render_video.py --still 12.4 14.8     # PNG stills into --outdir (for look-dev)
  python render_video.py --encode out.mp4 --audio audio.wav
"""
import argparse
import math
import multiprocessing as mp
import os
import random
import subprocess
import sys
import time
from collections import deque

import cv2
import numpy as np

import gfx
from gfx import (BG, Frame, Motes, clamp, finish, in_cubic, inout_cubic, lerp, logo_mark, out_back,
                 out_cubic, out_expo, out_quint, prog, pulse, smooth, text_width)
from timeline import *  # noqa: F401,F403

MOTES = Motes(90, 5)
SCR = "!<>-_/[]{}=+*^?#%&0123456789abcdef"
MX = 130  # left margin


# =============================================================================
# shared building blocks
# =============================================================================
def eyebrow(F, t, t0, label, alpha=1.0):
    k = prog(t, t0, 0.55)
    if k <= 0:
        return
    n = int(k * len(label) + 0.5)
    rng = random.Random(int(t * 30) * 13 + 5)
    s = label[:n] + "".join(" " if c == " " else rng.choice(SCR) for c in label[n:])
    F.line(MX, 98, MX + 30, 98, 2, 150, alpha * k)
    F.text(s, MX + 46, 105, "mono", 20, 140, alpha * k, tracking=0.16)


def corners(F, alpha=1.0):
    m, ln = 56, 38
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        x = m if sx > 0 else W - m
        y = m if sy > 0 else H - m
        F.line(x, y, x + sx * ln, y, 2, 80, alpha)
        F.line(x, y, x, y + sy * ln, 2, 80, alpha)


def brand_tr(F, alpha=1.0):
    w = text_width("trqsh", "sans_b", 30, -0.065)
    F.text("trqsh", W - MX, 110, "sans_b", 30, 225, alpha, ax="r", tracking=-0.065)
    logo_mark(F, W - MX - w - 28, 98, 28, alpha=alpha)


def decode_text(target, n, seed):
    rng = random.Random(seed)
    return target[:n], "".join(rng.choice(SCR) for _ in target[n:])


def draw_decode(F, target, n, x, y, size, seed, font="mono_b", val=255, alpha=1.0, ax="l",
                tracking=0.0, pre=None):
    """Left-to-right decode. Unresolved characters flicker as noise glyphs."""
    done, rest = decode_text(target, n, seed)
    total = text_width(target, font, size, tracking)
    x0 = x - {"l": 0, "m": total / 2, "r": total}[ax]
    F.text(done, x0, y, font, size, val, alpha, tracking=tracking)
    if rest:
        F.text(rest, x0 + text_width(done, font, size, tracking), y, font, size, 120, alpha * 0.8,
               tracking=tracking)


def typed_line(F, t, prompt, cmd, times, x, y, size, font="mono_b", pval=110, cval=245, alpha=1.0,
               center=None, show_cursor=True, blink=True):
    full_w = text_width(prompt + cmd, font, size)
    if center is not None:
        x = center - full_w / 2
    n = revealed(times, t)
    F.text(prompt, x, y, font, size, pval, alpha)
    pw = text_width(prompt, font, size)
    s = cmd[:n]
    F.text(s, x + pw, y, font, size, cval, alpha)
    cx = x + pw + text_width(s, font, size)
    last = times[n - 1] if n else times[0] - 0.4
    typing = (t - last) < 0.5
    on = typing or (not blink) or ((t * 1.9) % 1.0) < 0.62
    if show_cursor and on:
        F.rrect(cx + 0.32 * size, y - 0.3 * size, 0.5 * size, 0.95 * size, 2, th=0, fill=240,
                fill_alpha=alpha)
    return cx, last


def wire_page(F, x, y, w, h, k, compact=False, shimmer=-1.0):
    """Abstract web page (bars and cards) revealed with progress k in [0,1]."""
    def part(i):
        return smooth((k * 8 - i * 0.7))

    pad = 16 if compact else 40
    s = 0.62 if compact else 1.0
    a = part(0)
    F.circle(x + pad + 10 * s, y + 30 * s + 6, 10 * s, val=210, alpha=a, fill=True)
    if not compact:
        for i in range(3):
            F.rrect(x + w - pad - 150 + i * 58 + 22, y + 36, 44, 10, 5, th=0, fill=75, fill_alpha=a)
    a = part(1)
    F.rrect(x + pad + (420 if not compact else 150) / 2, y + (100 if not compact else 72),
            420 if not compact else 150, 30 * s + 2, 14, th=0, fill=130, fill_alpha=a)
    a = part(2)
    F.rrect(x + pad + (300 if not compact else 108) / 2, y + (148 if not compact else 100),
            300 if not compact else 108, 30 * s + 2, 14, th=0, fill=88, fill_alpha=a)
    a = part(3)
    for j, ww in enumerate((360, 300) if not compact else (170, 130)):
        F.rrect(x + pad + ww / 2, y + (196 + 20 * j if not compact else 138 + 15 * j), ww,
                12 if not compact else 8, 4, th=0, fill=58, fill_alpha=a)
    a = part(4)
    bw, bh = (130, 44) if not compact else (92, 32)
    F.rrect(x + pad + bw / 2, y + (264 if not compact else 192), bw, bh, bh / 2, th=0, fill=236,
            fill_alpha=a)
    F.rrect(x + pad + bw / 2, y + (264 if not compact else 192), bw * 0.5, 7, 3.5, th=0, fill=40,
            fill_alpha=a)
    if not compact:
        cw = (w - 2 * pad - 32) / 3
        for i in range(3):
            a = part(5 + i * 0.5)
            cx = x + pad + cw / 2 + i * (cw + 16)
            F.rrect(cx, y + 352, cw, 84, 14, th=2, val=62, alpha=a, fill=25, fill_alpha=a)
            F.rrect(cx - cw / 2 + 50, y + 340, 60, 8, 4, th=0, fill=100, fill_alpha=a)
            F.rrect(cx - cw / 2 + 70, y + 362, 100, 8, 4, th=0, fill=52, fill_alpha=a)
    else:
        cw = w - 2 * pad
        for i in range(2):
            a = part(5 + i * 0.7)
            cy = y + 262 + i * 84
            F.rrect(x + pad + cw / 2, cy, cw, 72, 12, th=2, val=62, alpha=a, fill=25, fill_alpha=a)
            F.rrect(x + pad + 45, cy - 12, 50, 7, 3, th=0, fill=100, fill_alpha=a)
            F.rrect(x + pad + 66, cy + 10, 88, 7, 3, th=0, fill=52, fill_alpha=a)
    if shimmer >= 0:
        sx = x + shimmer * (w + 200) - 100
        F.emit(sx, y + h * 0.75, 70, 120, 0.05)


def bezier(p0, p1, p2, s):
    a = (1 - s) ** 2
    b = 2 * (1 - s) * s
    c = s * s
    return (a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1])


def packet(F, path, s, size=16, trail=9, val=255, alpha=1.0, glow=0.5):
    """A light packet with a motion trail travelling along a quadratic bezier path."""
    if s <= 0 or s >= 1.0001:
        return
    for i in range(trail, 0, -1):
        q = bezier(*path, clamp(s - i * 0.012))
        F.circle(q[0], q[1], size * (0.45 + 0.04 * (trail - i)) * 0.6, val=val,
                 alpha=alpha * 0.5 * (1 - i / (trail + 1)), fill=True)
    p = bezier(*path, clamp(s))
    F.rrect(p[0], p[1], size, size, size * 0.28, th=0, fill=val, fill_alpha=alpha)
    F.emit(p[0], p[1], size * 2.2, size * 2.2, glow * alpha)


# =============================================================================
# tunnel (rounded squares like the logo, flying toward the camera)
# =============================================================================
_rs = np.random.default_rng(9)
STREAK_ANG = _rs.uniform(0, 2 * math.pi, 150)
STREAK_PH = _rs.uniform(0, 1, 150)


def tunnel(F, t, u, v, A, max_val=230.0, streaks=True, cx=960.0, cy=540.0):
    if A <= 0.01:
        return
    fr = u % 1.0
    g, s0, N = 1.52, 36.0, 14
    for k in range(N):
        d = k - fr
        size = s0 * g ** d
        fin = smooth((size - 24) / 150.0)
        fout = 1 - smooth((size - 2600) / 5500.0)
        val = max_val * A * fin * fout
        if val < 4:
            continue
        sway = 90 * math.sin(0.6 * t + 0.42 * d) * max(0.0, 1 - d / N)
        swy = 40 * math.sin(0.45 * t + 0.31 * d + 1.0) * max(0.0, 1 - d / N)
        F.rrect(cx + sway, cy + swy, size * 1.78, size, 0.2 * size, th=clamp(size * 0.007, 1.5, 30),
                val=val)
    if streaks and v > 1.2:
        dl = clamp(v * 0.44 / 30 * 2.4, 0.0, 0.55)
        ramp = clamp((v - 1.2) / 4.0)
        for j in range(150):
            p = (STREAK_PH[j] + 0.5 * u) % 1.0
            r = 70 * (1500 / 70) ** p
            br = 255 * A * smooth(r / 160) * (1 - smooth((r - 900) / 700)) * ramp
            if br < 6:
                continue
            ca, sa = math.cos(STREAK_ANG[j]), math.sin(STREAK_ANG[j])
            r2 = r * (1 - dl)
            F.line(cx + ca * r2 * 1.5, cy + sa * r2 * 0.9, cx + ca * r * 1.5, cy + sa * r * 0.9,
                   1.0 + 1.6 * r / 1500, br)


# =============================================================================
# scenes. each returns the finishing parameters for the frame
# =============================================================================
def scene_void(F, t, ctx):
    MOTES.draw(F, t, 0.55 * smooth(t / 1.2))
    F.emit(960, 300, 560, 260, 0.045 * smooth(t / 2.0) * (0.85 + 0.15 * math.sin(t * 1.3)))
    out = 1 - 0.75 * smooth((t - 3.45) / 0.5)
    size, y = 84, 540
    full_w = text_width(STR_LOCAL, "mono", size)
    x0 = 960 - full_w / 2
    n = revealed(TYPING["local"], t)
    # corner brackets: the "private" box around the text
    bk = smooth((t - 0.4) / 0.9) * out
    bw, bh, ln = full_w / 2 + 70, 92, 34
    for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        px, py = 960 + sx * bw, y - 24 + sy * bh
        F.line(px, py, px - sx * ln, py, 2, 95, bk)
        F.line(px, py, px, py - sy * ln, 2, 95, bk)
    s = STR_LOCAL[:n]
    F.text(s, x0, y, "mono", size, 175, out)
    last = TYPING["local"][n - 1] if n else 0.5
    cur_on = t > 0.35 and ((t - last) < 0.5 or (t * 1.9) % 1.0 < 0.62)
    if cur_on:
        F.rrect(x0 + text_width(s, "mono", size) + 0.3 * size, y - 0.3 * size, 0.5 * size, 0.95 * size,
                2, th=0, fill=230, fill_alpha=out)
    F.mask_line("Only you can see it.", 960, 690, t, 2.55, 0.9, 44, "sans_l", val=150, alpha=out,
                tracking=-0.02, ax="m")
    return dict(cam=(1.0 + 0.05 * t / 4, 0, 0, 0), fade=smooth(t / 0.9), bloom=0.5, halo=0.5)


def scene_type(F, t, ctx):
    c = prog(t, 6.7, 1.3)
    MOTES.draw(F, t, 0.5)
    size, y = 108, 580
    full_w = text_width("$ " + STR_CMD, "mono_b", size)
    jit = 1.6 * c
    rng = random.Random(int(t * 30))
    # charging particles converge on the cursor line
    for i in range(130):
        r = random.Random(i * 31 + 7)
        ang, rad = r.uniform(0, 6.28), r.uniform(450, 1100)
        t0 = 6.55 + r.uniform(0, 0.8)
        k = in_cubic(prog(t, t0, 1.25))
        if k <= 0 or k >= 1:
            continue
        sx, sy = 960 + math.cos(ang) * rad * 1.3, 580 + math.sin(ang) * rad * 0.7
        px, py = lerp(sx, 960 + r.uniform(-300, 300) * (1 - k), k), lerp(sy, 640, k)
        F.circle(px, py, 1.6 + 1.5 * k, val=255, alpha=0.8 * math.sin(k * 3.14159) ** 0.5, fill=True)
    typed_line(F, t, "$ ", STR_CMD, TYPING["cmd"], 0, y + rng.uniform(-jit, jit), size,
               center=960 + rng.uniform(-jit, jit))
    last = TYPING["cmd"][-1]
    if t > last:
        ky = pulse(t, last, 0.08)
        F.emit(960 + full_w / 2, y - 30, 80, 60, 0.3 * ky)
    # underline: the charge builds
    if c > 0:
        half = full_w / 2 * 1.15 * out_cubic(c)
        F.line(960 - half, y + 38, 960 + half, y + 38, 2 + 2 * c, 255, c)
        F.emit(960, y + 38, half * 0.8, 6, 0.9 * c)
        F.emit(960, y, 700, 150, 0.14 * c)
    for kt in TYPING["cmd"]:
        if kt <= t:
            F.emit(960 + (text_width("$ " + STR_CMD[:revealed(TYPING["cmd"], kt)], "mono_b", size) - full_w / 2),
                   y - 30, 70, 50, 0.22 * pulse(t, kt, 0.07))
    z = 1.0 + 0.10 * smooth((t - 4.0) / 4.0)
    return dict(cam=(z, 0, 0, 0), bloom=0.6, halo=0.6)


def scene_tunnel(F, t, ctx):
    u, v = tunnel_flow(t)
    after = t >= T_HIT_URL
    A = smooth((t - 8.15) / 0.7)
    if after:
        A *= lerp(1.0, 0.30, smooth((t - T_HIT_URL) / 0.5))
    tunnel(F, t, u, v, A, max_val=230)
    flash = 0.0
    # the command line becomes a beam
    if t < 9.1:
        k = prog(t, 8.0, 0.5)
        size, y = 108, 580
        sxx = 1 + 2.2 * out_expo(k)
        F.text("$ " + STR_CMD, 960, y, "mono_b", size, 255, (1 - smooth(k * 2.4)), ax="m", sx=sxx)
        beam_a = 1 - smooth((t - 8.35) / 0.7)
        th = 7 - 5 * k
        F.line(0, 584, W, 584, th, 255, beam_a)
        F.emit(960, 584, 1300, 8 + 20 * (1 - k), 0.5 * beam_a)
    if t < 8.4:
        flash += 0.28 * math.exp(-(t - 8.0) / 0.07) * (t >= 8.0)
    # singularity builds, then white-out into the hit
    if 9.5 < t < T_HIT_URL:
        k = prog(t, 9.5, 2.5)
        F.emit(960, 540, 30 + 380 * k * k, 30 + 280 * k * k, 0.10 + 1.4 * k ** 3)
        F.emit(960, 540, 900 * k, 5, 1.6 * k ** 2)
    if T_HIT_URL - 0.45 < t < T_HIT_URL:
        flash += 0.95 * smooth((t - (T_HIT_URL - 0.45)) / 0.45)
    if t >= T_HIT_URL:
        d = t - T_HIT_URL
        flash += 1.0 * math.exp(-d / 0.20)
        F.emit(960, 540, 1500, 7, 1.6 * math.exp(-d / 0.7))
        F.emit(960, 540, 420, 260, 0.9 * math.exp(-d / 0.5))
        k = prog(t, T_HIT_URL, 0.9)
        if 0 < k < 1:
            sz = lerp(200, 3600, out_expo(k))
            F.rrect(960, 540, sz * 1.78, sz, 0.2 * sz, th=lerp(26, 2, k), val=255, alpha=(1 - k) ** 1.5)
        # the public URL
        n = revealed(DECODE_URL, t)
        if t >= DECODE_URL[0] - 0.04:
            size, y = 80, 556
            F.emit(960, 540, 760, 100, 0.20)
            draw_decode(F, STR_URL, n, 960, y, size, int(t * 30) * 7 + 1, ax="m")
            if n == len(STR_URL):
                w = text_width(STR_URL, "mono_b", size)
                k2 = out_expo(prog(t, DECODE_URL[-1] + 0.05, 0.5))
                F.line(960 - w / 2 * k2, y + 30, 960 + w / 2 * k2, y + 30, 2, 255, 0.9)
                F.emit(960, y + 30, w / 2 * k2, 5, 0.5 * k2)
        F.mask_line("One command. Public HTTPS URL.", 960, 680, t, 13.05, 0.8, 40, "sans_l",
                    val=175, tracking=-0.015, ax="m")
        F.text("localhost:3000", 960, 452, "mono", 26, 105, smooth((t - 13.0) / 0.5), ax="m",
               tracking=0.02)
    zoom = 1.0 + 0.04 * smooth((t - 8.0) / 3.5) + 0.10 * pulse(t, T_ENTER, 0.18) \
        + 0.14 * pulse(t, T_HIT_URL, 0.22)
    return dict(cam=(zoom, 0, 0, 0), flash=flash, bloom=0.7, halo=0.75)


def scene_share(F, t, ctx):
    tau = t - 14.0
    MOTES.draw(F, t, 0.35)
    eyebrow(F, t, 14.15, "01 / SHARE")
    corners(F, smooth(tau / 0.6))
    brand_tr(F, smooth(tau / 0.6))
    F.mask_line("Share what", MX, 400, t, 14.25, 0.8, 100, tracking=-0.045)
    F.mask_line("you’re building.", MX, 510, t, 14.38, 0.8, 100, tracking=-0.045)
    F.mask_line("Send a preview to a teammate,", MX, 606, t, 14.95, 0.7, 34, "sans_l", val=155,
                tracking=-0.01)
    F.mask_line("test on your phone, or demo your work.", MX, 652, t, 15.03, 0.7, 34, "sans_l",
                val=155, tracking=-0.01)
    k = prog(t, 16.0, 0.6)
    F.circle(MX + 5, 744, 4, val=255, alpha=k, fill=True)
    F.text("No deployment needed to share a preview.", MX + 24, 750, "mono", 20, 125, k)

    # browser window
    slide = 1 - out_expo(prog(t, 14.3, 0.9))
    bx, by, bw, bh = 1250 + 150 * slide + 14 * tau * -1 * 0.4, 500, 720, 460
    al = smooth(prog(t, 14.3, 0.5))
    x0, y0 = bx - bw / 2, by - bh / 2
    F.rrect(bx, by, bw, bh, 22, th=2, val=78, alpha=al, fill=17, fill_alpha=al)
    F.line(x0 + 2, y0 + 56, x0 + bw - 2, y0 + 56, 2, 45, al)
    for i in range(3):
        F.circle(x0 + 34 + i * 22, y0 + 28, 6, val=85, alpha=al, fill=True)
    F.rrect(x0 + 160 + 215, y0 + 28, 430, 32, 16, th=0, fill=29, fill_alpha=al)
    if t >= T_SHARE_ADDR:
        n = int((t - T_SHARE_ADDR) / 0.03)
        draw_decode(F, "your-app.trqsh.uz", min(n, 17), x0 + 188, y0 + 34, 18, int(t * 30) + 3,
                    font="mono", val=225)
    lp = prog(t, 15.0, 0.6)
    if 0 < lp < 1:
        F.line(x0 + 4, y0 + 57, x0 + 4 + (bw - 8) * out_cubic(lp), y0 + 57, 3, 255, 1 - lp ** 3)
        F.emit(x0 + 4 + (bw - 8) * out_cubic(lp), y0 + 57, 60, 8, 0.4)
    sh = prog(t, 16.6, 1.3)
    wire_page(F, x0, y0 + 58, bw, bh - 58, prog(t, 15.55, 0.95), shimmer=sh if 0 < sh < 1 else -1)

    # phone slides in over the corner of the window
    ps = 1 - out_expo(prog(t, T_PHONE_IN, 0.85))
    px, py, pw, ph = 1690 + 300 * ps - 10 * tau * 0.4, 600, 232, 470
    pa = smooth(prog(t, T_PHONE_IN, 0.4))
    if pa > 0:
        F.rrect(px, py, pw, ph, 38, th=3, val=125, alpha=pa, fill=14, fill_alpha=pa)
        F.rrect(px, py - ph / 2 + 18, 64, 12, 6, th=0, fill=42, fill_alpha=pa)
        F.rrect(px, py - ph / 2 + 56, 172, 26, 13, th=0, fill=29, fill_alpha=pa)
        if t > T_PHONE_IN + 0.3:
            F.text("your-app.trqsh.uz", px, py - ph / 2 + 61, "mono", 12, 215, pa, ax="m")
        wire_page(F, px - pw / 2, py - ph / 2 + 70, pw, ph - 70, prog(t, T_PHONE_IN + 0.45, 0.8),
                  compact=True)
    # pings travelling from the URL pill to the phone
    path = ((x0 + 560, y0 + 28), (1560, y0 - 70), (px, py - ph / 2 - 6))
    for pt in T_SHARE_PINGS:
        k = prog(t, pt - 0.5, 0.5)
        if 0 < k < 1:
            packet(F, path, out_cubic(k) * 0.98, size=12, trail=7, glow=0.4)
        if 0 <= t - pt < 0.7:
            kk = (t - pt) / 0.7
            F.circle(px, py - ph / 2 - 6, 14 + 90 * out_cubic(kk), th=2, val=255, alpha=(1 - kk) ** 1.5)
    return dict(cam=(1.0 + 0.03 * tau / 6, 0, -10 * tau / 6, 0), bloom=0.32, halo=0.3)


def scene_hooks(F, t, ctx):
    tau = t - 20.0
    MOTES.draw(F, t, 0.3)
    eyebrow(F, t, 20.15, "02 / WEBHOOKS")
    corners(F)
    brand_tr(F)
    F.mask_line("Bring webhooks", MX, 340, t, 20.22, 0.8, 92, tracking=-0.045)
    F.mask_line("to your desk.", MX, 442, t, 20.35, 0.8, 92, tracking=-0.045)
    F.mask_line("Receive events on localhost, inspect headers", MX, 530, t, 20.9, 0.7, 28, "sans_l",
                val=155, tracking=-0.005)
    F.mask_line("and payloads, and replay requests while you debug.", MX, 570, t, 20.98, 0.7, 28,
                "sans_l", val=155, tracking=-0.005)

    # inspector panel
    pcx, pcy, pw, ph = 1335, 475, 1000, 700
    slide = 1 - out_expo(prog(t, 20.15, 0.9))
    pcx += 120 * slide
    al = smooth(prog(t, 20.15, 0.5))
    x0, y0 = pcx - pw / 2, pcy - ph / 2
    F.rrect(pcx, pcy, pw, ph, 22, th=2, val=78, alpha=al, fill=17, fill_alpha=al)
    F.line(x0 + 2, y0 + 68, x0 + pw - 2, y0 + 68, 2, 45, al)
    F.text("Request inspector", x0 + 32, y0 + 44, "sans", 26, 210, al)
    live = 0.5 + 0.5 * math.sin(t * 5)
    F.circle(x0 + pw - 112, y0 + 34, 6, val=255, alpha=al * (0.4 + 0.6 * live), fill=True)
    F.text("LIVE", x0 + pw - 92, y0 + 41, "mono", 18, 160, al, tracking=0.12)
    divx = x0 + 450
    F.line(divx, y0 + 69, divx, y0 + ph - 2, 2, 40, al)

    # rows
    arrivals = PACKET_ARRIVALS + [REPLAY_ARRIVAL]
    paths = [((1990, 40), (1500, 70), (x0 + 130, y0 + 110))] * 3
    for i, ta in enumerate(PACKET_ARRIVALS):
        k = (t - (ta - PACKET_TRAVEL)) / PACKET_TRAVEL
        if 0 < k < 1:
            packet(F, paths[i], in_cubic(k) * 0.4 + out_cubic(k) * 0.6 if k < 1 else 1, size=20, trail=10)
    rows_y = {}
    for i, ta in enumerate(arrivals):
        if t < ta:
            continue
        later = sum(out_cubic(prog(t, tb, 0.38)) for tb in arrivals[i + 1:])
        ry = y0 + 68 + 90 * (0.5 + later)
        ra = smooth(prog(t, ta, 0.25))
        # newest rows slide in from the top
        ry -= (1 - out_cubic(prog(t, ta, 0.38))) * 30
        rows_y[i] = ry
        sel = (i == 2 and t >= T_SELECT_ROW) or (i == 3 and t >= REPLAY_ARRIVAL + 0.2 and False)
        if sel:
            sk = out_cubic(prog(t, T_SELECT_ROW, 0.3))
            F.rrect(x0 + 225, ry, 448, 86, 0, th=0, fill=33, fill_alpha=sk * al)
            F.line(x0 + 3, ry - 34, x0 + 3, ry + 34, 3, 255, sk)
        flash = pulse(t, ta, 0.14)
        F.rrect(x0 + 70, ry, 76, 34, 7, th=2, val=170, alpha=ra)
        F.text("POST", x0 + 70, ry + 7, "mono", 19, 225, ra, ax="m", tracking=0.06)
        F.text("/webhook", x0 + 126, ry + 9, "mono", 27, 240, ra)
        F.text("200", x0 + 428, ry + 8, "mono", 21, 170, ra, ax="r")
        if i == 3:
            F.text("REPLAY", x0 + 428, ry - 20, "mono", 13, 140, ra, ax="r", tracking=0.12)
        F.line(x0 + 20, ry + 43, x0 + 432, ry + 43, 1, 40, ra)
        if flash > 0.02:
            F.emit(x0 + 220, ry, 250, 42, 0.35 * flash)

    # request details
    dx = divx + 38
    if t >= T_SELECT_ROW:
        base = T_SELECT_ROW + 0.1
        lines = [
            (0, "POST /webhook", "mono_b", 30, 252, 0),
            (1, "200 OK", "mono", 22, 180, 0),
            (2, "HEADERS", "mono", 16, 110, 0.2),
            (3, "content-type", "mono", 20, 140, 0),
            (4, "x-signature", "mono", 20, 140, 0),
            (5, "BODY", "mono", 16, 110, 0.2),
        ]
        ys = [y0 + 140, y0 + 182, y0 + 252, y0 + 296, y0 + 336, y0 + 408]
        for (i, s, f, sz, v, tr), yy in zip(lines, ys):
            a = smooth(prog(t, base + 0.09 * i, 0.2))
            F.text(s, dx, yy, f, sz, v, a, tracking=tr)
        a = smooth(prog(t, base + 0.35, 0.2))
        F.text("application/json", dx + 200, y0 + 296, "mono", 20, 240, a)
        a = smooth(prog(t, base + 0.45, 0.2))
        F.text("9f2c…e41a", dx + 200, y0 + 336, "mono", 20, 240, a)
        body = ['{', '  "event": "payment.succeeded",', '  "id": "evt_1042"', '}']
        for j, s in enumerate(body):
            a = smooth(prog(t, base + 0.6 + 0.1 * j, 0.2))
            F.text(s, dx, y0 + 452 + 34 * j, "mono", 22, 230, a)
        # replay button
        press = prog(t, T_REPLAY_PRESS, 0.12)
        pulse_k = 0.5 + 0.5 * math.sin((t - 23.5) * 7) if 23.6 < t < T_REPLAY_PRESS else 0
        bxx, byy = x0 + pw - 36 - 100, y0 + ph - 62
        ba = smooth(prog(t, base + 1.0, 0.3))
        down = press > 0
        F.rrect(bxx, byy, 200, 60, 30, th=2, val=255 if down else 150 + 90 * pulse_k, alpha=ba,
                fill=240 if down else 18, fill_alpha=ba)
        F.text("Replay", bxx, byy + 9, "sans", 26, BG if down else 235, ba, ax="m")
        if down:
            F.emit(bxx, byy, 130, 40, 0.6 * pulse(t, T_REPLAY_PRESS, 0.2))
        # replay packet to localhost
        rpath = ((bxx, byy), (x0 + 200, 1090), (255, 905))
        k = prog(t, T_REPLAY_PRESS + 0.05, REPLAY_ARRIVAL - T_REPLAY_PRESS - 0.05)
        if 0 < k < 1:
            packet(F, rpath, in_cubic(k) * 0.35 + k * 0.65, size=20, trail=12)

    # localhost node
    na = smooth(prog(t, 20.8, 0.6))
    nx, ny = 200, 900
    logo_mark(F, nx, ny, 70, alpha=na)
    F.text("localhost:3000", nx + 56, ny + 9, "mono", 28, 190, na)
    for ta in PACKET_ARRIVALS + [REPLAY_ARRIVAL]:
        pass
    ping = pulse(t, REPLAY_ARRIVAL, 0.25)
    if t >= REPLAY_ARRIVAL:
        kk = prog(t, REPLAY_ARRIVAL, 0.8)
        F.circle(nx, ny, 34 + 130 * out_cubic(kk), th=2, val=255, alpha=(1 - kk) ** 1.5)
        F.emit(nx, ny, 160, 160, 0.5 * ping)
    return dict(cam=(1.0 + 0.03 * tau / 6, 0, 8 * tau / 6, 0), bloom=0.32, halo=0.3)


def scene_proto(F, t, ctx):
    tau = t - 26.0
    MOTES.draw(F, t, 0.3)
    eyebrow(F, t, 26.15, "03 / PROTOCOLS")
    corners(F)
    brand_tr(F)
    F.mask_line("Go beyond", MX, 340, t, 26.22, 0.8, 92, tracking=-0.045)
    F.mask_line("the browser.", MX, 442, t, 26.35, 0.8, 92, tracking=-0.045)
    F.mask_line("Connect SSH and databases with TCP.", MX, 520, t, 26.9, 0.7, 30, "sans_l", val=155,
                tracking=-0.005)
    names = ["HTTP", "HTTPS", "TCP", "UDP", "TLS"]
    cw, ch, gap = 300, 140, 36
    x_start = (W - (5 * cw + 4 * gap)) / 2 + cw / 2
    cy = 660
    sweep_x = lerp(-300, W + 300, prog(t, T_PROTO_SWEEP, 1.0))
    for i, (nm, tc) in enumerate(zip(names, CHIP_TIMES)):
        if t < tc:
            continue
        k = prog(t, tc, 0.22)
        sc = lerp(1.35, 1.0, out_back(k, 2.0))
        cx = x_start + i * (cw + gap)
        a = smooth(k * 2)
        flash = pulse(t, tc, 0.09)
        near = math.exp(-((cx - sweep_x) / 170) ** 2)
        F.rrect(cx, cy, cw * sc, ch * sc, 28 * sc, th=2, val=min(255, 105 + 150 * near + 120 * flash),
                alpha=a, fill=min(255, 20 + 60 * flash + 18 * near), fill_alpha=a)
        F.text(nm, cx, cy + 20 * sc, "mono_b", int(58), 255, a, ax="m", scale=sc, tracking=0.02)
        if flash > 0.02:
            F.emit(cx, cy, 160, 70, 0.22 * flash)
        if i >= 3:
            F.text("paid plans", cx, cy + 112, "mono", 20, 135, smooth(prog(t, tc + 0.25, 0.4)), ax="m",
                   tracking=0.1)
    if 0 < prog(t, T_PROTO_SWEEP, 1.0) < 1:
        F.emit(sweep_x, cy, 90, 150, 0.22)
    # TCP commands: SSH and a database
    for key, cmd, label, yy, tcol in (("tcp1", STR_TCP1, "SSH", 840, TYPING["tcp1"]),
                                      ("tcp2", STR_TCP2, "Database", 920, TYPING["tcp2"])):
        if t < tcol[0] - 0.3:
            continue
        a = smooth(prog(t, tcol[0] - 0.3, 0.3))
        done = t >= ENTER[key]
        cur = tcol[-1]
        typed_line(F, t, "$ ", cmd, tcol, x_start - cw / 2, yy, 36, alpha=a,
                   cval=255 if done else 235, show_cursor=not done)
        if done:
            k = prog(t, ENTER[key], 0.4)
            F.circle(x_start - cw / 2 - 28, yy - 12, 6, val=255, alpha=1, fill=True)
            F.emit(x_start - cw / 2 - 28, yy - 12, 40, 40, 0.5 * (1 - k) + 0.12)
            lw = text_width("$ " + cmd, "mono_b", 36)
            F.rrect(x_start - cw / 2 + lw + 70 + 20 * len(label) / 2, yy - 12, 44 + 20 * len(label), 42, 21,
                    th=2, val=170, alpha=out_cubic(k))
            F.text(label, x_start - cw / 2 + lw + 70 + 20 * len(label) / 2, yy - 4, "mono", 20, 235,
                   out_cubic(k), ax="m", tracking=0.1)
    return dict(cam=(1.0 + 0.03 * tau / 5, 0, 0, 0), bloom=0.32, halo=0.3)


def _scramble_host(F, t, t0, target, x, y, size, seed):
    n = int((t - t0) / 0.035)
    if t < t0:
        return
    draw_decode(F, target, min(n, len(target)), x, y, size, seed, ax="l")


def scene_domain(F, t, ctx):
    tau = t - 31.0
    MOTES.draw(F, t, 0.3)
    eyebrow(F, t, 31.1, "04 / DOMAINS")
    corners(F)
    brand_tr(F)
    F.mask_line("Make it yours.", 960, 290, t, 31.12, 0.9, 124, tracking=-0.05, ax="m")
    F.mask_line("Reserved subdomains. Custom domains.", 960, 358, t, 31.4, 0.7, 36, "sans_l", val=155,
                tracking=-0.01, ax="m")
    # command
    if t > TYPING["sub"][0] - 0.2:
        done = t >= ENTER["sub"]
        typed_line(F, t, "$ ", STR_SUB_CMD, TYPING["sub"], 0, 478, 34, center=960,
                   alpha=smooth(prog(t, TYPING["sub"][0] - 0.2, 0.25)), cval=255 if done else 235,
                   show_cursor=not done)
    # address pill
    pk = out_cubic(prog(t, 31.05, 0.5))
    pw_, ph_ = 1180, 130
    F.rrect(960, 640, pw_ * pk, ph_, 65, th=2, val=100, alpha=pk, fill=20, fill_alpha=pk)
    if t >= T_DOMAIN_URL1:
        if t < T_DOMAIN_URL2:
            host, t0, seed = "your-app.trqsh.uz", T_DOMAIN_URL1, 11
        elif t < T_DOMAIN_URL3:
            host, t0, seed = "myapp.trqsh.uz", T_DOMAIN_URL2, 12
        else:
            host, t0, seed = "app.yourdomain.com", T_DOMAIN_URL3, 13
        size = 56
        total = text_width("https://" + host, "mono_b", size)
        x0 = 960 - total / 2
        F.text("https://", x0, 659, "mono_b", size, 105)
        _scramble_host(F, t, t0, host, x0 + text_width("https://", "mono_b", size), 659, size,
                       int(t * 30) * 5 + seed)
        if t >= 32.85:
            F.emit(960, 640, 640, 70, 0.2)
        flash = pulse(t, t0, 0.12) if t0 > T_DOMAIN_URL1 else 0
        if flash > 0.02:
            F.emit(960, 640, 700, 90, 0.7 * flash)
    # tags
    for xx, label, active, end in ((640, "RESERVED SUBDOMAIN", T_DOMAIN_URL2, T_DOMAIN_URL3),
                                   (1280, "CUSTOM DOMAIN", T_DOMAIN_URL3, 99.0)):
        on = active <= t < end
        k = out_cubic(prog(t, active, 0.35))
        w = 56 + 17.5 * len(label)
        a = smooth(prog(t, 31.8, 0.5))
        F.rrect(xx, 790, w, 56, 28, th=2, val=lerp(85, 255, k), alpha=a, fill=lerp(14, 238, k) if on else 14,
                fill_alpha=a)
        F.text(label, xx, 798, "mono", 22, BG if (on and k > 0.5) else 150, a, ax="m", tracking=0.14)
        if on:
            F.emit(xx, 790, w * 0.6, 40, 0.5 * pulse(t, active, 0.2))
    return dict(cam=(1.0 + 0.03 * tau / 4, 0, 0, 0), bloom=0.32, halo=0.3)


def _qr_matrix():
    rng = random.Random(1409)
    n = 25
    m = [[1 if rng.random() < 0.47 else 0 for _ in range(n)] for _ in range(n)]
    fixed = [[False] * n for _ in range(n)]

    def finder(r0, c0):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0 + r, c0 + c
                if 0 <= rr < n and 0 <= cc < n:
                    fixed[rr][cc] = True
                    on = 0 <= r <= 6 and 0 <= c <= 6 and (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4))
                    m[rr][cc] = 1 if on else 0
    finder(0, 0)
    finder(0, n - 7)
    finder(n - 7, 0)
    for i in range(8, n - 8):
        m[6][i] = m[i][6] = 1 - (i % 2)
    return m, fixed


QR_M, QR_FIXED = _qr_matrix()


def scene_remote(F, t, ctx):
    tau = t - 35.0
    MOTES.draw(F, t, 0.3)
    eyebrow(F, t, 35.15, "05 / REMOTE")
    corners(F)
    brand_tr(F)
    F.mask_line("Control it", MX, 340, t, 35.2, 0.8, 92, tracking=-0.045)
    F.mask_line("from your phone.", MX, 442, t, 35.33, 0.8, 92, tracking=-0.045)
    F.mask_line("Pair a phone with /qr, then check status,", MX, 520, t, 35.85, 0.7, 28, "sans_l",
                val=155, tracking=-0.005)
    F.mask_line("start and stop tunnels.", MX, 560, t, 35.93, 0.7, 28, "sans_l", val=155,
                tracking=-0.005)

    # terminal with the QR code
    tx, ty, tw, th_ = 450, 815, 640, 340
    ta = smooth(prog(t, 35.3, 0.5))
    x0, y0 = tx - tw / 2, ty - th_ / 2
    F.rrect(tx, ty, tw, th_, 18, th=2, val=78, alpha=ta, fill=15, fill_alpha=ta)
    for i in range(3):
        F.circle(x0 + 28 + i * 20, y0 + 26, 5, val=85, alpha=ta, fill=True)
    F.line(x0 + 2, y0 + 50, x0 + tw - 2, y0 + 50, 2, 42, ta)
    typed_line(F, t, "$ ", STR_QR, TYPING["qr"], x0 + 30, y0 + 98, 30, alpha=ta,
               show_cursor=t < T_QR_BUILD[0])
    # qr modules appear in a diagonal wave
    mod, qx, qy = 7.8, x0 + 36, y0 + 116
    n = len(QR_M)
    F.rrect(qx + n * mod / 2, qy + n * mod / 2, n * mod + 20, n * mod + 20, 8, th=0, fill=226,
            fill_alpha=smooth(prog(t, T_QR_BUILD[0] - 0.05, 0.2)))
    wave = prog(t, *(T_QR_BUILD[0], T_QR_BUILD[1] - T_QR_BUILD[0]))
    scan_k = prog(t, T_QR_SCAN[0], T_QR_SCAN[1] - T_QR_SCAN[0])
    paired = t >= T_PAIRED
    for r in range(n):
        for c in range(n):
            if QR_M[r][c] and wave * 2.3 > (r + c) / (n * 2) * 2.3 + 0.0:
                if (r + c) / (2 * n - 2) <= wave:
                    v = 18
                    F.rrect(qx + c * mod + mod / 2, qy + r * mod + mod / 2, mod + 0.6, mod + 0.6, 1, th=0,
                            fill=v)
    # scan line
    if 0 < scan_k < 1:
        yy = qy - 10 + (n * mod + 20) * scan_k
        F.line(qx - 18, yy, qx + n * mod + 18, yy, 3, 255, 0.95)
        F.emit(qx + n * mod / 2, yy, n * mod * 0.8, 10, 0.9)
    # brackets
    if T_QR_SCAN[0] - 0.3 < t:
        bk = out_cubic(prog(t, T_QR_SCAN[0] - 0.3, 0.4))
        inset = 22 - 10 * bk
        ex = n * mod + 20
        for sx_, sy_ in ((0, 0), (1, 0), (0, 1), (1, 1)):
            px = qx - 10 + sx_ * ex + (inset if sx_ == 0 else -inset) * 0 + (-inset if sx_ == 0 else inset)
            py = qy - 10 + sy_ * ex + (-inset if sy_ == 0 else inset)
            dxs = 1 if sx_ == 0 else -1
            dys = 1 if sy_ == 0 else -1
            F.line(px, py, px + dxs * 26, py, 3, 255, bk)
            F.line(px, py, px, py + dys * 26, 3, 255, bk)

    # phone
    ps = 1 - out_expo(prog(t, T_PHONE_SLIDE, 0.9))
    pcx, pcy, pw, ph = 1430, 535 + 420 * ps, 360, 740
    pa = smooth(prog(t, T_PHONE_SLIDE, 0.3))
    if pa > 0:
        F.rrect(pcx, pcy, pw, ph, 52, th=3, val=130, alpha=pa, fill=14, fill_alpha=pa)
        F.rrect(pcx, pcy - ph / 2 + 24, 90, 16, 8, th=0, fill=42, fill_alpha=pa)
        sx0, sy0 = pcx - pw / 2, pcy - ph / 2
        F.text("trqsh", sx0 + 34, sy0 + 98, "sans_b", 30, 230, pa, tracking=-0.065)
        lit = 0.5 + 0.5 * math.sin(t * 4)
        if paired:
            F.circle(sx0 + pw - 140, sy0 + 88, 5, val=255, alpha=pa * (0.5 + 0.5 * lit), fill=True)
            F.text("connected", sx0 + pw - 124, sy0 + 94, "mono", 14, 170, pa)
        F.line(sx0 + 24, sy0 + 124, sx0 + pw - 24, sy0 + 124, 2, 42, pa)
        # transcript
        if paired:
            for i, (key, s) in enumerate((("phone1", STR_PHONE1), ("phone2", STR_PHONE2))):
                times = TYPING[key]
                yy = sy0 + 190 + i * 150
                F.text("$ ", sx0 + 34, yy, "mono_b", 24, 110, pa)
                nn = revealed(times, t)
                F.text(s[:nn], sx0 + 34 + text_width("$ ", "mono_b", 24), yy, "mono_b", 24, 245, pa)
                if nn == len(s) and t > times[-1] + 0.35:
                    k = prog(t, times[-1] + 0.35, 0.5)
                    for j, wf in enumerate((0.78, 0.55, 0.66)):
                        F.rrect(sx0 + 34 + (pw - 68) * wf * out_cubic(k) / 2, yy + 34 + j * 20,
                                (pw - 68) * wf * out_cubic(k), 9, 4, th=0, fill=62, fill_alpha=1)
            # input bar
            F.rrect(pcx, sy0 + ph - 74, pw - 52, 54, 27, th=2, val=70, alpha=pa, fill=22, fill_alpha=pa)
            cur_s = STR_PHONE1 if t < TYPING["phone2"][0] - 0.1 else STR_PHONE2
            tm = TYPING["phone1"] if cur_s == STR_PHONE1 else TYPING["phone2"]
            ii = revealed(tm, t)
            if t < tm[-1] + 0.35:
                F.text("$ " + cur_s[:ii], sx0 + 44, sy0 + ph - 66, "mono", 20, 200, pa)
        else:
            k = prog(t, T_PHONE_SLIDE + 0.5, 0.6)
            for j, wf in enumerate((0.7, 0.45)):
                F.rrect(sx0 + 34 + (pw - 68) * wf / 2, sy0 + 190 + j * 24, (pw - 68) * wf, 9, 4, th=0,
                        fill=45, fill_alpha=pa * k)
    # data link from the QR to the phone once paired
    if t >= T_PAIRED - 0.15:
        path = ((qx + n * mod + 14, qy + n * mod / 2), (900, 640), (pcx - 180, 620))
        k = prog(t, T_PAIRED - 0.15, 0.7)
        a = out_cubic(k)
        pts = [bezier(*path, i / 28) for i in range(29)]
        F.poly(pts[: int(29 * a)] if a > 0.05 else pts[:2], th=2, val=130, alpha=0.8)
        for j in range(3):
            s_ = ((t - T_PAIRED) * 0.9 + j / 3) % 1.0
            if t > T_PAIRED + 0.3:
                packet(F, path, s_, size=13, trail=6, glow=0.35)
        F.emit(pcx, pcy, 300, 340, 0.12 * pulse(t, T_PAIRED, 0.6))
    return dict(cam=(1.0 + 0.03 * tau / 5, 0, 0, 0), bloom=0.32, halo=0.3)


def scene_specs(F, t, ctx):
    tau = t - 40.0
    idx = min(int(tau / BEAT), len(SPEC_WORDS) - 1)
    word, t0 = SPEC_WORDS[idx], SPEC_TIMES[idx]
    # fast tunnel behind
    u = 40 + 1.0 * tau + 0.14 * tau * tau
    tunnel(F, t, u, 1.0 + 0.28 * tau, 0.26, max_val=200, streaks=False)
    d = t - t0
    base = 100
    wu = text_width(word, "sans_b", base, -0.05)
    size = int(clamp(1450 / wu * base, 80, 240))
    sc = 1 + 0.15 * (1 - out_expo(prog(t, t0, 0.17))) + 0.04 * d / BEAT
    F.emit(960, 570, 700, 130, 0.05 + 0.22 * pulse(t, t0, 0.1))
    F.text(word, 960, 610, "sans_b", size, 255, 1.0, ax="m", tracking=-0.05, scale=sc)
    w = wu * size / base * sc
    k = out_expo(prog(t, t0, 0.25))
    F.line(960 - w / 2 * k, 640, 960 + w / 2 * k, 640, 3, 255, 0.85 * (1 - smooth(d / BEAT * 0.6)))
    # counter and progress ticks
    F.text("%02d / %02d" % (idx + 1, len(SPEC_WORDS)), MX, 105, "mono", 20, 140, 1.0, tracking=0.16)
    brand_tr(F)
    corners(F)
    for i in range(len(SPEC_WORDS)):
        on = i <= idx
        F.rrect(MX + 18 + i * 44, 980, 32, 6, 3, th=0, fill=235 if on else 50)
    return dict(cam=(1.0 + 0.04 * (d / BEAT), 0, 0, 0), flash=0.08 * pulse(t, t0, 0.06), bloom=0.2,
                halo=0.2)


def scene_outro(F, t, ctx):
    tau = t - 44.0
    MOTES.draw(F, t, 0.45)
    cx, cy = 960, 395
    msize = 132
    wsize = 150
    wmw = text_width("trqsh", "sans_b", wsize, -0.065)
    gw = msize + 34 + wmw
    gx0 = 960 - gw / 2
    mx = gx0 + msize / 2
    flash = 0.0
    # 44.0-45.0: a point of light, a line, a square collapsing into the mark
    if t < T_LOGO_HIT:
        k = prog(t, 44.45, 0.55)
        if k > 0:
            F.emit(mx, cy, 20 + 500 * k * k, 6 + 22 * k, 0.05 + 1.1 * k ** 2)
            F.emit(mx, cy, 20 + 40 * k, 20 + 40 * k, 0.8 * k)
            sz = lerp(1700, msize * 1.2, in_cubic(k))
            F.rrect(mx, cy, sz, sz, sz * 0.25, th=lerp(2, 5, k), val=255, alpha=k)
    else:
        d = t - T_LOGO_HIT
        flash += 0.5 * math.exp(-d / 0.14)
        F.emit(mx, cy, 1500, 8, 1.2 * math.exp(-d / 0.8))
        F.emit(mx, cy, 360, 240, 0.45 * math.exp(-d / 0.6))
        for j, (dl, dur) in enumerate(((0.0, 0.9), (0.08, 1.1), (0.18, 1.3))):
            k = prog(t, T_LOGO_HIT + dl, dur)
            if 0 < k < 1:
                sz = lerp(msize, 2200, out_expo(k))
                F.rrect(mx, cy, sz, sz, sz * 0.25, th=lerp(10, 1.5, k), val=255, alpha=(1 - k) ** 1.6 * 0.9)
        logo_mark(F, mx, cy, msize * (1 + 0.1 * pulse(t, T_LOGO_HIT, 0.14)), draw=out_cubic(prog(t, T_LOGO_HIT + 0.05, 0.5)),
                  cursor=out_cubic(prog(t, T_LOGO_HIT + 0.45, 0.25)))
        # wordmark, letter by letter out of its own mask
        xs = gfx.char_xs("trqsh", "sans_b", wsize, -0.065)
        for i, ch in enumerate("trqsh"):
            ta = T_LOGO_LETTERS + 0.06 * i
            kk = out_expo(prog(t, ta, 0.55))
            if kk <= 0:
                continue
            F.text(ch, gx0 + msize + 34 + xs[i], cy + 51 + (1 - kk) * 150, "sans_b", wsize, 255, 1.0,
                   tracking=-0.065, clip=(0, int(cy - 90), W, int(cy + 82)))
        # blinking terminal cursor in the mark after it has drawn
        if t > 46.0 and int((t - 46.0) * 2) % 2 == 1:
            s = msize / 32
            ox, oy = mx - msize / 2, cy - msize / 2
            F.line(ox + 18 * s, oy + 22 * s, ox + 24 * s, oy + 22 * s, 2.3 * s, 255, 0.0)
    # tagline
    F.mask_line("Your localhost, live on the internet.", 960, 585, t, T_TAGLINE, 0.9, 56, "sans_l",
                val=205, tracking=-0.025, ax="m")
    # site
    if t >= T_SITE:
        n = int((t - T_SITE) / 0.05)
        a = smooth(prog(t, T_SITE, 0.2))
        draw_decode(F, "trqsh.uz", min(n, 8), 960, 706, 52, int(t * 30) + 77, ax="m", alpha=a)
        if n >= 8:
            w = text_width("trqsh.uz", "mono_b", 52)
            k = out_expo(prog(t, T_SITE + 0.45, 0.5))
            F.line(960 - w / 2 * k, 726, 960 + w / 2 * k, 726, 2, 230, 0.7)
    # install command in a pill
    pk = out_expo(prog(t, T_PILL, 0.5))
    if pk > 0:
        done = t >= TYPING["install"][-1] + 0.12
        hit = t >= T_FINAL_HIT
        bval = 255 if hit else (150 if done else 95)
        F.rrect(960, 835, 1180 * pk, 100, 28, th=2, val=bval, alpha=pk, fill=19, fill_alpha=pk)
        if pk > 0.9:
            typed_line(F, t, "$ ", STR_INSTALL, TYPING["install"], 0, 849, 36, font="mono", center=960,
                       pval=105, cval=240, show_cursor=True)
    if t >= T_FINAL_HIT:
        d = t - T_FINAL_HIT
        flash += 0.55 * math.exp(-d / 0.14)
        F.emit(960, 835, 900, 40, 0.5 * math.exp(-d / 0.8))
        F.emit(960, 520, 1200, 8, 1.0 * math.exp(-d / 0.9))
        F.emit(960, 520, 700, 420, 0.35 * math.exp(-d / 0.7))
        k = prog(t, T_FINAL_HIT, 1.2)
        if 0 < k < 1:
            sz = lerp(300, 2600, out_expo(k))
            F.rrect(960, 520, sz * 1.78, sz, 0.2 * sz, th=lerp(8, 1.5, k), val=255, alpha=(1 - k) ** 1.8 * 0.8)
        a = smooth(prog(t, T_FINAL_HIT + 0.3, 0.6))
        F.text("Free plan  ·  No credit card", 960, 948, "mono", 28, 150, a, ax="m", tracking=0.06)
    zoom = 1.0 + 0.05 * tau / 12 + 0.06 * pulse(t, T_LOGO_HIT, 0.2) + 0.05 * pulse(t, T_FINAL_HIT, 0.25)
    fade = 1.0 - smooth((t - T_FADE_OUT) / (DURATION - T_FADE_OUT))
    return dict(cam=(zoom, 0, 0, 0), flash=flash, fade=fade, bloom=0.4, halo=0.4)


SCENE_FUNCS = [
    ("void", scene_void, False), ("type", scene_type, False), ("tunnel", scene_tunnel, False),
    ("share", scene_share, True), ("hooks", scene_hooks, True), ("proto", scene_proto, True),
    ("domain", scene_domain, True), ("remote", scene_remote, True), ("specs", scene_specs, False),
    ("outro", scene_outro, False),
]

# camera shake / flash / glitch events (time, amplitude)
SHAKES = [(8.0, 0.55), (12.0, 1.0), (45.0, 1.0), (52.0, 1.2), (T_PHONE_IN, 0.2)] + \
    [(c, 0.35) for c in CUTS] + [(x, 0.30) for x in SPEC_TIMES[1:]] + [(44.0, 0.2), (4.0, 0.25)]
TRANSITIONS = [4.0, 14.0, 20.0, 26.0, 31.0, 35.0, 40.0, 44.0]


def render_frame(idx):
    t = idx / FPS
    name, fn, grid = next((n, f, g) for (n, f, g) in SCENE_FUNCS
                          if SCENES[n][0] <= t < SCENES[n][1] + (1e-9 if n == "outro" else 0))
    F = Frame(grid=grid)
    P = fn(F, t, None)
    # transition glitch
    rng = random.Random(idx * 97 + 13)
    gl = 0.0
    for tc in TRANSITIONS:
        d = t - tc
        if -0.10 <= d < 0:
            gl = max(gl, 0.7 * (1 + d / 0.10))
        elif 0 <= d < 0.28:
            gl = max(gl, math.exp(-d / 0.07))
    gl = max(gl, 0.9 if 3.9 <= t < 4.0 else 0)
    if gl > 0.08:
        F.glitch(min(gl, 1.0), rng)
        P["flash"] = P.get("flash", 0.0) + 0.10 * gl
    # shake
    z, rot, tx, ty = P.get("cam", (1.0, 0, 0, 0))
    for ts, amp in SHAKES:
        d = t - ts
        if 0 <= d < 1.2:
            e = amp * math.exp(-d / 0.17)
            tx += 22 * e * math.sin(d * 61 + 1.3)
            ty += 22 * e * math.sin(d * 47 + 0.2)
            rot += 0.9 * e * math.sin(d * 39)
            z += 0.02 * e
    P["cam"] = (z, rot, tx, ty)
    P["seed"] = idx
    return finish(F, **P)


def _work(idx):
    return render_frame(idx)


def encode(out, audio, workers, start=0, count=None):
    from ffmpeg_path import find_ffmpeg
    ff = find_ffmpeg()
    n = N_FRAMES if count is None else count
    cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-i", audio]
    cmd += ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
            "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.2",
            "-tune", "film", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-color_range", "tv", "-g", "60", "-movflags", "+faststart"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest"]
    cmd += [out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    # bounded window: at most `window` finished frames (6 MB each) wait for the encoder
    window = workers * 2
    with mp.Pool(workers) as pool:
        pending = deque()
        nxt, end = start, start + n
        while nxt < end and len(pending) < window:
            pending.append(pool.apply_async(_work, (nxt,)))
            nxt += 1
        i = 0
        while pending:
            p.stdin.write(pending.popleft().get())
            if nxt < end:
                pending.append(pool.apply_async(_work, (nxt,)))
                nxt += 1
            if i % 60 == 0:
                el = time.time() - t0
                print(f"frame {i}/{n}  {el:5.0f}s  ~{el / max(i, 1) * (n - i):4.0f}s left", flush=True)
            i += 1
    p.stdin.close()
    p.wait()
    print("encoded", out, "in", round(time.time() - t0), "s")


def stills(times, outdir):
    os.makedirs(outdir, exist_ok=True)
    for tt in times:
        idx = int(round(tt * FPS))
        buf = render_frame(idx)
        img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)[..., ::-1]
        cv2.imwrite(os.path.join(outdir, f"t{tt:06.2f}.png"), img)
        print("wrote", tt)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", nargs="*", type=float)
    ap.add_argument("--outdir", default="stills")
    ap.add_argument("--encode")
    ap.add_argument("--audio")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 4) - 3))
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--count", type=int)
    a = ap.parse_args()
    if a.still:
        stills(a.still, a.outdir)
    if a.encode:
        encode(a.encode, a.audio, a.workers, a.start, a.count)

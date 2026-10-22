"""Procedural sound design for the trqsh X ad.

Every sample is computed here: oscillators, noise, filters, envelopes, reverb.
No recordings, no sample libraries, no existing audio. Event times come from
timeline.py so the sound lands on the same frames as the picture.

  python synth_audio.py out.wav
"""
import math
import subprocess
import sys

import numba as nb
import numpy as np
from scipy import signal as sg
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d

from timeline import *  # noqa: F401,F403

N = int(DURATION * SR)
rng = np.random.default_rng(20241022)
TAU = 2.0 * math.pi


# =============================================================================
# DSP primitives
# =============================================================================
@nb.njit(cache=True)
def svf(x, fc, q, mode):
    """Trapezoidal state-variable filter. mode 0=lowpass 1=bandpass 2=highpass; fc per sample."""
    n = x.shape[0]
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        f = fc[i]
        if f > 20000.0:
            f = 20000.0
        if f < 10.0:
            f = 10.0
        g = math.tan(math.pi * f / 48000.0)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v1
        else:
            y[i] = x[i] - k * v1 - v2
    return y


@nb.njit(cache=True)
def saw_osc(freq):
    """Band-limited (PolyBLEP) sawtooth with per-sample frequency."""
    n = freq.shape[0]
    y = np.empty(n)
    ph = 0.0
    for i in range(n):
        dt = freq[i] / 48000.0
        v = 2.0 * ph - 1.0
        if ph < dt:
            x = ph / dt
            v -= x + x - x * x - 1.0
        elif ph > 1.0 - dt:
            x = (ph - 1.0) / dt
            v -= x * x + x + x + 1.0
        y[i] = v
        ph += dt
        if ph >= 1.0:
            ph -= 1.0
    return y


@nb.njit(cache=True)
def release_follow(g, rel):
    """Instant attack, exponential release: used by the limiter."""
    out = np.empty_like(g)
    cur = 1.0
    for i in range(g.shape[0]):
        if g[i] < cur:
            cur = g[i]
        else:
            cur = cur + (g[i] - cur) * rel
            if cur > g[i]:
                cur = g[i]
        out[i] = cur
    return out


def T(d):
    return np.arange(int(d * SR)) / SR


def C(n, v):
    return np.full(n, float(v))


def hz(note):  # MIDI note -> Hz
    return 440.0 * 2 ** ((note - 69) / 12.0)


def sine_sweep(dur, f0, f1, power=1.0):
    n = int(dur * SR)
    x = np.arange(n) / n
    f = f0 + (f1 - f0) * x ** power
    return np.sin(np.cumsum(TAU * f / SR))


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


# =============================================================================
# Sound building blocks (each returns a numpy array)
# =============================================================================
def key_click(strength=1.0, heavy=False):
    n = int(0.11 * SR)
    t = np.arange(n) / SR
    nz = rng.standard_normal(n)
    tick = svf(nz, C(n, rng.uniform(3000, 4800)), 0.9, 2) * np.exp(-t / 0.0035)
    body = np.sin(TAU * rng.uniform(1500, 2300) * t) * np.exp(-t / 0.0055) * 0.55
    f_th = 105 if heavy else rng.uniform(150, 215)
    thunk = np.sin(TAU * f_th * t) * np.exp(-t / (0.040 if heavy else 0.017)) * (1.0 if heavy else 0.75)
    return (0.75 * tick + body + thunk) * strength


def kick(gain=1.0, dur=0.45, f_end=44.0, punch=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f_end + 110 * np.exp(-t / 0.032)
    y = np.sin(np.cumsum(TAU * f / SR)) * np.exp(-t / 0.15)
    y += 0.35 * punch * svf(rng.standard_normal(n), C(n, 2500), 0.8, 2) * np.exp(-t / 0.003)
    return np.tanh(1.6 * y) * gain


def sub_boom(dur=2.4, gain=1.0, f0=95.0, f_end=30.0, decay=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f_end + (f0 - f_end) * np.exp(-t / 0.14)
    y = np.sin(np.cumsum(TAU * f / SR)) * np.exp(-t / decay)
    y = np.tanh(2.2 * y)
    y *= np.minimum(1.0, t / 0.002)
    return y * gain


def crack(dur=0.3, gain=1.0, lo=900.0, decay=0.07):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = svf(rng.standard_normal(n), C(n, lo), 0.7, 2) * np.exp(-t / decay)
    return y * gain


def crash(dur=3.0, gain=1.0, lo=3500.0, decay=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = rng.standard_normal((2, n))
    out = np.stack([svf(nz[0], C(n, lo), 0.6, 2), svf(nz[1], C(n, lo), 0.6, 2)])
    env = np.exp(-t / decay) * np.minimum(1.0, t / 0.004)
    return out * env * gain


def hat(open_=False, gain=1.0):
    d = 0.22 if open_ else 0.045
    n = int(d * SR)
    t = np.arange(n) / SR
    y = svf(rng.standard_normal(n), C(n, 7500), 0.8, 2) * np.exp(-t / (0.07 if open_ else 0.011))
    return y * gain


def clap(gain=1.0):
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    nz = svf(rng.standard_normal(n), C(n, 1700), 0.8, 1)
    env = np.zeros(n)
    for off in (0.0, 0.010, 0.021):
        i = int(off * SR)
        env[i:] += np.exp(-t[: n - i] / 0.006) * 0.8
    env += np.exp(-t / 0.07) * np.minimum(1.0, t / 0.025) * 0.5
    return np.tanh(2 * nz * env) * gain


def tick(freq, gain=1.0, dur=0.05):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(TAU * freq * t) * np.exp(-t / 0.009) + 0.3 * np.sin(TAU * freq * 2.01 * t) * np.exp(-t / 0.005)
    return y * gain


def ping(freq, gain=1.0, dur=1.4, decay=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.sin(TAU * freq * t) + 0.35 * np.sin(TAU * freq * 2.0 * t) * np.exp(-t / 0.2) \
        + 0.15 * np.sin(TAU * freq * 3.01 * t) * np.exp(-t / 0.12)
    return y * np.exp(-t / decay) * np.minimum(1.0, t / 0.003) * gain


def bell(freq, gain=1.0, dur=3.0, decay=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, a, d in ((1.0, 1.0, 1.0), (2.76, 0.5, 0.6), (5.4, 0.28, 0.35), (8.93, 0.15, 0.2)):
        y += a * np.sin(TAU * freq * ratio * t) * np.exp(-t / (decay * d))
    return y * np.minimum(1.0, t / 0.002) * gain


def whoosh(dur, f0, f1, q=1.1, peak=0.5, power=1.4, gain=1.0, stereo=True):
    n = int(dur * SR)
    x = np.arange(n) / n
    fc = f0 * (f1 / f0) ** x
    ch = 2 if stereo else 1
    out = np.stack([svf(rng.standard_normal(n), fc, q, 1) for _ in range(ch)])
    warp = x ** (math.log(0.5) / math.log(max(min(peak, 0.97), 0.03)))
    env = np.sin(math.pi * warp) ** power
    out = out * env * gain * 2.2
    return out if stereo else out[0]


def riser_noise(dur, f0, f1, gain=1.0, power=2.2):
    n = int(dur * SR)
    x = np.arange(n) / n
    fc = f0 * (f1 / f0) ** x
    out = np.stack([svf(rng.standard_normal(n), fc, 1.6, 1) for _ in range(2)])
    return out * (x ** power) * gain * 2.4


def saw_sweep(dur, f0, f1, gain=1.0, power=2.0, cutoff_mul=6.0):
    n = int(dur * SR)
    x = np.arange(n) / n
    f = f0 * (f1 / f0) ** x
    outs = []
    for det in (0.996, 1.004):
        s = saw_osc(f * det)
        outs.append(svf(s, f * cutoff_mul, 0.9, 0))
    return np.stack(outs) * (x ** power) * gain


def glitch_zap(dur=0.16, gain=1.0):
    n = int(dur * SR)
    nz = rng.standard_normal(n)
    hold = int(rng.integers(6, 36))
    y = np.repeat(nz[::hold], hold)[:n]
    y = np.round(y * 2.0) / 2.0
    gate = np.ones(n)
    pos = 0
    while pos < n:
        ln = int(rng.integers(120, 700))
        if rng.random() < 0.45:
            gate[pos:pos + ln] = 0
        pos += ln
    t = np.arange(n) / SR
    return y * gate * np.exp(-t / (dur * 0.6)) * gain * 0.7


def thump(freq=62.0, gain=1.0, dur=0.22):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1.0 + 0.7 * np.exp(-t / 0.02))
    return np.sin(np.cumsum(TAU * f / SR)) * np.exp(-t / 0.06) * gain


def bass_note(f, dur=0.3, gain=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = saw_osc(C(n, f))
    s = svf(s, 130 + 1100 * np.exp(-t / 0.07), 1.4, 0)
    sub = np.sin(TAU * f * t)
    env = np.minimum(1.0, t / 0.004) * np.exp(-t / (dur * 0.5))
    return (0.55 * s + 0.85 * sub) * env * gain


def pad_chord(freqs, dur, attack, release, cut0, cut1, gain=1.0, detune=0.0045):
    n = int((dur + release) * SR)
    out = np.zeros((2, n))
    for f in freqs:
        for side, d in enumerate((-detune, detune)):
            s = saw_osc(C(n, f * (1 + d)))
            out[side] += s
            out[1 - side] += s * 0.35
    fc = np.linspace(cut0, cut1, n)
    for ch in range(2):
        out[ch] = svf(out[ch], fc, 0.7, 0)
    tt = np.arange(n) / SR
    env = np.interp(tt, [0, attack, dur, dur + release], [0, 1, 1, 0])
    env = smoothstep(env)
    return out * env * gain / max(1, len(freqs))


def reverb_ir(rt, seed=0):
    r = np.random.default_rng(seed)
    n = int(rt * 1.1 * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for ch in range(2):
        nz = r.standard_normal(n)
        lo = svf(nz, C(n, 600), 0.7, 0) * np.exp(-6.9 * t / rt)
        mid = svf(nz, C(n, 3000), 0.7, 0) * np.exp(-6.9 * t / (rt * 0.62))
        hi = svf(nz, C(n, 9000), 0.7, 2) * np.exp(-6.9 * t / (rt * 0.28))
        ir[ch] = lo * 1.0 + mid * 0.7 + hi * 0.35
        ir[ch] *= np.minimum(1.0, t / 0.012)
    pre = int(0.022 * SR)
    ir = np.concatenate([np.zeros((2, pre)), ir], axis=1)
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True)) + 1e-9
    return ir


def apply_reverb(x, rt, seed):
    ir = reverb_ir(rt, seed)
    out = np.stack([sg.fftconvolve(x[ch], ir[ch])[: x.shape[1]] for ch in range(2)])
    return out


# =============================================================================
# mixer
# =============================================================================
class Mix:
    def __init__(self):
        self.dry = np.zeros((2, N))
        self.rev_short = np.zeros((2, N))   # small room: UI sounds
        self.rev_long = np.zeros((2, N))    # hall: hits, pads, bells

    def add(self, sig, t0, gain=1.0, pan=0.0, short=0.0, long=0.0):
        sig = np.asarray(sig, dtype=np.float64)
        if sig.ndim == 1:
            a = (pan + 1) * math.pi / 4
            sig = np.stack([sig * math.cos(a), sig * math.sin(a)]) * math.sqrt(2.0) * 0.7071
        i0 = int(round(t0 * SR))
        if i0 >= N or i0 + sig.shape[1] <= 0:
            return
        s0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(sig.shape[1] - s0, N - i0)
        seg = sig[:, s0:s0 + n] * gain
        self.dry[:, i0:i0 + n] += seg
        if short:
            self.rev_short[:, i0:i0 + n] += seg * short
        if long:
            self.rev_long[:, i0:i0 + n] += seg * long


def duck(buf, t0, t1, floor=0.0, rel=0.04):
    """Silence a window (the 'breath' before a hit)."""
    i0, i1 = int(t0 * SR), int(t1 * SR)
    g = np.ones(N)
    g[i0:i1] = floor
    j = int(0.012 * SR)
    g[max(0, i0 - j):i0] = np.linspace(1, floor, i0 - max(0, i0 - j))
    buf *= g


# =============================================================================
# the score and the effects, scene by scene
# =============================================================================
CHORDS = {
    "Am": ([45, 48, 52, 57], 33),   # A2 C3 E3 A3, bass A1
    "F":  ([41, 45, 48, 53], 29),   # F2 A2 C3 F3, bass F1
    "C":  ([48, 52, 55, 60], 36),   # C3 E3 G3 C4, bass C2
    "G":  ([43, 47, 50, 55], 31),   # G2 B2 D3 G3, bass G1
}
PROG = ["Am", "F", "C", "G"]


def typing_clicks(m, times, gain, pan=0.0, short=0.08):
    for i, tt in enumerate(times):
        m.add(key_click(gain * rng.uniform(0.75, 1.1)), tt, 1.0, pan + rng.uniform(-0.12, 0.12), short=short)


def decode_ticks(m, t0, n, step, f0, f1, gain=0.05, pan=0.0):
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / max(1, n - 1))
        m.add(tick(f, 1.0), t0 + i * step, gain, pan * (1 if i % 2 else -1), short=0.12)


def build():
    m = Mix()
    music = Mix()

    # ---------------------------------------------------------------- 0-8 void + typing
    # drone: sub + slow, darkening pad that opens up
    n = int(8.4 * SR)
    t = np.arange(n) / SR
    sub = np.sin(TAU * 55.0 * t) * (0.8 + 0.2 * np.sin(TAU * 0.11 * t))
    sub *= smoothstep((t - 0.2) / 2.0)
    music.add(sub, 0.0, 0.20, long=0.0)
    music.add(pad_chord([hz(x) for x in (33, 40, 45, 52)], 8.0, 2.5, 1.4, 160, 1500, gain=1.0), 0.2, 0.2, long=0.35)
    air = np.stack([svf(rng.standard_normal(n), C(n, 700), 0.7, 0) for _ in range(2)])
    music.add(air * smoothstep((t - 0.5) / 3.0), 0.0, 0.012)

    typing_clicks(m, TYPING["local"], 0.075, short=0.12)
    typing_clicks(m, TYPING["cmd"], 0.2, short=0.10)
    m.add(ping(1760, 1.0, 2.2, 0.5), 1.1, 0.035, pan=0.5, long=0.8)
    m.add(ping(1318.5, 1.0, 2.2, 0.5), 2.62, 0.04, pan=-0.4, long=0.8)
    m.add(whoosh(0.7, 500, 2200, 1.2, 0.55, 1.6), 2.5, 0.05, long=0.3)
    m.add(glitch_zap(0.22, 1.0), 3.9, 0.22, short=0.1)
    m.add(thump(55, 1.0, 0.3), 4.0, 0.4)

    # heartbeat that accelerates into the command
    tt, dt = 4.9, 1.05
    while tt < 7.8:
        gain = 0.30 + 0.35 * (tt - 4.9) / 3.0
        m.add(thump(58, 1.0, 0.2), tt, gain)
        m.add(thump(52, 1.0, 0.2), tt + dt * 0.17, gain * 0.7)
        tt += dt
        dt *= 0.925
    # charge: noise sweep and rising saw, cut dead at Enter
    m.add(riser_noise(1.35, 400, 7000, 0.07, 2.6), 6.65, 1.0, long=0.2)
    m.add(saw_sweep(1.35, 110, 660, 0.05, 2.2, 5.0), 6.65, 1.0, long=0.2)
    m.add(tick(2400, 1.0), TYPING["cmd"][-1] + 0.2, 0.05, short=0.3)

    # ENTER
    m.add(key_click(0.55, heavy=True), ENTER["cmd"], 1.0, short=0.2)
    m.add(sub_boom(1.0, 0.7, 70, 38, 0.35), ENTER["cmd"], 1.0, long=0.2)
    m.add(whoosh(0.9, 9000, 300, 0.9, 0.12, 1.6), ENTER["cmd"] + 0.02, 0.16, long=0.35)

    # ---------------------------------------------------------------- 8.1-12 tunnel
    dur = T_HIT_URL - 8.2
    m.add(whoosh(dur - 0.08, 260, 11000, 1.4, 0.93, 2.4, stereo=True), 8.2, 0.26, long=0.15)
    m.add(riser_noise(dur - 0.05, 500, 9000, 0.06, 2.6), 8.25, 1.0, long=0.25)
    music.add(saw_sweep(dur - 0.05, 55, 1320, 0.10, 2.4, 4.0), 8.2, 1.0, long=0.3)
    music.add(sine_sweep(dur - 0.05, 90, 440, 3.0) * (np.linspace(0, 1, int((dur - 0.05) * SR)) ** 2), 8.2, 0.12)
    # ring-pass pulses locked to the tunnel flow
    last = int(tunnel_flow(8.2)[0])
    x = 8.2
    while x < T_HIT_URL - 0.1:
        x += 1.0 / 960
        u, v = tunnel_flow(x)
        if int(u) > last:
            last = int(u)
            k = (x - 8.2) / (T_HIT_URL - 8.2)
            m.add(tick(900 + 2600 * k, 1.0, 0.04), x, 0.05 + 0.10 * k, pan=math.sin(x * 9) * 0.5, short=0.15)
    duck_ranges = [(T_HIT_URL - 0.14, T_HIT_URL)]

    # THE HIT: public URL
    h = T_HIT_URL
    m.add(sub_boom(3.2, 1.0, 100, 31, 1.1), h, 1.0, long=0.3)
    m.add(crack(0.35, 0.9, 700, 0.09), h, 0.8, long=0.5)
    m.add(crash(2.8, 1.0, 4000, 0.9), h, 0.28, long=0.4)
    m.add(kick(1.0), h, 0.9)
    m.add(pad_chord([hz(x) for x in (33, 45, 52, 57, 60)], 2.2, 0.01, 1.8, 600, 300, gain=1.0), h, 0.5, long=0.6)
    m.add(ping(220, 1.0, 3.0, 1.0), h, 0.12, long=0.9)
    decode_ticks(m, DECODE_URL[0], len(DECODE_URL), 0.035, 1500, 3800, 0.065, pan=0.35)
    m.add(bell(hz(81), 1.0, 3.0, 1.1), 13.05, 0.05, pan=0.2, long=0.9)   # E6
    m.add(bell(hz(88), 1.0, 3.0, 1.1), 13.20, 0.045, pan=-0.2, long=0.9)  # G7... A bright shimmer
    m.add(whoosh(0.9, 2000, 600, 1.0, 0.3, 1.5), 13.05, 0.05, long=0.3)

    # ---------------------------------------------------------------- 12-44 groove
    def chord_at(b):  # b = bar index of 2s from 12.0; chord changes every 2 bars
        return PROG[(b // 2) % 4]

    # pads: chord per 4 seconds, crossfading
    for i, start in enumerate(range(12, 44, 4)):
        name = PROG[i % 4]
        notes, _ = CHORDS[name]
        fr = [hz(x) for x in notes]
        lvl = 0.27 if start >= 28 else 0.21
        music.add(pad_chord(fr, 4.0, 1.2 if start > 12 else 1.6, 1.6, 700, 1500 if start < 36 else 2300, 1.0),
                  float(start), lvl, long=0.4)
        # a soft sub on the root
    for i, start in enumerate(range(12, 44, 4)):
        root = CHORDS[PROG[i % 4]][1]
        n_ = int(4.2 * SR)
        tt_ = np.arange(n_) / SR
        s = np.sin(TAU * hz(root) * tt_) * smoothstep(tt_ / 0.3) * smoothstep((4.2 - tt_) / 0.3)
        music.add(s, float(start), 0.10 if start < 14 else 0.0)

    # bass pulse (8ths), kick (4 on the floor), hats, claps, arp
    arp_pat = [0, 2, 1, 3, 2, 1, 3, 1]
    arp = Mix()
    t0_ = 14.0
    step = BEAT / 2
    k = 0
    while t0_ < 43.99:
        bar_chord = CHORDS[PROG[int((t0_ - 12.0) // 4) % 4]]
        root_f = hz(bar_chord[1])
        on_beat = abs((t0_ / BEAT) - round(t0_ / BEAT)) < 1e-6
        beat_i = int(round(t0_ / BEAT))
        lvl = 0.55 if t0_ < 20 else 0.8
        if t0_ >= 40:
            lvl = 1.0
        if on_beat:
            music.add(kick(1.0), t0_, (0.34 if t0_ < 20 else 0.5) * (1.1 if t0_ >= 40 else 1.0))
            if t0_ >= 26 and beat_i % 2 == 1:
                music.add(clap(1.0), t0_, 0.16, short=0.15, long=0.2)
        else:
            if t0_ >= 20:
                music.add(hat(False, 1.0), t0_, 0.05 if t0_ < 36 else 0.07, pan=0.3, short=0.05)
        music.add(bass_note(root_f * (2 if (k % 4 == 3) else 1), 0.34, 1.0), t0_, 0.27 * lvl if on_beat else 0.18 * lvl)
        if t0_ >= 26 and t0_ < 40:
            for sub in (0, 1):
                tt2 = t0_ + sub * step / 2
                idx = arp_pat[(k * 2 + sub) % 8]
                nf = hz(bar_chord[0][idx] + 24)
                tri = (np.sin(TAU * nf * T(0.22)) + 0.3 * np.sin(TAU * nf * 2 * T(0.22))) * np.exp(-T(0.22) / 0.06)
                arp.add(tri, tt2, 0.045, pan=-0.5 + 0.2 * idx)
        t0_ += step
        k += 1
    # dotted-8th echo on the arp (ping-pong)
    src = arp.dry.copy()
    echo = src.copy()
    for rep_, g in ((1, 0.55), (2, 0.30), (3, 0.16)):
        d = int(0.375 * SR * rep_)
        echo[0, d:] += src[1, :-d] * g
        echo[1, d:] += src[0, :-d] * g
    music.dry += echo
    music.rev_long += echo * 0.25

    # build into the montage: snare roll and riser from 38 to 40
    tr = 38.0
    iv = 0.25
    while tr < 39.95:
        music.add(clap(1.0), tr, 0.06 + 0.16 * (tr - 38) / 2, short=0.1)
        tr += iv
        iv = max(0.0625, iv * 0.86)
    m.add(riser_noise(2.0, 500, 10000, 0.11, 2.4), 38.0, 1.0, long=0.2)
    music.add(saw_sweep(2.0, 110, 880, 0.12, 2.0, 5.0), 38.0, 1.0, long=0.2)
    duck_ranges.append((39.88, 40.0))
    # montage: one hit per word
    m.add(crash(2.0, 1.0, 3500, 0.7), 40.0, 0.2, long=0.4)
    for i, tw in enumerate(SPEC_TIMES):
        big = (i == len(SPEC_TIMES) - 1)
        m.add(sub_boom(0.9 if big else 0.5, 0.6 if big else 0.4, 90, 40, 0.3 if not big else 0.5), tw, 1.0, long=0.2)
        m.add(tick(900 * 2 ** (i * 2 / 12.0), 1.0, 0.05), tw, 0.12, pan=(-0.3 if i % 2 else 0.3), short=0.2)
        m.add(crack(0.12, 1.0, 1500, 0.03), tw, 0.22)
    m.add(crash(1.6, 1.0, 3000, 0.6), SPEC_TIMES[-1], 0.2, long=0.4)
    # final riser into silence
    m.add(riser_noise(1.0, 800, 12000, 0.08, 2.0), 43.0, 1.0, long=0.1)
    tr = 43.0
    iv = 0.125
    while tr < 43.95:
        music.add(clap(1.0), tr, 0.14, short=0.1)
        tr += iv
        iv = max(0.04, iv * 0.88)

    # ---------------------------------------------------------------- scene-by-scene SFX
    for tc in CUTS:
        m.add(whoosh(0.5, 300, 7000, 1.1, 0.95, 2.2), tc - 0.5, 0.20, long=0.15)
        m.add(thump(50, 1.0, 0.3), tc, 0.55)
        m.add(crack(0.12, 1.0, 1800, 0.03), tc, 0.12, short=0.1)
        m.add(glitch_zap(0.1, 1.0), tc - 0.04, 0.12, short=0.1)
    # 14 share
    m.add(whoosh(0.7, 500, 2500, 1.0, 0.45, 1.5), 14.22, 0.07, long=0.2)
    decode_ticks(m, T_SHARE_ADDR, 17, 0.03, 1800, 3200, 0.04)
    m.add(sine_sweep(0.6, 300, 2600, 1.4) * np.hanning(int(0.6 * SR)) * 0.5, 15.0, 0.08, short=0.2)
    m.add(whoosh(0.7, 400, 4000, 1.0, 0.55, 1.4), T_PHONE_IN - 0.05, 0.14, pan=0.4, long=0.2)
    m.add(thump(70, 1.0, 0.25), T_PHONE_IN + 0.55, 0.25)
    m.add(tick(700, 1.0, 0.04), T_PHONE_IN + 0.62, 0.08, pan=0.5)
    for i, p in enumerate(T_SHARE_PINGS):
        m.add(whoosh(0.5, 700, 2800, 1.2, 0.9, 1.6), p - 0.5, 0.07, pan=0.3)
        m.add(ping(hz(81 + i * 2 - (i > 1) * 0), 1.0, 1.4, 0.35), p, 0.08, pan=0.5, short=0.3, long=0.5)
    # 20 hooks
    m.add(whoosh(0.8, 300, 3000, 1.0, 0.5, 1.5), 20.12, 0.12, pan=0.3, long=0.2)
    m.add(whoosh(0.7, 500, 2500, 1.0, 0.45, 1.5), 20.2, 0.06, long=0.2)
    for i, ta in enumerate(PACKET_ARRIVALS):
        m.add(whoosh(PACKET_TRAVEL * 0.85, 1200, 3600, 1.3, 0.95, 1.8), ta - PACKET_TRAVEL * 0.85, 0.15, pan=0.4)
        m.add(thump(95, 1.0, 0.18), ta, 0.5)
        m.add(crack(0.1, 1.0, 2500, 0.025), ta, 0.2)
        m.add(tick(hz(76 + i * 3), 1.0, 0.05), ta + 0.02, 0.11, pan=-0.2, short=0.3)
    m.add(key_click(0.5), T_SELECT_ROW, 1.0, short=0.2)
    m.add(tick(1400, 1.0), T_SELECT_ROW + 0.02, 0.07)
    base = T_SELECT_ROW + 0.1
    for i in range(6):
        m.add(tick(2600 + 140 * i, 1.0, 0.03), base + 0.09 * i, 0.035, pan=0.3)
    for j in range(4):
        m.add(tick(2200 + 100 * j, 1.0, 0.03), base + 0.6 + 0.1 * j, 0.035, pan=0.3)
    m.add(ping(1568, 1.0, 0.8, 0.2), base + 1.0, 0.05, pan=0.4, short=0.2)
    m.add(key_click(0.7, heavy=True), T_REPLAY_PRESS, 1.0, short=0.2)
    m.add(thump(75, 1.0, 0.25), T_REPLAY_PRESS, 0.4)
    m.add(whoosh(REPLAY_ARRIVAL - T_REPLAY_PRESS, 500, 2800, 1.2, 0.85, 1.6), T_REPLAY_PRESS + 0.02, 0.20, pan=-0.3, long=0.2)
    m.add(thump(95, 1.0, 0.2), REPLAY_ARRIVAL, 0.6)
    m.add(sine_sweep(0.55, 300, 1400, 1.0) * np.hanning(int(0.55 * SR)) * 0.5, REPLAY_ARRIVAL, 0.10, pan=-0.4, short=0.3)
    m.add(ping(880, 1.0, 1.6, 0.4), REPLAY_ARRIVAL, 0.10, pan=-0.4, short=0.2, long=0.6)
    # 26 protocols
    m.add(whoosh(0.8, 300, 2800, 1.0, 0.5, 1.5), 26.12, 0.12, pan=-0.3, long=0.2)
    m.add(whoosh(0.7, 500, 2500, 1.0, 0.45, 1.5), 26.22, 0.06, long=0.2)
    for i, tc in enumerate(CHIP_TIMES):
        m.add(thump(80, 1.0, 0.2), tc, 0.5)
        m.add(crack(0.09, 1.0, 2500, 0.022), tc, 0.17)
        m.add(tick(hz(69 + [0, 3, 5, 7, 10][i] + 12), 1.0, 0.06), tc + 0.01, 0.12, pan=-0.6 + 0.3 * i, short=0.2)
    m.add(whoosh(1.0, 500, 3200, 0.9, 0.5, 1.5), T_PROTO_SWEEP - 0.1, 0.10, pan=0.0, long=0.2)
    typing_clicks(m, TYPING["tcp1"], 0.16)
    typing_clicks(m, TYPING["tcp2"], 0.16)
    for key in ("tcp1", "tcp2"):
        m.add(key_click(0.55, heavy=True), ENTER[key], 1.0, short=0.2)
        m.add(ping(988, 1.0, 1.2, 0.3), ENTER[key] + 0.03, 0.07, short=0.3, long=0.4)
        m.add(thump(70, 1.0, 0.2), ENTER[key], 0.35)
    # 31 domains
    m.add(whoosh(0.8, 300, 3000, 1.0, 0.5, 1.5), 31.12, 0.12, long=0.2)
    m.add(whoosh(0.7, 500, 2500, 1.0, 0.45, 1.5), 31.4, 0.06, long=0.2)
    typing_clicks(m, TYPING["sub"], 0.14)
    m.add(key_click(0.55, heavy=True), ENTER["sub"], 1.0, short=0.2)
    decode_ticks(m, T_DOMAIN_URL1, 17, 0.035, 1500, 3000, 0.05)
    decode_ticks(m, T_DOMAIN_URL2, 14, 0.035, 1700, 3400, 0.05)
    decode_ticks(m, T_DOMAIN_URL3, 18, 0.035, 1900, 3800, 0.05)
    for tt2 in (T_DOMAIN_URL2, T_DOMAIN_URL3):
        m.add(thump(75, 1.0, 0.22), tt2, 0.45)
        m.add(bell(hz(84), 1.0, 2.0, 0.6), tt2 + 0.45, 0.05, pan=0.2, long=0.7)
    # 35 remote
    m.add(whoosh(0.8, 300, 3000, 1.0, 0.5, 1.5), 35.12, 0.12, long=0.2)
    m.add(whoosh(0.7, 500, 2500, 1.0, 0.45, 1.5), 35.2, 0.06, long=0.2)
    typing_clicks(m, TYPING["qr"], 0.2)
    m.add(key_click(0.55, heavy=True), ENTER["qr"], 1.0, short=0.2)
    for i in range(46):
        tq = T_QR_BUILD[0] + (T_QR_BUILD[1] - T_QR_BUILD[0]) * (i / 46) ** 1.1
        m.add(tick(rng.uniform(2000, 5200), 1.0, 0.03), tq, 0.03, pan=rng.uniform(-0.6, 0.6), short=0.2)
    m.add(whoosh(0.8, 400, 4000, 1.0, 0.6, 1.4), T_PHONE_SLIDE - 0.05, 0.14, pan=0.4, long=0.2)
    m.add(thump(70, 1.0, 0.25), T_PHONE_SLIDE + 0.65, 0.3)
    nsweep = int((T_QR_SCAN[1] - T_QR_SCAN[0]) * SR)
    m.add(sine_sweep(T_QR_SCAN[1] - T_QR_SCAN[0], 500, 3200, 1.0) * np.hanning(nsweep) * 0.5, T_QR_SCAN[0], 0.09, short=0.3, long=0.2)
    m.add(thump(60, 1.0, 0.3), T_PAIRED, 0.45)
    for i, nt in enumerate((76, 81, 88)):
        m.add(bell(hz(nt), 1.0, 2.5, 0.8), T_PAIRED + i * 0.07, 0.06, pan=-0.3 + 0.3 * i, short=0.1, long=0.6)
    typing_clicks(m, TYPING["phone1"], 0.11, pan=0.35)
    typing_clicks(m, TYPING["phone2"], 0.11, pan=0.35)
    for key in ("phone1", "phone2"):
        m.add(tick(2000, 1.0, 0.05), TYPING[key][-1] + 0.35, 0.05, pan=0.4)

    # ---------------------------------------------------------------- 44-56 outro
    pre_m, pre_music, pre_duck = m, music, duck_ranges
    m, music, duck_ranges = Mix(), Mix(), []
    # a point of light, a line of light, a square collapsing into the logo
    m.add(riser_noise(0.55, 1200, 9000, 0.10, 2.8), 44.4, 1.0, long=0.2)
    m.add(sine_sweep(0.6, 300, 3800, 2.5) * np.linspace(0, 1, int(0.6 * SR)) ** 2 * 0.5, 44.4, 0.10, long=0.3)
    nsub = int(1.0 * SR)
    music.add(np.sin(np.cumsum(TAU * np.linspace(38, 56, nsub) / SR)) * np.linspace(0, 1, nsub) ** 2, 44.0, 0.40)
    m.add(ping(hz(93), 1.0, 1.0, 0.3), 44.5, 0.05, pan=0.0, long=0.6)
    # LOGO HIT
    L = T_LOGO_HIT
    m.add(sub_boom(3.6, 1.0, 105, 30, 1.3), L, 1.0, long=0.35)
    m.add(crack(0.4, 0.9, 700, 0.1), L, 0.75, long=0.5)
    m.add(crash(3.2, 1.0, 3800, 1.0), L, 0.26, long=0.5)
    m.add(kick(1.0), L, 0.9)
    m.add(pad_chord([hz(x) for x in (33, 45, 52, 57, 60, 64)], 3.2, 0.02, 2.6, 900, 400, gain=1.0), L, 0.32, long=0.7)
    for i in range(5):
        m.add(tick(hz(76 + [0, 3, 5, 7, 10][i]), 1.0, 0.05), T_LOGO_LETTERS + 0.06 * i, 0.09, pan=-0.4 + 0.2 * i, short=0.3)
    music.add(pad_chord([hz(x) for x in (45, 52, 57, 60, 64)], 6.8, 1.4, 2.0, 600, 1400, gain=1.0), 46.0, 0.17, long=0.6)
    music.add(pad_chord([hz(x) for x in (41, 48, 53, 57, 60)], 4.0, 1.0, 1.6, 600, 1100, gain=1.0), 52.0, 0.0)
    # tagline: airy rise and a bell
    m.add(riser_noise(0.8, 2500, 9000, 0.05, 1.6), T_TAGLINE - 0.1, 1.0, long=0.4)
    m.add(bell(hz(81), 1.0, 3.5, 1.2), T_TAGLINE + 0.25, 0.07, pan=0.2, long=0.9)
    m.add(bell(hz(76), 1.0, 3.5, 1.2), T_TAGLINE + 0.6, 0.05, pan=-0.2, long=0.9)
    # sparse shimmer stars
    for i, ts in enumerate(np.arange(47.2, 51.6, 0.75)):
        m.add(ping(hz([93, 88, 95, 91, 100, 88][i % 6]), 1.0, 1.4, 0.4), float(ts), 0.025, pan=rng.uniform(-0.7, 0.7), long=0.9)
    # site decode, pill, install typing
    decode_ticks(m, T_SITE, 8, 0.05, 1800, 3600, 0.06)
    m.add(bell(hz(88), 1.0, 3.0, 1.0), T_SITE + 0.45, 0.05, pan=0.1, long=0.8)
    m.add(whoosh(0.5, 600, 2600, 1.0, 0.5, 1.5), T_PILL - 0.05, 0.10, long=0.2)
    typing_clicks(m, TYPING["install"], 0.15, short=0.1)
    done = TYPING["install"][-1] + 0.12
    m.add(tick(hz(88), 1.0, 0.06), done, 0.10, short=0.3)
    m.add(tick(hz(95), 1.0, 0.06), done + 0.09, 0.10, short=0.3)
    # FINAL HIT with a long tail
    F_ = T_FINAL_HIT
    m.add(riser_noise(0.5, 1000, 9000, 0.09, 2.2), F_ - 0.5, 1.0, long=0.2)
    duck_ranges.append((F_ - 0.1, F_))
    m.add(sub_boom(4.4, 1.0, 110, 29, 1.6), F_, 1.0, long=0.4)
    m.add(crack(0.45, 1.0, 600, 0.12), F_, 0.85, long=0.6)
    m.add(crash(4.0, 1.0, 3500, 1.4), F_, 0.30, long=0.6)
    m.add(kick(1.0), F_, 1.0)
    m.add(pad_chord([hz(x) for x in (33, 45, 52, 57, 60, 64, 69)], 3.6, 0.02, 3.0, 1100, 400, gain=1.0), F_, 0.36, long=0.8)
    m.add(bell(hz(93), 1.0, 4.0, 1.5), F_ + 0.05, 0.06, pan=0.3, long=0.95)
    m.add(bell(hz(100), 1.0, 4.0, 1.5), F_ + 0.30, 0.04, pan=-0.3, long=0.95)

    # ---------------------------------------------------------------- master bus
    def render(mm, mu, ducks):
        dry = mm.dry + mu.dry
        rs = apply_reverb(mm.rev_short + mu.rev_short, 0.9, 1) * 0.9
        rl = apply_reverb(mm.rev_long + mu.rev_long, 3.6, 2) * 0.9
        return dry, rs + rl, ducks

    pre_dry, pre_wet, pre_ducks = render(pre_m, pre_music, pre_duck)
    post_dry, post_wet, post_ducks = render(m, music, duck_ranges)
    # the vacuum: at 44.0 the dry mix is cut dead and only a faint tail of the room remains
    i44 = int(44.0 * SR)
    g_dry = np.ones(N)
    g_dry[i44:i44 + int(0.03 * SR)] = np.linspace(1, 0, int(0.03 * SR))
    g_dry[i44 + int(0.03 * SR):] = 0.0
    g_wet = np.ones(N)
    g_wet[i44:i44 + int(0.4 * SR)] = np.linspace(1, 0.12, int(0.4 * SR))
    g_wet[i44 + int(0.4 * SR):] = 0.12
    pre = pre_dry * g_dry + pre_wet * g_wet
    for a_, b_ in pre_ducks:
        duck(pre, a_, b_, 0.0)
    post = post_dry + post_wet
    for a_, b_ in post_ducks:
        duck(post, a_, b_, 0.0)
    out = pre + post
    # fade out at the very end
    i_f = int(T_FADE_OUT * SR)
    out[:, i_f:] *= np.linspace(1, 0, N - i_f) ** 1.5
    # clean up sub rumble below 24 Hz
    sos = sg.butter(2, 24, "highpass", fs=SR, output="sos")
    return sg.sosfilt(sos, out, axis=1)


@nb.njit(cache=True)
def comp_gain(x, thresh_db, ratio, att, rel):
    n = x.shape[1]
    g = np.empty(n)
    env = 0.0
    for i in range(n):
        a = max(abs(x[0, i]), abs(x[1, i]))
        coef = att if a > env else rel
        env = a + (env - a) * coef
        lvl = 20.0 * math.log10(env + 1e-9)
        over = lvl - thresh_db
        gr = 0.0 if over <= 0.0 else over * (1.0 - 1.0 / ratio)
        g[i] = 10.0 ** (-gr / 20.0)
    return g


def glue(x, thresh_db=-19.0, ratio=2.3, att_ms=8.0, rel_ms=300.0):
    g = comp_gain(x, thresh_db, ratio, math.exp(-1.0 / (att_ms * SR / 1000.0)),
                  math.exp(-1.0 / (rel_ms * SR / 1000.0)))
    return x * g


def limiter(x, ceiling_db=-1.6, look_ms=5.0, release_ms=140.0):
    """Look-ahead limiter that detects true (inter-sample) peaks on a 4x oversampled signal."""
    ceil = 10 ** (ceiling_db / 20.0)
    up = sg.resample_poly(x, 4, 1, axis=1)
    peak = np.maximum(np.abs(up[0]), np.abs(up[1]))[: 4 * x.shape[1]]
    peak = peak.reshape(-1, 4).max(axis=1)
    del up
    g = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    look = int(look_ms * SR / 1000)
    g = minimum_filter1d(g, size=2 * look + 1, mode="nearest")
    g = uniform_filter1d(g, size=look + 1, mode="nearest")
    g = release_follow(g, 1.0 - math.exp(-1.0 / (release_ms * SR / 1000.0)))
    return x * g


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / math.tanh(drive)


def measure(path, ffmpeg):
    r = subprocess.run([ffmpeg, "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    tail = txt[txt.rfind("Summary:"):]
    I = float(tail.split("I:")[1].split("LUFS")[0])
    tp = float(tail.split("Peak:")[1].split("dBFS")[0])
    return I, tp


def write_wav(path, x):
    y = np.clip(x, -1, 1)
    dither = (rng.random(y.shape) - rng.random(y.shape)) / 32768.0
    wavfile.write(path, SR, np.round((y + dither) * 32767).astype(np.int16).T)


def main(out_path, target=-14.0):
    from ffmpeg_path import find_ffmpeg
    ff = find_ffmpeg()
    x = build()
    x = glue(x)
    x = softclip(x, 0.9)
    gain_db = 0.0
    peak0 = np.abs(x).max()
    gain = 0.7 / peak0
    best = None
    for it in range(6):
        y = limiter(x * gain, -1.7)
        write_wav(out_path, y)
        I, tp = measure(out_path, ff)
        print(f"iteration {it}: {I:.2f} LUFS, true peak {tp:.2f} dBTP")
        if abs(I - target) < 0.3 and tp <= -1.0:
            break
        gain *= 10 ** ((target - I) / 20.0)
    return I, tp


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "audio.wav")

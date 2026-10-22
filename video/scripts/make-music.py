"""Self-generated, royalty-free lo-fi/ambient bed for the demo video (no samples, no third-party audio).
Pure additive synthesis with numpy: warm pads, a soft electric-piano arpeggio, sub bass, a gentle kick/hat
groove and a little vinyl crackle.  Writes public/music.wav (44.1 kHz stereo, 16-bit).
Usage: python3 scripts/make-music.py [seconds]
"""
import sys, wave
import numpy as np

SR = 44100
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 540.0
BPM = 76.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)
n = int(DUR * SR)
L = np.zeros(n); R = np.zeros(n)

def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR)
    if i >= n: return
    sig = sig[: n - i]
    L[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * gain * np.sqrt(0.5 * (1 + pan))

def env(length, a, r):
    t = np.arange(int(length * SR)) / SR
    e = np.minimum(1.0, t / a) * np.minimum(1.0, (length - t) / r)
    return np.clip(e, 0, 1)

# Fmaj7 - Em7 - Dm7 - Cmaj7(add9): calm, unresolved, loops seamlessly
CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 62]]
CH_LEN = 2 * BAR

def pad(notes, length):
    t = np.arange(int(length * SR)) / SR
    out = np.zeros_like(t)
    for m in notes:
        f = hz(m + 12)
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            out += np.sin(2 * np.pi * ff * t + rng.uniform(0, 6.28)) + 0.18 * np.sin(4 * np.pi * ff * t)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t)
    return out * env(length, 1.8, 2.2) * lfo / (len(notes) * 3)

def epiano(m, length=1.6):
    t = np.arange(int(length * SR)) / SR
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6) + 0.08 * np.sin(6 * np.pi * f * t) * np.exp(-t * 9)
    return s * np.exp(-t * 2.6) * np.minimum(1, t / 0.004)

def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 50 + 70 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)

def hat():
    t = np.arange(int(0.06 * SR)) / SR
    w = rng.standard_normal(len(t))
    w = np.diff(np.concatenate([[0], w]))  # crude high-pass
    return w * np.exp(-t * 70)

def bass(m, length):
    t = np.arange(int(length * SR)) / SR
    f = hz(m - 12)
    return (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(4 * np.pi * f * t)) * env(length, 0.02, 0.5) * np.exp(-t * 0.6)

INTRO = 4 * BAR  # groove enters after the intro
t0, k = 0.0, 0
while t0 < DUR:
    ch = CHORDS[k % 4]
    add(pad(ch, CH_LEN + 2.0), t0, gain=0.55)
    add(bass(ch[0], CH_LEN), t0, gain=0.32)
    # arpeggio on eighth notes, with rests so it breathes
    pattern = [0, 2, 1, 3, None, 2, 3, 1, 0, None, 2, 3, 1, None, 3, 2]
    for j, p in enumerate(pattern):
        if p is None or rng.random() < 0.18: continue
        m = ch[p] + 24
        add(epiano(m), t0 + j * BEAT / 2 + rng.uniform(-0.008, 0.008), pan=rng.uniform(-0.5, 0.5), gain=0.11 * rng.uniform(0.7, 1.0))
    if t0 >= INTRO:
        for b in range(8):
            bt = t0 + b * BEAT
            if b % 4 in (0, 2) or (b % 4 == 3 and rng.random() < 0.3):
                add(kick(), bt + (BEAT / 2 if b % 4 == 3 else 0), gain=0.34)
            add(hat(), bt + BEAT / 2 + 0.012, pan=0.3, gain=0.045)
            if rng.random() < 0.4: add(hat(), bt + 3 * BEAT / 4, pan=0.35, gain=0.025)
    t0 += CH_LEN; k += 1

# vinyl crackle + soft noise floor
idx = rng.integers(0, n, size=int(DUR * 9))
crack = np.zeros(n); crack[idx] = rng.standard_normal(len(idx)) * 0.05
crack = np.convolve(crack, np.exp(-np.arange(40) / 6), mode="same")
L += crack; R += np.roll(crack, 17)
L += rng.standard_normal(n) * 0.0015; R += rng.standard_normal(n) * 0.0015

# gentle stereo widening + master fade in/out + normalize to about -3 dBFS peak
mix = np.stack([L, R], axis=1)
fade = np.minimum(1, np.arange(n) / (3 * SR)) * np.minimum(1, (n - np.arange(n)) / (4 * SR))
mix *= fade[:, None]
mix = np.tanh(mix * 1.2)
mix /= np.max(np.abs(mix)) / 0.7
pcm = (mix * 32767).astype(np.int16)
with wave.open("public/music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f"public/music.wav {DUR:.0f}s")

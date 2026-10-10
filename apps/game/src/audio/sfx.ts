import { CH2_SFX_VOICES } from "./sfxCh2";
import { impact } from "./sfxShared";
import type { Synth } from "./synth";
import { keyVoice, midiToHz as NOTE } from "./tiers";
import type { BusId, Sfx, SfxParams } from "./types";

/**
 * Procedural SFX. Each voice is `(synth, t, params) => void` scheduling Web Audio nodes at time `t`.
 * PORTED = taken from poc/hd2d-poc-v2.html `SFX` (Math.random replaced by the injected rng);
 * NEW = designed for this module.
 */
export type SfxVoice = (s: Synth, t: number, p: SfxParams) => void;

const shieldVoice = (s: Synth, t: number): void => {
  [84, 88, 91, 96].forEach((n, i) => {
    s.bell(NOTE(n), t + i * 0.055, 1.0, 0.07, 0.6);
  });
  s.noise(t, 0.5, 0.08, "highpass", 6000, 9000, { a: 0.1, wet: 0.5 });
};

/** v1.9 guard leak accent: a dry glass crack under the guard chime ("guarded, but some got through"). */
const crackVoice = (s: Synth, t: number): void => {
  s.noise(t + 0.02, 0.16, 0.16, "bandpass", 3200, 1400, { wet: 0.15 });
  s.osc("square", 190, 90, t + 0.02, 0.14, 0.08, { lp: 1600, wet: 0.1 });
  s.osc("sine", 3100, 2300, t + 0.05, 0.08, 0.04, { wet: 0.3 });
};

const shatterVoice = (s: Synth, t: number): void => {
  s.noise(t, 0.5, 0.5, "highpass", 3000, 1800, { wet: 0.4 });
  for (let i = 0; i < 14; i++) {
    const f = 2000 + s.rng() * 5000;
    s.osc("sine", f, f * 0.98, t + s.rng() * 0.25, 0.18, 0.05, { wet: 0.5 });
  }
  s.osc("sine", 120, 40, t, 0.5, 0.6, { wet: 0.3 });
};

const fanfare = (s: Synth, t: number, big: boolean): void => {
  const q = 0.13;
  const mel = big
    ? [
        [72, 0, 1],
        [76, 1, 1],
        [79, 2, 1],
        [84, 3, 4],
        [81, 7, 1],
        [83, 8, 1],
        [84, 9, 6],
      ]
    : [
        [79, 0, 1],
        [84, 1, 1],
        [88, 2, 3],
        [86, 5, 1],
        [91, 6, 4],
      ];
  for (const [n = 0, st = 0, l = 1] of mel) {
    s.osc("square", NOTE(n), NOTE(n), t + st * q, l * q + 0.1, 0.06, {
      lp: 3200,
      wet: 0.35,
      hold: l * q * 0.5,
    });
    s.osc("triangle", NOTE(n - 12), NOTE(n - 12), t + st * q, l * q + 0.15, 0.09, {
      wet: 0.3,
      hold: l * q * 0.5,
    });
  }
  const bass = big
    ? [
        [48, 0, 3],
        [53, 3, 4],
        [55, 7, 2],
        [48, 9, 6],
      ]
    : [
        [48, 0, 2],
        [55, 2, 3],
        [48, 5, 5],
      ];
  for (const [n = 0, st = 0, l = 1] of bass) {
    s.osc("triangle", NOTE(n), NOTE(n), t + st * q, l * q, 0.16, { wet: 0.2, hold: l * q * 0.4 });
  }
  s.noise(t + (big ? 9 : 6) * q, 0.8, 0.05, "highpass", 7000, 9000, { wet: 0.6 });
};

const wordChime = (s: Synth, t: number, n: number): void => {
  const b = 84 + (n % 3) * 2;
  s.osc("triangle", NOTE(b), NOTE(b), t, 0.12, 0.13, { wet: 0.25 });
  s.osc("triangle", NOTE(b + 7), NOTE(b + 7), t + 0.06, 0.22, 0.12, { wet: 0.35 });
  s.osc("sine", NOTE(b + 19), NOTE(b + 19), t + 0.06, 0.3, 0.05, { wet: 0.5 });
  s.noise(t, 0.18, 0.06, "highpass", 7000, 9000, { wet: 0.3 });
};

const ui = (bus: BusId): { bus: BusId; wet: number } => ({ bus, wet: 0 });

export const SFX_VOICES: Record<Sfx, SfxVoice> = {
  /**
   * NEW (extends POC `key`): streak-pitched click. Pentatonic walk + 2 semitones per tier;
   * brighter noise and added harmonic partials as the tier rises. Hot path: only ~7 nodes, no reverb send.
   */
  key(s, t, p) {
    const v = keyVoice(p.streak ?? 0, s.rng(), s.rng());
    s.noise(t, 0.022, 0.22, "highpass", v.noiseHz, v.noiseHz, { wet: 0 });
    s.osc("triangle", v.freq, v.freq * 1.01, t, 0.05, v.gain, { wet: 0, detune: v.detuneCents });
    s.osc("square", 140, 90, t, 0.02, 0.05, { lp: 900, wet: 0 });
    if (v.partial2 > 0) s.osc("sine", v.freq * 2, v.freq * 2, t, 0.06, v.partial2, { wet: 0 });
    if (v.partial3 > 0) s.osc("sine", v.freq * 3, v.freq * 3, t, 0.05, v.partial3, { wet: 0 });
  },

  /** PORTED `typo`. */
  typo(s, t, p) {
    // v1.1: a guard-plate typo (heavy) is lower and longer, with an extra low thud.
    const k = p.heavy ? 0.7 : 1;
    if (p.heavy) s.osc("sine", 90, 40, t, 0.25, 0.3, { wet: 0.05 });
    s.osc("square", 118 * k, 82 * k, t, p.heavy ? 0.24 : 0.16, 0.13, { lp: 1100, wet: 0.02 });
    s.osc("square", 123 * k, 86 * k, t, p.heavy ? 0.24 : 0.16, 0.1, { lp: 1100, wet: 0.02 });
    s.noise(t, 0.06, 0.1, "lowpass", 600, 300, { wet: 0 });
  },

  /** PORTED `word`. */
  wordComplete(s, t, p) {
    wordChime(s, t, p.count ?? 0);
  },

  /** NEW: the word chime plus a higher bell, octave sparkle and an airy shimmer. */
  perfectWord(s, t, p) {
    wordChime(s, t, p.count ?? 0);
    s.bell(NOTE(96), t + 0.1, 0.9, 0.09, 0.55, [1, 2.76, 4.1]);
    s.osc("triangle", NOTE(103), NOTE(103), t + 0.14, 0.35, 0.07, { wet: 0.5 });
    s.noise(t + 0.05, 0.4, 0.06, "highpass", 8000, 11000, { a: 0.08, wet: 0.5 });
  },

  /** NEW: rising bell arpeggio, longer and fuller per tier (1..4); tier 4 adds a sub boom. */
  tierUp(s, t, p) {
    const tier = Math.min(4, Math.max(1, Math.round(p.tier ?? 1)));
    const run = [84, 88, 91, 96, 100, 103].map((n) => n + (tier - 1) * 2);
    const count = 2 + tier;
    for (let i = 0; i < count; i++) {
      const n = run[i] ?? 103;
      s.bell(NOTE(n), t + i * 0.05, 0.7 + tier * 0.15, 0.08, 0.55);
    }
    if (tier >= 2) s.noise(t, 0.45, 0.07, "highpass", 6000, 10000, { a: 0.12, wet: 0.5 });
    if (tier >= 3)
      s.osc("sawtooth", NOTE(48 + tier), NOTE(60 + tier), t, 0.4, 0.07, {
        lp: 1400,
        a: 0.12,
        wet: 0.3,
      });
    if (tier >= 4) s.osc("sine", 90, 38, t, 0.7, 0.55, { slide: 0.4, wet: 0.3 });
  },

  /** PORTED `whoosh`. */
  slash(s, t, p) {
    const pitch = p.heavy ? 0.8 : 1;
    const pan = p.pan ?? 0;
    s.noise(t, 0.2, 0.42, "bandpass", 500 * pitch, 2800 * pitch, {
      q: 1.4,
      a: 0.03,
      wet: 0.12,
      pan,
    });
    s.noise(t + 0.02, 0.14, 0.16, "highpass", 4000, 6000, { a: 0.02, wet: 0.05, pan });
  },

  /** PORTED `monHit`. */
  hit(s, t, p) {
    const pan = p.pan ?? 0;
    s.osc("sine", 360, 120, t, 0.12, 0.3, { wet: 0.1, pan });
    s.noise(t, 0.08, 0.3, "bandpass", 1100, 500, { q: 2, wet: 0.1, pan });
  },

  /** PORTED `crit` (heavy impact + bell + saw shimmer). */
  crit(s, t, p) {
    impact(s, t, 1, p.pan ?? 0);
    s.bell(1240, t + 0.01, 0.9, 0.12, 0.5);
    s.osc("sawtooth", 2400, 3600, t, 0.12, 0.05, { lp: 6000, wet: 0.3 });
  },

  /** PORTED `shield`. */
  guard(s, t, p) {
    shieldVoice(s, t);
    if (p.leak) crackVoice(s, t);
  },

  /** PORTED `parry`. */
  parry(s, t, p) {
    s.bell(1560, t, 0.7, 0.16, 0.5, [1, 2.4, 3.9, 6.1]);
    s.osc("square", 2200, 1200, t, 0.06, 0.08, { lp: 5000, wet: 0.2 });
    s.noise(t, 0.08, 0.3, "highpass", 2500, 2500, { wet: 0.3 });
    shieldVoice(s, t);
    if (p.leak) crackVoice(s, t);
  },

  /** PORTED `monAtk` (heavy variant NEW: lower and longer). */
  enemyWindup(s, t, p) {
    const k = p.heavy ? 0.7 : 1;
    s.osc("sawtooth", 90 * k, 180 * k, t, p.heavy ? 0.5 : 0.3, 0.12, { lp: 700, a: 0.2, wet: 0.2 });
    s.noise(t + 0.25, 0.2, 0.3, "bandpass", 300, 1400, { q: 1, a: 0.05, wet: 0.15 });
  },

  /** PORTED `hurt`. */
  heroHurt(s, t, p) {
    impact(s, t, p.heavy ? 1 : 0, p.pan ?? 0);
    s.osc("square", 220, 110, t, 0.18, 0.1, { lp: 800, wet: 0.1 });
  },

  /** PORTED `monDie` (boss variant NEW: adds shatter). */
  enemyDeath(s, t, p) {
    const pan = p.pan ?? 0;
    s.osc("square", 640, 70, t, 0.42, 0.12, { lp: 1600, wet: 0.2, pan });
    s.noise(t, 0.5, 0.25, "lowpass", 2000, 200, { wet: 0.3, pan });
    [88, 91, 95, 100, 103].forEach((n, i) => {
      s.osc("sine", NOTE(n), NOTE(n), t + 0.12 + i * 0.045, 0.25, 0.06, { wet: 0.6, pan });
    });
    if (p.boss) shatterVoice(s, t + 0.1);
  },

  /** PORTED `shatter` / `breakGauge`. */
  break(s, t) {
    shatterVoice(s, t);
  },

  /** PORTED `chestLand`. */
  chestLand(s, t) {
    s.osc("sine", 120, 50, t, 0.2, 0.5, { wet: 0.2 });
    s.noise(t, 0.14, 0.35, "lowpass", 1500, 300, { wet: 0.2 });
  },

  /** PORTED `chestOpen` (creak with an LFO, latch click, rising arpeggio). */
  chestOpen(s, t) {
    const creak = s.osc("sawtooth", 85, 150, t, 0.4, 0.13, { lp: 900, q: 4, a: 0.05, wet: 0.2 });
    const lfo = s.ctx.createOscillator();
    const lg = s.ctx.createGain();
    lfo.frequency.value = 38;
    lg.gain.value = 25;
    lfo.connect(lg);
    lg.connect(creak.frequency);
    lfo.start(t);
    lfo.stop(t + 0.5);
    s.osc("square", 1400, 900, t + 0.42, 0.03, 0.08, { lp: 4000, wet: 0.1 });
    [79, 83, 86, 91, 95, 98].forEach((n, i) => {
      s.osc("triangle", NOTE(n), NOTE(n), t + 0.5 + i * 0.06, 0.4, 0.07, { wet: 0.6 });
    });
  },

  /** PORTED `coins`. */
  coin(s, t, p) {
    const n = p.count ?? 10;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.06 + s.rng() * 0.05;
      const f = 1800 + s.rng() * 900;
      s.osc("square", f, f, tt, 0.05, 0.035, { lp: 7000, wet: 0.25, pan: s.rng() - 0.5 });
      s.osc("square", f * 1.335, f * 1.335, tt + 0.05, 0.12, 0.03, { lp: 7000, wet: 0.3 });
    }
  },

  /** PORTED `fireCast`. */
  skillFire(s, t) {
    s.noise(t, 0.45, 0.32, "bandpass", 220, 1600, { q: 2, a: 0.12, wet: 0.25 });
    s.osc("sawtooth", 110, 330, t, 0.42, 0.12, { lp: 900, a: 0.1, wet: 0.2 });
    s.osc("sine", 440, 880, t + 0.2, 0.2, 0.06, { wet: 0.4 });
  },

  /** NEW: generic non-fire spell cast (airy rising shimmer). */
  skillMagic(s, t) {
    s.noise(t, 0.4, 0.14, "bandpass", 1200, 5200, { q: 3, a: 0.15, wet: 0.4 });
    [79, 83, 86].forEach((n, i) => {
      s.osc("triangle", NOTE(n), NOTE(n + 12), t + i * 0.07, 0.3, 0.07, { a: 0.05, wet: 0.5 });
    });
  },

  /** PORTED `explode`. */
  explode(s, t) {
    s.noise(t, 0.9, 0.85, "lowpass", 4200, 160, { slide: 0.6, wet: 0.45 });
    s.osc("sine", 110, 32, t, 0.7, 0.9, { slide: 0.5, wet: 0.2 });
    s.noise(t + 0.05, 0.6, 0.15, "highpass", 2500, 1200, { wet: 0.4 });
    for (let i = 0; i < 8; i++)
      s.noise(t + 0.1 + s.rng() * 0.5, 0.02, 0.12, "highpass", 3000, 3000, { wet: 0.2 });
  },

  /** NEW: soft rising chime for healing / second wind. */
  heal(s, t) {
    [84, 88, 91].forEach((n, i) => {
      s.osc("sine", NOTE(n), NOTE(n), t + i * 0.08, 0.5, 0.08, { a: 0.03, wet: 0.5 });
    });
    s.noise(t, 0.5, 0.04, "highpass", 6000, 9000, { a: 0.2, wet: 0.5 });
  },

  /** PORTED `encounter`. */
  encounter(s, t) {
    s.noise(t, 0.35, 0.3, "bandpass", 300, 3000, { q: 1, a: 0.25, wet: 0.2 });
    [50, 57, 62].forEach((n) => {
      s.osc("sawtooth", NOTE(n), NOTE(n), t + 0.3, 0.6, 0.07, { lp: 1800, wet: 0.35 });
    });
    s.osc("sine", 80, 40, t + 0.3, 0.4, 0.5, { wet: 0.2 });
  },

  /** PORTED `fanfare(false)`. */
  levelUp(s, t) {
    fanfare(s, t, false);
  },

  /** PORTED `fanfare(true)`. */
  victory(s, t) {
    fanfare(s, t, true);
  },

  /** PORTED `bossStinger`. */
  bossIntro(s, t) {
    [38, 45, 50, 53].forEach((n) => {
      s.osc("sawtooth", NOTE(n), NOTE(n), t, 2.6, 0.09, { lp: 700, a: 0.25, wet: 0.6, detune: -6 });
      s.osc("sawtooth", NOTE(n), NOTE(n), t, 2.6, 0.07, { lp: 700, a: 0.25, wet: 0.6, detune: 7 });
    });
    for (const d of [0, 0.32, 1.1]) {
      s.osc("sine", 72, 46, t + d, 0.8, 0.8, { slide: 0.3, wet: 0.5 });
      s.noise(t + d, 0.3, 0.3, "lowpass", 700, 120, { wet: 0.5 });
    }
    s.bell(NOTE(43), t + 1.1, 3.5, 0.18, 0.9, [1, 1.47, 2.09, 2.56, 3.3]);
  },

  /** NEW: UI blip (ui bus, dry). */
  uiClick(s, t) {
    s.osc("triangle", 1500, 1200, t, 0.04, 0.08, ui("ui"));
  },

  /** NEW: UI confirm two-note blip (ui bus, dry). */
  uiConfirm(s, t) {
    s.osc("triangle", NOTE(88), NOTE(88), t, 0.07, 0.08, ui("ui"));
    s.osc("triangle", NOTE(95), NOTE(95), t + 0.07, 0.12, 0.08, ui("ui"));
  },

  // ---- Chapter 2 (T3.3): see sfxCh2.ts ----
  ...CH2_SFX_VOICES,

  /**
   * NEW (Ch2, `CharCorrect.shifted`): the normal `key` voice plus ONE sine an octave below the click
   * (NOTE(key - 12) = freq / 2, 0.06 s, no reverb send). Hot path budget: +1 osc, +1 gain.
   */
  capitalKey(s, t, p) {
    SFX_VOICES.key(s, t, p);
    const v = keyVoice(p.streak ?? 0, 0.5, 0.5);
    s.osc("sine", v.freq / 2, v.freq / 2, t, 0.06, 0.06, { wet: 0 });
  },
};

/** Which bus each effect plays on. Everything is `sfx` except UI blips. */
export function busFor(id: Sfx): BusId {
  return id === "uiClick" || id === "uiConfirm" ? "ui" : "sfx";
}

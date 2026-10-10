import { impact } from "./sfxShared";
import type { Synth } from "./synth";
import { midiToHz as NOTE } from "./tiers";
import type { Sfx, SfxParams } from "./types";

/**
 * Chapter 2 SFX (T3.3), recipes from docs/vfx/ch2-art-direction.md section 6.4. Same `Synth` primitives and
 * injected rng as Ch1; softer, airier and wetter (more sine / triangle / bell, fewer squares).
 * `capitalKey` lives in sfx.ts because it reuses the Ch1 `key` voice.
 */
type Voice = (s: Synth, t: number, p: SfxParams) => void;

export const CH2_SFX_IDS = [
  "wispChime",
  "shadeHiss",
  "mothFlutter",
  "healChime",
  "toadCroak",
  "toadSplash",
  "wolfHowl",
  "wolfBite",
  "willowCreak",
  "whisperLoop",
  "leafStorm",
  "leafRustle",
  "leafPick",
  "riddleRight",
  "riddleWrong",
  "riddleTimeout",
  "willowSigh",
  "chapterSting",
] as const satisfies readonly Sfx[];
type Ch2Id = (typeof CH2_SFX_IDS)[number];

/** Rushing leaf rustle: a highpass noise sweep plus a scatter of tiny sine ticks. */
const leaves = (s: Synth, t: number, dur: number, k: number, ticks: number): void => {
  s.noise(t, dur, 0.07 * k, "highpass", 3000, 5000, { a: dur * 0.2, wet: 0.5 });
  for (let i = 0; i < ticks; i++) {
    const f = 3000 + s.rng() * 3000;
    s.osc("sine", f, f, t + s.rng() * dur, 0.01, 0.02 * k, { wet: 0.4, pan: s.rng() * 1.6 - 0.8 });
  }
};

/** A beating pair of oscillators: the beat frequency is the amplitude wobble (`beatHz`). */
const wobble = (
  s: Synth,
  type: OscillatorType,
  f0: number,
  f1: number,
  beatHz: number,
  t: number,
  dur: number,
  gain: number,
  o: { lp?: number; wet?: number; pan?: number },
): void => {
  for (const sign of [-1, 1]) {
    const d = (sign * beatHz) / 2;
    s.osc(type, f0 + d, f1 + d, t, dur, gain, o);
  }
};

export const CH2_SFX_VOICES: Record<Ch2Id, Voice> = {
  /** Small glassy "ting-pff" (wisp spawn). */
  wispChime(s, t) {
    s.bell(NOTE(91), t, 0.5, 0.06, 0.6, [1, 2.76, 5.4]);
    s.noise(t, 0.15, 0.04, "highpass", 8000, 6000, { wet: 0.3 });
  },

  /** An exhale, not a scream (shade spawn). */
  shadeHiss(s, t) {
    s.noise(t, 0.45, 0.1, "bandpass", 2400, 900, { a: 0.08, wet: 0.5 });
    s.osc("sine", 300, 180, t, 0.4, 0.03, { wet: 0.4 });
  },

  /** Six soft wing beats, panned with the moth. */
  mothFlutter(s, t, p) {
    for (let i = 0; i < 6; i++)
      s.noise(t + i * 0.045, 0.03, 0.05, "bandpass", 1800, 1800, {
        q: 1.5,
        wet: 0.15,
        pan: p.pan ?? 0,
      });
  },

  /** "They're healing": a rising minor-ish warning, distinct from the hero's sine `heal`. */
  healChime(s, t) {
    [76, 83, 88].forEach((n, i) => {
      s.osc("triangle", NOTE(n), NOTE(n), t + i * 0.09, 0.22, 0.08, { wet: 0.5 });
    });
  },

  /** A deep, comic ribbit: two squares 32 Hz apart = a 32 Hz wobble. */
  toadCroak(s, t, p) {
    wobble(s, "square", 110, 75, 32, t, 0.22, 0.06, { lp: 800, wet: 0.2, pan: p.pan ?? 0 });
  },

  /** A wet slam: heavy impact, a downward splash wash and eight random plips. */
  toadSplash(s, t, p) {
    const pan = p.pan ?? 0;
    impact(s, t, 1, pan);
    s.noise(t, 0.35, 0.4, "lowpass", 3000, 400, { wet: 0.3, pan });
    for (let i = 0; i < 8; i++) {
      const f = 600 + s.rng() * 800;
      s.osc("sine", f, f * 1.3, t + 0.03 + s.rng() * 0.3, 0.05, 0.05, { wet: 0.5, pan });
    }
  },

  /** Long, eerie, readable inside 0.3 s: a rising saw with a fifth-below echo. */
  wolfHowl(s, t) {
    const voice = (k: number, dt: number, gain: number): void => {
      const o = s.osc("sawtooth", 300 * k, 520 * k, t + dt, 0.5, gain, {
        slide: 0.6,
        hold: 0.4,
        a: 0.15,
        lp: 1400,
        q: 4,
        wet: 0.9,
      });
      o.frequency.exponentialRampToValueAtTime(380 * k, t + dt + 1.1);
    };
    voice(1, 0, 0.07);
    voice(2 / 3, 0.08, 0.04);
  },

  /** A snap. */
  wolfBite(s, t, p) {
    const pan = p.pan ?? 0;
    s.noise(t, 0.04, 0.2, "bandpass", 3000, 3000, { wet: 0.1, pan });
    s.osc("square", 180, 90, t, 0.08, 0.08, { lp: 1600, wet: 0.05, pan });
    s.osc("sine", 360, 120, t, 0.12, 0.3, { wet: 0.1, pan });
    s.noise(t, 0.08, 0.3, "bandpass", 1100, 500, { q: 2, wet: 0.1, pan });
  },

  /** Old wood groan: a 7 Hz-wobbling sub sine plus a narrow resonant noise. */
  willowCreak(s, t) {
    wobble(s, "sine", 70, 55, 7, t, 0.8, 0.22, { wet: 0.3 });
    s.noise(t, 0.7, 0.12, "bandpass", 400, 250, { q: 6, a: 0.15, wet: 0.4 });
  },

  /** One-shot preview of the held whisper (the held version is `AudioEngine.setWhisper`). */
  whisperLoop(s, t) {
    for (const f of [1200, 1800, 2600]) {
      s.noise(t, 2.2, 0.03, "bandpass", f, f * (0.7 + s.rng() * 0.6), {
        q: 8,
        a: 0.4,
        wet: 1,
        pan: s.rng() - 0.5,
      });
    }
  },

  /** A rush of leaves (phase change). */
  leafStorm(s, t) {
    leaves(s, t, 2.0, 1, 20);
  },

  /** Riddle shown: `leafStorm` at 0.4x for 0.6 s. */
  leafRustle(s, t) {
    leaves(s, t, 0.6, 0.4, 6);
  },

  /** A leaf is picked: a tiny soft tick (pan = lane). */
  leafPick(s, t, p) {
    const pan = p.pan ?? 0;
    s.osc("triangle", NOTE(88), NOTE(88), t, 0.08, 0.05, { wet: 0.3, pan });
    s.noise(t, 0.03, 0.04, "highpass", 5000, 5000, { wet: 0.1, pan });
  },

  /** A bright "correct!" bloom, quieter than `perfectWord`. */
  riddleRight(s, t) {
    [84, 88, 91].forEach((n, i) => {
      s.bell(NOTE(n), t + i * 0.06, 0.7, 0.05, 0.5, [1, 2.76]);
    });
    s.osc("triangle", NOTE(96), NOTE(96), t + 0.12, 0.4, 0.05, { wet: 0.5 });
  },

  /** Gentle, not punishing: a falling sigh and a dry leaf crunch. */
  riddleWrong(s, t) {
    s.osc("sine", 220, 196, t, 0.3, 0.08, { wet: 0.2 });
    s.noise(t, 0.2, 0.1, "lowpass", 900, 300, { wet: 0.1 });
  },

  /** Time ran out: slower and lower than `riddleWrong`. */
  riddleTimeout(s, t) {
    s.osc("sine", 196, 147, t, 0.5, 0.07, { a: 0.02, wet: 0.3 });
    s.noise(t + 0.05, 0.35, 0.07, "lowpass", 700, 200, { wet: 0.2 });
  },

  /** A release, warm: breath of noise under a D-F#-A triangle chord with a slow attack. */
  willowSigh(s, t) {
    s.noise(t, 1.8, 0.08, "bandpass", 600, 300, { a: 0.5, wet: 1 });
    for (const n of [62, 66, 69]) {
      s.osc("triangle", NOTE(n), NOTE(n), t, 2.4, 0.05, { a: 0.8, wet: 0.6 });
    }
  },

  /**
   * Chapter-complete sting: the `fanfare(big)` shape voiced on bells, I-V-I in D, ending on a held Dmaj9
   * bell chord. Starts 2.4 s in so `willowSigh` (about 2.6 s) resolves first and the two never clash.
   */
  chapterSting(s, t0) {
    const t = t0 + 2.4;
    const q = 0.14;
    const run: [number, number, number][] = [
      [74, 0, 1], // D (I)
      [78, 1, 1],
      [81, 2, 1],
      [76, 3, 1], // A (V)
      [81, 4, 1],
      [85, 5, 1],
      [78, 6, 1], // D (I)
      [81, 7, 1],
      [86, 8, 2],
    ];
    for (const [n, st, l] of run) {
      s.bell(NOTE(n), t + st * q, 0.9 * l, 0.07, 0.55, [1, 2.76]);
      s.osc("triangle", NOTE(n - 12), NOTE(n - 12), t + st * q, 0.3, 0.05, { wet: 0.3 });
    }
    const tc = t + 10 * q;
    for (const n of [50, 62, 66, 69, 73, 76]) s.bell(NOTE(n), tc, 3.2, 0.06, 0.8, [1, 2.76]);
    s.noise(tc, 1.2, 0.04, "highpass", 7000, 9000, { a: 0.2, wet: 0.6 });
  },
};

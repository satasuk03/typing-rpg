import { impact } from "./sfxShared";
import type { Synth } from "./synth";
import { midiToHz as NOTE } from "./tiers";
import type { Sfx, SfxParams } from "./types";

/**
 * Prologue SFX (P3.4), recipes from docs/vfx/prologue-art-direction.md section 5.3. Same `Synth` primitives and
 * injected rng as Ch1/Ch2; no sample files, no Math.random. The palette moves from bright to dry and close; every
 * "loss" sound descends, `emberChime` is the only one that rises.
 *
 * Params (the cutscene `sfx` cue carries none, so each default is the cue's meaning):
 * - `theftCrack` / `theftWhoosh`: `count` = kit slot 0..5 (Fireball, Aegis, Slash Wave, Piercing, Mending, Frost).
 * - `quillScratch`: `count` = letter index (seeds the +-8% pitch jitter, deterministic).
 * - `gateDark`: `count` = glyph index.
 * - `lineBlip`: `boss` true = Nul, false = the Knight. (ui bus, see `busFor`.)
 * - `wardHum`: `heavy` true = the hit bell only (no hum).
 */
type Voice = (s: Synth, t: number, p: SfxParams) => void;

export const PROLOGUE_SFX_IDS = [
  "inkPool",
  "skyTear",
  "skyTearClose",
  "hushBolt",
  "wardHum",
  "catchHiss",
  "quillScratch",
  "theftCrack",
  "theftWhoosh",
  "auraCollapse",
  "swordClang",
  "heartbeat",
  "emberChime",
  "lineBlip",
  "gateDark",
] as const satisfies readonly Sfx[];
type PId = (typeof PROLOGUE_SFX_IDS)[number];

/** Kit order (Fireball, Aegis, Slash Wave, Piercing Thrust, Mending Light, Frost Lock): E6 down to E5. */
export const THEFT_NOTES: readonly number[] = [88, 86, 83, 81, 79, 76];

const slot = (p: SfxParams): number => Math.min(5, Math.max(0, Math.floor(p.count ?? 0)));

/** Deterministic 0..1 jitter from an index (no rng draw, so cue order never shifts other sounds). */
const jitter = (i: number): number => {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export const PROLOGUE_SFX_VOICES: Record<PId, Voice> = {
  /** A wet bubble that runs backwards (`inkRise`). */
  inkPool(s, t) {
    s.noise(t, 0.5, 0.18, "lowpass", 900, 300, { a: 0.05, wet: 0.4 });
    s.osc("sine", 90, 140, t, 0.6, 0.08, { wet: 0.3 });
    for (let i = 0; i < 6; i++) s.osc("sine", 900, 1400, t + i * 0.085, 0.03, 0.05, { wet: 0.3 });
  },

  /** A sky ripping: reverse swell + whispers + a sub saw, then a crack at the open. */
  skyTear(s, t) {
    s.noise(t, 1.2, 0.22, "bandpass", 400, 3000, { a: 1.1, wet: 0.9 });
    for (const f of [1200, 1800, 2600])
      s.noise(t, 1.4, 0.03, "bandpass", f, f * (0.7 + s.rng() * 0.6), {
        q: 8,
        a: 0.4,
        wet: 1,
        pan: s.rng() - 0.5,
      });
    s.osc("sawtooth", 55, 55, t, 1.4, 0.12, { lp: 300, wet: 0.3 });
    s.noise(t + 1.2, 0.06, 0.3, "highpass", 2000, 2000, { wet: 0.4 });
  },

  /** Heard through cotton. */
  skyTearClose(s, t) {
    s.osc("sine", 70, 38, t, 0.9, 0.45, { lp: 400, wet: 0.3 });
    s.noise(t, 0.8, 0.3, "lowpass", 500, 120, { wet: 0.9 });
  },

  /** An ink lance: a hiss that thuds. */
  hushBolt(s, t) {
    s.noise(t, 0.28, 0.12, "bandpass", 1800, 600, { wet: 0.2 });
    s.osc("sine", 520, 180, t, 0.28, 0.06, { wet: 0.2 });
    impact(s, t + 0.28, 0.6, 0);
    s.noise(t + 0.28, 0.2, 0.08, "bandpass", 3000, 3000, { q: 2, wet: 0.3 });
  },

  /** A held glass hum (3 s); `heavy` = the hit bell only. */
  wardHum(s, t, p) {
    if (p.heavy) {
      s.bell(NOTE(79), t, 0.25, 0.05, 0.4, [1, 2.4]);
      return;
    }
    for (const f of [196, 197.5])
      s.osc("sine", f, f, t, 0.3, 0.05, { a: 0.3, hold: 2.4, lp: 900, wet: 0.3 });
  },

  /** Fire smothered in a fist: a clipped burst, a choked hiss, three dry crunches. */
  catchHiss(s, t) {
    s.noise(t, 0.06, 0.15, "bandpass", 1400, 900, { wet: 0.1 });
    s.osc("sawtooth", 320, 640, t, 0.06, 0.05, { lp: 1800, wet: 0.1 });
    s.noise(t + 0.5, 0.6, 0.14, "bandpass", 2500, 400, { wet: 0.2 });
    for (let i = 0; i < 3; i++)
      s.noise(t + 1.1 + i * 0.04, 0.05, 0.1, "highpass", 1500, 1500, { wet: 0.05 });
  },

  /** The player's own keystroke, made sinister. */
  quillScratch(s, t, p) {
    const f = 3800 * (1 + (jitter(p.count ?? 0) * 2 - 1) * 0.08);
    s.noise(t, 0.045, 0.07, "bandpass", f, f, { q: 4, wet: 0.1, pan: 0.3 });
    s.osc("square", 1600, 900, t, 0.02, 0.015, { wet: 0, pan: 0.3 });
  },

  /** Glass cracks, one step lower per stolen skill. */
  theftCrack(s, t, p) {
    const f = NOTE(THEFT_NOTES[slot(p)] ?? 88);
    s.bell(f, t, 0.5, 0.09, 0.6, [1, 2.76, 5.4, 8.9]);
    s.noise(t, 0.12, 0.12, "highpass", 6000, 3000, { wet: 0.3 });
  },

  /** The colour is sucked across (hero to Nul): a reverse whoosh plus a falling tone. */
  theftWhoosh(s, t, p) {
    const f = NOTE(THEFT_NOTES[slot(p)] ?? 88) / 2;
    const t0 = t + 0.12;
    s.noise(t0, 0.7, 0.13, "bandpass", 600, 2400, { a: 0.6, wet: 0.4, pan: -0.5 });
    s.osc("sine", f, f / 2, t0, 0.7, 0.03, { wet: 0.3, pan: 0.5 });
  },

  /** The power dies: a falling saw, a thud at the snap, a puff. */
  auraCollapse(s, t) {
    s.osc("sawtooth", 880, 55, t, 0.7, 0.1, { lp: 2000, wet: 0.3 });
    s.osc("sine", 110, 40, t + 0.7, 0.5, 0.25, { wet: 0.2 });
    s.noise(t + 0.7, 0.3, 0.12, "lowpass", 800, 800, { wet: 0.3 });
  },

  /** The sword on stone, heard far off. */
  swordClang(s, t) {
    s.osc("sine", 170, 42, t, 0.3, 0.45, { slide: 0.18, lp: 700, wet: 0.3 });
    s.noise(t, 0.12, 0.3, "lowpass", 700, 300, { wet: 0.3 });
    s.bell(NOTE(64), t, 0.4, 0.04, 0.9, [1, 2.4]);
  },

  /** Close, inside the head: lub-dub every 0.95 s for 4 s. */
  heartbeat(s, t) {
    for (let b = 0; b < 5; b++) {
      const tb = t + b * 0.95;
      s.osc("sine", 55, 55, tb, 0.09, 0.3, { lp: 200, wet: 0 });
      s.osc("sine", 48, 48, tb + 0.16, 0.08, 0.22, { lp: 200, wet: 0 });
    }
  },

  /** The one rising, warm sound. */
  emberChime(s, t) {
    s.bell(NOTE(86), t, 1.2, 0.06, 0.8, [1, 3.0]);
    s.osc("triangle", NOTE(98), NOTE(98), t, 0.3, 0.02, { a: 0.08, wet: 0.4 });
  },

  /** A soft speaker tick (ui bus): Nul a low sine, the Knight a higher triangle. */
  lineBlip(s, t, p) {
    if (p.boss) s.osc("sine", NOTE(50), NOTE(50), t, 0.05, 0.03, { lp: 600, wet: 0, bus: "ui" });
    else s.osc("triangle", NOTE(74), NOTE(74), t, 0.04, 0.03, { wet: 0, bus: "ui" });
  },

  /** Tiny lights going out. */
  gateDark(s, t, p) {
    const n = NOTE(91 - (Math.floor(p.count ?? 0) % 5) * 2);
    s.osc("sine", n, n, t, 0.06, 0.012, { wet: 0.7 });
  },
};

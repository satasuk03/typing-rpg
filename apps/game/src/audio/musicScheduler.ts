import { mulberry32 } from "./tiers";
import type { BiomeName, MusicState } from "./types";

/**
 * Pure (no Web Audio) part of the music system: a lookahead step scheduler and pattern generators.
 * The engine calls `advance(now, ahead, emit)` often from a light timer; notes are scheduled on the
 * audio clock `ahead` seconds in advance, so main-thread jitter never moves a note.
 */
export class StepScheduler {
  private nextStep = 0;
  private nextTime = 0;
  private started = false;

  constructor(
    public bpm: number,
    public readonly stepsPerBeat = 4,
  ) {}

  get stepDur(): number {
    return 60 / this.bpm / this.stepsPerBeat;
  }

  /** Anchor step 0 at audio time `t0`. */
  start(t0: number): void {
    this.nextStep = 0;
    this.nextTime = t0;
    this.started = true;
  }

  get isStarted(): boolean {
    return this.started;
  }

  stop(): void {
    this.started = false;
  }

  /**
   * Emit every step whose time falls before `now + ahead`. If the page stalled (now is far past the
   * next step), skip missed steps instead of bursting them all at once.
   * Returns how many steps were emitted.
   */
  advance(now: number, ahead: number, emit: (step: number, time: number) => void): number {
    if (!this.started) return 0;
    const dur = this.stepDur;
    const late = now - this.nextTime;
    if (late > 0.25) {
      const skip = Math.floor(late / dur);
      this.nextStep += skip;
      this.nextTime += skip * dur;
    }
    let n = 0;
    while (this.nextTime < now + ahead) {
      emit(this.nextStep, this.nextTime);
      this.nextStep++;
      this.nextTime += dur;
      n++;
    }
    return n;
  }
}

export type MusicLayer = "pad" | "melody" | "bass" | "drums" | "boss";
export const MUSIC_LAYERS: readonly MusicLayer[] = ["pad", "melody", "bass", "drums", "boss"];

/** Target gain per layer for each music state. Layers fade (1-2 s) toward these. */
export const LAYER_GAINS: Record<MusicState, Record<MusicLayer, number>> = {
  walk: { pad: 1, melody: 0.8, bass: 0.35, drums: 0, boss: 0 },
  battle: { pad: 0.6, melody: 0.5, bass: 1, drums: 1, boss: 0 },
  boss: { pad: 0.5, melody: 0.2, bass: 1, drums: 1.2, boss: 1 },
  victory: { pad: 1, melody: 1, bass: 0.4, drums: 0, boss: 0 },
};

export interface BiomeMusic {
  bpm: number;
  /** MIDI root. */
  root: number;
  /** Scale in semitones from the root. */
  scale: readonly number[];
  /** One chord (semitone offsets from root) per bar. */
  chords: readonly (readonly number[])[];
  /** Probability a melody slot sounds. */
  density: number;
  seed: number;
  /** Ch2 voicing (T3.3). Absent = the Ch1 voicing, byte-identical to before. */
  style?: "celesta" | "fen" | "willow";
}

export const STEPS_PER_BAR = 16;

/** Placeholder-but-musical material: pentatonic / modal scales, one chord per bar. */
export const BIOME_MUSIC: Record<BiomeName, BiomeMusic> = {
  forest: {
    bpm: 92,
    root: 62,
    scale: [0, 2, 4, 7, 9], // D major pentatonic
    chords: [
      [0, 4, 7],
      [-3, 0, 4],
      [-7, -3, 0],
      [-5, -1, 2],
    ], // I vi IV V
    density: 0.6,
    seed: 0xf0e57,
  },
  ruins: {
    bpm: 76,
    root: 62,
    scale: [0, 3, 5, 7, 10], // D minor pentatonic
    chords: [
      [0, 3, 7],
      [-2, 2, 5],
      [-7, -3, 0],
      [0, 3, 7],
    ], // Dm C G Dm
    density: 0.5,
    seed: 0x2d1a5,
  },
  cave: {
    bpm: 60,
    root: 52,
    scale: [0, 1, 3, 7, 8], // E phrygian-flavoured pentatonic
    chords: [
      [0, 7, 12],
      [1, 8, 12],
      [0, 7, 10],
      [-2, 5, 10],
    ],
    density: 0.3,
    seed: 0xca7e5,
  },
  boss: {
    bpm: 84,
    root: 38,
    scale: [0, 1, 3, 6, 7],
    chords: [
      [0, 7],
      [1, 8],
      [0, 7],
      [-2, 5],
    ],
    density: 0.4,
    seed: 0xb055,
  },
  // ---- Chapter 2 (T3.3, docs/vfx/ch2-art-direction.md 6.2) ----
  hushwood: {
    bpm: 72,
    root: 62,
    scale: [0, 2, 3, 5, 7, 9, 10], // D dorian
    chords: [
      [0, 3, 7, 14], // Dm9
      [-7, -3, 0], // G/D
      [3, 7, 10], // Fmaj7 (shell)
      [-2, 2, 5], // C
    ],
    density: 0.45,
    seed: 0x4a5d1,
    style: "celesta",
  },
  fen: {
    bpm: 66,
    root: 57,
    scale: [0, 2, 4, 6, 7, 9, 11], // A lydian
    chords: [
      [0, 4, 7], // A
      [2, 6, 9], // B/A
      [0, 4, 7], // A
      [7, 11, 14], // E/A
    ],
    density: 0.5,
    seed: 0xfe7d2,
    style: "fen",
  },
  grove: {
    bpm: 88,
    root: 50,
    scale: [0, 2, 3, 5, 7, 8, 11], // D harmonic minor (the Willow's Heart / boss theme)
    chords: [
      [0, 3, 7], // Dm
      [-4, 0, 3], // Bb
      [-7, -4, 0], // Gm
      [-5, -1, 2, 5], // A7
    ],
    density: 0.4,
    seed: 0x3177,
    style: "willow",
  },
};

/** The Willow resolved to D major once freed (Dmaj9 on the last bar, then the plain triad). */
export const FREED_CHORDS: readonly (readonly number[])[] = [
  [0, 4, 7],
  [-3, 0, 4],
  [-7, -3, 0],
  [0, 4, 7, 14],
];

export const PATTERN_BARS = 4;
export const PATTERN_STEPS = PATTERN_BARS * STEPS_PER_BAR;

/**
 * Deterministic melody: a random walk over scale degrees (2 octaves) on 8th-note slots,
 * `null` = rest. Same biome always yields the same tune.
 */
export function melodyPattern(biome: BiomeName): (number | null)[] {
  const cfg = BIOME_MUSIC[biome];
  const rng = mulberry32(cfg.seed);
  const span = cfg.scale.length * 2;
  const steps: (number | null)[] = new Array<number | null>(PATTERN_STEPS).fill(null);
  let deg = Math.floor(span / 2);
  const walk = [-2, -1, -1, 0, 1, 1, 2];
  for (let i = 0; i < PATTERN_STEPS; i += 2) {
    deg = Math.min(span - 1, Math.max(0, deg + (walk[Math.floor(rng() * walk.length)] ?? 0)));
    const strong = i % STEPS_PER_BAR === 0;
    if (strong || rng() < cfg.density) steps[i] = deg;
  }
  return steps;
}

/** Scale degree (0..2*len-1) -> MIDI note. */
export function degreeToMidi(cfg: BiomeMusic, deg: number): number {
  const len = cfg.scale.length;
  return cfg.root + 12 * Math.floor(deg / len) + (cfg.scale[deg % len] ?? 0);
}

export type DrumHit = "kick" | "snare" | "hat" | null;

/** Basic 16-step drum bar; `driving` adds extra kicks (battle/boss). */
export function drumStep(stepInBar: number, driving: boolean): DrumHit {
  if (stepInBar === 0 || stepInBar === 8) return "kick";
  if (driving && (stepInBar === 10 || stepInBar === 3)) return "kick";
  if (stepInBar === 4 || stepInBar === 12) return "snare";
  if (stepInBar % 2 === 0) return "hat";
  return null;
}

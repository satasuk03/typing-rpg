import type { Synth } from "./synth";
import type { BiomeName } from "./types";

/** Crossfade time between biomes (spec: 1-2 s). */
export const CROSSFADE_SEC = 1.5;

export interface AmbienceMix {
  wind: number;
  leaves: number;
  caveAir: number;
  drone: number;
  /** Sparse one-shot layers (probability/level scale, 0 = off). */
  birds: number;
  drips: number;
  crackle: number;
}

/** Layer levels per biome (0..1 multipliers of each layer's base gain). Pure table, unit-tested. */
export const AMBIENCE_MIX: Record<BiomeName, AmbienceMix> = {
  forest: { wind: 1, leaves: 1, caveAir: 0, drone: 0, birds: 1, drips: 0, crackle: 0 },
  ruins: { wind: 0.8, leaves: 0.25, caveAir: 0.15, drone: 0.1, birds: 0, drips: 0, crackle: 1 },
  cave: { wind: 0, leaves: 0, caveAir: 1, drone: 0.5, birds: 0, drips: 1, crackle: 0.25 },
  boss: { wind: 0.1, leaves: 0, caveAir: 0.7, drone: 1.3, birds: 0, drips: 0.2, crackle: 0.5 },
};

/** Reverb send scale per biome (POC `0.5 + biome * 1.1`: forest dry, cave wet). */
export const REVERB_BIAS: Record<BiomeName, number> = {
  forest: 0.5,
  ruins: 0.8,
  cave: 1.5,
  boss: 1.7,
};

interface Loop {
  g: GainNode;
  base: number;
}

/**
 * Per-biome ambience ported from the POC `startAmbience`/`tick`: looping filtered noise beds
 * (wind, leaves, cave air), a two-sine drone, plus scheduled sparse one-shots (birds, drips, torch crackle).
 * Layer gains crossfade with setTargetAtTime so a biome change never clicks.
 */
export class Ambience {
  private readonly loops: Record<"wind" | "leaves" | "caveAir" | "drone", Loop>;
  private mix: AmbienceMix = AMBIENCE_MIX.forest;
  private nextBird = 0;
  private nextDrip = 0;
  private nextCrackle = 0;
  private scheduledUntil = 0;

  constructor(private readonly s: Synth) {
    const ctx = s.ctx;
    const dest = s.mixer.buses.ambience;
    const mkLoop = (
      type: BiquadFilterType,
      f: number,
      q: number,
      base: number,
    ): Loop & { fl: BiquadFilterNode } => {
      const src = ctx.createBufferSource();
      src.buffer = s.noiseBuf;
      src.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(fl);
      fl.connect(g);
      g.connect(dest);
      src.start(0, s.rng() * 1.5);
      return { g, fl, base };
    };
    const wind = mkLoop("bandpass", 480, 0.5, 0.07);
    const leaves = mkLoop("highpass", 5000, 0.4, 0.012);
    const caveAir = mkLoop("lowpass", 140, 0.7, 0.11);

    const d1 = ctx.createOscillator();
    const d2 = ctx.createOscillator();
    const dg = ctx.createGain();
    d1.frequency.value = 55;
    d2.frequency.value = 82.6;
    d1.type = "sine";
    d2.type = "sine";
    dg.gain.value = 0;
    d1.connect(dg);
    d2.connect(dg);
    dg.connect(dest);
    d1.start();
    d2.start();

    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.09;
    lg.gain.value = 260;
    lfo.connect(lg);
    lg.connect(wind.fl.frequency);
    lfo.start();

    this.loops = { wind, leaves, caveAir, drone: { g: dg, base: 0.05 } };
  }

  setBiome(biome: BiomeName, fadeSec: number = CROSSFADE_SEC): void {
    this.mix = AMBIENCE_MIX[biome];
    this.s.reverbBias = REVERB_BIAS[biome];
    const t = this.s.now();
    const tc = Math.max(0.05, fadeSec / 3);
    for (const k of ["wind", "leaves", "caveAir", "drone"] as const) {
      const l = this.loops[k];
      l.g.gain.setTargetAtTime(l.base * this.mix[k], t, tc);
    }
  }

  /** Lookahead scheduler for sparse one-shots. Call often (cheap); schedules up to `ahead` seconds. */
  schedule(now: number, ahead: number): void {
    const end = now + ahead;
    if (this.scheduledUntil < now) this.scheduledUntil = now;
    const { s, mix } = this;
    while (this.nextBird < end) {
      const t = Math.max(this.nextBird, now);
      this.nextBird = t + 1.6 + s.rng() * 3.5;
      if (mix.birds > 0.4) {
        const b = 2400 + s.rng() * 1600;
        const n = 2 + Math.floor(s.rng() * 4);
        const pan = s.rng() * 1.6 - 0.8;
        for (let i = 0; i < n; i++) {
          const tt = t + i * (0.07 + s.rng() * 0.05);
          s.osc(
            "sine",
            b * (1 + s.rng() * 0.2),
            b * (1.3 + s.rng() * 0.3),
            tt,
            0.06,
            0.035 * mix.birds,
            {
              slide: 0.05,
              wet: 0.3,
              pan,
              bus: "ambience",
            },
          );
        }
      }
    }
    while (this.nextDrip < end) {
      const t = Math.max(this.nextDrip, now);
      this.nextDrip = t + 0.8 + s.rng() * 2.4;
      if (mix.drips > 0.15) {
        const fr = 900 + s.rng() * 900;
        s.osc("sine", fr * 1.6, fr, t, 0.07, 0.07 * mix.drips, {
          slide: 0.04,
          wet: 0.9,
          pan: s.rng() * 1.6 - 0.8,
          bus: "ambience",
        });
      }
    }
    while (this.nextCrackle < end) {
      const t = Math.max(this.nextCrackle, now);
      this.nextCrackle = t + 0.04 + s.rng() * 0.18;
      if (mix.crackle > 0.2) {
        s.noise(
          t,
          0.012 + s.rng() * 0.02,
          (0.03 + s.rng() * 0.06) * mix.crackle,
          "highpass",
          1500 + s.rng() * 2500,
          1500,
          {
            wet: 0.05,
            pan: s.rng() - 0.5,
            bus: "ambience",
          },
        );
      }
    }
    this.scheduledUntil = end;
  }
}

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
  /** Ch2 sparse layers (T3.3). 0 = off (all Ch1 biomes), and then no rng is drawn for them. */
  crickets: number;
  owl: number;
  frogs: number;
  /** Looped highpass-noise bed (7 kHz, slow tremolo). */
  insects: number;
  /** Drip length / reverb send overrides (fen: shorter, wetter). Absent = the Ch1 drip. */
  dripDur?: number;
  dripWet?: number;
}

/** Layer levels per biome (0..1 multipliers of each layer's base gain). Pure table, unit-tested. */
const NO_CH2 = { crickets: 0, owl: 0, frogs: 0, insects: 0 } as const;

export const AMBIENCE_MIX: Record<BiomeName, AmbienceMix> = {
  forest: { wind: 1, leaves: 1, caveAir: 0, drone: 0, birds: 1, drips: 0, crackle: 0, ...NO_CH2 },
  ruins: {
    wind: 0.8,
    leaves: 0.25,
    caveAir: 0.15,
    drone: 0.1,
    birds: 0,
    drips: 0,
    crackle: 1,
    ...NO_CH2,
  },
  cave: {
    wind: 0,
    leaves: 0,
    caveAir: 1,
    drone: 0.5,
    birds: 0,
    drips: 1,
    crackle: 0.25,
    ...NO_CH2,
  },
  boss: {
    wind: 0.1,
    leaves: 0,
    caveAir: 0.7,
    drone: 1.3,
    birds: 0,
    drips: 0.2,
    crackle: 0.5,
    ...NO_CH2,
  },
  // Chapter 2 (T3.3, brief 6.3). Night forest: no birds; crickets and a sparse owl.
  hushwood: {
    wind: 0.6,
    leaves: 0.5,
    caveAir: 0,
    drone: 0,
    birds: 0,
    drips: 0,
    crackle: 0,
    crickets: 1,
    owl: 1,
    frogs: 0,
    insects: 0,
  },
  // Fen: frogs, short wet drips, a quiet insect bed.
  fen: {
    wind: 0.3,
    leaves: 0,
    caveAir: 0,
    drone: 0,
    birds: 0,
    drips: 0.6,
    crackle: 0,
    crickets: 0,
    owl: 0,
    frogs: 1,
    insects: 1,
    dripDur: 0.04,
    dripWet: 1,
  },
  // The Willow's grove: the night forest at 0.6, with a low drone under the boss fight.
  grove: {
    wind: 0.36,
    leaves: 0.3,
    caveAir: 0,
    drone: 0.3,
    birds: 0,
    drips: 0,
    crackle: 0,
    crickets: 0.6,
    owl: 0.6,
    frogs: 0,
    insects: 0,
  },
};

/** Wind bandpass centre and LFO rate for the Ch2 beds (Ch1 keeps the original 480 Hz / 0.09 Hz). */
export const WIND_SHAPE: Partial<Record<BiomeName, { hz: number; lfo: number }>> = {
  hushwood: { hz: 380, lfo: 0.07 },
  grove: { hz: 380, lfo: 0.07 },
  fen: { hz: 380, lfo: 0.07 },
};

/** Reverb send scale per biome (POC `0.5 + biome * 1.1`: forest dry, cave wet). */
export const REVERB_BIAS: Record<BiomeName, number> = {
  forest: 0.5,
  ruins: 0.8,
  cave: 1.5,
  boss: 1.7,
  hushwood: 1.0,
  fen: 1.2,
  grove: 1.6,
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
  private readonly loops: Record<"wind" | "leaves" | "caveAir" | "drone" | "insects", Loop>;
  private readonly windFilter: BiquadFilterNode;
  private readonly windLfo: OscillatorNode;
  private nextCricket = 0;
  private nextOwl = 0;
  private nextFrog = 0;
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
    this.windFilter = wind.fl;
    this.windLfo = lfo;

    // Ch2 insect bed: highpass noise at 7 kHz with a slow tremolo (fixed buffer offset: no rng draw, Ch1 stream intact).
    const isrc = ctx.createBufferSource();
    isrc.buffer = s.noiseBuf;
    isrc.loop = true;
    const ifl = ctx.createBiquadFilter();
    ifl.type = "highpass";
    ifl.frequency.value = 7000;
    ifl.Q.value = 0.5;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const ilfo = ctx.createOscillator();
    const ilg = ctx.createGain();
    ilfo.frequency.value = 0.13;
    ilg.gain.value = 0.4;
    ilfo.connect(ilg);
    ilg.connect(trem.gain);
    const ig = ctx.createGain();
    ig.gain.value = 0;
    isrc.connect(ifl);
    ifl.connect(trem);
    trem.connect(ig);
    ig.connect(dest);
    isrc.start(0, 0.37);
    ilfo.start();

    this.loops = {
      wind,
      leaves,
      caveAir,
      drone: { g: dg, base: 0.05 },
      insects: { g: ig, base: 0.006 },
    };
  }

  setBiome(biome: BiomeName, fadeSec: number = CROSSFADE_SEC): void {
    this.mix = AMBIENCE_MIX[biome];
    this.s.reverbBias = REVERB_BIAS[biome];
    const t = this.s.now();
    const tc = Math.max(0.05, fadeSec / 3);
    for (const k of ["wind", "leaves", "caveAir", "drone", "insects"] as const) {
      const l = this.loops[k];
      l.g.gain.setTargetAtTime(l.base * this.mix[k], t, tc);
    }
    const shape = WIND_SHAPE[biome];
    this.windFilter.frequency.setTargetAtTime(shape?.hz ?? 480, t, tc);
    this.windLfo.frequency.setTargetAtTime(shape?.lfo ?? 0.09, t, tc);
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
        s.osc("sine", fr * 1.6, fr, t, mix.dripDur ?? 0.07, 0.07 * mix.drips, {
          slide: 0.04,
          wet: mix.dripWet ?? 0.9,
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
    this.scheduleCh2(now, end);
    this.scheduledUntil = end;
  }

  /** Ch2 one-shots. Disabled layers advance a fixed step and draw no rng, so Ch1 beds are untouched. */
  private scheduleCh2(now: number, end: number): void {
    const { s, mix } = this;
    // crickets: a chirp of 3 sine pulses (4.6 kHz, 18 ms apart) every 0.4-1.2 s, from 3 panned voices.
    while (this.nextCricket < end) {
      const t = Math.max(this.nextCricket, now);
      if (mix.crickets > 0.1) {
        this.nextCricket = t + 0.4 + s.rng() * 0.8;
        const pan = (Math.floor(s.rng() * 3) - 1) * 0.7;
        for (let i = 0; i < 3; i++)
          s.osc("sine", 4600, 4600, t + i * 0.018, 0.012, 0.012 * mix.crickets, {
            lp: 5200,
            wet: 0.2,
            pan,
            bus: "ambience",
          });
      } else this.nextCricket = t + 1;
    }
    // owl: two sine hoots 380 -> 360 Hz, 0.35 s each, 0.5 s apart, every 9-20 s (never closer than 9 s).
    while (this.nextOwl < end) {
      const t = Math.max(this.nextOwl, now);
      if (mix.owl > 0.1) {
        this.nextOwl = t + 9 + s.rng() * 11;
        const pan = s.rng() * 1.2 - 0.6;
        for (let i = 0; i < 2; i++)
          s.osc("sine", 380, 360, t + i * 0.5, 0.35, 0.05 * mix.owl, {
            a: 0.06,
            wet: 0.8,
            pan,
            bus: "ambience",
          });
      } else this.nextOwl = t + 1;
    }
    // frogs: bursts of 2-3 croaks (square 90 -> 70 Hz, 30 Hz wobble = two oscillators 30 Hz apart, 0.12 s, lp 700).
    while (this.nextFrog < end) {
      const t = Math.max(this.nextFrog, now);
      if (mix.frogs > 0.1) {
        this.nextFrog = t + 1.5 + s.rng() * 2.5;
        const n = 2 + Math.floor(s.rng() * 2);
        const pan = s.rng() * 1.6 - 0.8;
        for (let i = 0; i < n; i++)
          for (const d of [-15, 15])
            s.osc("square", 90 + d, 70 + d, t + i * 0.2, 0.12, 0.018 * mix.frogs, {
              lp: 700,
              wet: 0.3,
              pan,
              bus: "ambience",
            });
      } else this.nextFrog = t + 1;
    }
  }
}

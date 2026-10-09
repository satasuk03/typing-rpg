import {
  BIOME_MUSIC,
  type BiomeMusic,
  degreeToMidi,
  drumStep,
  LAYER_GAINS,
  MUSIC_LAYERS,
  type MusicLayer,
  melodyPattern,
  PATTERN_STEPS,
  STEPS_PER_BAR,
  StepScheduler,
} from "./musicScheduler";
import type { Synth } from "./synth";
import { midiToHz } from "./tiers";
import type { BiomeName, MusicState } from "./types";

const LAYER_FADE_TC = 0.6; // ~2 s to settle
const SILENT = 0.02;

/**
 * Procedural placeholder music: a 4-bar loop per biome (pentatonic/modal), as layers that fade by state.
 * pad + melody = exploration, + bass/drums = battle, + low ostinato = boss. Notes are scheduled on the
 * audio clock by `StepScheduler` (lookahead); layers whose target gain is ~0 schedule nothing (CPU-light).
 */
export class Music {
  private readonly layers = {} as Record<MusicLayer, GainNode>;
  private readonly sched = new StepScheduler(90, 4);
  private biome: BiomeName = "forest";
  private pendingBiome: BiomeName | null = null;
  private state: MusicState = "walk";
  private cfg: BiomeMusic = BIOME_MUSIC.forest;
  private melody = melodyPattern("forest");

  constructor(private readonly s: Synth) {
    for (const l of MUSIC_LAYERS) {
      const g = s.ctx.createGain();
      g.gain.value = 0;
      g.connect(s.mixer.buses.music);
      this.layers[l] = g;
    }
    this.applyState(true);
  }

  getState(): MusicState {
    return this.state;
  }

  getBiome(): BiomeName {
    return this.biome;
  }

  /** Switch biome material. While playing, the tune/tempo swap lands at the next bar boundary. */
  setBiome(b: BiomeName): void {
    this.biome = b;
    if (this.sched.isStarted) this.pendingBiome = b;
    else this.applyBiome(b);
  }

  private applyBiome(b: BiomeName): void {
    this.cfg = BIOME_MUSIC[b];
    this.melody = melodyPattern(b);
    this.sched.bpm = this.cfg.bpm;
  }

  setState(st: MusicState): void {
    this.state = st;
    this.applyState(false);
  }

  start(): void {
    if (!this.sched.isStarted) this.sched.start(this.s.now() + 0.1);
  }

  private applyState(immediate: boolean): void {
    const t = this.s.now();
    for (const l of MUSIC_LAYERS) {
      const target = LAYER_GAINS[this.state][l] * 0.9;
      if (immediate) this.layers[l].gain.setValueAtTime(target, t);
      else this.layers[l].gain.setTargetAtTime(target, t, LAYER_FADE_TC);
    }
  }

  private on(l: MusicLayer): boolean {
    return LAYER_GAINS[this.state][l] > SILENT;
  }

  schedule(now: number, ahead: number): void {
    this.sched.advance(now, ahead, (step, time) => this.step(step % PATTERN_STEPS, time));
  }

  private step(i: number, t: number): void {
    if (this.pendingBiome && i % STEPS_PER_BAR === 0) {
      this.applyBiome(this.pendingBiome);
      this.pendingBiome = null;
    }
    const { s, cfg } = this;
    const bar = Math.floor(i / STEPS_PER_BAR);
    const inBar = i % STEPS_PER_BAR;
    const chord = cfg.chords[bar % cfg.chords.length] ?? [0];
    const stepDur = this.sched.stepDur;
    const m = (l: MusicLayer) => ({ bus: "music" as const, dest: this.layers[l] });

    if (inBar === 0 && this.on("pad")) {
      const len = stepDur * STEPS_PER_BAR;
      for (const off of chord) {
        const f = midiToHz(cfg.root + off - 12);
        s.osc("triangle", f, f, t, len * 0.9, 0.07, {
          ...m("pad"),
          a: len * 0.35,
          hold: len * 0.2,
          wet: 0.5,
          detune: -5,
        });
        s.osc("sine", f * 2, f * 2, t, len * 0.8, 0.025, {
          ...m("pad"),
          a: len * 0.4,
          wet: 0.6,
          detune: 5,
        });
      }
    }

    if (i % 2 === 0 && this.on("melody")) {
      const deg = this.melody[i];
      if (deg != null) {
        const f = midiToHz(degreeToMidi(cfg, deg) + 12);
        s.osc("triangle", f, f, t, stepDur * 3, 0.06, { ...m("melody"), wet: 0.5, lp: 3500 });
      }
    }

    if (this.on("bass")) {
      const drive = this.state === "battle" || this.state === "boss";
      if (inBar % 4 === 0 || (drive && inBar % 2 === 0)) {
        const off = (inBar / 2) % 2 === 1 && drive ? 7 : 0;
        const f = midiToHz(cfg.root + (chord[0] ?? 0) + off - 24);
        s.osc("sawtooth", f, f, t, stepDur * (drive ? 1.6 : 3), 0.1, {
          ...m("bass"),
          lp: 500,
          wet: 0.05,
        });
      }
    }

    if (this.on("drums")) {
      const hit = drumStep(inBar, true);
      if (hit === "kick")
        s.osc("sine", 140, 45, t, 0.16, 0.35, { ...m("drums"), slide: 0.1, wet: 0 });
      else if (hit === "snare")
        s.noise(t, 0.12, 0.16, "bandpass", 1800, 1200, { ...m("drums"), q: 0.9, wet: 0.15 });
      else if (hit === "hat")
        s.noise(t, 0.03, 0.05, "highpass", 8000, 8000, { ...m("drums"), wet: 0 });
    }

    if (this.on("boss")) {
      if ([0, 3, 6, 8, 11, 14].includes(inBar)) {
        const f = midiToHz(cfg.root + (chord[0] ?? 0) - 12 + (inBar === 6 || inBar === 14 ? 1 : 0));
        s.osc("sawtooth", f, f, t, stepDur * 2, 0.09, { ...m("boss"), lp: 900, q: 3, wet: 0.2 });
      }
      if (inBar === 0) {
        for (const off of chord) {
          const f = midiToHz(cfg.root + off);
          s.osc("sawtooth", f, f * 1.003, t, stepDur * 6, 0.04, {
            ...m("boss"),
            lp: 1400,
            a: 0.05,
            wet: 0.4,
          });
        }
      }
    }
  }
}

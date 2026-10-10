import type { Mixer } from "./mixer";
import { midiToHz } from "./tiers";
import type { BusId, Rng } from "./types";

export interface VoiceOpts {
  bus?: BusId;
  /** Connect dry output here instead of the bus gain (e.g. a music layer gain). */
  dest?: AudioNode;
  wet?: number;
  pan?: number;
  a?: number;
  hold?: number;
  slide?: number;
  detune?: number;
  lp?: number;
  q?: number;
  rate?: number;
}

/** Web Audio nominal frequency range (Chrome warns outside [0, Nyquist]); high partials of bells and tier-up arpeggios can exceed it. */
export const FREQ_MIN = 20;
export const FREQ_MAX = 20000;
export const clampHz = (hz: number): number =>
  Number.isFinite(hz) ? Math.min(FREQ_MAX, Math.max(FREQ_MIN, hz)) : FREQ_MIN;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Low-level voice helpers ported from the POC `SFX` (`osc`, `noise`, `bell`, `env`, `out`).
 * Differences from the POC: no `Math.random` (injected `rng`), per-bus routing, per-bus reverb sends,
 * and the noise buffer is allocated once here and shared by every voice.
 */
export class Synth {
  readonly noiseBuf: AudioBuffer;
  /** Reverb scale (0.5 forest .. 1.6 boss), POC `0.5 + biome * 1.1`. */
  reverbBias = 0.5;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly mixer: Mixer,
    readonly rng: Rng,
  ) {
    this.noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
  }

  now(): number {
    return this.ctx.currentTime;
  }

  /** Route a voice's output gain to its bus (dry) and optionally to that bus's reverb (wet). */
  out(node: AudioNode, wet: number, pan: number, bus: BusId, dest?: AudioNode): void {
    let n = node;
    if (pan !== 0) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      n.connect(p);
      n = p;
    }
    n.connect(dest ?? this.mixer.buses[bus]);
    const verb = this.mixer.reverbs[bus];
    if (wet > 0.03 && verb) {
      const g = this.ctx.createGain();
      g.gain.value = wet * this.reverbBias;
      n.connect(g);
      g.connect(verb);
    }
  }

  env(g: GainNode, t: number, a: number, peak: number, d: number, hold = 0): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (hold) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }

  osc(
    type: OscillatorType,
    f0: number,
    f1: number,
    t: number,
    dur: number,
    gain: number,
    o: VoiceOpts = {},
  ): OscillatorNode {
    const s = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    s.type = type;
    const hz0 = clampHz(f0);
    const hz1 = clampHz(f1);
    s.frequency.setValueAtTime(hz0, t);
    if (hz1 !== hz0) s.frequency.exponentialRampToValueAtTime(hz1, t + (o.slide ?? dur));
    if (o.detune) s.detune.value = o.detune;
    const a = o.a ?? 0.004;
    this.env(g, t, a, gain, dur, o.hold ?? 0);
    let n: AudioNode = s;
    if (o.lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = clampHz(o.lp);
      f.Q.value = o.q ?? 0.7;
      s.connect(f);
      n = f;
    }
    n.connect(g);
    this.out(g, o.wet ?? 0.15, o.pan ?? 0, o.bus ?? "sfx", o.dest);
    s.start(t);
    s.stop(t + a + (o.hold ?? 0) + dur + 0.05);
    return s;
  }

  noise(
    t: number,
    dur: number,
    gain: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    o: VoiceOpts = {},
  ): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = o.rate ?? 1;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    const hz0 = clampHz(f0);
    const hz1 = clampHz(f1);
    f.frequency.setValueAtTime(hz0, t);
    if (hz1 !== hz0) f.frequency.exponentialRampToValueAtTime(hz1, t + (o.slide ?? dur));
    f.Q.value = o.q ?? 0.8;
    const g = this.ctx.createGain();
    const a = o.a ?? 0.003;
    this.env(g, t, a, gain, dur, o.hold ?? 0);
    s.connect(f);
    f.connect(g);
    this.out(g, o.wet ?? 0.15, o.pan ?? 0, o.bus ?? "sfx", o.dest);
    s.start(t, this.rng() * 1.5);
    s.stop(t + a + (o.hold ?? 0) + dur + 0.05);
  }

  bell(
    f: number,
    t: number,
    dur: number,
    gain: number,
    wet = 0.4,
    ratios: readonly number[] = [1, 2.76, 5.4, 8.93],
    bus: BusId = "sfx",
    dest?: AudioNode,
  ): void {
    ratios.forEach((r, i) => {
      const o: VoiceOpts = { wet, bus };
      if (dest) o.dest = dest; // music layers route here (T3.3); omitted for SFX so Ch1 option objects are unchanged
      this.osc("sine", f * r, f * r, t, dur / (1 + i * 0.6), gain / (1 + i * 0.9), o);
    });
  }

  hz(midi: number): number {
    return midiToHz(midi);
  }
}

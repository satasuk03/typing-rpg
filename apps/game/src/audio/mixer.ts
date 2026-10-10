import { type AudioSettings, channelGain, cloneSettings, DEFAULT_SETTINGS } from "./settings";
import { BUS_IDS, type BusId, type MixerChannel, type Rng } from "./types";

/** Time constant (s) for gain changes: fast enough to feel instant, slow enough to avoid zipper noise. */
const GAIN_TC = 0.03;

/** Noise-based stereo impulse response (ported from the POC `impulse`), seeded for reproducibility. */
export function makeImpulse(
  ctx: BaseAudioContext,
  sec: number,
  decay: number,
  rng: Rng,
): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (rng() * 2 - 1) * (1 - i / len) ** decay * (i < 80 ? i / 80 : 1);
    }
  }
  return b;
}

/** `silence()` low-pass range (Hz) and duck depth (dB at amount 1). Art direction 5.2. */
export const SILENCE_OPEN_HZ = 18000;
export const SILENCE_CLOSED_HZ = 350;
export const SILENCE_DUCK_DB = -12;
const SILENCED_BUSES: readonly BusId[] = ["music", "ambience"];

/** Low-pass cutoff (exponential in `amount`: 0 -> 18 kHz, 0.75 -> ~960 Hz, 1 -> 350 Hz). */
export const silenceCutoffHz = (amount: number): number =>
  SILENCE_OPEN_HZ * (SILENCE_CLOSED_HZ / SILENCE_OPEN_HZ) ** amount;
/** Duck gain (linear): -12 dB at 1, -9 dB at 0.75, exactly 1 at 0. */
export const silenceDuckGain = (amount: number): number => 10 ** ((SILENCE_DUCK_DB * amount) / 20);

/**
 * Mixer graph: bus gains (sfx, ui, ambience, music) -> master gain -> limiter -> destination.
 * Wet buses (sfx, ambience, music) each have a convolver reverb feeding back into that bus gain,
 * so muting a bus also silences its reverb tail.
 */
export class Mixer {
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly buses: Record<BusId, GainNode>;
  readonly reverbs: Partial<Record<BusId, ConvolverNode>> = {};
  /** music + ambience: bus gain -> low-pass -> duck gain -> master (the `silence()` path). */
  readonly silenceFilters: Partial<Record<BusId, BiquadFilterNode>> = {};
  readonly silenceDucks: Partial<Record<BusId, GainNode>> = {};
  /** Music that bypasses `silence()` (the spark motif): follows the music bus volume, goes straight to master. */
  readonly musicDirect: GainNode;
  readonly musicDirectReverb: ConvolverNode;
  private silenceAmount = 0;
  private settings: AudioSettings = cloneSettings(DEFAULT_SETTINGS);

  constructor(
    private readonly ctx: BaseAudioContext,
    rng: Rng,
  ) {
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -14;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.16;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(this.limiter);

    const ir = makeImpulse(ctx, 3.2, 2.6, rng);
    this.buses = {} as Record<BusId, GainNode>;
    for (const id of BUS_IDS) {
      const g = ctx.createGain();
      if (SILENCED_BUSES.includes(id)) {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = SILENCE_OPEN_HZ;
        lp.Q.value = 0.7;
        const duck = ctx.createGain();
        g.connect(lp);
        lp.connect(duck);
        duck.connect(this.master);
        this.silenceFilters[id] = lp;
        this.silenceDucks[id] = duck;
      } else g.connect(this.master);
      this.buses[id] = g;
      if (id !== "ui") {
        const conv = ctx.createConvolver();
        conv.buffer = ir;
        conv.connect(g);
        this.reverbs[id] = conv;
      }
    }
    this.musicDirect = ctx.createGain();
    this.musicDirect.connect(this.master);
    this.musicDirectReverb = ctx.createConvolver();
    this.musicDirectReverb.buffer = ir;
    this.musicDirectReverb.connect(this.musicDirect);
  }

  /**
   * Prologue "silence": music + ambience low-pass 18 kHz -> 350 Hz (exponential in `amount`) and duck up to -12 dB.
   * `setTargetAtTime` with tc = rampS / 3 from the CURRENT value, so retargeting mid-ramp never jumps (no clicks).
   * `silence(0)` restores the exact pre-silence gains. SFX and the `musicDirect` send are never touched.
   */
  silence(amount: number, rampS = 1.2): void {
    const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
    this.silenceAmount = a;
    const t = this.ctx.currentTime;
    const tc = Math.max(0.001, rampS / 3);
    const go = (p: AudioParam, target: number, exact: boolean): void => {
      const cur = p.value;
      p.cancelScheduledValues(t);
      p.setValueAtTime(cur, t);
      p.setTargetAtTime(target, t, tc);
      if (exact) p.setValueAtTime(target, t + tc * 9); // 9 tc: the asymptote is within 1e-4, snap it exactly
    };
    for (const id of SILENCED_BUSES) {
      const lp = this.silenceFilters[id];
      const duck = this.silenceDucks[id];
      if (lp) go(lp.frequency, silenceCutoffHz(a), a === 0);
      if (duck) go(duck.gain, silenceDuckGain(a), a === 0);
    }
  }

  get silenceLevel(): number {
    return this.silenceAmount;
  }

  /** Apply settings with smoothing (or instantly on the first call). */
  apply(s: AudioSettings, immediate = false): void {
    this.settings = cloneSettings(s);
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number): void => {
      if (immediate) g.gain.setValueAtTime(v, t);
      else g.gain.setTargetAtTime(v, t, GAIN_TC);
    };
    set(this.master, channelGain(s.master.volume, s.master.muted));
    for (const id of BUS_IDS) set(this.buses[id], channelGain(s[id].volume, s[id].muted));
    set(this.musicDirect, channelGain(s.music.volume, s.music.muted));
  }

  current(): AudioSettings {
    return cloneSettings(this.settings);
  }

  isAudible(ch: MixerChannel): boolean {
    return channelGain(this.settings[ch].volume, this.settings[ch].muted) > 0;
  }
}

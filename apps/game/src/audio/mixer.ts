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
      g.connect(this.master);
      this.buses[id] = g;
      if (id !== "ui") {
        const conv = ctx.createConvolver();
        conv.buffer = ir;
        conv.connect(g);
        this.reverbs[id] = conv;
      }
    }
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
  }

  current(): AudioSettings {
    return cloneSettings(this.settings);
  }

  isAudible(ch: MixerChannel): boolean {
    return channelGain(this.settings[ch].volume, this.settings[ch].muted) > 0;
  }
}

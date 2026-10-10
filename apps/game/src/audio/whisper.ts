import type { Synth } from "./synth";

/** Centres of the three whisper voices (Hz). */
export const WHISPER_FREQS = [1200, 1800, 2600] as const;
const FADE_IN = 0.4;
const FADE_OUT = 0.12; // the checklist wants it to stop "instantly" when the spell ends
const WALK_EVERY = 0.35;

/**
 * Held `whisperLoop` (T3.3): three looping noise voices (bandpass 1200 / 1800 / 2600, q 8, gain 0.03 each,
 * wet 1.0) whose filters do a seeded random walk. Built lazily on first use, faded in over 0.4 s, and
 * released by `stop()` (the Hush Spell ended). Driven by `update()` from the engine's lookahead timer.
 */
export class WhisperLoop {
  private voices: { fl: BiquadFilterNode; g: GainNode; src: AudioBufferSourceNode; hz: number }[] =
    [];
  private master: GainNode | null = null;
  private on = false;
  private nextWalk = 0;
  private killAt = 0;

  constructor(private readonly s: Synth) {}

  get active(): boolean {
    return this.on;
  }

  start(): void {
    if (this.on) return;
    this.dispose();
    const { s } = this;
    const ctx = s.ctx;
    const t = s.now();
    this.on = true;
    this.killAt = 0;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(1, t + FADE_IN);
    this.master = master;
    this.voices = WHISPER_FREQS.map((hz) => {
      const src = ctx.createBufferSource();
      src.buffer = s.noiseBuf;
      src.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = "bandpass";
      fl.frequency.value = hz;
      fl.Q.value = 8;
      const g = ctx.createGain();
      g.gain.value = 0.03;
      src.connect(fl);
      fl.connect(g);
      g.connect(master);
      src.start(t, s.rng() * 1.5);
      return { fl, g, src, hz };
    });
    // dry to the sfx bus plus the wet send (wet 1.0 x the biome reverb bias)
    s.out(master, 1, 0, "sfx");
    this.nextWalk = t;
  }

  stop(): void {
    if (!this.on || !this.master) return;
    const t = this.s.now();
    this.on = false;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT);
    this.killAt = t + FADE_OUT + 0.05;
  }

  /** Random-walk the filters while held; free the nodes shortly after `stop()`. */
  update(now: number): void {
    if (this.on) {
      while (this.nextWalk < now + 0.3) {
        const t = Math.max(this.nextWalk, now);
        this.nextWalk = t + WALK_EVERY;
        for (const v of this.voices)
          v.fl.frequency.setTargetAtTime(v.hz * (0.75 + this.s.rng() * 0.5), t, 0.18);
      }
    } else if (this.killAt > 0 && now >= this.killAt) {
      this.dispose();
    }
  }

  private dispose(): void {
    for (const v of this.voices) {
      v.src.stop();
      v.src.disconnect();
      v.g.disconnect();
    }
    this.master?.disconnect();
    this.voices = [];
    this.master = null;
    this.killAt = 0;
  }
}

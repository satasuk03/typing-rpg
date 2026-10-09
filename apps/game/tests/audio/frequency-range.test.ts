import { describe, expect, it } from "vitest";
import type { Mixer } from "../../src/audio/mixer";
import { SFX_VOICES } from "../../src/audio/sfx";
import { clampHz, FREQ_MAX, FREQ_MIN, Synth } from "../../src/audio/synth";
import { mulberry32 } from "../../src/audio/tiers";
import { SFX_IDS } from "../../src/audio/types";

/** Records every value written to an oscillator / filter `frequency` AudioParam. */
function makeRecorder(): { ctx: BaseAudioContext; freqs: number[] } {
  const freqs: number[] = [];
  const param = (record: boolean): Record<string, unknown> => {
    let v = 0;
    const push = (x: number): void => {
      if (record) freqs.push(x);
    };
    return {
      get value() {
        return v;
      },
      set value(x: number) {
        v = x;
        push(x);
      },
      setValueAtTime: (x: number) => push(x),
      linearRampToValueAtTime: (x: number) => push(x),
      exponentialRampToValueAtTime: (x: number) => push(x),
      setTargetAtTime: (x: number) => push(x),
    };
  };
  const node = (record: boolean): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get(target: Record<string, unknown>, k: string) {
          if (k === "connect") return () => undefined;
          if (k in target) return target[k];
          if (
            k === "frequency" ||
            ["gain", "detune", "Q", "pan", "playbackRate", "delayTime"].includes(k)
          ) {
            target[k] = param(record && k === "frequency");
            return target[k];
          }
          return () => undefined;
        },
        set(target: Record<string, unknown>, k: string, v: unknown) {
          target[k] = v;
          return true;
        },
      },
    );
  const ctx = {
    sampleRate: 48000,
    currentTime: 0,
    createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
    createOscillator: () => node(true),
    createBiquadFilter: () => node(true),
    createGain: () => node(false),
    createStereoPanner: () => node(false),
    createBufferSource: () => node(false),
  } as unknown as BaseAudioContext;
  return { ctx, freqs };
}

describe("sfx frequency range", () => {
  it("clampHz pins to the nominal range and survives NaN", () => {
    expect(clampHz(29669.4)).toBe(FREQ_MAX);
    expect(clampHz(1)).toBe(FREQ_MIN);
    expect(clampHz(Number.NaN)).toBe(FREQ_MIN);
    expect(clampHz(440)).toBe(440);
  });

  it("no Sfx id x streak 0..200 x tier 1..4 writes a frequency outside [20, 20000] Hz", () => {
    const { ctx, freqs } = makeRecorder();
    const mixer = {
      buses: new Proxy({}, { get: () => ({ connect() {} }) }),
      reverbs: {},
    } as unknown as Mixer;
    const synth = new Synth(ctx, mixer, mulberry32(7));
    for (const id of SFX_IDS) {
      for (let streak = 0; streak <= 200; streak++) {
        for (const tier of [1, 2, 3, 4]) {
          for (const boss of [false, true]) {
            SFX_VOICES[id](synth, 0, { streak, tier, count: streak, boss, heavy: boss });
          }
        }
      }
    }
    expect(freqs.length).toBeGreaterThan(1000);
    const bad = freqs.filter((f) => !(f >= FREQ_MIN && f <= FREQ_MAX));
    expect(bad.slice(0, 5)).toEqual([]);
  }, 60_000); // full sweep: heavy by design, slow under parallel CI load
});

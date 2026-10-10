import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AMBIENCE_MIX, REVERB_BIAS } from "../../src/audio/ambience";
import { AUDIO_SILENT_EVENTS } from "../../src/audio/bindings";
import { silenceCutoffHz, silenceDuckGain } from "../../src/audio/mixer";
import { Music } from "../../src/audio/music";
import { BIOME_MUSIC, melodyPattern } from "../../src/audio/musicScheduler";
import { busFor, SFX_VOICES } from "../../src/audio/sfx";
import { PROLOGUE_SFX_IDS, THEFT_NOTES } from "../../src/audio/sfxPrologue";
import { midiToHz, mulberry32 } from "../../src/audio/tiers";
import { BIOMES, SFX_IDS, type Sfx } from "../../src/audio/types";
import { DEFAULT_REGISTRIES } from "../../src/cutscene/timeline";

type Call = { kind: "osc" | "noise" | "bell"; args: unknown[] };

function node(): unknown {
  const fn = (): void => {};
  const p: unknown = new Proxy(fn, {
    get: (_t, k) => (k === "then" ? undefined : p),
    set: () => true,
    apply: () => p,
  });
  return p;
}

function fakeSynth(seed = 7) {
  const calls: Call[] = [];
  const ctx = new Proxy(
    { currentTime: 0, sampleRate: 48000 },
    { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => node()) },
  );
  const s = {
    ctx,
    mixer: { buses: { music: node(), ambience: node(), sfx: node(), ui: node() }, reverbs: {} },
    rng: mulberry32(seed),
    reverbBias: 0.5,
    noiseBuf: {},
    now: () => 0,
    env: () => {},
    osc: (...args: unknown[]) => {
      calls.push({ kind: "osc", args });
      return node();
    },
    noise: (...args: unknown[]) => void calls.push({ kind: "noise", args }),
    bell: (...args: unknown[]) => void calls.push({ kind: "bell", args }),
  };
  return { s, calls };
}

/** Ids in the art-direction 5.3 table (first backticked token of each row). */
function docIds(): string[] {
  const md = readFileSync(
    resolve(__dirname, "../../../../docs/vfx/prologue-art-direction.md"),
    "utf8",
  );
  const a = md.indexOf("### 5.3 SFX");
  const b = md.indexOf("### 5.4", a);
  const ids: string[] = [];
  for (const line of md.slice(a, b).split("\n")) {
    const m = /^\| `([A-Za-z]+)`/.exec(line);
    if (m?.[1]) ids.push(m[1]);
  }
  return ids;
}

describe("prologue audio drift", () => {
  it("the ids in code = the ids in the art-direction doc, SFX_IDS and the cutscene registry", () => {
    const doc = docIds();
    expect(doc.length).toBe(15);
    expect([...PROLOGUE_SFX_IDS].sort()).toEqual([...doc].sort());
    for (const id of doc) {
      expect(SFX_IDS, id).toContain(id);
      expect(DEFAULT_REGISTRIES.sfx.has(id), `cutscene registry: ${id}`).toBe(true);
      expect(SFX_VOICES[id as Sfx], `voice: ${id}`).toBeTypeOf("function");
    }
    expect(new Set(SFX_IDS).size).toBe(SFX_IDS.length);
  });
  it("the climax is audio-silent (the cutscene owns it); lineBlip is on the ui bus", () => {
    expect(AUDIO_SILENT_EVENTS).toContain("PrologueClimax");
    expect(busFor("lineBlip")).toBe("ui");
    expect(busFor("heartbeat")).toBe("sfx");
  });
});

describe("prologue SFX voices", () => {
  it("every voice runs without throwing and schedules something", () => {
    for (const id of PROLOGUE_SFX_IDS) {
      for (const p of [{}, { count: 3 }, { boss: true }, { heavy: true }, { count: 99 }]) {
        const { s, calls } = fakeSynth();
        // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
        expect(() => SFX_VOICES[id](s as any, 1, p), id).not.toThrow();
        expect(calls.length, id).toBeGreaterThan(0);
      }
    }
  });
  it("the 6 theft cracks step down in pitch (E6 -> E5)", () => {
    const fs: number[] = [];
    for (let i = 0; i < 6; i++) {
      const { s, calls } = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      SFX_VOICES.theftCrack(s as any, 0, { count: i });
      fs.push(calls.find((c) => c.kind === "bell")?.args[0] as number);
    }
    for (let i = 1; i < 6; i++) expect(fs[i] as number).toBeLessThan(fs[i - 1] as number);
    expect(fs[0]).toBeCloseTo(midiToHz(88), 6);
    expect(fs[5]).toBeCloseTo(midiToHz(76), 6);
    expect(THEFT_NOTES).toEqual([88, 86, 83, 81, 79, 76]);
  });
  it("emberChime rises (E7 bell, G7 triangle on top); loss sounds fall", () => {
    const { s, calls } = fakeSynth();
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    SFX_VOICES.emberChime(s as any, 0, {});
    expect(calls.find((c) => c.kind === "bell")?.args[0]).toBeCloseTo(midiToHz(86), 6);
    for (const id of ["auraCollapse", "skyTearClose"] as const) {
      const f = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      SFX_VOICES[id](f.s as any, 0, {});
      const o = f.calls.find((c) => c.kind === "osc");
      expect(o?.args[1] as number, id).toBeGreaterThan(o?.args[2] as number);
    }
  });
  it("quillScratch is deterministic per index, +-8% around 3.8 kHz, and not the key sound", () => {
    const hz = (i: number): number => {
      const { s, calls } = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      SFX_VOICES.quillScratch(s as any, 0, { count: i });
      return calls.find((c) => c.kind === "noise")?.args[4] as number;
    };
    const all = Array.from({ length: 20 }, (_, i) => hz(i));
    for (const f of all) {
      expect(f).toBeGreaterThanOrEqual(3800 * 0.92 - 1e-6);
      expect(f).toBeLessThanOrEqual(3800 * 1.08 + 1e-6);
    }
    expect(hz(5)).toBe(hz(5));
    expect(new Set(all).size).toBeGreaterThan(10);
  });
});

describe("prologue music + silence tables", () => {
  it("BIOME_MUSIC.prologue follows art direction 5.2", () => {
    expect(BIOME_MUSIC.prologue).toMatchObject({
      bpm: 112,
      root: 62,
      density: 0.7,
      style: "brass",
    });
    expect(BIOME_MUSIC.prologue.scale).toEqual([0, 2, 4, 7, 9]);
    expect(BIOME_MUSIC.prologue.chords).toEqual([
      [0, 4, 7],
      [-5, -1, 2],
      [-3, 0, 4],
      [-7, -3, 0],
    ]);
    expect(BIOMES).toContain("prologue");
    expect(AMBIENCE_MIX.prologue).toMatchObject({ wind: 0.7, crackle: 0.4, birds: 0, drips: 0 });
    expect(REVERB_BIAS.prologue).toBe(1.1);
  });
  it("the melody head is the rising fifth D5 -> A5 (MIDI 74 -> 81) on the first bar", () => {
    const m = melodyPattern("prologue");
    expect(m[0]).toBe(0);
    expect(m[4]).toBe(3);
    expect(melodyPattern("prologue")).toEqual(m);
    // the voice sounds degree + 12: root 62 + 12 + scale[0] = 74, and 62 + 12 + scale[3] = 81
    const cfg = BIOME_MUSIC.prologue;
    expect(cfg.root + 12 + (cfg.scale[m[0] as number] as number)).toBe(74);
    expect(cfg.root + 12 + (cfg.scale[m[4] as number] as number)).toBe(81);
  });
  it("the brass melody plays detuned saws and a square an octave down", () => {
    const { s, calls } = fakeSynth(9);
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    const m = new Music(s as any);
    m.setBiome("prologue");
    m.setState("battle");
    m.start();
    for (let t = 0; t < 8; t += 0.3) m.schedule(t, 0.3);
    const lead = calls.filter(
      (c) =>
        c.kind === "osc" && c.args[0] === "sawtooth" && (c.args[6] as { lp?: number }).lp === 2400,
    );
    expect(lead.length).toBeGreaterThan(2);
    expect(calls.some((c) => c.kind === "osc" && c.args[0] === "square")).toBe(true);
    const detunes = new Set(lead.map((c) => (c.args[6] as { detune?: number }).detune));
    expect(detunes).toEqual(new Set([-6, 6]));
  });
  it("silence mapping: 18 kHz -> 350 Hz exponentially, -12 dB duck, exact restore at 0", () => {
    expect(silenceCutoffHz(0)).toBe(18000);
    expect(silenceCutoffHz(1)).toBeCloseTo(350, 6);
    expect(silenceCutoffHz(0.75)).toBeGreaterThan(850);
    expect(silenceCutoffHz(0.75)).toBeLessThan(1000);
    expect(silenceDuckGain(0)).toBe(1);
    expect(20 * Math.log10(silenceDuckGain(1))).toBeCloseTo(-12, 6);
    expect(20 * Math.log10(silenceDuckGain(0.75))).toBeCloseTo(-9, 6);
  });
});

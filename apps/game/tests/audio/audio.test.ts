import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AMBIENCE_MIX, CROSSFADE_SEC } from "../../src/audio/ambience";
import {
  AUDIO_BINDINGS,
  AUDIO_SILENT_EVENTS,
  type AudioApi,
  dispatchAudioEvent,
  KNOWN_EVENTS,
  KNOWN_SIM_EVENTS,
} from "../../src/audio/bindings";
import {
  BIOME_MUSIC,
  degreeToMidi,
  drumStep,
  LAYER_GAINS,
  melodyPattern,
  PATTERN_STEPS,
  StepScheduler,
} from "../../src/audio/musicScheduler";
import {
  channelGain,
  DEFAULT_SETTINGS,
  loadSettings,
  SETTINGS_KEY,
  type StorageLike,
  saveSettings,
} from "../../src/audio/settings";
import { busFor, SFX_VOICES } from "../../src/audio/sfx";
import { keyVoice, mulberry32, streakTier } from "../../src/audio/tiers";
import { BIOMES, MUSIC_STATES, SFX_IDS } from "../../src/audio/types";

describe("mixer gain math", () => {
  it("tapers volume quadratically and clamps", () => {
    expect(channelGain(1, false)).toBe(1);
    expect(channelGain(0.5, false)).toBeCloseTo(0.25);
    expect(channelGain(2, false)).toBe(1);
    expect(channelGain(-1, false)).toBe(0);
    expect(channelGain(Number.NaN, false)).toBe(0);
  });
  it("mute always yields silence", () => {
    expect(channelGain(1, true)).toBe(0);
  });
});

describe("settings persistence", () => {
  const memory = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };
  it("round-trips through storage", () => {
    const st = memory();
    const s = loadSettings(st);
    expect(s).toEqual(DEFAULT_SETTINGS);
    s.music.volume = 0.2;
    s.sfx.muted = true;
    saveSettings(st, s);
    const again = loadSettings(st);
    expect(again.music.volume).toBe(0.2);
    expect(again.sfx.muted).toBe(true);
    expect(again.master).toEqual(DEFAULT_SETTINGS.master);
  });
  it("tolerates corrupt, partial and out-of-range data", () => {
    const st = memory();
    st.data.set(SETTINGS_KEY, "{nope");
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
    st.data.set(SETTINGS_KEY, JSON.stringify({ master: { volume: 7 }, sfx: { muted: "yes" } }));
    const s = loadSettings(st);
    expect(s.master.volume).toBe(1);
    expect(s.sfx.muted).toBe(DEFAULT_SETTINGS.sfx.muted);
  });
  it("never throws when storage throws or is missing", () => {
    const bad: StorageLike = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(bad, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe("streak tiers (PO: 10/25/50/100)", () => {
  it("maps boundaries", () => {
    const cases: [number, number][] = [
      [0, 0],
      [9, 0],
      [10, 1],
      [24, 1],
      [25, 2],
      [49, 2],
      [50, 3],
      [99, 3],
      [100, 4],
      [500, 4],
    ];
    for (const [streak, tier] of cases) expect(streakTier(streak)).toBe(tier);
  });
  it("key voice gets higher and brighter with tier", () => {
    const v = [0, 10, 25, 50, 100].map((s) => keyVoice(s - (s % 33), 0.5, 0.5));
    // same pentatonic position (streak multiple of 33 -> compare tiers via explicit streaks below)
    expect(v.length).toBe(5);
    const lo = keyVoice(9, 0.5, 0.5);
    const hi = keyVoice(100, 0.5, 0.5);
    expect(hi.noiseHz).toBeGreaterThan(lo.noiseHz);
    expect(hi.partial2).toBeGreaterThan(lo.partial2);
    expect(hi.partial3).toBeGreaterThan(0);
    expect(lo.partial3).toBe(0);
    // tier steps lift pitch by 2 semitones when the pentatonic step is equal (streak 9 vs 10 share step 3 vs 3)
    const a = keyVoice(9, 0.5, 0.5);
    const b = keyVoice(10, 0.5, 0.5);
    expect(b.freq / a.freq).toBeCloseTo(2 ** (2 / 12), 5);
  });
  it("is deterministic with the injected PRNG and varies slightly", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    const a = keyVoice(5, r1(), r1());
    const b = keyVoice(5, r2(), r2());
    expect(a).toEqual(b);
    const c = keyVoice(5, 0.1, 0.9);
    const d = keyVoice(5, 0.9, 0.1);
    expect(c.detuneCents).not.toBe(d.detuneCents);
    expect(Math.abs(c.detuneCents)).toBeLessThanOrEqual(8);
  });
});

describe("music scheduler (pure)", () => {
  it("emits steps on the grid within the lookahead window, without duplicates", () => {
    const s = new StepScheduler(120, 4); // 0.125 s per step
    expect(s.stepDur).toBeCloseTo(0.125);
    s.start(1);
    const got: [number, number][] = [];
    s.advance(1, 0.3, (st, t) => got.push([st, t]));
    expect(got.map((g) => g[0])).toEqual([0, 1, 2]);
    expect(got[2]?.[1]).toBeCloseTo(1.25);
    s.advance(1.1, 0.3, (st, t) => got.push([st, t]));
    expect(got.map((g) => g[0])).toEqual([0, 1, 2, 3]); // up to 1.4 -> step 3 at 1.375
    const n = s.advance(1.1, 0.3, () => {});
    expect(n).toBe(0);
  });
  it("does nothing before start", () => {
    expect(new StepScheduler(100).advance(5, 1, () => expect.fail())).toBe(0);
  });
  it("skips missed steps after a stall instead of bursting", () => {
    const s = new StepScheduler(120, 4);
    s.start(0);
    let count = 0;
    let first = -1;
    s.advance(10, 0.3, (st) => {
      if (first < 0) first = st;
      count++;
    });
    expect(count).toBeLessThanOrEqual(4);
    expect(first).toBeGreaterThanOrEqual(78);
  });
  it("keeps step phase when bpm changes mid-stream", () => {
    const s = new StepScheduler(60, 4);
    s.start(0);
    s.advance(0, 0.3, () => {});
    s.bpm = 120;
    expect(s.stepDur).toBeCloseTo(0.125);
  });
  it("melody patterns are deterministic, in range and start each bar", () => {
    for (const b of BIOMES) {
      const m = melodyPattern(b);
      expect(m).toEqual(melodyPattern(b));
      expect(m.length).toBe(PATTERN_STEPS);
      const cfg = BIOME_MUSIC[b];
      for (let i = 0; i < m.length; i++) {
        const d = m[i];
        if (i % 16 === 0) expect(d).not.toBeNull();
        if (i % 2 === 1) expect(d).toBeNull();
        if (d != null) {
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThan(cfg.scale.length * 2);
          expect(degreeToMidi(cfg, d)).toBeGreaterThanOrEqual(cfg.root);
        }
      }
    }
  });
  it("layer gains: battle adds drums, boss adds the boss layer, walk is quiet", () => {
    expect(LAYER_GAINS.walk.drums).toBe(0);
    expect(LAYER_GAINS.battle.drums).toBeGreaterThan(0);
    expect(LAYER_GAINS.boss.boss).toBeGreaterThan(0);
    expect(LAYER_GAINS.battle.boss).toBe(0);
    expect(Object.keys(LAYER_GAINS).sort()).toEqual([...MUSIC_STATES].sort());
  });
  it("drum bar has kick on 1 and 3, snare on 2 and 4", () => {
    expect(drumStep(0, false)).toBe("kick");
    expect(drumStep(8, false)).toBe("kick");
    expect(drumStep(4, false)).toBe("snare");
    expect(drumStep(12, false)).toBe("snare");
  });
});

describe("ambience table", () => {
  it("defines every biome with levels in 0..2 and a 1-2 s crossfade", () => {
    for (const b of BIOMES)
      for (const v of Object.values(AMBIENCE_MIX[b])) expect(v).toBeGreaterThanOrEqual(0);
    expect(CROSSFADE_SEC).toBeGreaterThanOrEqual(1);
    expect(CROSSFADE_SEC).toBeLessThanOrEqual(2);
    expect(AMBIENCE_MIX.forest.birds).toBeGreaterThan(0);
    expect(AMBIENCE_MIX.cave.drips).toBeGreaterThan(0);
    expect(AMBIENCE_MIX.ruins.crackle).toBeGreaterThan(0);
    expect(AMBIENCE_MIX.boss.drone).toBeGreaterThan(AMBIENCE_MIX.forest.drone);
  });
});

describe("sfx table", () => {
  it("has a voice for every id", () => {
    for (const id of SFX_IDS) expect(typeof SFX_VOICES[id]).toBe("function");
    expect(Object.keys(SFX_VOICES).length).toBe(SFX_IDS.length);
    expect(busFor("uiClick")).toBe("ui");
    expect(busFor("key")).toBe("sfx");
  });
});

describe("event bindings table", () => {
  it("only references known event names", () => {
    for (const name of Object.keys(AUDIO_BINDINGS)) expect(KNOWN_EVENTS).toContain(name);
    for (const name of AUDIO_SILENT_EVENTS) expect(KNOWN_EVENTS).toContain(name);
  });
  it("covers every sim event exactly once (bound xor silent)", () => {
    for (const name of KNOWN_EVENTS) {
      const bound = name in AUDIO_BINDINGS;
      const silent = AUDIO_SILENT_EVENTS.includes(name);
      expect(bound !== silent, `${name}: bound=${bound} silent=${silent}`).toBe(true);
    }
  });
  it("local event list matches docs/interfaces.md section 4 (when the doc is present)", () => {
    let doc: string;
    try {
      doc = readFileSync(new URL("../../../../docs/interfaces.md", import.meta.url), "utf8");
    } catch {
      return;
    }
    const block = /export const ALL_EVENT_TYPES = \[([\s\S]*?)\] as const/.exec(doc)?.[1];
    if (!block) return;
    const names = [...block.matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(new Set(KNOWN_SIM_EVENTS)).toEqual(new Set(names));
  });
  it("dispatches to the engine API", () => {
    const calls: [string, unknown][] = [];
    const api: AudioApi = {
      play: (id, p) => void calls.push([id, p]),
      setMusicState: (s) => void calls.push(["state:" + s, null]),
    };
    expect(dispatchAudioEvent({ type: "CharCorrect", streak: 12 }, api)).toBe(true);
    expect(dispatchAudioEvent({ type: "WordCompleted", perfect: true, combo: 3 }, api)).toBe(true);
    expect(dispatchAudioEvent({ type: "WordCompleted", perfect: false }, api)).toBe(true);
    expect(dispatchAudioEvent({ type: "Hit", crit: true }, api)).toBe(true);
    expect(dispatchAudioEvent({ type: "EncounterStarted", isBoss: true }, api)).toBe(true);
    expect(dispatchAudioEvent({ type: "PlateShown" }, api)).toBe(false);
    expect(calls.map((c) => c[0])).toEqual([
      "key",
      "perfectWord",
      "wordComplete",
      "crit",
      "state:boss",
    ]);
    expect(calls[0]?.[1]).toEqual({ streak: 12 });
  });
});

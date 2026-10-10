import { describe, expect, it } from "vitest";
import { AMBIENCE_MIX, Ambience, REVERB_BIAS } from "../../src/audio/ambience";
import {
  AUDIO_BINDINGS,
  AUDIO_SILENT_EVENTS,
  type AudioApi,
  dispatchAudioEvent,
  resetAudioBindingState,
} from "../../src/audio/bindings";
import { Music } from "../../src/audio/music";
import { BIOME_MUSIC, FREED_CHORDS, melodyPattern } from "../../src/audio/musicScheduler";
import { SFX_VOICES } from "../../src/audio/sfx";
import { mulberry32 } from "../../src/audio/tiers";
import { BIOMES, SFX_IDS, type Sfx } from "../../src/audio/types";

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
    osc: (...args: unknown[]) => {
      calls.push({ kind: "osc", args });
      return node();
    },
    noise: (...args: unknown[]) => void calls.push({ kind: "noise", args }),
    bell: (...args: unknown[]) => void calls.push({ kind: "bell", args }),
  };
  return { s, calls };
}

const CH2_NEW: Sfx[] = [
  "wispChime",
  "shadeHiss",
  "mothFlutter",
  "healChime",
  "toadCroak",
  "toadSplash",
  "wolfHowl",
  "wolfBite",
  "willowCreak",
  "whisperLoop",
  "leafStorm",
  "leafRustle",
  "leafPick",
  "riddleRight",
  "riddleWrong",
  "riddleTimeout",
  "capitalKey",
  "willowSigh",
  "chapterSting",
];

describe("Ch2 SFX voices", () => {
  it("are registered ids and run without throwing", () => {
    for (const id of CH2_NEW) {
      expect(SFX_IDS).toContain(id);
      const { s, calls } = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      expect(() => SFX_VOICES[id](s as any, 1, { streak: 12, pan: 0.3 }), id).not.toThrow();
      expect(calls.length, id).toBeGreaterThan(0);
    }
  });
  it("capitalKey = the key voice + exactly one dry sine (hot path budget)", () => {
    const a = fakeSynth(5);
    const b = fakeSynth(5);
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    SFX_VOICES.key(a.s as any, 0, { streak: 20 });
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    SFX_VOICES.capitalKey(b.s as any, 0, { streak: 20 });
    expect(b.calls.length).toBe(a.calls.length + 1);
    const extra = b.calls[b.calls.length - 1] as Call;
    expect(extra.kind).toBe("osc");
    expect(extra.args[0]).toBe("sine");
    expect((extra.args[6] as { wet: number }).wet).toBe(0); // no reverb send
    // an octave below the key click
    const keyFreq = (a.calls.find((c) => c.args[0] === "triangle") as Call).args[1] as number;
    expect(extra.args[1] as number).toBeCloseTo(keyFreq / 2, 6);
  });
  it("riddleRight is quieter than perfectWord (summed voice gain)", () => {
    const sum = (id: Sfx): number => {
      const { s, calls } = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      SFX_VOICES[id](s as any, 0, {});
      return calls.reduce(
        (acc, c) => acc + (c.args[c.kind === "osc" ? 5 : c.kind === "noise" ? 2 : 3] as number),
        0,
      );
    };
    expect(sum("riddleRight")).toBeLessThan(sum("perfectWord"));
  });
});

describe("Ch2 music + ambience tables", () => {
  it("hushwood / fen / grove rows follow brief 6.2", () => {
    expect(BIOME_MUSIC.hushwood).toMatchObject({ bpm: 72, root: 62, density: 0.45 });
    expect(BIOME_MUSIC.hushwood.scale).toEqual([0, 2, 3, 5, 7, 9, 10]);
    expect(BIOME_MUSIC.fen).toMatchObject({ bpm: 66, root: 57 });
    expect(BIOME_MUSIC.fen.scale).toEqual([0, 2, 4, 6, 7, 9, 11]);
    expect(BIOME_MUSIC.grove).toMatchObject({ bpm: 88, root: 50 });
    expect(BIOME_MUSIC.grove.scale).toEqual([0, 2, 3, 5, 7, 8, 11]);
    expect(FREED_CHORDS[3]).toEqual([0, 4, 7, 14]); // Dmaj9
    for (const b of ["hushwood", "fen", "grove"] as const)
      expect(melodyPattern(b)).toEqual(melodyPattern(b));
  });
  it("reverb bias and ambience rows", () => {
    expect(REVERB_BIAS).toMatchObject({ hushwood: 1.0, fen: 1.2, grove: 1.6 });
    expect(AMBIENCE_MIX.hushwood.crickets).toBe(1);
    expect(AMBIENCE_MIX.grove.crickets).toBeCloseTo(0.6);
    expect(AMBIENCE_MIX.hushwood.birds).toBe(0);
    expect(AMBIENCE_MIX.fen.frogs).toBe(1);
    expect(AMBIENCE_MIX.fen.dripDur).toBe(0.04);
    for (const b of BIOMES) expect(AMBIENCE_MIX[b]).toBeDefined();
  });
  it("owl hoots never come closer than 9 s", () => {
    const { s, calls } = fakeSynth(11);
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    const amb = new Ambience(s as any);
    amb.setBiome("hushwood", 0.05);
    for (let t = 0; t < 180; t += 0.6) amb.schedule(t, 0.6);
    const hoots = calls
      .filter((c) => c.kind === "osc" && c.args[1] === 380 && c.args[2] === 360)
      .map((c) => c.args[3] as number)
      .filter((_, i) => i % 2 === 0); // first hoot of each pair
    expect(hoots.length).toBeGreaterThan(5);
    for (let i = 1; i < hoots.length; i++)
      expect((hoots[i] as number) - (hoots[i - 1] as number)).toBeGreaterThanOrEqual(9);
  });
  it("crickets are on in the night forest and off in the fen", () => {
    const run = (b: "hushwood" | "fen") => {
      const { s, calls } = fakeSynth(3);
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      const amb = new Ambience(s as any);
      amb.setBiome(b, 0.05);
      for (let t = 0; t < 20; t += 0.6) amb.schedule(t, 0.6);
      return calls.filter((c) => c.args[1] === 4600).length;
    };
    expect(run("hushwood")).toBeGreaterThan(10);
    expect(run("fen")).toBe(0);
  });
});

describe("Ch2 music engine", () => {
  const run = (
    b: "hushwood" | "fen" | "grove",
    state: "walk" | "battle" | "boss" | "victory",
    pre?: (m: Music) => void,
  ) => {
    const { s, calls } = fakeSynth(9);
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    const m = new Music(s as any);
    m.setBiome(b);
    m.setState(state);
    pre?.(m);
    m.start();
    for (let t = 0; t < 14; t += 0.3) m.schedule(t, 0.3);
    return calls;
  };
  it("every Ch2 biome x state schedules notes without throwing", () => {
    for (const b of ["hushwood", "fen", "grove"] as const)
      for (const st of ["walk", "battle", "boss", "victory"] as const)
        expect(run(b, st).length, `${b}/${st}`).toBeGreaterThan(0);
  });
  it("fen has the always-on drone (sine at root - 24 = 55 Hz)", () => {
    const drone = run("fen", "walk").filter(
      (c) => c.kind === "osc" && Math.abs((c.args[1] as number) - 55) < 0.01,
    );
    expect(drone.length).toBeGreaterThan(0);
  });
  it("hushwood melody is celesta (sine + bell [1,4])", () => {
    const bells = run("hushwood", "walk").filter((c) => c.kind === "bell");
    expect(bells.length).toBeGreaterThan(0);
    expect(bells[0]?.args[5]).toEqual([1, 4]);
  });
  it("Willow phase 3 drops the drums to the hat and adds celesta", () => {
    const drumsOf = (phase: 1 | 3) =>
      run("grove", "boss", (m) => m.setBossPhase(phase)).filter(
        (c) => c.kind === "noise" && c.args[3] === "bandpass" && c.args[4] === 1800,
      ).length; // snare
    expect(drumsOf(1)).toBeGreaterThan(0);
    expect(drumsOf(3)).toBe(0);
    const bells3 = run("grove", "boss", (m) => m.setBossPhase(3)).filter((c) => c.kind === "bell");
    const bells1 = run("grove", "boss", (m) => m.setBossPhase(1)).filter((c) => c.kind === "bell");
    expect(bells3.length).toBeGreaterThan(0);
    expect(bells1.length).toBe(0);
  });
  it("Willow freed resolves to D major (F# present, F natural absent in the pad)", () => {
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const calls = run("grove", "victory", (m) => m.setFreed(true));
    expect(
      calls.some(
        (c) => c.kind === "osc" && Math.abs((c.args[1] as number) / hz(50 + 4 - 12) - 1) < 0.01,
      ),
    ).toBe(true);
    const minor = run("grove", "victory");
    expect(
      minor.some(
        (c) => c.kind === "osc" && Math.abs((c.args[1] as number) / hz(50 + 3 - 12) - 1) < 0.01,
      ),
    ).toBe(true); // F natural before freed
  });
});

describe("Ch2 bindings", () => {
  const recorder = () => {
    const calls: [string, unknown][] = [];
    const api: AudioApi = {
      play: (id, p) => void calls.push([id, p]),
      setMusicState: (s) => void calls.push([`state:${s}`, null]),
      setBossPhase: (p) => void calls.push([`phase:${p}`, null]),
      setBossFreed: (f) => void calls.push([`freed:${f}`, null]),
      setWhisper: (on) => void calls.push([`whisper:${on}`, null]),
    };
    return { calls, api };
  };
  const names = (c: [string, unknown][]) => c.map((x) => x[0]);

  it("every v2.0 Ch2 event has a binding (none left silent)", () => {
    for (const t of [
      "EnemyHealed",
      "RiddleStarted",
      "RiddleLeafPicked",
      "RiddleResolved",
      "EnemySpawned",
      "BossPhaseChanged",
      "EnemyAttack",
    ]) {
      expect(AUDIO_BINDINGS[t], t).toBeDefined();
      expect(AUDIO_SILENT_EVENTS).not.toContain(t);
    }
  });
  it("CharCorrect: shifted -> capitalKey, otherwise the Ch1 key", () => {
    const { calls, api } = recorder();
    dispatchAudioEvent({ type: "CharCorrect", keyStreak: 4, shifted: true }, api);
    dispatchAudioEvent({ type: "CharCorrect", keyStreak: 4 }, api);
    expect(names(calls)).toEqual(["capitalKey", "key"]);
    expect(calls[0]?.[1]).toEqual({ streak: 4 });
  });
  it("healer chime once per (source, tick) and distinct from the hero heal", () => {
    resetAudioBindingState();
    const { calls, api } = recorder();
    const ev = (target: number, tick: number) => ({
      type: "EnemyHealed",
      sourceId: 1,
      targetId: target,
      tick,
    });
    dispatchAudioEvent(ev(2, 10), api);
    dispatchAudioEvent(ev(3, 10), api);
    dispatchAudioEvent(ev(2, 70), api);
    dispatchAudioEvent({ type: "HeroHealed" }, api);
    expect(names(calls)).toEqual(["healChime", "healChime", "heal"]);
  });
  it("riddle: rustle, pick (pan by lane), right / wrong / timeout", () => {
    const { calls, api } = recorder();
    dispatchAudioEvent({ type: "RiddleStarted" }, api);
    dispatchAudioEvent({ type: "RiddleLeafPicked", lane: 2 }, api);
    for (const outcome of ["right", "wrong", "timeout"])
      dispatchAudioEvent({ type: "RiddleResolved", outcome }, api);
    expect(names(calls)).toEqual([
      "leafRustle",
      "leafPick",
      "riddleRight",
      "riddleWrong",
      "riddleTimeout",
    ]);
    expect(calls[1]?.[1]).toEqual({ pan: 0.5 });
  });
  it("creature cues from EnemySpawned.defId; elite howls", () => {
    resetAudioBindingState();
    const { calls, api } = recorder();
    const sp = (id: number, defId: string, extra: object = {}) =>
      dispatchAudioEvent({ type: "EnemySpawned", enemyId: id, defId, ...extra }, api);
    sp(1, "wisp");
    sp(2, "shade");
    sp(3, "moth");
    sp(4, "moss-slime"); // Ch1: silent
    sp(5, "gloom-wolf", { elite: true });
    expect(names(calls)).toEqual(["wispChime", "shadeHiss", "mothFlutter", "wolfHowl"]);
  });
  it("toad windup croaks and attack splashes; wolf bites; Ch1 enemies unchanged", () => {
    resetAudioBindingState();
    const { calls, api } = recorder();
    dispatchAudioEvent({ type: "EnemySpawned", enemyId: 7, defId: "bog-toad" }, api);
    dispatchAudioEvent({ type: "EnemySpawned", enemyId: 8, defId: "gloom-wolf" }, api);
    dispatchAudioEvent({ type: "EnemySpawned", enemyId: 9, defId: "moss-slime" }, api);
    calls.length = 0;
    dispatchAudioEvent({ type: "EnemyAttackWindup", enemyId: 7, heavy: false }, api);
    dispatchAudioEvent({ type: "EnemyAttack", enemyId: 7 }, api);
    dispatchAudioEvent({ type: "EnemyAttack", enemyId: 8 }, api);
    dispatchAudioEvent({ type: "EnemyAttackWindup", enemyId: 9, heavy: false }, api);
    dispatchAudioEvent({ type: "EnemyAttack", enemyId: 9 }, api);
    expect(names(calls)).toEqual([
      "enemyWindup",
      "toadCroak",
      "toadSplash",
      "wolfBite",
      "enemyWindup",
    ]);
  });
  it("Willow: creak on spawn, phase change storm + music phase, whisper held over a Hush Spell, freed sigh", () => {
    resetAudioBindingState();
    const { calls, api } = recorder();
    dispatchAudioEvent({ type: "EnemySpawned", enemyId: 20, defId: "whispering-willow" }, api);
    dispatchAudioEvent({ type: "BossPhaseChanged", enemyId: 20, from: 2, to: 3 }, api);
    dispatchAudioEvent({ type: "DoomSpellStarted", enemyId: 20 }, api);
    dispatchAudioEvent({ type: "DoomSpellCompleted", enemyId: 20 }, api);
    dispatchAudioEvent({ type: "EnemyDeath", enemyId: 20, isBoss: true }, api);
    dispatchAudioEvent({ type: "LevelCleared", levelId: "ch2-l10" }, api);
    expect(names(calls)).toEqual([
      "willowCreak",
      "leafStorm",
      "willowCreak",
      "phase:3",
      "enemyWindup",
      "whisper:true",
      "whisper:false",
      "break",
      "whisper:false",
      "freed:true",
      "willowSigh",
      "state:victory",
      "chapterSting",
    ]);
  });
  it("Ch1 boss (golem) events keep their exact Ch1 behaviour", () => {
    resetAudioBindingState();
    const { calls, api } = recorder();
    dispatchAudioEvent({ type: "EnemySpawned", enemyId: 1, defId: "stone-golem" }, api);
    dispatchAudioEvent({ type: "BossPhaseChanged", enemyId: 1, from: 1, to: 2 }, api);
    dispatchAudioEvent({ type: "DoomSpellStarted", enemyId: 1 }, api);
    dispatchAudioEvent({ type: "EnemyDeath", enemyId: 1, isBoss: true }, api);
    dispatchAudioEvent({ type: "LevelCleared", levelId: "ch1-l10" }, api);
    expect(calls.filter((c) => !c[0].startsWith("whisper") && !c[0].startsWith("freed"))).toEqual([
      ["enemyWindup", { heavy: true }],
      ["enemyDeath", { boss: true }],
      ["state:victory", null],
      ["victory", undefined],
    ]);
  });
});

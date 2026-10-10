import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ambience } from "../../src/audio/ambience";
import { Music } from "../../src/audio/music";
import { SFX_VOICES } from "../../src/audio/sfx";
import { mulberry32 } from "../../src/audio/tiers";
import type { Sfx, SfxParams } from "../../src/audio/types";

/**
 * T3.3 "Ch1 audio unchanged" proof. A recording fake Synth captures every `osc` / `noise` / `bell` call
 * (rounded params, destination node identity) made by each Ch1 SFX voice, by the Ch1 music engine
 * (forest/ruins/cave/boss x 4 music states, 14 s) and by the Ch1 ambience scheduler (4 biomes, 40 s).
 * Each case is hashed; the hashes live in ch1-golden.json, generated from the pre-T3.3 code.
 * Regenerate only on an intentional Ch1 sound change: UPDATE_CH1_GOLDEN=1 vitest run tests/audio/ch1-golden.test.ts
 */
const GOLDEN = new URL("./ch1-golden.json", import.meta.url);

const CH1_SFX = [
  "key",
  "typo",
  "wordComplete",
  "perfectWord",
  "tierUp",
  "slash",
  "hit",
  "crit",
  "guard",
  "parry",
  "enemyWindup",
  "heroHurt",
  "enemyDeath",
  "break",
  "chestLand",
  "chestOpen",
  "coin",
  "skillFire",
  "skillMagic",
  "explode",
  "heal",
  "encounter",
  "levelUp",
  "victory",
  "bossIntro",
  "uiClick",
  "uiConfirm",
] as const satisfies readonly Sfx[];

const PARAM_SETS: SfxParams[] = [
  {},
  { streak: 7 },
  { streak: 30, tier: 2 },
  { streak: 100, tier: 4, pan: 0.4 },
  { heavy: true, boss: true, leak: true, count: 4, tier: 3 },
];
const CH1_BIOMES = ["forest", "ruins", "cave", "boss"] as const;
const MUSIC_STATES = ["walk", "battle", "boss", "victory"] as const;

let nodeId = 0;
function node(): unknown {
  const id = nodeId++;
  const fn = (): void => {};
  const p: unknown = new Proxy(fn, {
    get: (_t, k) => (k === "__id" ? id : k === "then" ? undefined : p),
    set: () => true,
    apply: () => p,
  });
  return p;
}

const norm = (v: unknown): unknown => {
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  if (typeof v === "function") return `n${(v as unknown as { __id: number }).__id}`;
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
  return v;
};

function fakeSynth(seed = 1234) {
  nodeId = 0;
  const calls: unknown[] = [];
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
    hz: (m: number) => 440 * 2 ** ((m - 69) / 12),
    osc: (...a: unknown[]) => {
      calls.push(["osc", norm(a)]);
      return node();
    },
    noise: (...a: unknown[]) => void calls.push(["noise", norm(a)]),
    bell: (...a: unknown[]) => void calls.push(["bell", norm(a)]),
  };
  return { s, calls };
}

const hash = (v: unknown): string =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

function compute(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of CH1_SFX) {
    PARAM_SETS.forEach((p, i) => {
      const { s, calls } = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      SFX_VOICES[id](s as any, 1.5, p);
      out[`sfx.${id}.${i}`] = hash([calls, s.rng()]);
    });
  }
  for (const b of CH1_BIOMES) {
    const { s, calls } = fakeSynth();
    // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
    const amb = new Ambience(s as any);
    amb.setBiome(b, 0.05);
    for (let t = 0; t < 40; t += 0.6) amb.schedule(t, 0.6);
    out[`ambience.${b}`] = hash([calls, s.reverbBias, s.rng()]);
    for (const st of MUSIC_STATES) {
      const m = fakeSynth();
      // biome-ignore lint/suspicious/noExplicitAny: structural fake of Synth
      const music = new Music(m.s as any);
      music.setBiome(b);
      music.setState(st);
      music.start();
      for (let t = 0; t < 14; t += 0.3) music.schedule(t, 0.3);
      out[`music.${b}.${st}`] = hash([m.calls, m.s.rng()]);
    }
  }
  return out;
}

describe("Ch1 audio is unchanged by Ch2 additions (golden hashes)", () => {
  it("matches the pre-T3.3 SFX / music / ambience call streams", () => {
    const now = compute();
    if (process.env.UPDATE_CH1_GOLDEN === "1" || !existsSync(GOLDEN)) {
      writeFileSync(GOLDEN, `${JSON.stringify(now, null, 1)}\n`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string>;
    expect(Object.keys(now).length).toBeGreaterThan(150);
    const diff = Object.keys(golden).filter((k) => golden[k] !== now[k]);
    expect(diff, `Ch1 audio changed for: ${diff.join(", ")}`).toEqual([]);
    expect(Object.keys(now).sort()).toEqual(Object.keys(golden).sort());
  });
});

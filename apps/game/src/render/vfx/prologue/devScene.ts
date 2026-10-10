/**
 * DEV-ONLY: fire every prologue world VFX cue in isolation on the Word Gate (P3.2).
 *
 *   ?scene=prologue&part=vfx&cue=<id|skyTearClose|clusterB|clusterC>[&age=<ms>][&freeze=1][&tier=0|1|2][&k=<0..1>]
 *     [&cam=wide|two|mask|palm|hero|gate|sky|boss][&blend=<0..1>][&adds=0|1][&reducedFlash=1][&p.<name>=<number|text>]
 *
 * `part=vfx` is routed here by `dev/prologueScene.ts` (one line there). The scene builds the prologue layout (`id=prologue`) with
 * the hero, Nul and two adds on the encounter-2 anchors, then draws ONE cue at `age` ms through the same `PrologueFx` the game
 * uses. A cue is a pure function of (seed, age): `freeze=1` renders the exact frame; without it the cue loops live. The camera, the
 * mood blend (STORM_GOLD -> UNWRITTEN) and Nul's pose default per cue (see `RIGS`) and can be overridden by the URL.
 *
 * Test hook `window.__prologueVfx`: `seek(cue, age, params?)` (deterministic re-render), `diagnostics()`, `bench(frames)` (rAF frame
 * times for the perf AC), `ids`.
 */
import { PROLOGUE_VFX_IDS } from "../../../cutscene/types";
import { blendMood, STORM_GOLD, THEFT_RAMP, UNWRITTEN } from "../../biomes";
import type { CameraPose } from "../../camera";
import { isQualityTier, type QualityTier, RenderWorld } from "../../index";
import { buildWorld, loadLevel, toRenderBiome, type WorldHandle } from "../../world";
import { HERO_LUM_CAP } from "../colors";
import { HeroAura } from "../HeroAura";
import { LightSlots } from "../LightSlots";
import { PooledParticles } from "../PooledParticles";
import type { TypingFxSettings } from "../types";
import { devSeed, PrologueFx } from "./PrologueFx";
import { nulLift } from "./params";
import type { CueInstance, GateInfo, PrologueAnchors, PrologueVfxId, V3 } from "./types";

type DevCue = PrologueVfxId | "skyTearClose" | "clusterB" | "clusterC";

declare global {
  interface Window {
    __prologueVfx?: {
      ready: boolean;
      ids: readonly string[];
      fx: PrologueFx;
      seek(cue: string, ageMs: number, params?: Record<string, number | string>): void;
      diagnostics(): ReturnType<PrologueFx["diagnostics"]>;
      /** rAF frame times (ms) of `frames` live frames of the current cue cluster. */
      bench(
        frames: number,
      ): Promise<{ avgMs: number; p95Ms: number; maxMs: number; frames: number }>;
      /** Fake plate rects for the keep-out check (CSS px x, y, w, h). */
      setKeepOut(rects: number[][]): void;
    };
  }
}

interface Rig {
  cam: string;
  /** Mood blend toward UNWRITTEN. */
  blend: number;
  adds: boolean;
  nul: { anim: string; frame: number };
  hero: { anim: string; frame: number };
  /** Frames to settle the stateful parts (the aura eases in). */
  settle: number;
  /** Default still age (ms). */
  age: number;
  params?: Record<string, number | string>;
  force4?: boolean;
  /** Nul rises with `nulLift(age)` (letterVortex). */
  lift?: boolean;
  /** Cue length for live looping (ms). */
  loop: number;
}

const RIGS: Record<DevCue, Rig> = {
  inkRise: {
    cam: "two",
    blend: 0,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 520,
    loop: 2200,
  },
  skyTear: {
    cam: "sky",
    blend: 0,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 1100,
    loop: 3200,
  },
  skyTearClose: {
    cam: "sky",
    blend: 1,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 420,
    loop: 2400,
    params: { mode: "close" },
  },
  hushBolt: {
    cam: "two",
    blend: 0,
    adds: true,
    nul: { anim: "cast", frame: 1 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 380,
    loop: 1400,
  },
  ward: {
    cam: "boss",
    blend: 0,
    adds: true,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 1500,
    loop: 3000,
  },
  surgeAura: {
    cam: "hero",
    blend: 0,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 130,
    age: 1000,
    loop: 3000,
    params: { mult: 16 },
  },
  catchFireball: {
    cam: "palm",
    blend: 0,
    adds: false,
    nul: { anim: "catch", frame: 1 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 450,
    loop: 3000,
  },
  inkWrite: {
    cam: "two",
    blend: 0.2,
    adds: false,
    nul: { anim: "write", frame: 1 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 750,
    loop: 2200,
  },
  theftStream: {
    cam: "two",
    blend: 0.24,
    adds: false,
    nul: { anim: "catch", frame: 1 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 520,
    loop: 1500,
    params: { k: 1 },
  },
  auraCollapse: {
    cam: "hero",
    blend: 1,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 130,
    age: 520,
    loop: 2400,
    force4: true,
  },
  gateDarken: {
    cam: "gate",
    blend: 1,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 2500,
    loop: 6000,
  },
  letterVortex: {
    cam: "vortex",
    blend: 1,
    adds: false,
    nul: { anim: "rise", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 2400,
    loop: 6000,
    lift: true,
  },
  silenceFog: {
    cam: "two",
    blend: 1,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 4200,
    loop: 8000,
  },
  ember: {
    cam: "hero",
    blend: 1,
    adds: false,
    nul: { anim: "idle", frame: 0 },
    hero: { anim: "kneel", frame: 0 },
    settle: 4,
    age: 1600,
    loop: 3000,
  },
  clusterB: {
    cam: "two",
    blend: 0,
    adds: true,
    nul: { anim: "cast", frame: 1 },
    hero: { anim: "idle", frame: 0 },
    settle: 130,
    age: 900,
    loop: 2400,
    force4: true,
  },
  clusterC: {
    cam: "wide",
    blend: 1,
    adds: false,
    nul: { anim: "rise", frame: 0 },
    hero: { anim: "idle", frame: 0 },
    settle: 4,
    age: 2600,
    loop: 5200,
    lift: true,
  },
};

const DT = 1 / 60;

function parseParams(q: URLSearchParams): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const [k, v] of q.entries()) {
    if (!k.startsWith("p.")) continue;
    const n = Number(v);
    out[k.slice(2)] = v !== "" && Number.isFinite(n) ? n : v;
  }
  return out;
}

export function start(canvas: HTMLCanvasElement, q: URLSearchParams): void {
  if (q.get("cue") === "partB") {
    // Part B at max FX with the real HUD and a wpm bot (the keep-out + perf probe): devPartB.ts
    void import("./devPartB").then((m) => m.startPartB(canvas, q));
    return;
  }
  const cueRaw = (q.get("cue") ?? "inkRise") as DevCue;
  if (!(cueRaw in RIGS)) throw new Error(`prologue vfx scene: unknown cue "${cueRaw}"`);
  let cue: DevCue = cueRaw;
  const tierParam = Number(q.get("tier") ?? "0");
  const tier: QualityTier = isQualityTier(tierParam) ? tierParam : 0;
  const frozen = q.get("freeze") === "1";
  const k = q.has("k") ? Number(q.get("k")) : 1;
  const settings: TypingFxSettings = {
    effectsIntensity: k,
    reducedFlash: q.get("reducedFlash") === "1",
    reducedMotion: q.get("reducedMotion") === "1",
  };

  const layout = loadLevel("prologue");
  const world = new RenderWorld({ biome: toRenderBiome(layout.biome), quality: tier });
  world.init(canvas);
  const handle: WorldHandle = buildWorld(layout, world, world.source);

  // ---- the stage: encounter 2 (the boss encounter): hero, Nul on the boss slot, two adds
  const enc = handle.encounter(2);
  const bossSlot = enc.slots.find((s) => s.kind === "boss") ?? enc.slots[0];
  if (!bossSlot) throw new Error("prologue vfx scene: no boss slot");
  const addSlots = enc.slots.filter((s) => s !== bossSlot);
  const gateA = handle.getAnchor("gate");
  const tearA = handle.getAnchor("tear");
  const gateProp = layout.props.find((p) => p.key === "prop.prologue.wordgate");
  const gateScale = gateProp?.scale ?? 0.85;

  const actors: { dispose(): void }[] = [];
  const mk = (key: string, scale: number, o: { rim?: number } = {}) =>
    world.addActor(key, "idle", { scale, rim: o.rim ?? 1.4, blobW: scale * 1.1 });
  const hero = world.addActor("hero", "idle", { rim: 1.3, blobW: 1.25 });
  hero.setLumCap(HERO_LUM_CAP);
  const nul = mk("monster.nul", 1.0);
  const add0 = mk("monster.shade", 1.1);
  const add1 = mk("monster.wisp", 1.2);
  actors.push(hero, nul, add0, add1);

  const frame = (key: string, anim: string, i: number) => {
    let fr: ReturnType<typeof world.source.frames> = [];
    try {
      fr = world.source.frames(key, anim);
    } catch {
      /* fall back */
    }
    if (fr.length === 0) fr = world.source.frames(key, "idle");
    return fr[Math.min(i, fr.length - 1)] ?? fr[0];
  };

  const nulPos: V3 = { x: bossSlot.x, y: 0, z: bossSlot.z };
  const heroPos: V3 = { x: enc.hero.x, y: 0, z: enc.hero.z };
  const anchors: PrologueAnchors = {
    hero: (o) => {
      o.x = heroPos.x;
      o.y = heroPos.y;
      o.z = heroPos.z;
    },
    boss: (o) => {
      o.x = nulPos.x;
      o.y = nulPos.y;
      o.z = nulPos.z;
      return true;
    },
    gate: (o: GateInfo) => {
      o.x = gateA.x;
      o.y = 0;
      o.z = gateA.z;
      o.scale = gateScale;
    },
    tear: (o) => {
      o.x = tearA.x;
      o.y = tearA.y ?? 7;
      o.z = tearA.z;
    },
    enemy: () => false,
    runes: (out) => {
      let n = 0;
      for (const p of layout.props) {
        const m = /^prop\.prologue\.runestone\.(\d)/.exec(p.key);
        const o = out[n];
        if (!m || !o) continue;
        o.x = p.x;
        o.y = p.y ?? 0;
        o.z = p.z;
        o.n = Number(m[1]);
        o.scale = p.scale ?? 1;
        o.flip = p.flip === true;
        n++;
      }
      return n;
    },
  };

  // ---- the prologue VFX + a stand-alone HeroAura (the game's lives in TypingWorldFx)
  const koRects = new Float32Array(16 * 4);
  let koN = 0;
  const fx = new PrologueFx({
    world,
    anchors,
    keepOutRects: (out) => {
      out.set(koRects);
      return koN;
    },
  });
  fx.setSettings(settings, tier);
  const poolA = new PooledParticles(256, true, world.scene);
  const poolB = new PooledParticles(128, false, world.scene, 12);
  const lights = new LightSlots(world.lights);
  let aura = new HeroAura(world, poolA, poolB, lights);
  /** The same biome brightness the game's TypingWorldFx derives from the fog colour (the prologue dusk is bright). */
  const updateBright = (): void => {
    const f = world.currentMood.fogCol;
    const lum = 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    const t = Math.min(1, Math.max(0, (lum - 0.08) / 0.4));
    aura.bright = t * t * (3 - 2 * t);
  };
  /** A fresh aura per seek: its eased level, spin and mote accumulator are history a re-seek must not inherit. */
  const freshAura = (): void => {
    aura.dispose();
    aura = new HeroAura(world, poolA, poolB, lights);
    aura.heroX = heroPos.x;
    aura.heroZ = heroPos.z;
    fx.attachAura(aura);
  };
  aura.heroX = heroPos.x;
  aura.heroZ = heroPos.z;
  fx.attachAura(aura);
  lights.gain = k;

  // ---- per-run state
  let curRig: Rig = RIGS[cue];
  let curAge = q.has("age") ? Number(q.get("age")) : curRig.age;
  let curParams: Record<string, number | string> = { ...(curRig.params ?? {}), ...parseParams(q) };
  let auraTime = 0;
  const poses = (): Record<string, CameraPose> => {
    const base = handle.cameraPose("battle:2");
    const mid = (heroPos.x + nulPos.x) / 2;
    return {
      wide: base,
      two: { ...base, x: mid, y: 2.4, dist: 22, pitch: 12, fov: 30 },
      mask: { ...base, x: nulPos.x - 0.6, y: 3.2, dist: 14, pitch: 7, fov: 24 },
      palm: { ...base, x: nulPos.x - 1.4, y: 2.7, dist: 11, pitch: 7, fov: 26 },
      hero: { ...base, x: heroPos.x + 0.6, y: 1.5, dist: 13, pitch: 6, fov: 26 },
      gate: { ...base, x: gateA.x, y: 5.2, dist: 27, pitch: 9, fov: 30 },
      sky: { ...base, x: gateA.x, y: 5.6, dist: 24, pitch: 6, fov: 32 },
      boss: handle.cameraPose("boss"),
      vortex: { ...base, x: nulPos.x - 0.5, y: 5.2, dist: 27, pitch: 8, fov: 32 },
    };
  };
  const camOverride = q.get("cam");

  const applyRig = (age: number): void => {
    const r = curRig;
    nulPos.x = bossSlot.x;
    nulPos.z = bossSlot.z;
    nulPos.y = r.lift ? nulLift(age) : 0;
    const nf = frame("monster.nul", r.nul.anim, r.nul.frame);
    if (nf) nul.setFrame(nf);
    nul.place(nulPos.x, nulPos.y, nulPos.z);
    world.shadowFor(nul, nulPos.x, nulPos.z);
    const hf = frame("hero", r.hero.anim, r.hero.frame);
    if (hf) hero.setFrame(hf);
    hero.place(heroPos.x, 0, heroPos.z);
    world.shadowFor(hero, heroPos.x, heroPos.z);
    const showAdds = q.has("adds") ? q.get("adds") === "1" : r.adds;
    const a0 = addSlots[0];
    const a1 = addSlots[1];
    const f0 = frame("monster.shade", "idle", 0);
    if (f0) add0.setFrame(f0);
    const f1 = frame("monster.wisp", "idle", 0);
    if (f1) add1.setFrame(f1);
    add0.visible = showAdds && !!a0;
    add1.visible = showAdds && !!a1;
    if (a0) add0.place(a0.x, 0, a0.z);
    if (a1) add1.place(a1.x, 1.2, a1.z);
  };

  const moodFor = (blend: number, fog: number | null) => {
    const m = blendMood(STORM_GOLD, UNWRITTEN, blend);
    return fog === null ? m : { ...m, fog: [fog, m.fog[1], m.fog[2]] as [number, number, number] };
  };

  /** The cue instances of one frame at `age` (a cluster is several cues at once). */
  const instances = (age: number): CueInstance[] => {
    const mk1 = (
      id: PrologueVfxId,
      at: number,
      params?: Record<string, number | string>,
      salt = 0,
    ): CueInstance => ({
      id,
      ageMs: age - at,
      seed: devSeed(id, salt),
      params: { ...(params ?? {}) },
    });
    if (cue === "clusterB") {
      // Part B at its densest: surge 16, the ward, two bolts in flight, three ink pools, the sky tear
      return [
        mk1("surgeAura", 0, { mult: 16 }),
        mk1("ward", 0),
        mk1("hushBolt", 0, undefined, 1),
        mk1("hushBolt", 420, undefined, 2),
        mk1("inkRise", 0, { x: addSlots[0]?.x ?? 0, z: addSlots[0]?.z ?? 0 }, 1),
        mk1("inkRise", 200, { x: addSlots[1]?.x ?? 0, z: addSlots[1]?.z ?? 0 }, 2),
        mk1("skyTear", 0),
      ];
    }
    if (cue === "clusterC") {
      // Part C's densest stretch: the vortex + the fog + the gate going dark + the tear closing + a theft stream
      return [
        mk1("letterVortex", 0),
        mk1("silenceFog", 0),
        mk1("gateDarken", 0),
        mk1("skyTear", 1200, { mode: "close" }),
        mk1("theftStream", 600, { k: 6 }),
        mk1("inkWrite", 300, { chars: 14 }),
      ];
    }
    const id = (cue === "skyTearClose" ? "skyTear" : cue) as PrologueVfxId;
    const p = { ...curParams };
    if (id === "inkRise") {
      p.x ??= addSlots[0]?.x ?? nulPos.x - 4;
      p.z ??= addSlots[0]?.z ?? nulPos.z + 1;
    }
    // the collapse shows the aura at its full tier-4 look; the ember hero kneels in the hand's reach
    return [{ id, ageMs: age, seed: devSeed(id), params: p }];
  };

  const stepOne = (age: number, render: boolean): void => {
    applyRig(age);
    const rig = curRig;
    const pose = camOverride ? poses()[camOverride] : poses()[rig.cam];
    if (pose) {
      world.camera.setTarget(pose);
      world.camera.snap();
    }
    handle.setLetterbox(rig.cam === "boss" && !camOverride);
    const blend = q.has("blend")
      ? Number(q.get("blend"))
      : cue === "theftStream"
        ? (THEFT_RAMP[Math.min(6, Math.max(0, Number(curParams.k ?? 1)))] ?? rig.blend)
        : rig.blend;
    fx.frame(DT, instances(age), blend);
    if (rig.force4) aura.setForceMax(true);
    auraTime += DT;
    updateBright();
    aura.update(DT, auraTime, settings, [1, 0.75, 0.5][tier] ?? 1, tier);
    poolA.update(DT);
    poolB.update(DT);
    poolA.upload();
    poolB.upload();
    lights.update(DT);
    handle.update(DT, world.camera.pose.x);
    world.setMood(moodFor(blend, fx.out.fogDensity), "ruins");
    fx.applyPost(world.postFx.effects);
    world.update(DT, 0);
    if (render) world.render();
  };

  let warmed = false;
  const seek = (cueId: string, ageMs: number, params?: Record<string, number | string>): void => {
    if (!(cueId in RIGS)) throw new Error(`unknown cue ${cueId}`);
    cue = cueId as DevCue;
    curRig = RIGS[cue];
    curAge = ageMs;
    curParams = { ...(curRig.params ?? {}), ...(params ?? {}) };
    // reset the render clock and the stateful aura so a re-seek reproduces the frame exactly
    world.time = 0;
    auraTime = 0;
    freshAura();
    poolA.clear();
    poolB.clear();
    world.postFx.effects.vignetteBoost = 0;
    world.postFx.effects.flash = 0;
    // the ambient dust / embers warm up once; a re-seek must not advance them again (it would move every mote)
    if (!warmed) handle.warmUp(3, world.camera.pose.x);
    warmed = true;
    const n = curRig.settle;
    for (let i = 0; i < n; i++) stepOne(curAge, i === n - 1);
  };

  window.__prologueVfx = {
    ready: false,
    ids: PROLOGUE_VFX_IDS,
    fx,
    seek,
    diagnostics: () => fx.diagnostics(),
    bench: (frames) =>
      new Promise((resolve) => {
        const times: number[] = [];
        let last = performance.now();
        let t0 = last;
        const loop = (now: number): void => {
          times.push(now - last);
          last = now;
          const age = (now - t0) % curRig.loop;
          stepOne(age, true);
          if (times.length >= frames + 5) {
            const t = times.slice(5).sort((a, b) => a - b);
            const avg = t.reduce((s, v) => s + v, 0) / t.length;
            resolve({
              avgMs: avg,
              p95Ms: t[Math.floor(t.length * 0.95)] ?? 0,
              maxMs: t[t.length - 1] ?? 0,
              frames: t.length,
            });
            return;
          }
          requestAnimationFrame(loop);
        };
        t0 = performance.now();
        requestAnimationFrame(loop);
      }),
    setKeepOut: (rects) => {
      koN = Math.min(16, rects.length);
      for (let i = 0; i < koN; i++)
        for (let j = 0; j < 4; j++) koRects[i * 4 + j] = rects[i]?.[j] ?? 0;
    },
  };
  window.__renderTest = {
    world,
    step: (n: number, dt = DT) => {
      for (let i = 0; i < n; i++) stepOne(curAge, i === n - 1);
      void dt;
    },
    bench: () => ({ avgMs: 0, p95Ms: 0, maxMs: 0 }),
    setBiome: (b) => world.setBiome(b, true),
    ready: true,
  };

  seek(cue, curAge, parseParams(q));
  window.__prologueVfx.ready = true;
  if (frozen) return;

  // live: loop the cue on the real clock
  let last = performance.now();
  let t = curAge;
  const loop = (now: number): void => {
    const dt = Math.min(now - last, 50);
    last = now;
    t = (t + dt) % curRig.loop;
    stepOne(t, true);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", () => {
    fx.dispose();
    aura.dispose();
    poolA.dispose();
    poolB.dispose();
    lights.dispose();
    handle.dispose();
    world.dispose();
  });
}

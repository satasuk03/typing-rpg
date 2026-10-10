/**
 * DEV-ONLY prologue scene (P3.1, P4.2 WP-B): ?scene=prologue&part=cutscene[&tl=open|unwriting|test][&t=<ms>][&lc=<ms>][&freeze=1][&id=<level>][&tier=0]
 *
 * Drives the cutscene engine over a real level. P4.2 (P3-7): by default it plays the REAL prologue timelines on the Word Gate
 * layout (`tl=open` = Part A, then Part C straight after it; `tl=unwriting` = Part C alone), with the actors, camera and mood
 * the stage seam carries (the HUD, VFX and sim are the real session's: use `?scene=play`'s prologue route for those).
 * `tl=test` (or any `id=`) plays the small TEST timeline over a ruins level, as before.
 * `t` + `freeze=1` renders the exact frame at `t` ms of the first timeline. Overlay lines never hold the clock; a gate line does
 * (Space/Enter advance it, letter keys do not).
 *
 * Test hooks: `window.__prologueScene` (+ `window.__renderTest`, same shape as the level scene).
 */
import { CutscenePlayer } from "../cutscene/player";
import { TEST_TIMELINE } from "../cutscene/testTimeline";
import { OPEN_TIMELINE, UNWRITING_TIMELINE } from "../cutscene/timelines/prologue";
import type {
  ActorRef,
  CutsceneState,
  HeroCutsceneAnim,
  StageDirector,
  Timeline,
} from "../cutscene/types";
import type { QualityTier } from "../render";
import { isQualityTier, RenderWorld } from "../render";
import { type BiomeMood, blendMood, UNWRITTEN } from "../render/biomes";
import type { CameraPose } from "../render/camera";
import { buildWorld, loadLevel, toRenderBiome } from "../render/world";

declare global {
  interface Window {
    __prologueScene?: {
      ready: boolean;
      player: CutscenePlayer;
      /** Seek (pure: no edge cues) and render. */
      seek(tMs: number, lineClockMs?: number): CutsceneState;
      state(): CutsceneState;
    };
  }
}

/** A desaturated, slightly darker take on `base` (stand-in for the real UNWRITTEN mood, for the TEST timeline). */
function desaturate(base: BiomeMood): BiomeMood {
  return {
    ...base,
    sat: base.sat * 0.18,
    exposure: base.exposure * 0.92,
    fogCol: [0.2, 0.21, 0.24],
    vig: base.vig * 1.2,
  };
}

export function start(canvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const part = q.get("part") ?? "cutscene";
  // P3.2: `part=vfx` fires each prologue VFX cue in isolation (render/vfx/prologue/devScene.ts)
  if (part === "vfx") {
    void import("../render/vfx/prologue/devScene").then((m) => m.start(canvas, q));
    return;
  }
  // P3.3: `part=hud` is the prologue HUD probe / stills scene (hud/prologue/devScene.ts)
  if (part === "hud") {
    void import("../hud/prologue/devScene").then((m) => m.startPrologueHud(canvas, q));
    return;
  }
  if (part !== "cutscene") throw new Error(`prologue scene: unknown part "${part}"`);
  // P3-7: the real timelines on the Word Gate layout by default; the TEST timeline over a ruins level when asked for
  const which = q.get("tl") ?? (q.get("id") ? "test" : "open");
  const real = which !== "test";
  const id = q.get("id") ?? (real ? "prologue" : "ch1-l04");
  const tierParam = Number(q.get("tier") ?? "0");
  const tier: QualityTier = isQualityTier(tierParam) ? tierParam : 0;
  const frozen = q.get("freeze") === "1";
  const layout = loadLevel(id);

  const world = new RenderWorld({ biome: toRenderBiome(layout.biome), quality: tier });
  world.init(canvas);
  const handle = buildWorld(layout, world, world.source);
  const timelines: Timeline[] = !real
    ? [TEST_TIMELINE]
    : which === "unwriting"
      ? [UNWRITING_TIMELINE]
      : [OPEN_TIMELINE, UNWRITING_TIMELINE];

  // ---- the hero's home: the layout's start anchor (Part A, the test timeline); the encounter stop for Part C (it continues the live stage)
  const startAnchor = handle.getAnchor("start");
  const stopAnchor = real && handle.hasAnchor("enc1.hero") ? handle.getAnchor("enc1.hero") : null;
  let homeX = startAnchor.x;
  let homeZ = handle.walkPath.zAtX(homeX);
  const hero = world.addActor("hero", "idle", { rim: 1.3, blobW: 1.25 });
  const heroFrames = (anim: string) => {
    try {
      const f = world.source.frames("hero", anim);
      return f.length > 0 ? f : world.source.frames("hero", "idle");
    } catch {
      return world.source.frames("hero", "idle");
    }
  };

  // ---- the standalone StageDirector (LevelStage.director() is the in-game one)
  let camOverride: CameraPose | null = null;
  let moodOverride: BiomeMood | null = null;
  const hs = { anim: "idle" as HeroCutsceneAnim | null, ageMs: 0, dx: 0, dz: 0, visible: true };
  const director: StageDirector = {
    heroActor: () => hero,
    bossActor: () => null,
    prop: () => null,
    setCameraOverride: (p) => {
      camOverride = p;
    },
    setMood: (m) => {
      moodOverride = (m as BiomeMood | null) ?? null;
    },
    setLetterbox: (on) => handle.setLetterbox(on),
    setHeroAnim: (anim, ageMs = 0) => {
      hs.anim = anim;
      hs.ageMs = ageMs;
    },
    setActorState: (who: ActorRef, st) => {
      if (who !== "hero") return;
      hs.dx = st?.dx ?? 0;
      hs.dz = st?.dz ?? 0;
      hs.visible = st?.visible ?? true;
    },
  };

  const baseWalk = handle.cameraPose("walk");
  const pose = (n: string): CameraPose | undefined => {
    try {
      return handle.cameraPose(n as never);
    } catch {
      return undefined;
    }
  };
  const makePlayer = (tl: Timeline): CutscenePlayer => {
    const cont = tl.setup === "continue";
    homeX = cont && stopAnchor ? stopAnchor.x : startAnchor.x;
    homeZ = handle.walkPath.zAtX(homeX);
    const walk = { ...baseWalk, x: startAnchor.x + 3.2 };
    return new CutscenePlayer(tl, {
      env: {
        basePose: cont ? (pose("battle:1") ?? walk) : walk,
        anchors: { walk, battle: pose("battle:1"), bossIntro: pose("boss"), boss: pose("boss") },
        reducedMotion: q.get("reduced") === "1",
      },
      director,
      moodAt: (k) => {
        const base = handle.moodAt(homeX + 3.2);
        return blendMood(base, real ? UNWRITTEN : desaturate(base), k);
      },
      sink: {
        onEnd: () => {
          // Part A hands over to Part C (the dev scene has no sim between them)
          const next = timelines[timelines.indexOf(tl) + 1];
          if (!next) return;
          player.release();
          hs.anim = "idle";
          hs.ageMs = 0;
          player = makePlayer(next);
          player.start();
        },
      },
    });
  };
  let player = makePlayer(timelines[0] as Timeline);

  const applyHero = (): void => {
    const frames = heroFrames(hs.anim ?? "idle");
    const fps = hs.anim === "walk" ? 8 : 2.5;
    const idx = frames.length > 1 ? Math.floor((hs.ageMs / 1000) * fps) % frames.length : 0;
    const f = frames[idx] ?? frames[0];
    if (f) hero.setFrame(f);
    const x = homeX + hs.dx;
    const z = homeZ + hs.dz;
    hero.place(x, 0, z);
    hero.visible = hs.visible;
    world.shadowFor(hero, x, z);
  };

  /** One fixed 1/60 s presentation step (no player clock advance): camera snap, level + mood, render. */
  const step = (n: number, dt = 1 / 60): void => {
    for (let i = 0; i < n; i++) {
      if (camOverride) {
        world.camera.setTarget(camOverride);
        world.camera.snap();
      }
      applyHero();
      handle.update(dt, world.camera.pose.x);
      if (moodOverride) world.setMood(moodOverride);
      world.update(dt, 0);
      if (i === n - 1) world.render();
    }
  };

  const seek = (tMs: number, lc = -1): CutsceneState => {
    // grain / flicker are functions of the render clock: restart it so a re-seek reproduces the same frame
    world.time = 0;
    const s = player.seek(tMs, lc);
    handle.warmUp(3, world.camera.pose.x);
    step(20);
    return s;
  };

  window.__prologueScene = {
    ready: true,
    get player() {
      return player;
    },
    seek,
    state: () => player.state,
  };
  window.__renderTest = {
    world,
    step,
    bench: () => ({ avgMs: 0, p95Ms: 0, maxMs: 0 }),
    setBiome: (b) => world.setBiome(b, true),
    ready: true,
  };

  const t0 = Number(q.get("t") ?? "0");
  const lc = q.get("lc");
  if (frozen) {
    seek(t0, lc === null ? -1 : Number(lc));
    return;
  }

  player.start();
  if (t0 > 0) player.seek(t0, lc === null ? -1 : Number(lc));
  window.addEventListener("keydown", (e) => {
    if (player.key(e.key)) e.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) player.pause();
    else player.resume();
  });
  window.addEventListener("blur", () => player.pause());
  window.addEventListener("focus", () => player.resume());
  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(now - last, 50);
    last = now;
    player.tick(dt);
    step(1, dt / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("beforeunload", () => {
    player.release();
    handle.dispose();
    world.dispose();
  });
}

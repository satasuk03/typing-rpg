/**
 * PrologueFx (P3.2): the director of the prologue world VFX (`docs/vfx/prologue-art-direction.md` §3).
 *
 * Two sources of cues, one drawing path:
 *   1. SCRIPTED: the cutscene engine's `CutsceneState.vfx` (`ActiveVfx`: id, `ageMs`, fixed `seed`, params). Pass them to
 *      `frame(dt, scripted)` every frame: the pictures are pure functions of (seed, age), so `seek(t)` reproduces them.
 *   2. LIVE: Part B cues the sim events trigger (`inkRise` on a spawn, `skyTear` on the boss intro, `hushBolt` on Nul's attack)
 *      and the ward, which follows `view.prologue.bossClamped`. They get a seed from a counter and age with `dt`.
 *
 * It owns its own pools (2 particle batches, a glyph batch, 10 ink cards, 20 quads, 2 lights) and never touches the typing VFX
 * pools, so a prologue frame costs 5 draw calls more than a story frame. `HeroAura` prologue modes (floor tier, surge, collapse)
 * are driven through `attachAura`. Wiring into the level session is `attachPrologueFx` (`attach.ts`).
 */
import type { EventOf, LevelView } from "@hd2d/sim";
import { FxKind } from "../../materials/fx";
import type { PostEffects } from "../../post/pipeline";
import type { RenderWorld } from "../../RenderWorld";
import { type HeroAura, PROLOGUE_FLOOR_TIER } from "../HeroAura";
import type { TypingFxSettings } from "../types";
import { FxCtx } from "./ctx";
import { CUE_RENDERERS } from "./cues";
import { rnd, sunDim } from "./params";
import type { CueInstance, PrologueAnchors, PrologueOut, PrologueVfxId } from "./types";

export interface PrologueFxDeps {
  world: RenderWorld;
  anchors: PrologueAnchors;
  /** CSS-px rects of what a bright effect must keep 40 px away from: plates in Part B, the dialogue box (inflated 24 px) and the ink line in Part C. */
  keepOutRects?(out: Float32Array): number;
  /** Hero outline flash (`hushBolt` impact). */
  heroRim?(amount: number, rgb: readonly [number, number, number]): void;
  /** The sim's defId of an enemy (to tell Nul from his adds). */
  defOf?(enemyId: number): string | null;
  /** P4.2: the combat library's persistent state (Aegis bubble, the boss intro rune circle) that a cutscene switches off. */
  combat?: { setCutscene(on: boolean): void } | null;
}

/** How long a live cue is kept after it starts (ms): longer than its picture, shorter than a leak. */
const LIVE_LIFETIME: Readonly<Record<PrologueVfxId, number>> = {
  inkRise: 2000,
  skyTear: 60000,
  hushBolt: 1200,
  ward: 1e9,
  surgeAura: 0,
  catchFireball: 2600,
  inkWrite: 4000,
  theftStream: 1600,
  auraCollapse: 0,
  gateDarken: 9000,
  letterVortex: 6000,
  silenceFog: 1e9,
  ember: 1e9,
};

/** The prewarm set: one mid-life instance of every cue (auraCollapse before its snap, so the streak is untouched). */
const WARM_CUES: readonly {
  id: PrologueVfxId;
  age: number;
  params?: Record<string, number | string>;
}[] = [
  { id: "inkRise", age: 500 },
  { id: "skyTear", age: 900, params: { closeAt: 3400 } },
  { id: "hushBolt", age: 330 },
  { id: "hushBolt", age: 520 },
  { id: "ward", age: 900 },
  { id: "surgeAura", age: 300, params: { mult: 16 } },
  { id: "catchFireball", age: 700 },
  { id: "inkWrite", age: 400 },
  { id: "theftStream", age: 500, params: { k: 1 } },
  { id: "theftStream", age: 900, params: { k: 3 } },
  { id: "gateDarken", age: 800 },
  { id: "letterVortex", age: 1500 },
  { id: "silenceFog", age: 1500 },
  { id: "ember", age: 800 },
];

/** Intensity of the Part B mask glint. */
const MASK_GLINT = 0.42;

interface LiveCue {
  id: PrologueVfxId;
  ageMs: number;
  seed: number;
  params?: Record<string, number | string>;
}

/** The sink the event bindings call (`Sinks.prologue`): all render-only. */
export interface PrologueFxSink {
  /** `EnemySpawned` on the prologue (an add rises out of an ink pool; Nul himself comes out of the sky tear). */
  enemySpawned(e: EventOf<"EnemySpawned">): void;
  /** `BossIntroStarted`: the sky tear opens. */
  bossIntro(e: EventOf<"BossIntroStarted">): void;
  /** `EnemyAttack`: Nul's attack is the ink lance. */
  enemyAttack(e: EventOf<"EnemyAttack">): void;
  /** `Hit` on the clamped boss: the ward ripples. */
  hit(e: EventOf<"Hit">): void;
  /** `PrologueClimax`: Part B's world effects end (the ward drops, bolts and pools are cleared); the cutscene takes over. */
  climax(e: EventOf<"PrologueClimax">): void;
}

interface SunGlow {
  uI: { value: number };
  base: number;
}

export class PrologueFx implements PrologueFxSink {
  readonly ctx: FxCtx;
  private live: LiveCue[] = [];
  private view: LevelView | null = null;
  private aura: HeroAura | null = null;
  private seedN = 0x5eed;
  private wardAge = -1;
  private wardOut = -1;
  private wardHit = -1;
  private sun: SunGlow[] | null = null;
  private readonly ko = new Float32Array(16 * 4);
  private disposed = false;
  private enabled = true;
  /** P4.2: Part C (the cutscene) has begun: combat leftovers are being cleared. */
  private cutscene = false;
  /** P4.2: frames left of the hidden prewarm (every cue kind drawn once under Part A's opening black). */
  private warmFrames = 0;
  /** Probe hook: false keeps the aura driving but skips every cue's drawing (a with / without comparison of the cues alone). */
  private cuesVisible = true;
  /** Dev / test hook: cues forced by `trigger` that never expire (the dev scene seeks by age instead). */
  private readonly inst: CueInstance = { id: "inkRise", ageMs: 0, seed: 0 };

  constructor(private readonly deps: PrologueFxDeps) {
    this.ctx = new FxCtx(deps.world);
  }

  get out(): PrologueOut {
    return this.ctx.out;
  }

  setSettings(s: TypingFxSettings, tier: number): void {
    this.ctx.setSettings(s, tier);
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }
  setCuesVisible(on: boolean): void {
    this.cuesVisible = on;
  }
  setView(v: LevelView | null): void {
    this.view = v;
  }
  /** Drive `HeroAura`'s prologue modes from `view.prologue` and the scripted `surgeAura` / `auraCollapse` cues. */
  attachAura(aura: HeroAura | null): void {
    this.aura = aura;
  }

  // ------------------------------------------------------------------------------------------ live cues

  /** Start a live cue now (age 0). Deterministic seed from a counter. */
  trigger(id: PrologueVfxId, params?: Record<string, number | string>): void {
    if (!this.enabled) return;
    this.seedN = (Math.imul(this.seedN, 1664525) + 1013904223) >>> 0;
    this.live.push({ id, ageMs: 0, seed: this.seedN, params });
    if (this.live.length > 24) this.live.shift();
  }
  /**
   * P4.2: draw every cue kind for `frames` frames so the shaders compile, the buffers upload and the lazy quads are built BEFORE
   * Part B (the P4.1 first-frame hitch). Call it while the screen is black (Part A's opening fade).
   */
  prewarm(frames = 3): void {
    this.warmFrames = frames;
    // the servants' and Nul's sprites (geometry + textures upload on their first draw): a visible actor each, in the hero's spot,
    // freed after the warm frames
    if (this.warmActors.length === 0) {
      const h = { x: 0, y: 0, z: 0 };
      this.deps.anchors.hero(h);
      for (const key of ["monster.shade", "monster.wisp", "monster.nul"]) {
        try {
          const a = this.deps.world.addActor(key, "idle", { scale: 1, rim: 1, blobW: 1 });
          a.place(h.x, 0, h.z);
          this.warmActors.push(a);
        } catch {
          /* a key the sprite source does not have: nothing to warm */
        }
      }
    }
  }
  private readonly warmActors: { dispose(): void; place(x: number, y: number, z: number): void }[] =
    [];

  /** Drop every live cue (a new attempt, the climax). */
  clear(): void {
    this.live.length = 0;
    this.wardAge = this.wardOut = this.wardHit = -1;
  }
  /** A new attempt: the cutscene state is left (re-arms `enterCutscene`). */
  leaveCutscene(): void {
    if (!this.cutscene) return;
    this.cutscene = false;
    this.deps.combat?.setCutscene(false);
    this.aura?.setCutscene(false);
  }

  // ---- sink (event bindings)
  enemySpawned(e: EventOf<"EnemySpawned">): void {
    if (!this.view?.prologue || e.isBoss) return;
    const p = { x: 0, y: 0, z: 0 };
    if (!this.deps.anchors.enemy(e.enemyId, p)) return;
    this.trigger("inkRise", { x: p.x, z: p.z });
  }
  bossIntro(_e: EventOf<"BossIntroStarted">): void {
    if (!this.view?.prologue) return;
    // B2: open, hold to the end of the boss intro (3.4 s, art direction §4.2), then close; Part C's exit tear is a scripted cue
    // P4.2 (P2-3): the mouth of the tear sits just above Nul's crown, in the boss-intro frame (the layout marker is 7 m up, off frame)
    this.trigger("skyTear", { closeAt: 3400, ty: 5.3 });
  }
  enemyAttack(e: EventOf<"EnemyAttack">): void {
    if (!this.view?.prologue) return;
    const def =
      this.deps.defOf?.(e.enemyId) ?? this.view.enemies.find((x) => x.id === e.enemyId)?.defId;
    if (def === "nul") this.trigger("hushBolt");
  }
  hit(e: EventOf<"Hit">): void {
    if (this.wardAge >= 0 && this.wardOut < 0 && e.kind !== "chip") this.wardHit = 0;
  }
  climax(_e: EventOf<"PrologueClimax">): void {
    this.clear();
    this.aura?.setPrologue(null);
    this.enterCutscene();
  }

  /**
   * P4.2 (P1-4): Part C begins. The combat state that leaked into the cutscene goes: the Aegis bubble (about 300 ms), the
   * hero's combo rune circle and Nul's cyan boss-intro circle (both gone by 1.5 s). Idempotent; `reset()` re-arms it.
   */
  enterCutscene(): void {
    if (this.cutscene) return;
    this.cutscene = true;
    this.deps.combat?.setCutscene(true);
    this.aura?.setCutscene(true);
  }

  // ------------------------------------------------------------------------------------------ frame

  /**
   * @hot Once per frame. `dt` seconds (the stage's dilated dt); `scripted` the cutscene's active vfx; `moodBlend` 0..1 toward
   * UNWRITTEN (the sun glows dim stepwise with it).
   */
  frame(dt: number, scripted: readonly CueInstance[] = [], moodBlend = 0): void {
    if (this.disposed) return;
    const c = this.ctx;
    if (!this.enabled || c.k <= 0) {
      c.hideAll();
      this.aura?.setPrologue(null);
      return;
    }
    const a = this.deps.anchors;
    a.hero(c.hero);
    c.bossOk = a.boss(c.boss);
    a.gate(c.gate);
    a.tear(c.tear);
    c.runeN = a.runes ? Math.min(c.runes.length, a.runes(c.runes)) : 0;
    const n = this.deps.keepOutRects ? this.deps.keepOutRects(this.ko) : 0;
    c.setKeepOut(this.ko, n);
    this.stepWard(dt);

    c.begin();
    const dtMs = dt * 1000;
    // live cues age with dt; expired ones go
    let w = 0;
    for (let j = 0; j < this.live.length; j++) {
      const l = this.live[j] as LiveCue;
      l.ageMs += dtMs;
      if (l.ageMs > LIVE_LIFETIME[l.id]) continue;
      this.live[w++] = l;
      this.draw(l.id, l.ageMs, l.seed, l.params);
    }
    this.live.length = w;
    if (this.wardAge >= 0) {
      const p: Record<string, number> = { out: this.wardOut, hit: this.wardHit };
      this.draw("ward", this.wardAge, 0x3a1d, p);
    }
    for (const s of scripted) {
      this.inst.id = s.id;
      this.draw(s.id, s.ageMs, s.seed, s.params, s);
    }
    // P4.2 (P1-1): the low-key grade lowers the whole frame, so Nul's pale mask gets a small cool glint (mask : cloak >= 6);
    // a tiny glow on the mask only (the cloak stays ink: P3), dimmed near plates
    if (this.view?.prologue && !this.cutscene && c.bossOk) {
      const k = c.keepK(c.boss.x - 0.1, c.boss.y + 3.3, c.boss.z + 0.3);
      c.glow(
        c.boss.x - 0.1,
        c.boss.y + 3.3,
        c.boss.z + 0.45,
        0.6,
        [0.95, 0.85, 1.25],
        MASK_GLINT * k,
      );
    }
    if (this.warmFrames === 0 && this.warmActors.length > 0) {
      for (const a of this.warmActors) a.dispose();
      this.warmActors.length = 0;
    }
    if (this.warmFrames > 0) {
      this.warmFrames--;
      for (const w of WARM_CUES) this.draw(w.id, w.age, 0x77a1, w.params);
    }
    c.end();
    this.driveAura();
    this.dimSun(moodBlend);
    this.heroRim();
  }

  private draw(
    id: PrologueVfxId,
    ageMs: number,
    seed: number,
    params?: Readonly<Record<string, number | string>>,
    src?: CueInstance,
  ): void {
    if (!this.cuesVisible && id !== "surgeAura") return;
    const inst = this.inst;
    inst.id = id;
    inst.ageMs = ageMs;
    inst.seed = seed;
    inst.params = params;
    inst.from = src?.from;
    inst.to = src?.to;
    inst.scripted = src !== undefined;
    CUE_RENDERERS[id](this.ctx, inst);
  }

  private stepWard(dt: number): void {
    const clamped = this.view?.prologue?.bossClamped === true;
    if (clamped) {
      if (this.wardAge < 0 || this.wardOut >= 0) {
        this.wardAge = 0;
        this.wardOut = -1;
      }
    } else if (this.wardAge >= 0 && this.wardOut < 0) this.wardOut = 0;
    if (this.wardAge >= 0) this.wardAge += dt * 1000;
    if (this.wardOut >= 0) {
      this.wardOut += dt * 1000;
      if (this.wardOut > 400) this.wardAge = this.wardOut = this.wardHit = -1;
    }
    if (this.wardHit >= 0) {
      this.wardHit += dt * 1000;
      if (this.wardHit > 600) this.wardHit = -1;
    }
  }

  private driveAura(): void {
    const aura = this.aura;
    if (!aura) return;
    const o = this.ctx.out;
    const vp = this.view?.prologue;
    const surge = o.auraSurge ?? vp?.surgeMult ?? null;
    if (surge !== null || o.auraCollapseMs !== null) {
      aura.setPrologue({ floor: PROLOGUE_FLOOR_TIER, surgeMult: surge ?? 1 });
    } else if (aura.prologue !== null) aura.setPrologue(null);
    aura.setCollapse(o.auraCollapseMs);
  }

  private heroRim(): void {
    const o = this.ctx.out;
    if (o.heroRim > 0 || this.rimOn) {
      this.deps.heroRim?.(o.heroRim, [1.2, 0.6, 2.4]);
      this.rimOn = o.heroRim > 0;
    }
  }
  private rimOn = false;

  /** The two sun Glow quads (layout glows at the gate: 22 m and 8 m) scale with `rays / 1.5`: they dim with the theft ramp. */
  private dimSun(blend: number): void {
    if (this.sun === null) {
      this.sun = [];
      const g = this.ctx.gate;
      for (const ch of this.deps.world.scene.children) {
        const m = ch as unknown as {
          renderOrder: number;
          position: { x: number };
          scale: { x: number };
          material?: { uniforms?: Record<string, { value: number }> };
        };
        const u = m.material?.uniforms;
        if (!u || u.uKind?.value !== FxKind.Glow || m.renderOrder !== 6) continue;
        if (Math.abs(m.position.x - g.x) > 1.5) continue;
        if (Math.abs(m.scale.x - 22) > 0.01 && Math.abs(m.scale.x - 8) > 0.01) continue;
        const uI = u.uI as { value: number };
        this.sun.push({ uI, base: uI.value });
      }
    }
    const k = sunDim(blend);
    for (const s of this.sun) s.uI.value = s.base * k;
  }

  /** Apply the post requests (vignette pulse, capped flash) on top of whatever else set them this frame (max). */
  applyPost(effects: PostEffects): void {
    const o = this.ctx.out;
    effects.vignetteBoost = Math.max(effects.vignetteBoost, o.vignette);
    effects.flash = Math.max(effects.flash, o.flash);
  }

  /** Diagnostics for tests and the dev overlay. */
  diagnostics(): ReturnType<FxCtx["diagnostics"]> & {
    live: number;
    keepOut: { checked: number; dimmed: number };
  } {
    return {
      ...this.ctx.diagnostics(),
      live: this.live.length + (this.wardAge >= 0 ? 1 : 0),
      keepOut: { checked: this.ctx.keepOutChecked, dimmed: this.ctx.keepOutDimmed },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.aura?.setPrologue(null);
    this.aura?.setCollapse(null);
    this.ctx.dispose();
  }
}

/** A seed for a scripted cue the way the cutscene engine makes it (for tests and the dev scene): `rnd` of the id's index. */
export function devSeed(id: PrologueVfxId, salt = 0): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return (h ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
}
export { rnd };

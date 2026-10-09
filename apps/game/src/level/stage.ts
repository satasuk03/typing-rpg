/**
 * LevelStage: the world-side presentation of a running level. It owns the hero and enemy actors and the camera
 * poses, and it only ever CONSUMES sim output: events (through `eventBindings.ts`) and the per-frame `LevelView`.
 * It never reads or mutates sim state.
 *
 * Everything here runs on a render clock (`RenderClock`) that can dilate time (hit-stop, slow-mo, the boss death
 * beat). That never touches the sim: the sim clock is owned by `runner.ts`.
 *
 * Minimal on purpose: the VFX spectacle arrives through the hook points in `eventBindings.ts` (T2.3 / T2.6).
 */
import type { EnemyDef } from "@hd2d/content";
import type { EnemyView, LevelView } from "@hd2d/sim";
import type { HudAnchor, HudProjector } from "../hud";
import type { CameraPose, RenderWorld, SpriteActor, SpriteFrame } from "../render";
import { HERO_LUM_CAP } from "../render/vfx/colors";
import { motionK } from "../render/vfx/combat/params";
import type { WorldHandle } from "../render/world";
import { WEAPON_ANCHOR_OFFSET } from "./typingFxParams";

// ---------------------------------------------------------------------------------------------- render clock

/** Render-only time dilation. `dilate(realDt)` is what animations consume; the sim never sees it. */
export class RenderClock {
  private stopLeft = 0;
  private slowLeft = 0;
  private slowScale = 1;

  /** Freeze animation for `sec` real seconds (impact frames). */
  hitStop(sec: number): void {
    this.stopLeft = Math.max(this.stopLeft, sec);
  }

  /** Run animation at `scale` (<1) for `sec` real seconds. */
  slowMo(scale: number, sec: number): void {
    this.slowScale = Math.min(this.slowLeft > 0 ? this.slowScale : 1, scale);
    this.slowLeft = Math.max(this.slowLeft, sec);
  }

  get active(): boolean {
    return this.stopLeft > 0 || this.slowLeft > 0;
  }

  dilate(realDt: number): number {
    if (this.stopLeft > 0) {
      this.stopLeft = Math.max(0, this.stopLeft - realDt);
      return 0;
    }
    if (this.slowLeft > 0) {
      this.slowLeft = Math.max(0, this.slowLeft - realDt);
      const s = this.slowScale;
      if (this.slowLeft === 0) this.slowScale = 1;
      return realDt * s;
    }
    return realDt;
  }

  reset(): void {
    this.stopLeft = 0;
    this.slowLeft = 0;
    this.slowScale = 1;
  }
}

// ---------------------------------------------------------------------------------------------- helpers

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOut = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

/** Hero faces right; the walk camera leads the hero by this much (POC framing). */
const WALK_LEAD = 3.2;
const FLY_Y = 1.7;
const TICKS_PER_S = 60;
/** How long a dead enemy waits for its EnemyDeath to be presented before dissolving anyway (s). */
const DEATH_WAIT = 1.6;

interface HeroFrames {
  idle: readonly SpriteFrame[];
  walk: readonly SpriteFrame[];
  raise: readonly SpriteFrame[];
  slash: readonly SpriteFrame[];
  cast: readonly SpriteFrame[];
  hurt: readonly SpriteFrame[];
  win: readonly SpriteFrame[];
}

interface EnemyActor {
  id: number;
  defId: string;
  slot: number;
  isBoss: boolean;
  actor: SpriteActor;
  idle: readonly SpriteFrame[];
  atk: readonly SpriteFrame[];
  scale: number;
  flyY: number;
  baseX: number;
  baseZ: number;
  /** The frame drawn last frame (the death dissolve samples its pixels). */
  frame: SpriteFrame | null;
  /** Stage seconds spent dead before EnemyDeath was presented. */
  deadWait: number;
  /** Stage-time (s) timers since the last event of each kind. Infinity = never. */
  born: number;
  hurtT: number;
  attackT: number;
  deadT: number;
  flash: number;
}

export interface StageOptions {
  enemies: ReadonlyMap<string, EnemyDef>;
}

export class LevelStage {
  readonly clock = new RenderClock();
  /** Stage time in seconds (dilated). */
  time = 0;
  /** The dilated dt of the last `update` (0 during a hit-stop): the combat VFX advance on this clock. */
  dt = 0;
  /** Accessibility settings that scale the camera hits (`setFxSettings`, from the HUD settings each frame). */
  private fxSet = { effectsIntensity: 1, reducedMotion: false };

  private hero: SpriteActor | null = null;
  private heroFrames: HeroFrames | null = null;
  private heroX = 0;
  private heroZ = 0;
  private heroY = 0;
  private heroFlash = 0;
  private heroFrame: SpriteFrame | null = null;
  private heroHurtT = Infinity;
  private heroAttackT = Infinity;
  private heroCastT = Infinity;
  private heroGuardT = Infinity;
  private heroTargetX: number | null = null;
  private readonly foes = new Map<number, EnemyActor>();

  private nextEnc = 1;
  private curEnc = 0;
  private prevStopX: number;
  private walkStartTick = 0;
  private walkEndTick = 1;
  private letterboxOn = false;
  private lastView: LevelView | null = null;
  // ---- typing VFX hooks (T2.6): camera override, guard push-back, delayed finisher dash
  private camOverride: Partial<CameraPose> | null = null;
  private camSnapPending = false;
  private pushT = Infinity;
  private pushDist = 0;
  private pushOut = 0.08;
  private pushBack = 0.2;
  private pendingDash: { at: number; target: number } | null = null;

  constructor(
    readonly world: RenderWorld,
    readonly handle: WorldHandle,
    private readonly opts: StageOptions,
  ) {
    this.prevStopX = handle.getAnchor("start").x;
    this.heroX = this.prevStopX;
    this.heroZ = handle.walkPath.zAtX(this.heroX);
    this.spawnHero();
    this.snapCamera("walk");
  }

  // ------------------------------------------------------------------------------------------- setup

  private spawnHero(): void {
    const src = this.world.source;
    const f = (a: string): readonly SpriteFrame[] => src.frames("hero", a);
    this.heroFrames = {
      idle: f("idle"),
      walk: f("walk"),
      raise: f("raise"),
      slash: f("slash"),
      cast: f("cast"),
      hurt: f("hurt"),
      win: f("win"),
    };
    this.hero = this.world.addActor("hero", "idle", { rim: 1.3, blobW: 1.25 });
    this.hero.setLumCap(HERO_LUM_CAP);
    this.placeHero();
  }

  /** Back to the start of the level (restart). */
  reset(): void {
    for (const e of this.foes.values()) e.actor.dispose();
    this.foes.clear();
    this.nextEnc = 1;
    this.curEnc = 0;
    this.prevStopX = this.handle.getAnchor("start").x;
    this.heroX = this.prevStopX;
    this.heroZ = this.handle.walkPath.zAtX(this.heroX);
    this.heroFlash = 0;
    this.heroHurtT = this.heroAttackT = this.heroCastT = this.heroGuardT = Infinity;
    this.camOverride = null;
    this.pushT = Infinity;
    this.pendingDash = null;
    this.clock.reset();
    this.setLetterbox(false);
    this.placeHero();
    this.snapCamera("walk");
  }

  dispose(): void {
    for (const e of this.foes.values()) e.actor.dispose();
    this.foes.clear();
    this.hero?.dispose();
    this.hero = null;
  }

  // ------------------------------------------------------------------------------------------- event-driven actions
  // Called from eventBindings.ts. They only start timers / create actors; update() animates them.

  walkStarted(tick: number, untilTick: number): void {
    this.walkStartTick = tick;
    this.walkEndTick = Math.max(tick + 1, untilTick);
  }

  /** `index` is the sim's encounter index (0-based); layouts number encounters from 1. */
  encounterStarted(index: number): void {
    const n = index + 1;
    this.curEnc = n;
    this.nextEnc = n + 1;
    const stop = this.handle.encounter(n).hero;
    this.prevStopX = stop.x;
    this.heroX = stop.x;
    this.heroZ = stop.z;
  }

  encounterCleared(): void {
    // The hero stays at the stop; the next walk starts from here.
  }

  spawnEnemy(id: number, defId: string, slot: number, isBoss: boolean): void {
    if (this.foes.has(id)) return;
    const def = this.opts.enemies.get(defId);
    const src = this.world.source;
    let key = `monster.${def?.spriteId ?? "goblin"}`;
    if (!src.has(key)) key = "monster.goblin";
    const scale = def?.scale ?? (isBoss ? 1.6 : 1.35);
    const flyY = def?.flying === true ? FLY_Y : 0;
    const pos = this.slotPosition(this.curEnc > 0 ? this.curEnc : 1, slot);
    const actor = this.world.addActor(key, "idle", { scale, rim: 1.4, blobW: scale * 1.1 });
    const idle = src.frames(key, "idle");
    const atk = src.frames(key, "atk");
    const e: EnemyActor = {
      id,
      defId,
      slot,
      isBoss,
      actor,
      idle,
      atk,
      scale,
      flyY,
      baseX: pos.x,
      baseZ: pos.z,
      frame: null,
      deadWait: 0,
      born: this.time,
      hurtT: Infinity,
      attackT: Infinity,
      deadT: Infinity,
      flash: 0,
    };
    this.foes.set(id, e);
    this.world.shadowFor(actor, pos.x, pos.z);
    actor.place(pos.x + 4, flyY, pos.z);
  }

  /** Anchor position of an encounter slot; boss adds (slots beyond the layout) fan out in front of the boss. */
  slotPosition(encIndex: number, slot: number): { x: number; z: number } {
    const enc = this.handle.encounter(encIndex);
    const s = enc.slots[slot];
    if (s) return { x: s.x, z: s.z };
    const boss = enc.slots[0];
    if (!boss) return { x: enc.hero.x + 5, z: enc.hero.z };
    const n = slot - enc.slots.length + 1;
    return { x: boss.x - 2.4 * n, z: boss.z + (n % 2 === 0 ? -0.9 : 0.9) };
  }

  enemyHit(id: number, strength: number): void {
    const e = this.foes.get(id);
    if (!e) return;
    e.hurtT = 0;
    // chip / DoT hits must not keep a big enemy white: no re-trigger while a flash is still up, bosses cap at 0.5
    if (e.flash > 0.2) return;
    e.flash = Math.max(e.flash, Math.min(strength, e.isBoss ? 0.5 : 1));
  }

  enemyAttack(id: number): void {
    const e = this.foes.get(id);
    if (e) e.attackT = 0;
  }

  enemyDied(id: number): void {
    const e = this.foes.get(id);
    if (e) e.deadT = 0;
  }

  heroHurt(strength = 1): void {
    this.heroHurtT = 0;
    this.heroFlash = Math.max(this.heroFlash, strength);
  }

  heroAttack(targetId: number | null): void {
    this.heroAttackT = 0;
    const t = targetId === null ? undefined : this.foes.get(targetId);
    this.heroTargetX = t ? t.baseX : null;
  }

  heroCast(): void {
    this.heroCastT = 0;
  }

  heroGuard(): void {
    this.heroGuardT = 0;
  }

  /** Scale the camera hits (shake / punch / hit-stop / slow-mo) by effectsIntensity and reducedMotion. */
  setFxSettings(s: { effectsIntensity: number; reducedMotion: boolean }): void {
    this.fxSet.effectsIntensity = s.effectsIntensity;
    this.fxSet.reducedMotion = s.reducedMotion;
  }

  shake(sec: number, mag: number): void {
    const k = motionK(this.fxSet);
    if (k > 0) this.world.camera.shake(sec, mag * k);
  }

  punch(punch: number, ca: number, zoom: number): void {
    const k = motionK(this.fxSet);
    if (k > 0) this.world.camera.punch(punch * k, ca * k, zoom * k);
  }

  hitStop(sec: number): void {
    // an impact frame is part of the feel at any intensity but 0; reduced motion keeps only a token one
    const k = this.fxSet.effectsIntensity;
    if (k <= 0) return;
    this.clock.hitStop(this.fxSet.reducedMotion ? Math.min(sec, 0.04) : sec * k);
  }

  slowMo(scale: number, sec: number): void {
    const k = motionK(this.fxSet);
    if (k <= 0) return;
    this.clock.slowMo(1 - (1 - scale) * k, sec);
  }

  // ------------------------------------------------------------------------------------------- typing VFX hooks (T2.6)

  /** Hero position (resting x incl. dash, z) for the world typing effects. */
  heroPos(out: { x: number; z: number }): void {
    out.x = this.heroXNow();
    out.z = this.heroZ;
  }

  /** Centre of an enemy's body (world units); false when the enemy is not on stage. */
  enemyBody(id: number, out: { x: number; y: number; z: number }): boolean {
    const e = this.foes.get(id);
    if (!e) return false;
    out.x = e.baseX;
    out.y = e.flyY + e.actor.height * 0.5;
    out.z = e.baseZ;
    return true;
  }

  /** The hero's current frame and foot position (afterimages). Null before the hero exists. */
  heroSnapshot(out: { x: number; y: number; z: number }): SpriteFrame | null {
    if (!this.hero) return null;
    const p = this.hero.mesh.position;
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    return this.heroFrame;
  }

  /** What the combat VFX need of an enemy: current frame, scale, resting foot position, sprite height. */
  enemyInfo(
    id: number,
    out: {
      frame: SpriteFrame | null;
      scale: number;
      x: number;
      y: number;
      z: number;
      height: number;
    },
  ): boolean {
    const e = this.foes.get(id);
    if (!e) return false;
    out.frame = e.frame;
    out.scale = e.scale;
    out.x = e.baseX;
    out.y = e.flyY;
    out.z = e.baseZ;
    out.height = e.actor.height;
    return true;
  }

  /** Outline-only flash of the hero (`"hero"`) or an enemy actor: the silhouette stays readable. */
  rimFlash(who: "hero" | number, amount: number, rgb: readonly [number, number, number]): void {
    if (who === "hero") this.hero?.setRimFlash(amount, rgb);
    else this.foes.get(who)?.actor.setRimFlash(amount, rgb);
  }

  /** Hold a camera pose over the stage's own (finisher push); `null` releases it. `snap` = hard cut. */
  setCameraOverride(pose: Partial<CameraPose> | null, followRate: number, snap: boolean): void {
    this.camOverride = pose ? { ...pose } : null;
    this.world.camera.followRate = followRate;
    this.camSnapPending = snap;
  }

  /** Push the hero back `dist` world units over `outMs`, returning over `backMs` (guard block). */
  heroPush(dist: number, outMs: number, backMs: number): void {
    this.pushT = 0;
    this.pushDist = dist;
    this.pushOut = Math.max(0.01, outMs / 1000);
    this.pushBack = Math.max(0.01, backMs / 1000);
  }

  /** Start the hero's dash at `target` in `inMs` (stage time). */
  dashLater(inMs: number, target: number): void {
    this.pendingDash = { at: this.time + inMs / 1000, target };
  }

  setLetterbox(on: boolean): void {
    if (this.letterboxOn === on) return;
    this.letterboxOn = on;
    this.handle.setLetterbox(on);
  }

  // ------------------------------------------------------------------------------------------- per frame

  /**
   * Advance presentation. `view`/`alpha` come from the runner; `realDt` is wall seconds (the stage dilates it).
   * Does not render: the caller calls `world.render()` afterwards.
   */
  update(view: LevelView, alpha: number, realDt: number): void {
    const dt = this.clock.dilate(realDt);
    this.dt = dt;
    this.time += dt;
    this.lastView = view;
    const tickF = view.tick + alpha;

    this.heroFlash = Math.max(0, this.heroFlash - dt * 6);
    this.heroHurtT += dt;
    this.heroAttackT += dt;
    this.heroCastT += dt;
    this.heroGuardT += dt;
    this.pushT += dt;
    if (this.pendingDash && this.time >= this.pendingDash.at) {
      this.heroAttack(this.pendingDash.target);
      this.pendingDash = null;
    }

    // drop actors of enemies the sim no longer lists (previous wave / encounter)
    const live = new Set(view.enemies.map((e) => e.id));
    for (const [id, e] of this.foes) {
      if (!live.has(id)) {
        e.actor.dispose();
        this.foes.delete(id);
      }
    }
    for (const ev of view.enemies) this.updateEnemy(ev, dt, tickF);

    this.updateHero(view, tickF);
    this.updateCamera(view);
    this.handle.update(dt, this.world.camera.pose.x);
    this.world.update(dt, alpha);
  }

  private placeHero(): void {
    if (!this.hero) return;
    this.hero.place(this.heroX, this.heroY, this.heroZ);
  }

  private updateHero(view: LevelView, tickF: number): void {
    const hero = this.hero;
    const F = this.heroFrames;
    if (!hero || !F) return;
    const phase = view.phase;
    let x = this.heroX;
    let z = this.heroZ;
    let frames: readonly SpriteFrame[] = F.idle;
    let fps = 2.5;
    let y = 0;

    if (phase === "walk") {
      const stop =
        this.nextEnc <= view.encounterCount ? this.handle.encounter(this.nextEnc).hero : null;
      const toX = stop ? stop.x : this.handle.getAnchor("end").x;
      const p = clamp01((tickF - this.walkStartTick) / (this.walkEndTick - this.walkStartTick));
      x = this.prevStopX + (toX - this.prevStopX) * p;
      z = this.handle.walkPath.zAtX(x);
      this.heroX = x;
      this.heroZ = z;
      frames = F.walk;
      fps = 8;
      this.world.shadowFor(hero, x, z);
    } else if (phase === "cleared") {
      frames = F.win;
      y = Math.abs(Math.sin(this.time * 6)) * 0.12;
    } else if (view.hero.pose === "downed") {
      frames = F.hurt;
    } else if (this.heroHurtT < 0.32) {
      frames = F.hurt;
      x -= 0.35 * (1 - this.heroHurtT / 0.32);
    } else if (this.heroAttackT < 0.65) {
      frames = F.slash;
      // dash toward the target and back: out in 0.3 s (the impact), back by 0.65 s
      const t = this.heroAttackT;
      const k = t < 0.3 ? easeOut(t / 0.3) : 1 - easeOut((t - 0.3) / 0.35);
      const reach =
        this.heroTargetX === null ? 2 : Math.min(4.2, Math.max(0, this.heroTargetX - x - 1.7));
      x += reach * k;
    } else if (this.heroCastT < 0.7) {
      frames = F.cast;
    } else if (this.heroGuardT < 0.6) {
      frames = F.raise;
    }
    if (this.pushT < this.pushOut + this.pushBack) {
      const u =
        this.pushT < this.pushOut
          ? easeOut(this.pushT / this.pushOut)
          : 1 - easeOut((this.pushT - this.pushOut) / this.pushBack);
      x -= this.pushDist * u;
    }
    const idx = frames.length > 1 ? Math.floor(this.time * fps) % frames.length : 0;
    const f = frames[idx] ?? frames[0];
    if (f) {
      hero.setFrame(f);
      this.heroFrame = f;
    }
    hero.setFlash(this.heroFlash, [1, 0.25, 0.2]);
    hero.place(x, y, z);
    this.heroY = y;
  }

  private updateEnemy(ev: EnemyView, dt: number, tickF: number): void {
    const e = this.foes.get(ev.id);
    if (!e) return;
    e.hurtT += dt;
    e.attackT += dt;
    if (e.deadT !== Infinity) e.deadT += dt;
    e.flash = Math.max(0, e.flash - dt * 12);

    let dx = 0;
    let dz = 0;
    let useAtk = false;
    let flashCol: readonly [number, number, number] = [1.25, 1.2, 1.1];
    let flash = e.flash;
    const age = this.time - e.born;
    if (age < 0.7) dx += 4 * (1 - easeOut(age / 0.7));

    if (!ev.alive) {
      // the dissolve starts when EnemyDeath is presented (`enemyDied`): a finisher holds the death for its
      // cinematic. A death that is never presented still dissolves after DEATH_WAIT so nothing can linger.
      if (e.deadT === Infinity) {
        e.deadWait += dt;
        if (e.deadWait >= DEATH_WAIT) e.deadT = 0;
      }
      if (e.deadT !== Infinity) {
        e.actor.setDissolve(clamp01(e.deadT / 0.7));
        if (e.deadT >= 0.7) e.actor.visible = false;
      }
    } else {
      if (ev.pose === "windup") {
        // lean back, then (EnemyAttack) lunge
        const span = Math.max(1, ev.atbFrac);
        dx += 0.25 * Math.sin(this.time * 14) * span;
        useAtk = ev.atbFrac > 0.9;
        flash = Math.max(flash, 0.12 + 0.08 * Math.sin(this.time * 18));
        flashCol = [1, 0.5, 0.2];
      }
      if (e.attackT < 0.4) {
        useAtk = true;
        dx -= 1.5 * Math.sin(Math.PI * clamp01(e.attackT / 0.4));
      }
      if (e.hurtT < 0.2) dx += 0.25 * (1 - e.hurtT / 0.2);
      if (ev.pose === "broken") {
        flash = Math.max(flash, 0.28 + 0.1 * Math.sin(this.time * 10));
        flashCol = [0.45, 0.75, 1];
        dz += 0;
      }
    }
    void tickF;

    const bob = e.flyY > 0 ? Math.sin(this.time * 3 + e.slot) * 0.18 : 0;
    const frames = useAtk && e.atk.length > 0 ? e.atk : e.idle;
    const idx = frames.length > 1 ? Math.floor(this.time * 2.2 + e.slot) % frames.length : 0;
    const f = frames[idx] ?? frames[0];
    if (f) {
      e.actor.setFrame(f);
      e.frame = f;
    }
    e.actor.setFlash(flash, flashCol);
    e.actor.place(e.baseX + dx, e.flyY + bob, e.baseZ + dz);
  }

  // ------------------------------------------------------------------------------------------- camera

  private poseFor(view: LevelView): { target: CameraPose; letterbox: boolean } {
    const h = this.handle;
    if (view.phase === "walk" || this.curEnc === 0) {
      const base = h.cameraPose("walk");
      return { target: { ...base, x: this.heroX + WALK_LEAD }, letterbox: false };
    }
    if (view.phase === "bossIntro") return { target: h.cameraPose("boss"), letterbox: true };
    return { target: h.cameraPose(`battle:${this.curEnc}`), letterbox: false };
  }

  private updateCamera(view: LevelView): void {
    const { target, letterbox } = this.poseFor(view);
    this.world.camera.setTarget(this.camOverride ? { ...target, ...this.camOverride } : target);
    if (this.camSnapPending) {
      this.camSnapPending = false;
      this.world.camera.snap();
    }
    this.setLetterbox(letterbox);
  }

  private snapCamera(pose: "walk"): void {
    const base = this.handle.cameraPose(pose);
    this.world.camera.setTarget({ ...base, x: this.heroX + WALK_LEAD });
    this.world.camera.snap();
  }

  // ------------------------------------------------------------------------------------------- projection for the HUD

  private toPx(x: number, y: number, z: number): { x: number; y: number } {
    const n = this.world.camera.project(x, y, z);
    return { x: (n.x * 0.5 + 0.5) * window.innerWidth, y: (-n.y * 0.5 + 0.5) * window.innerHeight };
  }

  /** The HUD projector: world position of an enemy/hero body part through the real camera (CSS px). */
  readonly projector: HudProjector = (a: HudAnchor) => {
    if (a.kind === "hero") {
      if (a.part === "weapon") {
        const off =
          WEAPON_ANCHOR_OFFSET[this.lastView?.hero.archetype ?? "sword"] ??
          WEAPON_ANCHOR_OFFSET.sword;
        return this.toPx(
          this.heroXNow() + (off?.x ?? 0.55),
          this.heroY + (off?.y ?? 0.65),
          this.heroZ,
        );
      }
      const h = this.hero?.height ?? 2.2;
      const y = this.heroY + (a.part === "head" ? h : a.part === "feet" ? 0 : h * 0.5);
      return this.toPx(this.heroXNow(), y, this.heroZ);
    }
    const e = this.foes.get(a.id);
    if (e) {
      const h = e.actor.height;
      const p = e.actor.mesh.position;
      const y = p.y + (a.part === "head" ? h : a.part === "feet" ? 0 : h * 0.5);
      // use the resting x so plates do not wobble with lunges
      return this.toPx(e.baseX, y, e.baseZ);
    }
    if (this.curEnc === 0) return null;
    const pos = this.slotPosition(this.curEnc, a.slot);
    const h = 2.7;
    return this.toPx(pos.x, a.part === "head" ? h : a.part === "feet" ? 0 : h / 2, pos.z);
  };

  private heroXNow(): number {
    return this.hero ? this.hero.mesh.position.x : this.heroX;
  }

  // ------------------------------------------------------------------------------------------- debug

  /** Current screen positions, for tests/screenshots: where each enemy and the hero are drawn (CSS px). */
  debug(): {
    hero: { x: number; y: number } | null;
    enemies: { id: number; slot: number; x: number; y: number }[];
  } {
    const hero = this.projector({ kind: "hero", part: "body" });
    const enemies = [...this.foes.values()].map((e) => {
      const p = this.projector({ kind: "enemy", id: e.id, slot: e.slot, part: "body" }) ?? {
        x: 0,
        y: 0,
      };
      return { id: e.id, slot: e.slot, x: Math.round(p.x), y: Math.round(p.y) };
    });
    return { hero, enemies };
  }

  get view(): LevelView | null {
    return this.lastView;
  }
}

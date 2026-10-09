/**
 * CombatFx (T2.3): the non-typing combat / world effects, one director over the effect modules:
 *
 *   AttackFx  (arcs per weapon, afterimages, crit / weak / chip / counter / DoT, shield chip, BREAK)
 *   SkillFx   (fireball, slash wave, thrust, frost lock, aegis, mending light, statuses, passives, revive)
 *   EnemyFx   (windup telegraph, lunge impact, block / parry sparks, death dissolve)
 *   RewardFx  (chest + beam by tier, coin fountain)
 *   BossFx    (rune circle + intro, doom aura, phase change, rubble impact)
 *
 * Render-only and allocation-free per event: every pool is built once. It consumes sim events (through the
 * `CombatFxSink` the binding table in `level/eventBindings.ts` calls) and the per-frame `LevelView`, never the sim.
 * Everything scales with effectsIntensity / reducedFlash / reducedMotion and the world quality tier (`FxKit`).
 */
import type { EventOf, LevelView, StatusId } from "@hd2d/sim";
import type { TypingFxSettings } from "../types";
import { AttackFx } from "./AttackFx";
import { BossFx } from "./BossFx";
import { EnemyFx } from "./EnemyFx";
import { type CombatDeps, FxKit } from "./kit";
import { P_BOLT, Projectiles } from "./Projectiles";
import type { Rgb } from "./params";
import { RewardFx } from "./RewardFx";
import { SkillFx } from "./SkillFx";

/** What the event binding table calls (all methods render-only; none reads the sim). */
export interface CombatFxSink {
  /**
   * True when the typing handle's `chipImpact` / `dissolve` callbacks play the chip impact and the death dissolve
   * (they run when the presentation queue releases the event); the bindings then skip those two.
   */
  viaCallbacks: boolean;
  autoAttack(e: EventOf<"AutoAttack">): void;
  hit(e: EventOf<"Hit">): void;
  weaknessRevealed(e: EventOf<"WeaknessRevealed">): void;
  shieldDamaged(e: EventOf<"ShieldDamaged">): void;
  breakStarted(e: EventOf<"Break">): void;
  statusApplied(e: EventOf<"StatusApplied">): void;
  statusEnded(e: EventOf<"StatusEnded">): void;
  skillCast(e: EventOf<"SkillCast">): void;
  windup(e: EventOf<"EnemyAttackWindup">): void;
  enemyAttack(e: EventOf<"EnemyAttack">): void;
  guardBlocked(e: EventOf<"GuardBlocked">): void;
  guardParried(e: EventOf<"GuardParried">): void;
  enemyDeath(e: EventOf<"EnemyDeath">): void;
  heroHealed(e: EventOf<"HeroHealed">): void;
  heroDowned(e: EventOf<"HeroDowned">): void;
  passive(e: EventOf<"PassiveTriggered">): void;
  secondWindSucceeded(e: EventOf<"SecondWindSucceeded">): void;
  chestDropped(e: EventOf<"ChestDropped">): void;
  goldGained(e: EventOf<"GoldGained">): void;
  bossIntro(e: EventOf<"BossIntroStarted">): void;
  bossPhase(e: EventOf<"BossPhaseChanged">): void;
  doomStarted(e: EventOf<"DoomSpellStarted">): void;
  doomCompleted(e: EventOf<"DoomSpellCompleted">): void;
  doomFailed(e: EventOf<"DoomSpellFailed">): void;
  minigameMissed(e: EventOf<"MinigameWordMissed">): void;
}

const MAX_RIMS = 6;
interface RimSlot {
  who: number;
  amount: number;
  t: number;
  dur: number;
  r: number;
  g: number;
  b: number;
}
/** `RimSlot.who` for the hero. */
const HERO = -2;
const RIM_RGB: [number, number, number] = [1, 1, 1];
const RIM_TMP: [number, number, number] = [1, 1, 1];

export interface CombatDiagnostics {
  poolA: number;
  poolB: number;
  arcs: number;
  ghosts: number;
  projectiles: number;
  lights: number;
}

export class CombatFx implements CombatFxSink {
  viaCallbacks = false;
  readonly kit: FxKit;
  private readonly proj: Projectiles;
  private readonly attackFx: AttackFx;
  private readonly skillFx: SkillFx;
  private readonly enemyFx: EnemyFx;
  private readonly rewardFx: RewardFx;
  private readonly bossFx: BossFx;
  private readonly rims: RimSlot[] = [];
  private view: LevelView | null = null;
  private tier = 0;
  private disposed = false;
  private readonly fallbackAt = { x: 0, z: 0 };
  /** Dev-only (the `?scene=play` fx demo): barrier charges and statuses the sim is not producing right now. */
  readonly debug = {
    barrier: 0,
    statuses: new Map<number, StatusId[]>(),
    archetype: null as string | null,
  };

  constructor(readonly deps: CombatDeps) {
    this.kit = new FxKit(deps);
    const rim = (who: "hero" | number, amount: number, rgb: Rgb, dur: number): void =>
      this.rimFlash(who, amount, rgb, dur);
    this.proj = new Projectiles(deps.world, this.kit, 3);
    this.attackFx = new AttackFx(this.kit, this.proj, rim);
    this.skillFx = new SkillFx(deps.world, this.kit, this.proj, rim);
    this.enemyFx = new EnemyFx(deps.world, this.kit, rim);
    this.rewardFx = new RewardFx(deps.world, this.kit, () => this.fallback());
    this.bossFx = new BossFx(deps.world, this.kit, this.proj, rim);
    for (let i = 0; i < MAX_RIMS; i++)
      this.rims.push({ who: -1, amount: 0, t: 0, dur: 0, r: 1, g: 1, b: 1 });
  }

  /** Where rewards appear when no enemy anchor exists: the last death, else ahead of the hero. */
  private fallback(): { x: number; z: number } {
    const d = this.enemyFx.lastDeath;
    if (d.valid) {
      this.fallbackAt.x = d.x;
      this.fallbackAt.z = d.z;
    } else {
      this.deps.anchors.hero(this.kit.hero);
      this.fallbackAt.x = this.kit.hero.x + 5;
      this.fallbackAt.z = this.kit.hero.z;
    }
    return this.fallbackAt;
  }

  /** Outline flash with its own decay (`SpriteActor.setRimFlash` stays until reset, so the decay lives here). */
  private rimFlash(who: "hero" | number, amount: number, rgb: Rgb, dur: number): void {
    const id = who === "hero" ? HERO : who;
    let slot: RimSlot | null = null;
    for (const s of this.rims) if (s.dur > 0 && s.who === id) slot = s;
    if (!slot) for (const s of this.rims) if (s.dur <= 0) slot = s;
    if (!slot) {
      slot = this.rims[0] as RimSlot;
      for (const s of this.rims) if (s.t / s.dur > slot.t / slot.dur) slot = s;
    }
    slot.who = id;
    slot.amount = amount * (this.kit.scale.reducedFlash ? 0.6 : 1);
    slot.t = 0;
    slot.dur = Math.max(0.03, dur);
    slot.r = rgb[0];
    slot.g = rgb[1];
    slot.b = rgb[2];
  }

  setSettings(s: TypingFxSettings, tier: number): void {
    this.tier = tier;
    this.kit.setSettings(s, tier);
  }

  setView(v: LevelView | null): void {
    this.view = v;
  }

  // ------------------------------------------------------------------------------- the typing callbacks

  /** `TypingFxCallbacks.chipImpact`: the deferred chip hit is presented now. */
  chipImpact(e: EventOf<"Hit">): void {
    this.attackFx.chip(e);
  }

  /** `TypingFxCallbacks.dissolve`: EnemyDeath is presented now. */
  dissolve(enemyId: number, _byKind: string): void {
    let boss = false;
    if (this.view) for (const e of this.view.enemies) if (e.id === enemyId) boss = e.isBoss;
    this.enemyFx.dissolve(enemyId, boss);
  }

  // ------------------------------------------------------------------------------- the sink

  autoAttack(e: EventOf<"AutoAttack">): void {
    this.attackFx.autoAttack(e);
  }
  hit(e: EventOf<"Hit">): void {
    if (e.kind === "chip") {
      if (!this.viaCallbacks) this.attackFx.chip(e);
      return;
    }
    // a big pale target (the Golem) washes out under the full-size flares and lights: dim them while this hit plays
    this.kit.localK = this.kit.bigTargetK(e.targetId);
    if (e.kind === "skill" && e.skillId !== null) this.skillFx.skillHit(e);
    else {
      if (e.kind === "auto") this.proj.consume(P_BOLT, e.targetId);
      this.attackFx.hit(e);
    }
    this.kit.localK = 1;
  }
  weaknessRevealed(e: EventOf<"WeaknessRevealed">): void {
    this.attackFx.weaknessRevealed(e);
  }
  shieldDamaged(e: EventOf<"ShieldDamaged">): void {
    this.attackFx.shieldDamaged(e);
  }
  breakStarted(e: EventOf<"Break">): void {
    // W4: a big pale target (the Golem) takes the dimmed (x0.5) lights / stars / flashes for the whole break burst too
    this.kit.localK = this.kit.bigTargetK(e.enemyId);
    this.attackFx.brk(e);
    this.kit.localK = 1;
  }
  statusApplied(e: EventOf<"StatusApplied">): void {
    this.skillFx.statusApplied(e);
  }
  statusEnded(e: EventOf<"StatusEnded">): void {
    this.skillFx.statusEnded(e);
  }
  skillCast(e: EventOf<"SkillCast">): void {
    this.skillFx.skillCast(e);
  }
  windup(e: EventOf<"EnemyAttackWindup">): void {
    this.enemyFx.windup(e);
  }
  enemyAttack(e: EventOf<"EnemyAttack">): void {
    this.enemyFx.attack(e, () => this.skillFx.barrierAbsorbed());
  }
  guardBlocked(_e: EventOf<"GuardBlocked">): void {
    this.enemyFx.guardBlocked();
  }
  guardParried(_e: EventOf<"GuardParried">): void {
    this.enemyFx.guardParried();
  }
  enemyDeath(e: EventOf<"EnemyDeath">): void {
    if (!this.viaCallbacks) this.enemyFx.dissolve(e.enemyId, e.isBoss);
  }
  heroHealed(e: EventOf<"HeroHealed">): void {
    this.skillFx.heal(e);
  }
  heroDowned(_e: EventOf<"HeroDowned">): void {
    this.skillFx.heroDowned();
  }
  passive(_e: EventOf<"PassiveTriggered">): void {
    this.skillFx.passive();
  }
  secondWindSucceeded(_e: EventOf<"SecondWindSucceeded">): void {
    this.skillFx.revive();
  }
  chestDropped(e: EventOf<"ChestDropped">): void {
    this.rewardFx.chestDropped(e);
  }
  goldGained(e: EventOf<"GoldGained">): void {
    this.rewardFx.goldGained(e);
  }
  bossIntro(e: EventOf<"BossIntroStarted">): void {
    this.bossFx.bossIntro(e);
  }
  bossPhase(e: EventOf<"BossPhaseChanged">): void {
    this.kit.localK = this.kit.bigTargetK(e.enemyId);
    this.bossFx.bossPhase(e);
    this.kit.localK = 1;
  }
  doomStarted(e: EventOf<"DoomSpellStarted">): void {
    this.bossFx.doomStarted(e);
  }
  doomCompleted(e: EventOf<"DoomSpellCompleted">): void {
    this.bossFx.doomCompleted(e);
  }
  doomFailed(e: EventOf<"DoomSpellFailed">): void {
    this.bossFx.doomFailed(e);
  }
  minigameMissed(_e: EventOf<"MinigameWordMissed">): void {
    this.bossFx.rubble();
  }

  // ------------------------------------------------------------------------------- per frame

  /**
   * @hot Once per frame AFTER `stage.update`, with the stage's dilated dt (a hit-stop freezes arcs and projectiles).
   * Without the typing VFX the kit also updates and uploads its own particle pools here.
   */
  update(dt: number): void {
    if (this.disposed) return;
    const view =
      this.debug.barrier > 0 || this.debug.statuses.size > 0 ? this.patched() : this.view;
    this.kit.archetypeOverride = this.debug.archetype;
    this.kit.update(dt);
    this.proj.update(dt);
    this.attackFx.update(dt);
    this.skillFx.update(dt, view);
    this.enemyFx.update(dt, view);
    this.rewardFx.update(dt);
    this.bossFx.update(dt, view);
    for (const s of this.rims) {
      if (s.dur <= 0) continue;
      s.t += dt;
      const k = s.t / s.dur;
      const who = s.who === HERO ? "hero" : s.who;
      if (k >= 1) {
        s.dur = 0;
        this.deps.rim(who, 0, RIM_RGB);
      } else {
        RIM_TMP[0] = s.r;
        RIM_TMP[1] = s.g;
        RIM_TMP[2] = s.b;
        this.deps.rim(who, s.amount * (1 - k), RIM_TMP);
      }
    }
  }

  /** A copy of the view with the debug overrides applied (allocates; only while a demo override is active). */
  private patched(): LevelView | null {
    const v = this.view;
    if (!v) return v;
    return {
      ...v,
      hero: { ...v.hero, barrierCharges: Math.max(v.hero.barrierCharges, this.debug.barrier) },
      enemies: v.enemies.map((e) => {
        const extra = this.debug.statuses.get(e.id);
        if (!extra) return e;
        return {
          ...e,
          statuses: [...e.statuses, ...extra.map((id) => ({ id, ticksLeft: null, stacks: 1 }))],
        };
      }),
    };
  }

  /** Counters for tests and the dev overlay. */
  diagnostics(): CombatDiagnostics {
    return {
      poolA: this.kit.add.count,
      poolB: this.kit.norm.count,
      arcs: this.kit.arcs.live,
      ghosts: this.kit.ghosts.live,
      projectiles: this.proj.live,
      lights: this.kit.lights.live,
    };
  }

  get qualityTier(): number {
    return this.tier;
  }

  /** A new attempt: drop everything in flight. */
  clear(): void {
    this.kit.clear();
    this.proj.clear();
    this.attackFx.clear();
    this.skillFx.clear();
    this.enemyFx.clear();
    this.rewardFx.clear();
    this.bossFx.clear();
    for (const s of this.rims) {
      if (s.dur > 0) this.deps.rim(s.who === HERO ? "hero" : s.who, 0, RIM_RGB);
      s.dur = 0;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.proj.dispose();
    this.skillFx.dispose();
    this.enemyFx.dispose();
    this.rewardFx.dispose();
    this.bossFx.dispose();
    this.kit.dispose();
  }
}

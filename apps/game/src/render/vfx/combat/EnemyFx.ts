/**
 * EnemyFx: everything an enemy does and what happens to it when it dies.
 *   - Windup telegraph: a red ground sigil under the enemy that contracts toward the strike (progress comes from
 *     the sim tick, so a pause freezes it), with converging motes. It is information, so it stays (dimmer, no
 *     particles) at effectsIntensity 0.
 *   - Attack lunge impact on the hero (claw arcs, sparks, red flash behind the hero), delayed to the lunge contact.
 *   - Block / parry sparks that complement the T2.6 guard barrier; Aegis absorb goes through SkillFx.
 *   - Death dissolve (the `dissolve` callback): the sprite's own pixels lift off as light motes, ground ring, light.
 */
import type { EventOf, LevelView } from "@hd2d/sim";
import type { RenderWorld } from "../../RenderWorld";
import { PX } from "../../util";
import { AuraKind, AuraQuad } from "../AuraQuad";
import { PK_GLOW, PK_PIXEL } from "../PooledParticles";
import { type EnemyInfo, type FxKit, HERO_LIGHT_R } from "./kit";
import { ARC_COL, dissolveCount, GUARD_STEEL, type Rgb, WARN_RED } from "./params";
import { pixelSamples } from "./spritePixels";

const INFO: EnemyInfo = { frame: null, scale: 1, x: 0, y: 0, z: 0, height: 2 };
const MAX_TELE = 4;
const LUNGE_DELAY = 0.14;
/** Barrier contact point relative to the hero (matches the T2.6 GuardBarrier). */
const BARRIER_X = 1.65 + 0.7;

function isAlive(view: LevelView | null, id: number): boolean {
  if (!view) return false;
  for (const e of view.enemies) if (e.id === id) return e.alive;
  return false;
}

interface Tele {
  id: number;
  on: boolean;
  fade: number;
  startTick: number;
  impactTick: number;
  heavy: boolean;
  acc: number;
  ring: AuraQuad;
  inner: AuraQuad;
}
interface Pending {
  t: number;
  heavy: boolean;
}

export class EnemyFx {
  private readonly tele: Tele[] = [];
  private readonly pending: Pending[] = [];
  /** Where the last enemy died / the last foe stood (chest and coins start there). */
  lastDeath = { x: 0, z: 0, valid: false };

  constructor(
    world: RenderWorld,
    private readonly kit: FxKit,
    private readonly rim: (who: "hero" | number, amount: number, rgb: Rgb, dur: number) => void,
  ) {
    for (let i = 0; i < MAX_TELE; i++)
      this.tele.push({
        id: -1,
        on: false,
        fade: 0,
        startTick: 0,
        impactTick: 1,
        heavy: false,
        acc: 0,
        ring: new AuraQuad(world, AuraKind.Ring, 5, i * 2.1, 0.5).flat(),
        inner: new AuraQuad(world, AuraKind.Disc, 5, i * 1.3, 0.5).flat(),
      });
    for (let i = 0; i < 4; i++) this.pending.push({ t: -1, heavy: false });
  }

  // ------------------------------------------------------------------------------- windup

  windup(e: EventOf<"EnemyAttackWindup">): void {
    let t: Tele | null = null;
    for (const c of this.tele) if (c.id === e.enemyId) t = c;
    if (!t) for (const c of this.tele) if (!c.on) t = c;
    t ??= this.tele[0] as Tele;
    t.id = e.enemyId;
    t.on = true;
    t.fade = 1;
    t.startTick = e.tick;
    t.impactTick = Math.max(e.tick + 1, e.impactTick);
    t.heavy = e.heavy;
    t.acc = 0;
  }

  private endTele(id: number): void {
    for (const t of this.tele) if (t.on && t.id === id) t.fade = Math.min(t.fade, 0.999);
  }

  // ------------------------------------------------------------------------------- attacks

  attack(e: EventOf<"EnemyAttack">, absorbed: () => void): void {
    const kit = this.kit;
    this.endTele(e.enemyId);
    switch (e.outcome) {
      case "hit":
        this.queueLunge(
          e.damage > (kit.deps.getView()?.hero.maxHp ?? Number.POSITIVE_INFINITY) * 0.2,
        );
        break;
      case "barrier":
        absorbed();
        break;
      default:
        break; // blocked / parried: GuardBlocked / GuardParried draw them
    }
  }

  private queueLunge(heavy: boolean): void {
    for (const p of this.pending)
      if (p.t < 0) {
        p.t = LUNGE_DELAY;
        p.heavy = heavy;
        return;
      }
  }

  /** The strike lands on the hero: two crossing claw arcs, sparks, a red light behind the hero. */
  private heroImpact(heavy: boolean): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    kit.deps.anchors.hero(kit.hero);
    const x = kit.hero.x + 0.25;
    const y = 1.15;
    const z = kit.hero.z;
    const big = heavy ? 1.35 : 1;
    const i = kit.scale.reducedFlash ? 0.65 : 0.95;
    kit.arcs.fire(
      x,
      y,
      z + 0.9,
      {
        r: 1.3 * big,
        w: 0.4,
        a0: 2.4,
        sweep: -3.0,
        rx: -0.3,
        ry: -0.2,
        rz: -0.5,
        dur: 0.07,
        tail: 0.2,
        intensity: i,
      },
      ARC_COL.claw.core,
      ARC_COL.claw.edge,
    );
    kit.arcs.fire(
      x,
      y,
      z + 0.9,
      {
        r: 1.3 * big,
        w: 0.4,
        a0: 2.4,
        sweep: -3.0,
        rx: -0.3,
        ry: -0.2,
        rz: -0.1,
        dur: 0.07,
        tail: 0.2,
        intensity: i,
        delay: 0.05,
      },
      ARC_COL.claw.core,
      ARC_COL.claw.edge,
    );
    kit.sparks(x, y, z, kit.n(heavy ? 30 : 20), [3.2, 1.0, 0.5], 6.5, {
      dir: -1,
      grav: 7,
      st: 0.06,
    });
    kit.sparks(x, y, z, kit.n(8), [1.4, 0.4, 0.2], 3, {
      kind: PK_PIXEL,
      size: 0.07,
      life: 0.55,
      grav: 9,
      st: 0,
    });
    kit.star(x, y, z + 0.8, 2.4 * big, 0.3, 0.16, [3, 1.2, 0.7], 0.8, 0.5);
    kit.ring(x, y, z + 0.5, 0.4, 3.6 * big, 0.28, [3, 0.9, 0.5], [1, 0.25, 0.1], 0.9);
    kit.flash(x, 1.3, z - 0.85, [1, 0.35, 0.2], 2.2 * big, HERO_LIGHT_R, 0.24);
    kit.puffs(kit.hero.x, 0.15, z, kit.n(5), [0.45, 0.38, 0.3], 0.5, 0.5, 0.5);
    this.rim("hero", 0.85, [3, 0.9, 0.5], 0.18);
  }

  /** GuardBlocked: a steel clang at the barrier (shards and the push-back come from the T2.6 barrier). */
  guardBlocked(): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    kit.deps.anchors.hero(kit.hero);
    const x = kit.hero.x + BARRIER_X;
    kit.star(x, 1.25, kit.hero.z + 0.7, 2.8, 0.3, 0.16, GUARD_STEEL, 0.9, 0.2);
    kit.sparks(x, 1.25, kit.hero.z + 0.5, kit.n(22), GUARD_STEEL, 7, {
      dir: 1,
      grav: 7,
      st: 0.06,
      life: 0.4,
    });
    kit.sparks(x, 1.25, kit.hero.z + 0.5, kit.n(6), [1.4, 1.2, 1], 3, {
      kind: PK_PIXEL,
      size: 0.07,
      life: 0.5,
      grav: 10,
      st: 0,
    });
    kit.puffs(kit.hero.x + 0.2, 0.15, kit.hero.z, kit.n(4), [0.45, 0.4, 0.34], 0.5, 0.4, 0.5);
  }

  /** GuardParried: a gold flare and a fan of sparks thrown back at the attacker. */
  guardParried(): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    kit.deps.anchors.hero(kit.hero);
    const x = kit.hero.x + BARRIER_X;
    kit.star(x, 1.25, kit.hero.z + 0.7, 5, 0.4, 0.22, [3.4, 2.8, 1.2], 1.3, 0.785);
    kit.sparks(x, 1.25, kit.hero.z + 0.5, kit.n(34), [4, 3.1, 1.1], 9, {
      dir: 1.2,
      grav: 5,
      st: 0.07,
      life: 0.5,
    });
    kit.flash(x, 1.3, kit.hero.z + 0.4, [1, 0.85, 0.4], 3, 5, 0.25);
  }

  // ------------------------------------------------------------------------------- death

  /** `EnemyDeath` presented (after any chip hit): the sprite's own pixels lift off as light. */
  dissolve(enemyId: number, isBoss: boolean): void {
    const kit = this.kit;
    const ok = kit.deps.enemyInfo(enemyId, INFO);
    if (!ok) return;
    this.lastDeath.x = INFO.x;
    this.lastDeath.z = INFO.z;
    this.lastDeath.valid = true;
    if (kit.scale.k <= 0) return;
    const s = INFO.scale;
    const f = INFO.frame;
    const ps = f ? pixelSamples(f) : null;
    const want = kit.n(dissolveCount(isBoss, s));
    if (ps && f && ps.n > 0) {
      const x0 = INFO.x - f.ax * PX * s;
      const y0 = INFO.y + f.ay * PX * s;
      const wpx = f.w * PX * s;
      const hpx = f.h * PX * s;
      for (let i = 0; i < want; i++) {
        const o = ((i * 7919) % ps.n) * 5;
        const u = ps.data[o] as number;
        const v = ps.data[o + 1] as number;
        const glowy = kit.rnd() < 0.35;
        const sp = kit.p(
          x0 + u * wpx,
          y0 - v * hpx,
          INFO.z + 0.1,
          (kit.rnd() - 0.5) * 0.8,
          0.4 + kit.rnd() * 1.4,
          (kit.rnd() - 0.2) * 0.6,
          0.8 + kit.rnd() * 1.1,
          PX * s * 1.15,
          PK_PIXEL,
          glowy
            ? [0.8, 2.2, 2.6]
            : [
                (ps.data[o + 2] as number) * 1.6 + 0.2,
                (ps.data[o + 3] as number) * 1.6 + 0.3,
                (ps.data[o + 4] as number) * 1.6 + 0.4,
              ],
        );
        sp.drag = 1.2;
        sp.grav = -0.6;
        sp.delay = v * 0.5 + kit.rnd() * 0.1; // the top lifts off first, like the sprite's own dissolve
        sp.sway = 0.6;
        sp.ph = kit.rnd() * 6;
        kit.emitA(sp);
      }
    } else
      kit.sparks(INFO.x, INFO.y + INFO.height * 0.5, INFO.z, want, [0.8, 2.2, 2.6], 2.5, {
        kind: PK_GLOW,
        size: 0.14,
        life: 1.2,
        grav: -0.6,
        st: 0,
      });
    const cy = INFO.y + INFO.height * 0.5;
    kit.ring(INFO.x, 0.05, INFO.z, 0.5, 4 * s, 0.6, [0.6, 2, 2.4], [0.3, 0.8, 1.5], 1.2, true);
    kit.flash(INFO.x, cy, INFO.z + 1, [0.5, 0.9, 1], 4, 6 * Math.min(1.4, s), 0.9);
    if (isBoss) {
      kit.ring(INFO.x, cy, INFO.z + 0.5, 0.6, 9, 0.8, [1.6, 2.8, 3.2], [0.5, 1.2, 1.8], 1.3);
      kit.postFlash(0.12, [0.6, 0.9, 1], 200, 0.14);
    }
  }

  // ------------------------------------------------------------------------------- per frame

  /** @hot */
  update(dt: number, view: LevelView | null): void {
    const kit = this.kit;
    const sc = kit.scale;
    for (const p of this.pending) {
      if (p.t < 0) continue;
      p.t -= dt;
      if (p.t <= 0) {
        p.t = -1;
        this.heroImpact(p.heavy);
      }
    }
    for (let i = 0; i < this.tele.length; i++) {
      const t = this.tele[i] as Tele;
      if (!t.on) continue;
      const alive = isAlive(view, t.id);
      const tick = view ? view.tick : t.impactTick;
      if (!alive || tick > t.impactTick + 12) t.fade = Math.min(t.fade, 0.999);
      if (t.fade < 1) t.fade -= dt * 6;
      if (t.fade <= 0) {
        t.on = false;
        t.id = -1;
        t.ring.alpha(0);
        t.inner.alpha(0);
        continue;
      }
      if (!kit.deps.enemyInfo(t.id, INFO)) {
        t.ring.alpha(0);
        t.inner.alpha(0);
        continue;
      }
      const p = Math.min(
        1,
        Math.max(0, (tick - t.startTick) / Math.max(1, t.impactTick - t.startTick)),
      );
      const size = (t.heavy ? 4.4 : 3.4) * Math.max(0.9, INFO.scale);
      const g = sc.k <= 0 ? 0.45 : 0.6 + 0.4 * sc.k;
      const blink =
        sc.reducedFlash || sc.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(kit.time * (8 + 14 * p));
      const a = (0.3 + 0.7 * p) * g * blink * Math.min(1, t.fade);
      t.ring
        .color(WARN_RED[0], WARN_RED[1], WARN_RED[2])
        .at(INFO.x, 0.05, INFO.z)
        .size(size)
        .progress(1 - 0.78 * p);
      t.ring.alpha(a);
      t.inner
        .color(WARN_RED[0] * 0.8, WARN_RED[1] * 0.8, WARN_RED[2] * 0.8)
        .at(INFO.x, 0.045, INFO.z)
        .size(size * (0.55 + 0.35 * p));
      t.inner.alpha(a * (t.heavy ? 0.5 : 0.32) * p);
      if (sc.k > 0) {
        t.acc += dt * 14 * sc.k * sc.q * (0.5 + p);
        while (t.acc >= 1) {
          t.acc -= 1;
          const ang = kit.rnd() * Math.PI * 2;
          const r = size * 0.5;
          const sp = kit.p(
            INFO.x + Math.cos(ang) * r,
            0.1,
            INFO.z + Math.sin(ang) * r * 0.5,
            -Math.cos(ang) * 3,
            0.9,
            -Math.sin(ang) * 1.5,
            0.45,
            0.06,
            PK_PIXEL,
            WARN_RED,
          );
          kit.emitA(sp);
        }
      }
    }
  }

  clear(): void {
    for (const t of this.tele) {
      t.on = false;
      t.id = -1;
      t.ring.alpha(0);
      t.inner.alpha(0);
    }
    for (const p of this.pending) p.t = -1;
    this.lastDeath.valid = false;
  }

  dispose(): void {
    for (const t of this.tele) {
      t.ring.dispose();
      t.inner.dispose();
    }
  }
}

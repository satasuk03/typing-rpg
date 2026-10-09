/**
 * AttackFx: the hero's weapon offense and what it does to enemies.
 *   - Auto-attack per weapon archetype: sword arcs, dagger double-flick, staff bolt, hammer slam with a ground crack,
 *     all with afterimages and speed lines on the dash.
 *   - Hits: crit (bigger arc, sparks, shock ring), weakness flash, chip hit, counter hit, DoT ticks.
 *   - Shield: chip shards, BREAK (hex flash + shard burst), weakness reveal.
 * The camera shake, punch and hit-stop of a hit stay in the render column of the binding (`eventBindings.ts`).
 */
import type { EventOf } from "@hd2d/sim";
import { elementIndex, WEAPON_ANCHOR_OFFSET } from "../../../level/typingFxParams";
import { ELEMENT_RGB } from "../colors";
import { PK_GLOW, PK_PIXEL } from "../PooledParticles";
import type { EnemyInfo, FxKit } from "./kit";
import { P_BOLT, type Projectiles } from "./Projectiles";
import {
  ARC_COL,
  type Archetype,
  arcFor,
  FIRE_HOT,
  type Rgb,
  SHARD_BLUE,
  SPARK_CRIT,
  SPARK_WHITE,
  STAFF_BOLT,
  WEAK_PINK,
} from "./params";

const EN = { x: 0, y: 0, z: 0 };
const INFO: EnemyInfo = { frame: null, scale: 1, x: 0, y: 0, z: 0, height: 2 };
const DUST: Rgb = [0.5, 0.42, 0.32];
const DEBRIS: Rgb = [1.4, 1.1, 0.8];
const RING_A: Rgb = [3, 2.4, 1.2];
const RING_B: Rgb = [1, 0.4, 0.1];
const ARCANE: Rgb = [2.4, 1.2, 4];
const GOLD_SPK: Rgb = [4, 3, 1];

export class AttackFx {
  /** Dash afterimage timers. */
  private ghostT = 0;
  private ghostEvery = 0.05;
  private ghostNext = 0;
  private dashCol: Rgb = [0.5, 0.85, 1.6];

  constructor(
    private readonly kit: FxKit,
    private readonly proj: Projectiles,
    /** Rim flash (outline only) with its own decay. */
    private readonly rim: (who: "hero" | number, amount: number, rgb: Rgb, dur: number) => void,
  ) {}

  private archetype(): Archetype {
    return (this.kit.archetypeOverride ??
      this.kit.deps.getView()?.hero.archetype ??
      "sword") as Archetype;
  }

  private body(id: number): boolean {
    return this.kit.deps.anchors.enemy(id, EN);
  }

  /** Body height of an enemy (arc size); a default when unknown. */
  private height(id: number): number {
    return this.kit.deps.enemyInfo(id, INFO) ? INFO.height * 0.85 : 2;
  }

  // ------------------------------------------------------------------------------- AutoAttack

  autoAttack(e: EventOf<"AutoAttack">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    const arche = e.archetype as Archetype;
    this.ghostT = arche === "dagger" ? 0.26 : 0.34;
    this.ghostEvery = arche === "dagger" ? 0.035 : 0.05;
    this.ghostNext = 0;
    this.dashCol =
      arche === "hammer"
        ? [1.6, 1.0, 0.5]
        : arche === "dagger"
          ? [0.5, 1.8, 1.4]
          : arche === "staff"
            ? [1.2, 0.7, 2.2]
            : [0.5, 0.85, 1.6];
    if (arche === "staff") {
      // the bolt leaves the staff head and lands on the impact tick
      const off = WEAPON_ANCHOR_OFFSET.staff ?? { x: 0.55, y: 0.65 };
      kit.deps.anchors.hero(kit.hero);
      const dur = Math.max(0.12, (e.impactTick - e.tick) / 60 - 0.12);
      this.proj.launch(
        P_BOLT,
        kit.hero.x + off.x,
        off.y + 0.6,
        kit.hero.z + 0.4,
        e.targetId,
        0.06,
        dur,
        0.35,
        STAFF_BOLT,
      );
    }
  }

  // ------------------------------------------------------------------------------- Hit

  /** `Hit` of kind auto / counter / dot / minigame / finisher (chip goes through `chip`; skills through SkillFx). */
  hit(e: EventOf<"Hit">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || e.targetId === 0 || !this.body(e.targetId)) return;
    const cx = EN.x;
    const cy = EN.y;
    const cz = EN.z;
    switch (e.kind) {
      case "auto":
        this.autoHit(e, cx, cy, cz);
        break;
      case "counter":
        this.counterHit(cx, cy, cz);
        break;
      case "dot":
        this.dotTick(e, cx, cy, cz);
        break;
      case "minigame":
        kit.sparks(cx, cy, cz, kit.n(14), DEBRIS, 5, {
          dir: 0.4,
          kind: PK_PIXEL,
          size: 0.07,
          grav: 12,
        });
        kit.puffs(cx, cy - 0.4, cz, kit.n(5), DUST, 0.5, 0.6, 0.6);
        kit.star(cx, cy, cz + 0.8, 2, 0.3, 0.14, RING_A, 0.7);
        break;
      case "finisher":
        // the finisher cinematic (T2.6) draws the arcs; the landing blow just flares
        kit.star(cx, cy, cz + 0.8, 3.2, 0.4, 0.2, SPARK_CRIT, 0.9);
        break;
      default:
        break;
    }
    if (e.weak && e.kind !== "dot") this.weakFlash(e.targetId, cx, cy, cz);
  }

  private autoHit(e: EventOf<"Hit">, cx: number, cy: number, cz: number): void {
    const kit = this.kit;
    const arche = this.archetype();
    const crit = e.crit;
    const lastOfCombo = e.hitIndex >= e.hitCount - 1;
    const h = this.height(e.targetId);
    const big = crit ? 1.5 : 1;
    const hot = crit ? SPARK_CRIT : SPARK_WHITE;

    const spec = arcFor(arche, e.hitIndex);
    if (spec) {
      const col = crit
        ? ARC_COL.crit
        : arche === "dagger"
          ? ARC_COL.dagger
          : arche === "hammer"
            ? ARC_COL.hammer
            : kit.warmBiome()
              ? ARC_COL.slashWarm
              : ARC_COL.slash;
      const base = Math.max(1.5, h * 0.75) * spec.r;
      kit.arcs.fire(
        cx,
        cy,
        cz + 0.9,
        {
          r: base * big,
          w: spec.w * (arche === "sword" ? big : crit ? 1.3 : 1),
          a0: spec.a0,
          sweep: spec.sweep,
          rx: spec.rx,
          ry: spec.ry,
          rz: spec.rz,
          dur: spec.dur,
          tail: spec.tail,
          intensity: kit.scale.reducedFlash ? 0.7 : 1,
          delay: arche === "dagger" ? 0.05 * (e.hitIndex % 2) : 0,
        },
        col.core,
        col.edge,
      );
      if (crit && lastOfCombo && arche !== "dagger")
        kit.arcs.fire(
          cx,
          cy,
          cz + 1.0,
          {
            r: Math.max(1.5, h * 0.75) * 1.25,
            w: 0.35,
            a0: -1.0,
            sweep: 3.4,
            rx: 0.3,
            ry: 0.25,
            rz: -0.6,
            dur: 0.1,
            tail: 0.3,
            intensity: kit.scale.reducedFlash ? 0.7 : 1,
            delay: 0.04,
          },
          ARC_COL.crit.core,
          ARC_COL.crit.edge,
        );
    }

    // impact sparks, embers, star and a light (POC `hitMonster`)
    const el = arche === "staff" ? ARCANE : hot;
    kit.sparks(cx, cy, cz, kit.n(crit ? 46 : 26), el, crit ? 9 : 6.5, {
      dir: 1,
      grav: 7,
      st: 0.06,
    });
    kit.sparks(cx, cy, cz, kit.n(10), [1, 0.5, 0.2], 3, {
      kind: PK_PIXEL,
      size: 0.07,
      life: 0.6,
      grav: 9,
      st: 0,
    });
    kit.star(
      cx,
      cy,
      cz + 0.8,
      crit ? 3.0 : 2.0,
      0.3,
      crit ? 0.2 : 0.14,
      arche === "staff" ? ARCANE : [1.4, 1.3, 1.1],
      0.9,
      kit.rnd() * 0.8,
    );
    kit.flash(
      cx,
      cy,
      cz + 1.2,
      arche === "staff" ? [0.7, 0.5, 1] : [1, 0.85, 0.65],
      crit ? 4 : 2.6,
      crit ? 7 : 6,
      0.22,
    );
    if (crit) {
      kit.ring(cx, cy, cz + 0.6, 0.6, 6.5, 0.35, RING_A, RING_B, 1.4);
      this.rim(e.targetId, 0.8, [3, 2.4, 1.0], 0.18);
    }
    if (arche === "hammer") this.slam(e, cx, cz);
    if (arche === "dagger" && e.hitIndex > 0)
      kit.sparks(cx, cy, cz, kit.n(8), [1.2, 3.2, 2.6], 7, { dir: 0.6, life: 0.3, st: 0.08 });
  }

  /** Hammer: dust ring and radial cracks on the ground under the target, chunks thrown up. */
  private slam(e: EventOf<"Hit">, cx: number, cz: number): void {
    const kit = this.kit;
    this.kit.deps.enemyInfo(e.targetId, INFO);
    const fx = INFO.x || cx;
    const fz = INFO.z || cz;
    const sz = e.crit ? 6.5 : 5;
    kit.crack(fx, fz, sz, 1.1, [1.1, 0.7, 0.35]);
    kit.ring(fx, 0.06, fz, 0.5, sz * 0.9, 0.4, [2.4, 1.6, 0.8], [1, 0.5, 0.2], 1.1, true);
    kit.puffs(fx, 0.2, fz, kit.n(12), DUST, 0.7, 0.9, 0.8);
    kit.chips(fx, 0.3, fz, kit.n(14), DEBRIS, 4.5, 0.08, 0.8, 14);
    kit.flash(fx, 0.8, fz + 1, [1, 0.7, 0.35], 2.2, 5, 0.25);
  }

  private counterHit(cx: number, cy: number, cz: number): void {
    const kit = this.kit;
    kit.arcs.fire(
      cx,
      cy,
      cz + 0.9,
      {
        r: 1.9,
        w: 0.55,
        a0: 2.2,
        sweep: -3.3,
        rx: -0.4,
        ry: 0.2,
        rz: 0.2,
        dur: 0.07,
        tail: 0.22,
        intensity: 1,
      },
      ARC_COL.gold.core,
      ARC_COL.gold.edge,
    );
    kit.sparks(cx, cy, cz, kit.n(30), GOLD_SPK, 8, { dir: 1, grav: 6 });
    kit.star(cx, cy, cz + 0.8, 3.4, 0.4, 0.2, [3, 2.4, 1], 1);
    kit.flash(cx, cy, cz + 1.2, [1, 0.85, 0.4], 3, 6, 0.22);
  }

  private dotTick(e: EventOf<"Hit">, cx: number, cy: number, cz: number): void {
    const kit = this.kit;
    const burn = e.damageType === "fire" || e.origin === "skill";
    if (burn) {
      kit.sparks(cx, cy - 0.2, cz, kit.n(6), FIRE_HOT, 2.2, {
        kind: PK_PIXEL,
        size: 0.07,
        life: 0.7,
        grav: -2,
        st: 0,
      });
      kit.glow(cx, cy, cz + 0.4, 0.8, 1.8, 0.3, [1.6, 0.5, 0.1], 0.5);
    } else {
      kit.sparks(cx, cy, cz, kit.n(6), [2.4, 0.15, 0.18], 3, {
        kind: PK_PIXEL,
        size: 0.06,
        life: 0.5,
        grav: 14,
        st: 0,
      });
    }
  }

  // ------------------------------------------------------------------------------- chip

  /** The deferred chip hit is being presented: a small impact in the element's colour. */
  chip(e: EventOf<"Hit">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || !this.body(e.targetId)) return;
    const col = ELEMENT_RGB[elementIndex(e.damageType ?? undefined)] as Rgb;
    kit.sparks(EN.x, EN.y, EN.z, kit.n(9), col, 4.5, { dir: 0.8, life: 0.32, grav: 6 });
    kit.star(
      EN.x,
      EN.y,
      EN.z + 0.8,
      1.3,
      0.2,
      0.11,
      [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8],
      0.7,
      kit.rnd() * 0.8,
    );
    kit.ring(EN.x, EN.y, EN.z + 0.5, 0.3, 1.6, 0.2, col, col, 0.5);
    this.rim(e.targetId, 0.5, col, 0.1);
  }

  // ------------------------------------------------------------------------------- weakness / shield / break

  weakFlash(enemyId: number, cx: number, cy: number, cz: number): void {
    const kit = this.kit;
    kit.ring(cx, cy, cz + 0.6, 0.5, 3.6, 0.3, WEAK_PINK, [1, 0.3, 0.8], 1.1);
    kit.sparks(cx, cy, cz, kit.n(10), WEAK_PINK, 4, {
      kind: PK_PIXEL,
      size: 0.09,
      life: 0.5,
      grav: 1,
      st: 0,
    });
    this.rim(enemyId, 0.9, WEAK_PINK, 0.25);
  }

  weaknessRevealed(e: EventOf<"WeaknessRevealed">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || !this.body(e.enemyId)) return;
    const col = ELEMENT_RGB[elementIndex(e.damageType)] as Rgb;
    kit.star(EN.x, EN.y + 0.6, EN.z + 0.9, 0.4, 2.6, 0.35, WEAK_PINK, 0.8, 0.785);
    kit.ring(EN.x, EN.y + 0.6, EN.z + 0.6, 0.3, 2.4, 0.4, col, WEAK_PINK, 0.9);
    kit.sparks(EN.x, EN.y + 0.6, EN.z, kit.n(8), col, 2.5, {
      kind: PK_GLOW,
      size: 0.14,
      life: 0.7,
      grav: -1,
      st: 0,
    });
    this.rim(e.enemyId, 0.7, WEAK_PINK, 0.3);
  }

  shieldDamaged(e: EventOf<"ShieldDamaged">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || !this.body(e.enemyId)) return;
    this.kit.deps.enemyInfo(e.enemyId, INFO);
    const w = Math.max(2, INFO.height * 1.1);
    kit.hex(EN.x, EN.y, EN.z + 0.6, w * 0.85, w * 1.05, 0.22, SHARD_BLUE, 1.0);
    kit.sparks(EN.x, EN.y, EN.z, kit.n(12), SHARD_BLUE, 5, {
      kind: PK_PIXEL,
      size: 0.08,
      life: 0.45,
      grav: 8,
      st: 0,
    });
    kit.flash(EN.x, EN.y, EN.z + 1, [0.6, 0.8, 1], 1.6, 5, 0.18);
  }

  /** BREAK: the shield shatters (POC `breakMon`): hex flash, shard burst, shock ring, white-blue star, light. */
  brk(e: EventOf<"Break">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || !this.body(e.enemyId)) return;
    const cx = EN.x;
    const cy = EN.y;
    const cz = EN.z;
    this.kit.deps.enemyInfo(e.enemyId, INFO);
    const w = Math.max(2.6, INFO.height * 1.3);
    kit.hex(cx, cy, cz + 0.6, w, w * 1.7, 0.4, [0.7, 1.1, 1.7], 0.45);
    kit.sparks(cx, cy, cz, kit.n(50), SHARD_BLUE, 9, {
      kind: PK_PIXEL,
      size: 0.08,
      life: 0.8,
      grav: 8,
      st: 0,
    });
    kit.sparks(cx, cy, cz, kit.n(18), [2.4, 3.4, 4.2], 6, { life: 0.4, grav: 4 });
    kit.ring(cx, cy, cz + 0.6, 0.5, 7, 0.45, [2, 3, 4], [0.6, 0.8, 2], 1.2);
    kit.star(cx, cy, cz + 0.8, 3.2, 0.5, 0.3, [2, 2.6, 3.4], 1.0, 0.785);
    kit.flash(cx, cy, cz + 1, [0.6, 0.8, 1], 2.4, 6, 0.4);
    kit.postFlash(0.1, [0.7, 0.85, 1], 140, 0.14);
    this.rim(e.enemyId, 1, [2, 3, 4], 0.3);
  }

  // ------------------------------------------------------------------------------- per frame

  /** @hot Afterimages and speed lines while the hero dashes in. */
  update(dt: number): void {
    if (this.ghostT <= 0) return;
    const kit = this.kit;
    this.ghostT -= dt;
    this.ghostNext -= dt;
    const sc = kit.scale;
    if (sc.k <= 0) return;
    const f = kit.deps.heroSnapshot(kit.hero);
    if (this.ghostNext <= 0 && f) {
      this.ghostNext = this.ghostEvery;
      kit.ghosts.spawn(
        f,
        kit.hero.x,
        kit.hero.y,
        kit.hero.z,
        this.dashCol,
        0.28,
        (0.5 + 0.5 * sc.k) * (sc.reducedFlash ? 0.6 : 1),
      );
    }
    if (!sc.reducedMotion && kit.n(1) > 0) {
      const sp = kit.p(
        kit.hero.x - 0.4,
        kit.hero.y + 0.3 + kit.rnd() * 1.6,
        kit.hero.z + 0.2,
        -6,
        0,
        0,
        0.2,
        0.04,
        2,
        [1.4, 2.2, 3],
      );
      sp.st = 0.04;
      kit.emitA(sp);
    }
  }

  clear(): void {
    this.ghostT = 0;
  }
}

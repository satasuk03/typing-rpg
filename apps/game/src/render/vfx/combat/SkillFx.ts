/**
 * SkillFx: the six active skills, the status markers and the hero's restoring effects.
 *   - Fireball: cast swirl, projectile (Projectiles), explosion with burn embers on the target.
 *   - Slash Wave: two travelling crescents, a spark line per enemy hit.
 *   - Piercing Thrust: a bright lance beam from the hand to the target, a pierce flare at the tip.
 *   - Frost Lock: ice bolts to every target, a frost burst and a persistent frozen lattice per frozen enemy.
 *   - Aegis: shield rune and a persistent guard bubble around the hero while barrier charges remain.
 *   - Mending Light: a rising column of green-gold light and motes.
 *   - Statuses (burn / bleed / freeze / stagger): small persistent markers read from the view every frame.
 *   - Second Wind: the revive burst.
 * Keyed on SkillCast / Hit{origin:"skill", skillId} / StatusApplied / StatusEnded / HeroHealed (see eventBindings).
 */
import type { EventOf, LevelView } from "@hd2d/sim";
import { WEAPON_ANCHOR_OFFSET } from "../../../level/typingFxParams";
import { FxKind } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import { AuraKind, AuraQuad } from "../AuraQuad";
import { FxQuad } from "../FxQuad";
import { PK_GLOW, PK_PIXEL, PK_STREAK } from "../PooledParticles";
import { type EnemyInfo, type FxKit, HERO_LIGHT_R } from "./kit";
import { P_BOLT, P_FIRE, type Projectiles } from "./Projectiles";
import {
  ARC_COL,
  clamp01,
  easeOutBack,
  FIRE_HOT,
  HEAL_GREEN,
  ICE,
  type Rgb,
  SKILL_STYLE,
  STATUS_STYLE,
} from "./params";

const EN = { x: 0, y: 0, z: 0 };
const INFO: EnemyInfo = { frame: null, scale: 1, x: 0, y: 0, z: 0, height: 2 };
const BUBBLE: Rgb = [0.3, 0.55, 1.0];
/** Rim / fresnel colour of the Aegis lattice. */
const BUBBLE_RIM: Rgb = [0.75, 0.95, 1.5];
const GOLD_COL: Rgb = [3.2, 2.4, 0.9];
const MAX_MARK = 8;

interface Mark {
  id: number;
  acc: number;
  /** Frozen-lattice intensity (eased). */
  freeze: number;
}

export class SkillFx {
  private readonly bubble: FxQuad;
  private bubbleLevel = 0;
  private bubblePop = -1;
  private bubbleFlare = 0;
  private readonly column: AuraQuad;
  private colT = -1;
  private colLife = 1;
  private colPeak = 0.7;
  private readonly ice: FxQuad[] = [];
  private readonly marks: Mark[] = [];
  /** Thrust beam parameters live in the QuadPool; the tip flare is spawned with the hit. */

  constructor(
    world: RenderWorld,
    private readonly kit: FxKit,
    private readonly proj: Projectiles,
    private readonly rim: (who: "hero" | number, amount: number, rgb: Rgb, dur: number) => void,
  ) {
    this.bubble = new FxQuad(world, FxKind.Hex, 9);
    this.column = new AuraQuad(world, AuraKind.Column, 6, 1.7, 0.5);
    for (let i = 0; i < 4; i++) this.ice.push(new FxQuad(world, FxKind.Guard, 9, i * 3.3));
    for (let i = 0; i < MAX_MARK; i++) this.marks.push({ id: -1, acc: 0, freeze: 0 });
  }

  private hero(): void {
    this.kit.deps.anchors.hero(this.kit.hero);
  }

  // ------------------------------------------------------------------------------- SkillCast

  skillCast(e: EventOf<"SkillCast">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    const st = SKILL_STYLE[e.skillId];
    this.hero();
    // T6.3 #3: the cast flash sits at the WEAPON TIP (the swirl converges there, the projectile leaves from there),
    // not on the hero's chest, so the burst never white-washes the sprite
    const arche = kit.archetypeOverride ?? kit.deps.getView()?.hero.archetype ?? "sword";
    const off = WEAPON_ANCHOR_OFFSET[arche] ?? { x: 0.55, y: 0.65 };
    const hx = kit.hero.x + off.x + 0.45;
    const hy = off.y + 0.25;
    const hz = kit.hero.z + 0.4;
    const total = Math.max(0.2, (e.impactTick - e.tick) / 60);
    // gather swirl: particles converge into the hand, then the effect leaves it
    const n = kit.n(e.skillId === "mendingLight" || e.skillId === "aegis" ? 12 : 16);
    for (let i = 0; i < n; i++) {
      const a = kit.rnd() * Math.PI * 2;
      const r = 0.8 + kit.rnd() * 0.4;
      const sp = kit.p(
        hx + Math.cos(a) * r,
        hy + Math.sin(a) * r,
        hz,
        -Math.cos(a) * 4,
        -Math.sin(a) * 4,
        0,
        0.25,
        0.05,
        PK_STREAK,
        st.swirl,
      );
      sp.st = 0.05;
      sp.delay = kit.rnd() * 0.12;
      kit.emitA(sp);
    }
    kit.flash(hx - 0.2, hy + 0.2, kit.hero.z - 0.6, st.light, 1.3, HERO_LIGHT_R, 0.3);
    kit.star(hx, hy, hz + 0.3, 0.5, 1.9, 0.25, kit.warm(st.core), 0.7);

    switch (e.skillId) {
      case "fireball": {
        const tid = e.targetIds[0] ?? -1;
        const delay = Math.min(0.15, total * 0.35);
        this.proj.launch(
          P_FIRE,
          hx,
          hy,
          hz,
          tid,
          delay,
          total - delay - 0.02,
          1.6,
          kit.warm(st.core),
        );
        break;
      }
      case "slashWave": {
        let far = hx + 6;
        for (const id of e.targetIds) if (kit.deps.anchors.enemy(id, EN) && EN.x > far) far = EN.x;
        const delay = Math.min(0.08, total * 0.2);
        const vx = Math.max(6, (far - hx) / Math.max(0.15, total - delay));
        const mk = (r: number, w: number, d: number, i: number): void =>
          kit.arcs.fire(
            hx + 0.6,
            1.45,
            kit.hero.z + 0.9,
            {
              r,
              w,
              a0: -1.05,
              sweep: 2.1,
              rx: -0.12,
              ry: 0.15,
              rz: 0,
              dur: 0.16,
              tail: 0.55,
              intensity: i,
              vx,
              delay: d,
            },
            ARC_COL.wave.core,
            ARC_COL.wave.edge,
          );
        mk(2.1, 0.95, delay, kit.scale.reducedFlash ? 0.7 : 1);
        mk(1.45, 0.55, delay + 0.07, kit.scale.reducedFlash ? 0.5 : 0.75);
        // ground dust streak under the wave
        kit.sparks(hx + 1, 0.1, kit.hero.z + 0.4, kit.n(14), [1.4, 2.2, 3.6], 7, {
          dir: 1.2,
          life: 0.35,
          st: 0.08,
          grav: 0,
        });
        break;
      }
      case "piercingThrust": {
        const tid = e.targetIds[0] ?? -1;
        if (kit.deps.anchors.enemy(tid, EN))
          this.thrust(hx, hy, hz, EN.x, EN.y, EN.z, st.core, st.edge);
        break;
      }
      case "frostLock": {
        let i = 0;
        for (const id of e.targetIds) {
          if (i++ >= 3) break;
          this.proj.launch(P_BOLT, hx, hy, hz, id, 0.08, Math.max(0.12, total - 0.12), 0.4, ICE);
        }
        kit.ring(
          kit.hero.x,
          0.06,
          kit.hero.z,
          0.5,
          6.5,
          0.6,
          [1.2, 2.4, 3.6],
          [0.4, 0.9, 1.8],
          1.1,
          true,
        );
        kit.sparks(kit.hero.x + 0.5, 1.2, kit.hero.z + 0.3, kit.n(16), ICE, 3.5, {
          kind: PK_PIXEL,
          size: 0.07,
          life: 0.6,
          grav: -1,
          st: 0,
        });
        break;
      }
      case "mendingLight":
        kit.ring(
          kit.hero.x,
          0.06,
          kit.hero.z,
          0.4,
          3.6,
          0.5,
          HEAL_GREEN,
          [0.5, 1.4, 0.7],
          1.0,
          true,
        );
        break;
      case "aegis":
        kit.ring(
          kit.hero.x + 0.2,
          0.06,
          kit.hero.z + 0.2,
          0.4,
          4.2,
          0.55,
          [2.4, 2.6, 3.8],
          [0.8, 1, 1.8],
          1.2,
          true,
        );
        kit.sparks(kit.hero.x + 0.4, 1.2, kit.hero.z + 0.4, kit.n(12), [2.4, 2.6, 3.8], 3, {
          life: 0.4,
          grav: 0,
        });
        break;
    }
  }

  /** A lance of light from `(x0,y0,z0)` to the target: a thin tall beam quad rotated onto the x axis. */
  private thrust(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    core: Rgb,
    edge: Rgb,
  ): void {
    const kit = this.kit;
    const len = Math.max(1, x1 - x0);
    const q = kit.quad();
    q.x = x0 + len / 2;
    q.y = y0 + (y1 - y0) / 2;
    q.z = (z0 + z1) / 2 + 0.2;
    q.s0 = q.s1 = 1;
    q.ax = 0.7;
    q.ay = len;
    q.rot = Math.PI / 2 + Math.atan2(y1 - y0, len);
    q.life = 0.3;
    q.i = 1.6 * (0.5 + 0.5 * kit.scale.k);
    q.r = edge[0] * 0.5;
    q.g = edge[1] * 0.5;
    q.b = edge[2] * 0.5;
    q.r2 = core[0];
    q.g2 = core[1];
    q.b2 = core[2];
    kit.beams.spawn(q);
    for (let i = 0; i < kit.n(14); i++) {
      const t = kit.rnd();
      const sp = kit.p(
        x0 + len * t,
        y0 + (y1 - y0) * t + (kit.rnd() - 0.5) * 0.15,
        z0,
        22 + kit.rnd() * 8,
        0,
        0,
        0.16,
        0.04,
        PK_STREAK,
        core,
      );
      sp.st = 0.1;
      kit.emitA(sp);
    }
  }

  // ------------------------------------------------------------------------------- skill impacts

  /** `Hit{origin:"skill"}`: the impact of fireball / slashWave / piercingThrust on one target. */
  skillHit(e: EventOf<"Hit">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || !kit.deps.anchors.enemy(e.targetId, EN)) return;
    const x = EN.x;
    const y = EN.y;
    const z = EN.z;
    switch (e.skillId) {
      case "fireball":
        this.proj.consume(P_FIRE, e.targetId);
        this.explode(x, y, z);
        this.rim(e.targetId, 0.9, [3, 1, 0.2], 0.3);
        break;
      case "slashWave":
        kit.sparks(x, y, z, kit.n(26), [1.6, 2.6, 4], 7, { dir: 1, grav: 5 });
        kit.star(x, y, z + 0.8, 3.2, 0.3, 0.18, [1.6, 2.4, 3.6], 1);
        kit.flash(x, y, z + 1.2, [0.6, 0.8, 1], 3, 6, 0.22);
        break;
      case "piercingThrust":
        kit.star(x, y, z + 0.8, 4.2, 0.3, 0.2, [2.6, 3, 3.6], 1.2, 0.785);
        kit.sparks(x, y, z, kit.n(24), [2.6, 3, 3.8], 9, {
          dir: 1.6,
          life: 0.4,
          st: 0.09,
          grav: 3,
        });
        kit.ring(x, y, z + 0.6, 0.4, 3.8, 0.3, [2.4, 2.8, 3.6], [0.8, 1.1, 2], 1.1);
        kit.flash(x, y, z + 1.2, [0.9, 0.95, 1], 3, 6, 0.2);
        this.rim(e.targetId, 0.8, [2.4, 2.8, 3.6], 0.2);
        break;
      default:
        break;
    }
  }

  /** POC `explode`: star, fire glow, ground shockwave, spark burst, smoke puffs, light. */
  private explode(x: number, y: number, z: number): void {
    const kit = this.kit;
    kit.star(x, y, z + 0.6, 4.5, 0.5, 0.28, kit.warm([2.4, 1.2, 0.4]), 1.0, 0.3);
    kit.glow(x, y, z + 0.4, 1.5, 5, 0.45, kit.warm([1.6, 0.6, 0.12]), 1.0);
    kit.ring(x, 0.06, z, 0.5, 8, 0.55, [3, 1.4, 0.4], [1.5, 0.3, 0.05], 1.4, true);
    kit.sparks(x, y, z, kit.n(70), FIRE_HOT, 10, { life: 0.7, grav: 5, st: 0.07 });
    for (let i = 0; i < kit.n(24); i++) {
      const sp = kit.p(
        x + (kit.rnd() - 0.5) * 0.8,
        y + (kit.rnd() - 0.5) * 0.8,
        z + 0.2,
        (kit.rnd() - 0.5) * 2,
        0.6 + kit.rnd() * 1.5,
        kit.rnd() - 0.5,
        0.6 + kit.rnd() * 0.5,
        0.5 + kit.rnd() * 0.5,
        PK_GLOW,
        [1.5, 0.5, 0.12],
        0.8,
      );
      sp.size1 = 1.4;
      sp.drag = 2;
      kit.emitA(sp);
    }
    // burn embers: they keep rising after the blast (the persistent burn marker takes over from the view)
    kit.sparks(x, y - 0.3, z, kit.n(14), [3.4, 1.3, 0.3], 2, {
      kind: PK_PIXEL,
      size: 0.07,
      life: 1.0,
      grav: -2.5,
      st: 0,
    });
    kit.flash(x, y, z + 1.2, kit.warm([1, 0.55, 0.2]), 3.2, 7, 0.5);
    kit.postFlash(0.08, [1, 0.6, 0.25], 120, 0.12);
  }

  // ------------------------------------------------------------------------------- statuses

  statusApplied(e: EventOf<"StatusApplied">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    if (e.targetId === 0) {
      if (e.status === "barrier") {
        this.bubblePop = 0;
        this.hero();
        kit.ring(
          kit.hero.x + 0.3,
          1.2,
          kit.hero.z + 0.5,
          1,
          5.4,
          0.4,
          [2.4, 2.6, 3.8],
          [0.8, 1, 1.8],
          1.0,
        );
        kit.sparks(kit.hero.x + 0.3, 1.2, kit.hero.z + 0.4, kit.n(14), [2, 2.4, 3.6], 3.5, {
          life: 0.5,
          grav: 0,
        });
        kit.flash(kit.hero.x, 1.3, kit.hero.z - 0.85, [0.7, 0.8, 1], 1.6, HERO_LIGHT_R, 0.3);
      }
      return;
    }
    if (!kit.deps.anchors.enemy(e.targetId, EN)) return;
    const x = EN.x;
    const y = EN.y;
    const z = EN.z;
    switch (e.status) {
      case "freeze":
        kit.deps.enemyInfo(e.targetId, INFO);
        kit.sparks(x, y, z, kit.n(28), ICE, 6, {
          kind: PK_PIXEL,
          size: 0.09,
          life: 0.7,
          grav: 5,
          st: 0,
        });
        kit.hex(
          x,
          y,
          z + 0.6,
          Math.max(2.4, INFO.height * 1.2),
          Math.max(2.8, INFO.height * 1.5),
          0.35,
          [0.6, 1.2, 1.8],
          0.9,
        );
        kit.ring(x, 0.06, z, 0.5, 5, 0.5, [1.2, 2.4, 3.6], [0.4, 0.9, 1.8], 1.1, true);
        kit.star(x, y, z + 0.8, 3, 0.4, 0.25, [1.6, 2.8, 3.8], 1, 0.785);
        kit.flash(x, y, z + 1, [0.5, 0.85, 1], 3.5, 7, 0.45);
        this.rim(e.targetId, 0.8, [1.6, 2.8, 3.8], 0.25);
        break;
      case "burn":
        kit.sparks(x, y, z, kit.n(16), FIRE_HOT, 3, {
          kind: PK_PIXEL,
          size: 0.08,
          life: 0.8,
          grav: -2,
          st: 0,
        });
        kit.glow(x, y, z + 0.4, 1, 3, 0.4, [1.6, 0.5, 0.1], 0.8);
        break;
      case "bleed":
        kit.sparks(x, y, z, kit.n(14), [2.6, 0.15, 0.2], 4, {
          kind: PK_PIXEL,
          size: 0.07,
          life: 0.6,
          grav: 14,
          st: 0,
        });
        break;
      case "stagger":
        kit.star(x, y + 0.9, z + 0.8, 0.5, 2.4, 0.3, [3.4, 3, 1], 0.9, 0.4);
        kit.ring(x, y + 0.9, z + 0.5, 0.4, 3, 0.4, [3, 2.6, 0.8], [1, 0.8, 0.2], 1);
        break;
      default:
        break;
    }
  }

  statusEnded(e: EventOf<"StatusEnded">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    if (e.targetId === 0) {
      if (e.status === "barrier") {
        this.hero();
        kit.sparks(kit.hero.x + 0.3, 1.2, kit.hero.z + 0.5, kit.n(16), [1.8, 2.2, 3.4], 4, {
          kind: PK_PIXEL,
          size: 0.1,
          life: 0.5,
          grav: 4,
          st: 0,
        });
        kit.ring(
          kit.hero.x + 0.3,
          1.2,
          kit.hero.z + 0.5,
          3,
          4.4,
          0.25,
          [1.4, 1.8, 3],
          [0.6, 0.8, 1.4],
          0.8,
        );
      }
      return;
    }
    if (e.status === "freeze" && kit.deps.anchors.enemy(e.targetId, EN)) {
      // the lattice shatters (a dead enemy's StatusEnded lands here too: the shards then double as dust)
      kit.sparks(EN.x, EN.y, EN.z, kit.n(16), ICE, 5, {
        kind: PK_PIXEL,
        size: 0.08,
        life: 0.5,
        grav: 8,
        st: 0,
      });
    }
  }

  /** An enemy's shield absorbed by Aegis: the bubble flares. */
  barrierAbsorbed(): void {
    const kit = this.kit;
    this.bubbleFlare = 1;
    if (kit.scale.k <= 0) return;
    this.hero();
    kit.sparks(kit.hero.x + 1.4, 1.2, kit.hero.z + 0.5, kit.n(16), [2.4, 2.8, 4], 5, {
      dir: -0.6,
      life: 0.35,
      grav: 2,
    });
    kit.star(kit.hero.x + 1.4, 1.2, kit.hero.z + 0.7, 2.6, 0.3, 0.16, [2.4, 2.8, 4], 1);
    kit.flash(kit.hero.x, 1.3, kit.hero.z - 0.85, [0.6, 0.8, 1], 2.2, HERO_LIGHT_R, 0.25);
  }

  // ------------------------------------------------------------------------------- heal / passive / revive

  heal(e: EventOf<"HeroHealed">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || e.cause === "secondWind" || e.cause === "revive") return;
    this.hero();
    const x = kit.hero.x + 0.15;
    const z = kit.hero.z;
    if (e.cause === "walk") {
      kit.sparks(x, 0.5, z + 0.3, kit.n(5), HEAL_GREEN, 1.4, {
        kind: PK_GLOW,
        size: 0.14,
        life: 1,
        grav: -1.5,
        st: 0,
      });
      return;
    }
    this.columnPlay(SKILL_STYLE.mendingLight.core, 1.0, 0.7);
    this.risers(x, z, HEAL_GREEN, kit.n(e.cause === "skill" ? 26 : 12));
    kit.ring(x, 0.06, z, 0.4, 4, 0.6, HEAL_GREEN, [0.5, 1.4, 0.7], 1.1, true);
    kit.flash(x, 1.3, z - 0.85, SKILL_STYLE.mendingLight.light, 2.2, HERO_LIGHT_R, 0.5);
    kit.star(x, 1.5, z + 0.5, 0.5, 2.4, 0.4, [2.4, 3.4, 1.8], 0.7);
  }

  private risers(x: number, z: number, col: Rgb, n: number): void {
    const kit = this.kit;
    for (let i = 0; i < n; i++) {
      const sp = kit.p(
        x + (kit.rnd() - 0.5) * 1.6,
        kit.rnd() * 1.6,
        z + (kit.rnd() - 0.5) * 0.6,
        0,
        1.2 + kit.rnd() * 1.8,
        0,
        1.1 + kit.rnd() * 0.5,
        0.1 + kit.rnd() * 0.06,
        PK_GLOW,
        col,
        0.9,
      );
      sp.sway = 0.5;
      sp.ph = kit.rnd() * 6;
      sp.delay = kit.rnd() * 0.4;
      kit.emitA(sp);
    }
  }

  passive(): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    this.hero();
    kit.star(kit.hero.x + 0.1, 2.5, kit.hero.z + 0.6, 0.4, 1.8, 0.3, [3, 2.6, 1], 0.8, 0.785);
    kit.ring(kit.hero.x + 0.1, 2.5, kit.hero.z + 0.4, 0.3, 2, 0.3, GOLD_COL, [1, 0.8, 0.3], 0.7);
    kit.sparks(kit.hero.x + 0.1, 2.5, kit.hero.z + 0.4, kit.n(8), GOLD_COL, 2.5, {
      life: 0.4,
      grav: -1,
    });
  }

  /** Second Wind succeeded: a golden revive burst around the hero. */
  revive(): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    this.hero();
    const x = kit.hero.x + 0.15;
    const z = kit.hero.z;
    this.columnPlay([3.2, 2.6, 1.0], 1.3, 1.0);
    this.risers(x, z, GOLD_COL, kit.n(40));
    kit.ring(x, 0.06, z, 0.4, 7, 0.7, GOLD_COL, [1.2, 0.7, 0.2], 1.4, true);
    kit.ring(x, 1.2, z + 0.5, 0.6, 6, 0.5, [3.2, 2.8, 1.4], [1.2, 0.7, 0.2], 1.2);
    kit.star(x, 1.3, z + 0.6, 0.5, 6, 0.4, [3.4, 3, 1.4], 1.4, 0.785);
    kit.sparks(x, 1.2, z + 0.3, kit.n(36), GOLD_COL, 7, { life: 0.8, grav: -0.5 });
    kit.flash(x, 1.3, z - 0.85, [1, 0.8, 0.4], 3.4, HERO_LIGHT_R, 0.7);
    kit.postFlash(0.1, [1, 0.85, 0.5], 160, 0.12);
  }

  heroDowned(): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    this.hero();
    kit.ring(
      kit.hero.x,
      0.06,
      kit.hero.z,
      0.4,
      4,
      0.6,
      [0.8, 0.4, 0.5],
      [0.3, 0.1, 0.2],
      0.8,
      true,
    );
    kit.puffs(kit.hero.x, 0.2, kit.hero.z, kit.n(8), [0.4, 0.34, 0.3], 0.6, 0.5, 0.8);
    kit.sparks(kit.hero.x, 1.2, kit.hero.z + 0.3, kit.n(10), [1.2, 0.5, 0.6], 2, {
      kind: PK_GLOW,
      size: 0.14,
      life: 1,
      grav: 0.8,
      st: 0,
    });
  }

  private columnPlay(col: Rgb, life: number, peak: number): void {
    this.colT = 0;
    this.colLife = life;
    this.colPeak = peak;
    this.column.color(col[0], col[1], col[2]);
    this.hero();
    this.column.at(this.kit.hero.x + 0.15, 2.6, this.kit.hero.z - 0.2).size(2.6, 5.2);
  }

  // ------------------------------------------------------------------------------- per frame

  /** @hot Persistent state: the Aegis bubble (from the view's barrier charges) and the status markers. */
  update(dt: number, view: LevelView | null): void {
    const kit = this.kit;
    const sc = kit.scale;
    // ---- aegis bubble
    const charges = view?.hero.barrierCharges ?? 0;
    const want = charges > 0 ? 1 : 0;
    this.bubbleLevel += (want - this.bubbleLevel) * Math.min(1, dt * 8);
    this.bubbleFlare = Math.max(0, this.bubbleFlare - dt * 4);
    let scale = 1;
    if (this.bubblePop >= 0) {
      this.bubblePop += dt;
      scale = 0.6 + 0.4 * easeOutBack(this.bubblePop / 0.25);
      if (this.bubblePop > 0.25) this.bubblePop = -1;
    }
    if (this.bubbleLevel > 0.02) {
      this.hero();
      const g = sc.k <= 0 ? 0.35 : 0.5 + 0.5 * sc.k;
      const pulse = sc.reducedMotion || sc.reducedFlash ? 0 : 0.06 * Math.sin(kit.time * 3);
      this.bubble
        .color(BUBBLE[0], BUBBLE[1], BUBBLE[2])
        .color2(BUBBLE_RIM[0], BUBBLE_RIM[1], BUBBLE_RIM[2])
        .at(kit.hero.x + 0.3, 1.5, kit.hero.z + 0.3)
        .size(3 * scale * (1 + pulse));
      this.bubble.progress(this.bubbleFlare * 1.2);
      this.bubble.intensity((0.3 + 0.08 * Math.min(3, charges)) * this.bubbleLevel * g);
    } else this.bubble.intensity(0);

    // ---- heal / revive column
    if (this.colT >= 0) {
      this.colT += dt;
      const k = this.colT / this.colLife;
      if (k >= 1) {
        this.colT = -1;
        this.column.alpha(0);
      } else
        this.column.alpha(
          this.colPeak * Math.sin(Math.PI * clamp01(k) ** 0.7) * (sc.k <= 0 ? 0 : 0.5 + 0.5 * sc.k),
        );
    }

    // ---- status markers
    if (view === null) return;
    for (const m of this.marks) m.id = m.id >= 0 && !this.stillMarked(m.id, view) ? -1 : m.id;
    for (const ev of view.enemies) {
      if (!ev.alive || ev.statuses.length === 0) continue;
      let m: Mark | null = null;
      for (const c of this.marks) if (c.id === ev.id) m = c;
      if (!m) {
        for (const c of this.marks)
          if (c.id < 0) {
            c.id = ev.id;
            c.acc = 0;
            c.freeze = 0;
            m = c;
            break;
          }
      }
      if (!m || !kit.deps.anchors.enemy(ev.id, EN)) continue;
      let frozen = false;
      for (const s of ev.statuses) {
        const sty = STATUS_STYLE[s.id];
        if (!sty) continue;
        if (s.id === "freeze") {
          frozen = true;
          continue;
        }
        if (sc.k <= 0) continue;
        m.acc += dt * sty.rate * sc.k * sc.q * (s.stacks > 1 ? 1.4 : 1);
        while (m.acc >= 1) {
          m.acc -= 1;
          this.markerParticle(s.id, EN.x, EN.y, EN.z, sty.col);
        }
      }
      m.freeze += ((frozen ? 1 : 0) - m.freeze) * Math.min(1, dt * 10);
    }
    // frozen lattices
    let li = 0;
    for (const m of this.marks) {
      if (m.id < 0 || m.freeze < 0.03 || li >= this.ice.length) continue;
      if (!kit.deps.anchors.enemy(m.id, EN)) continue;
      kit.deps.enemyInfo(m.id, INFO);
      const q = this.ice[li++] as FxQuad;
      const w = Math.max(2.4, INFO.height * 1.25);
      q.color(0.45, 1.0, 1.5)
        .at(EN.x, EN.y, EN.z + 0.5)
        .size(w);
      q.progress(0.2);
      q.intensity(0.26 * m.freeze * (sc.k <= 0 ? 0.6 : 0.6 + 0.4 * sc.k));
      this.rim(m.id, 0.45 * m.freeze, ICE, 0.05);
    }
    for (; li < this.ice.length; li++) (this.ice[li] as FxQuad).intensity(0);
  }

  private stillMarked(id: number, view: LevelView): boolean {
    for (const e of view.enemies) if (e.id === id && e.alive && e.statuses.length > 0) return true;
    return false;
  }

  private markerParticle(id: string, x: number, y: number, z: number, col: Rgb): void {
    const kit = this.kit;
    switch (id) {
      case "burn": {
        const sp = kit.p(
          x + (kit.rnd() - 0.5) * 1.0,
          y - 0.3 + kit.rnd() * 0.9,
          z + 0.2,
          (kit.rnd() - 0.5) * 0.5,
          1.2 + kit.rnd(),
          0,
          0.7 + kit.rnd() * 0.5,
          0.07,
          PK_PIXEL,
          col,
        );
        sp.grav = -1;
        kit.emitA(sp);
        break;
      }
      case "bleed": {
        const sp = kit.p(
          x + (kit.rnd() - 0.5) * 0.8,
          y + 0.2 + kit.rnd() * 0.5,
          z + 0.2,
          (kit.rnd() - 0.5) * 0.4,
          0,
          0,
          0.6,
          0.06,
          PK_PIXEL,
          col,
        );
        sp.grav = 9;
        kit.emitA(sp);
        break;
      }
      case "stagger": {
        // three small stars orbiting above the head, redrawn every frame as very short particles
        const a = kit.time * 5 + kit.rnd() * 6.283;
        const sp = kit.p(
          x + Math.cos(a) * 0.7,
          y + 1.0 + Math.sin(a * 2) * 0.12,
          z + 0.3 + Math.sin(a) * 0.3,
          0,
          0,
          0,
          0.12,
          0.13,
          PK_GLOW,
          col,
        );
        kit.emitA(sp);
        break;
      }
      default:
        break;
    }
  }

  clear(): void {
    this.bubbleLevel = 0;
    this.bubblePop = -1;
    this.colT = -1;
    this.column.alpha(0);
    this.bubble.intensity(0);
    for (const q of this.ice) q.intensity(0);
    for (const m of this.marks) m.id = -1;
  }

  dispose(): void {
    this.bubble.dispose();
    this.column.dispose();
    for (const q of this.ice) q.dispose();
  }
}

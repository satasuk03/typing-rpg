/**
 * BossFx: the boss moments.
 *   - Intro: a glowing rune circle under the boss that ignites at ~35% of the intro (star, ground shockwave, light,
 *     motes, shake), after dust falls from the ceiling. The timeline runs on sim ticks (BossIntroStarted.untilTick),
 *     never on the intro card, so the card showing before typing goes live cannot desync it. The rune then stays
 *     lit, dimmer, for as long as the boss lives.
 *   - Doom Spell aura: a dark violet column and a contracting halo around the boss that grows with the deadline;
 *     completed = it shatters (stagger stars), failed = a bolt hits the hero.
 *   - Phase change: shockwave rings, a rune surge, embers and a flash.
 *   - Rubble impact on a missed minigame word.
 */
import type { EventOf, LevelView } from "@hd2d/sim";
import { FxKind } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import { AuraKind, AuraQuad } from "../AuraQuad";
import { FxQuad } from "../FxQuad";
import { PK_GLOW, PK_PIXEL } from "../PooledParticles";
import { type EnemyInfo, type FxKit, HERO_LIGHT_R } from "./kit";
import { P_DOOM, type Projectiles } from "./Projectiles";
import { clamp01, type Rgb } from "./params";

const INFO: EnemyInfo = { frame: null, scale: 1, x: 0, y: 0, z: 0, height: 2 };
const RUNE_COL: Rgb = [0.25, 1.4, 1.5];
const DOOM_COL: Rgb = [1.5, 0.35, 1.7];
/** T3.2: the Willow's rune ring is violet-teal, not the Golem's cyan (brief 3.7 / 5.7). */
const RUNE_WILLOW: Rgb = [0.55, 0.5, 1.7];
const DUST: Rgb = [0.42, 0.36, 0.3];
const LIT_AT = 0.35;

export class BossFx {
  private readonly rune: FxQuad;
  private runeLevel = 0;
  private surge = 0;
  private bossId = -1;
  private introStart = 0;
  private introEnd = 1;
  private intro = false;
  private lit = false;
  private dustAcc = 0;
  private runeAcc = 0;
  // doom
  private readonly column: AuraQuad;
  private readonly halo: AuraQuad;
  private doomOn = false;
  private doomId = -1;
  private doomStart = 0;
  private doomEnd = 1;
  private doomK = 1;
  private doomEnding = false;
  private doomAcc = 0;
  private pulseT = 0;

  constructor(
    world: RenderWorld,
    private readonly kit: FxKit,
    private readonly proj: Projectiles,
    private readonly rim: (who: "hero" | number, amount: number, rgb: Rgb, dur: number) => void,
  ) {
    this.rune = new FxQuad(world, FxKind.Rune, 3);
    this.rune.mesh.rotation.x = -Math.PI / 2;
    this.column = new AuraQuad(world, AuraKind.Column, 4, 3.3, 0.5);
    this.halo = new AuraQuad(world, AuraKind.Halo, 4, 0.4, 0.5);
    this.proj.onExpire = (type, _tid, x, y, z) => {
      if (type === P_DOOM) this.doomImpact(x, y, z);
    };
  }

  // ------------------------------------------------------------------------------- events

  bossIntro(e: EventOf<"BossIntroStarted">): void {
    this.bossId = e.enemyId;
    this.introStart = e.tick;
    this.introEnd = Math.max(e.tick + 1, e.untilTick);
    this.intro = true;
    this.lit = false;
    this.dustAcc = 0;
  }

  private ignite(): void {
    const kit = this.kit;
    this.lit = true;
    if (kit.scale.k <= 0 || !kit.deps.enemyInfo(this.bossId, INFO)) return;
    const cy = INFO.y + INFO.height * 0.55;
    // the star sits BEHIND the golem's head and is kept cool and modest: at 5 u x [1, 3, 3.4] it blew the head out
    kit.star(INFO.x + 0.3, cy + 1.2, INFO.z - 0.4, 3.2, 0.5, 0.5, [0.3, 1.0, 1.25], 0.7);
    kit.ring(INFO.x, 0.06, INFO.z, 0.5, 11, 0.9, [0.5, 2.4, 2.6], [0.2, 0.8, 1.2], 1.4, true);
    // a front light of 1.5 washed the Golem white-blue: keep it a faint, high, rim-ish lift
    kit.flash(INFO.x, cy + 2.2, INFO.z - 0.8, [0.3, 0.8, 1], 0.5, 8, 1.0);
    // motes burst from the rune circle at the feet (never from the body centre: they sat on the sprite as white dots)
    kit.sparks(INFO.x, 0.2, INFO.z, kit.n(16), [0.3, 1.2, 1.4], 5, {
      kind: PK_PIXEL,
      size: 0.07,
      life: 0.9,
      grav: -0.5,
      st: 0,
    });
    kit.shake(0.8, 1.4);
    this.surge = 1;
    kit.postFlash(0.05, [0.5, 0.95, 1], 220, 0.08);
  }

  bossPhase(e: EventOf<"BossPhaseChanged">): void {
    const kit = this.kit;
    this.surge = 1;
    if (kit.scale.k <= 0 || !kit.deps.enemyInfo(e.enemyId, INFO)) return;
    const cy = INFO.y + INFO.height * 0.55;
    if (INFO.sprite === "willow") {
      // T3.2: a shudder ring in violet-teal and a burst of leaves (the storm 40 / s for 2 s is the ambient director's)
      kit.ring(INFO.x, 0.06, INFO.z, 0.5, 12, 0.8, [0.9, 0.8, 2.2], [0.3, 1.0, 1.1], 1.2, true);
      kit.sparks(INFO.x, 4.5, INFO.z, kit.n(40), [0.5, 1.2, 0.8], 5, {
        kind: PK_PIXEL,
        size: 0.07,
        life: 1.2,
        grav: 1.5,
        st: 0,
      });
      kit.crack(INFO.x, INFO.z, 8, 1.4, [0.3, 0.2, 0.5]);
      this.rim(e.enemyId, 0.7, [0.7, 0.6, 1.8], 0.3);
      return;
    }
    kit.ring(INFO.x, 0.06, INFO.z, 0.5, 12, 0.7, [2.2, 2.6, 3.2], [0.6, 1, 1.6], 1.4, true);
    kit.ring(INFO.x, cy, INFO.z + 0.6, 0.8, 9, 0.55, [3, 2.4, 1.6], [1, 0.5, 0.2], 1.3);
    kit.star(INFO.x, cy, INFO.z + 1, 3.5, 0.5, 0.35, [1.6, 1.3, 1.0], 1.6, 0.785);
    kit.flash(INFO.x, cy, INFO.z + 1.4, [1, 0.8, 0.6], 1.5, 5, 0.5);
    kit.sparks(INFO.x, cy, INFO.z, kit.n(50), [3.4, 1.6, 0.5], 8, { life: 0.9, grav: 3 });
    kit.puffs(INFO.x, 0.2, INFO.z, kit.n(14), DUST, 0.9, 1, 1);
    kit.crack(INFO.x, INFO.z, 8, 1.4, [0.9, 0.7, 0.5]);
    kit.postFlash(0.06, [1, 0.9, 0.8], 160, 0.08);
    this.rim(e.enemyId, 0.9, [1.6, 1.4, 1.1], 0.3);
  }

  doomStarted(e: EventOf<"DoomSpellStarted">): void {
    this.doomOn = true;
    this.doomId = e.enemyId;
    this.doomStart = e.tick;
    this.doomEnd = Math.max(e.tick + 1, e.deadlineTick);
    this.doomK = 1;
    this.doomEnding = false;
    this.doomAcc = 0;
    this.pulseT = 0;
    const kit = this.kit;
    if (kit.scale.k > 0 && kit.deps.enemyInfo(e.enemyId, INFO)) {
      kit.ring(INFO.x, 0.06, INFO.z, 0.5, 7, 0.6, [2, 0.5, 2.4], [0.6, 0.1, 0.8], 1.2, true);
      // P1-3: the Willow's Hush light back-lights it (behind the trunk) and stays low: in front it turned the whole boss pink
      const wl = INFO.sprite === "willow";
      kit.flash(
        INFO.x,
        INFO.y + INFO.height * 0.6,
        wl ? INFO.z - 2 : INFO.z + 1.2,
        [0.7, 0.2, 0.9],
        wl ? 1.2 : 3,
        8,
        0.6,
      );
    }
  }

  doomCompleted(e: EventOf<"DoomSpellCompleted">): void {
    const kit = this.kit;
    this.doomEnding = true;
    if (kit.scale.k <= 0 || !kit.deps.enemyInfo(e.enemyId, INFO)) return;
    const cy = INFO.y + INFO.height * 0.6;
    kit.ring(INFO.x, cy, INFO.z + 0.6, 0.8, 8, 0.45, [3, 2.6, 3.4], [1.2, 0.8, 1.8], 1.3);
    kit.star(INFO.x, cy, INFO.z + 1, 6, 0.4, 0.3, [3.2, 3, 3.6], 1.5, 0.785);
    kit.sparks(INFO.x, cy, INFO.z, kit.n(40), [2.8, 2.4, 3.6], 7, { life: 0.6, grav: 4 });
    kit.flash(INFO.x, cy, INFO.z + 1.2, [0.85, 0.8, 1], 4, 8, 0.4);
    this.rim(e.enemyId, 0.9, [3, 2.8, 3.6], 0.3);
  }

  doomFailed(e: EventOf<"DoomSpellFailed">): void {
    const kit = this.kit;
    this.doomEnding = true;
    if (kit.scale.k <= 0 || !kit.deps.enemyInfo(e.enemyId, INFO)) return;
    kit.deps.anchors.hero(kit.hero);
    const cy = INFO.y + INFO.height * 0.6;
    kit.star(INFO.x - 0.5, cy, INFO.z + 1, 5, 0.5, 0.3, [3, 0.8, 2.6], 1.3);
    this.proj.launch(P_DOOM, INFO.x - 0.5, cy, INFO.z + 0.6, -1, 0, 0.22, 0.6, DOOM_COL, {
      x: kit.hero.x + 0.2,
      y: 1.2,
      z: kit.hero.z + 0.5,
    });
  }

  /** The Doom bolt reaches the hero. */
  private doomImpact(x: number, y: number, z: number): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    kit.sparks(x, y, z, kit.n(34), [2.6, 0.5, 2.4], 7, { dir: -0.8, grav: 6, st: 0.07 });
    kit.star(x, y, z + 0.4, 4, 0.4, 0.25, [3, 0.9, 2.6], 1.2);
    kit.ring(x, 0.06, z, 0.5, 6, 0.5, [2.2, 0.5, 2.2], [0.8, 0.1, 0.9], 1.2, true);
    kit.flash(x, 1.3, z - 0.85, [0.8, 0.2, 0.9], 3, HERO_LIGHT_R, 0.4);
    this.rim("hero", 0.9, [3, 0.9, 2.6], 0.25);
  }

  /** A missed rubble word lands on the hero. */
  rubble(): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    kit.deps.anchors.hero(kit.hero);
    const x = kit.hero.x + 0.3;
    const z = kit.hero.z + 0.2;
    // a quick falling streak, then the burst
    for (let i = 0; i < kit.n(4); i++) {
      const sp = kit.p(
        x + (kit.rnd() - 0.5) * 0.5,
        6.5,
        z,
        0,
        -38,
        0,
        0.17,
        0.06,
        2,
        [1.6, 1.3, 1],
      );
      sp.st = 0.12;
      kit.emitA(sp);
    }
    kit.chips(x, 0.6, z, kit.n(18), [1.5, 1.2, 0.9], 5, 0.1, 0.9, 16);
    kit.puffs(x, 0.2, z, kit.n(10), DUST, 0.8, 1.1, 0.9);
    kit.star(x, 0.8, z + 0.6, 2.8, 0.3, 0.16, [2.6, 2, 1.4], 0.8);
    kit.ring(x, 0.06, z, 0.4, 5, 0.4, [2, 1.5, 1], [0.8, 0.5, 0.3], 1, true);
    kit.flash(x, 1.0, z - 0.85, [1, 0.7, 0.4], 2, HERO_LIGHT_R, 0.3);
    this.rim("hero", 0.7, [2.4, 1.6, 1], 0.2);
  }

  // ------------------------------------------------------------------------------- per frame

  /** @hot */
  update(dt: number, view: LevelView | null): void {
    const kit = this.kit;
    const sc = kit.scale;
    const tick = view ? view.tick : 0;

    // ---- boss alive?
    let bossAlive = false;
    if (view)
      for (const e of view.enemies)
        if (e.isBoss && e.alive) {
          bossAlive = true;
          if (this.bossId < 0) this.bossId = e.id;
        }
    // ---- intro timeline
    let target = 0;
    if (this.intro) {
      const p = clamp01((tick - this.introStart) / (this.introEnd - this.introStart));
      if (!this.lit && p >= LIT_AT) this.ignite();
      if (this.lit) target = 1;
      else target = 0.25 * clamp01(p / LIT_AT);
      if (p >= 1) this.intro = false;
      if (!this.lit && sc.k > 0 && kit.deps.enemyInfo(this.bossId, INFO)) {
        this.dustAcc += dt * 40 * sc.k * sc.q;
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          const sp = kit.p(
            INFO.x + (kit.rnd() - 0.5) * 8,
            7 + kit.rnd() * 2,
            INFO.z + (kit.rnd() - 0.5) * 4,
            0,
            -1,
            0,
            2,
            0.06 + kit.rnd() * 0.06,
            PK_PIXEL,
            [0.4, 0.34, 0.28],
            0.9,
          );
          sp.grav = 6;
          kit.emitN(sp);
        }
      }
    } else if (bossAlive) target = 0.6;
    this.runeLevel += (target - this.runeLevel) * Math.min(1, dt * 2);
    this.surge = Math.max(0, this.surge - dt * 1.6);
    if (this.runeLevel > 0.02 && kit.deps.enemyInfo(this.bossId, INFO)) {
      const g = sc.k <= 0 ? 0.4 : 0.6 + 0.4 * sc.k;
      const rc = INFO.sprite === "willow" ? RUNE_WILLOW : RUNE_COL;
      this.rune
        .color(rc[0], rc[1], rc[2])
        .at(INFO.x, 0.05, INFO.z)
        .size(11 * (1 + 0.05 * this.surge));
      this.rune.mesh.rotation.z = sc.reducedMotion ? 0 : kit.time * 0.08;
      this.rune.intensity((1.5 * this.runeLevel + 1.4 * this.surge) * g);
      if (sc.k > 0 && this.runeLevel > 0.3) {
        this.runeAcc += dt * 7 * sc.k * sc.q * this.runeLevel;
        while (this.runeAcc >= 1) {
          this.runeAcc -= 1;
          const sp = kit.p(
            INFO.x + (kit.rnd() - 0.5) * 6,
            0.1,
            INFO.z + (kit.rnd() - 0.5) * 3,
            0,
            0.8 + kit.rnd(),
            0,
            1.4,
            0.06,
            PK_PIXEL,
            [0.25, 1.1, 1.3],
          );
          sp.sway = 0.4;
          sp.ph = kit.rnd() * 6;
          kit.emitA(sp);
        }
      }
    } else this.rune.intensity(0);
    if (!bossAlive && !this.intro) this.bossId = -1;

    // ---- doom aura
    if (this.doomOn) {
      if (!view || !isAliveId(view, this.doomId)) this.doomEnding = true;
      if (this.doomEnding) this.doomK -= dt * 4;
      if (this.doomK <= 0) {
        this.doomOn = false;
        this.column.alpha(0);
        this.halo.alpha(0);
      } else if (kit.deps.enemyInfo(this.doomId, INFO)) {
        const p = clamp01((tick - this.doomStart) / (this.doomEnd - this.doomStart));
        const f = Math.max(0, this.doomK);
        const g = sc.k <= 0 ? 0.4 : 0.6 + 0.4 * sc.k;
        const cy = INFO.y + INFO.height * 0.5;
        // P1-3: for the Willow the aura sits BEHIND the trunk and is thinner, so the body keeps its dark indigo value
        const wl = INFO.sprite === "willow";
        const az = wl ? -1.8 : 0;
        const ak = wl ? 0.45 : 1;
        const pulse =
          sc.reducedFlash || sc.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(kit.time * (4 + 10 * p));
        this.column
          .color(DOOM_COL[0], DOOM_COL[1], DOOM_COL[2])
          .at(INFO.x, cy + 1.2, INFO.z - 0.3 + az)
          .size(3.6 * INFO.scale, 7.5);
        this.column.alpha((0.35 + 0.45 * p) * f * g * pulse * ak);
        this.halo
          .color(DOOM_COL[0] * 1.2, DOOM_COL[1], DOOM_COL[2] * 1.2)
          .at(INFO.x, cy, INFO.z + 0.4 + az)
          .size(INFO.height * 2.2 * (1.25 - 0.3 * p));
        this.halo.alpha((0.3 + 0.5 * p) * f * g * pulse * ak);
        if (sc.k > 0) {
          this.doomAcc += dt * (14 + 26 * p) * sc.k * sc.q;
          while (this.doomAcc >= 1) {
            this.doomAcc -= 1;
            const a = kit.rnd() * Math.PI * 2;
            const r = INFO.height * (1.0 + kit.rnd() * 0.5);
            const sp = kit.p(
              INFO.x + Math.cos(a) * r,
              cy + Math.sin(a) * r * 0.8,
              INFO.z + 0.3,
              -Math.cos(a) * r * 2.2,
              -Math.sin(a) * r * 1.8,
              0,
              0.45,
              0.06,
              PK_GLOW,
              [2, 0.6, 2.4],
            );
            sp.size1 = 0.02;
            kit.emitA(sp);
          }
          this.pulseT -= dt;
          if (this.pulseT <= 0 && !this.doomEnding) {
            this.pulseT = 0.5 - 0.3 * p;
            kit.flash(
              INFO.x,
              cy,
              wl ? INFO.z - 2 : INFO.z + 1.2,
              [0.7, 0.2, 0.9],
              (1.4 + 1.2 * p) * (wl ? 0.4 : 1),
              7,
              0.3,
            );
          }
        }
      }
    }
  }

  clear(): void {
    this.runeLevel = 0;
    this.surge = 0;
    this.intro = false;
    this.lit = false;
    this.bossId = -1;
    this.doomOn = false;
    this.rune.intensity(0);
    this.column.alpha(0);
    this.halo.alpha(0);
  }

  dispose(): void {
    this.rune.dispose();
    this.column.dispose();
    this.halo.dispose();
  }
}

function isAliveId(view: LevelView, id: number): boolean {
  for (const e of view.enemies) if (e.id === id) return e.alive;
  return false;
}

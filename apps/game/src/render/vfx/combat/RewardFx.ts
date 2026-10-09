/**
 * RewardFx: the chest drop and the coin fountain.
 *   - ChestDropped: the chest falls from above and bounces (dust ring), then opens: a light beam by tier
 *     (Wooden: a dim warm column; Iron: cold steel; Gold: the POC's golden beam plus god-rays; Mythic: violet beam,
 *     a rune circle on the ground, hue-cycling motes), rising motes and a held light, all fading out by ~4.7 s.
 *   - GoldGained: a fountain of spinning, bouncing gold pixels from the chest / the last enemy to die / the hero.
 * One chest at a time (a new drop restarts the effect). Built once; the chest actor is created lazily and reused.
 */
import type { EventOf } from "@hd2d/sim";
import { FxKind } from "../../materials/fx";
import type { SpriteActor } from "../../materials/sprite";
import type { RenderWorld } from "../../RenderWorld";
import type { SpriteFrame } from "../../sprites/SpriteSource";
import { AuraKind, AuraQuad } from "../AuraQuad";
import { hueRgb } from "../colors";
import { FxQuad } from "../FxQuad";
import { PK_GLOW, PK_PIXEL } from "../PooledParticles";
import type { FxKit } from "./kit";
import { CHEST_STYLE, type ChestStyle, coinCount, type Rgb } from "./params";

const EN = { x: 0, y: 0, z: 0 };
const OPEN_AT = 1.1;
const BEAM_HOLD_END = 3.4;
const END_AT = 4.7;
const GOLD: Rgb = [3.2, 2.3, 0.6];
const RGB: Rgb = [0, 0, 0];

export class RewardFx {
  private actor: SpriteActor | null = null;
  private closed: SpriteFrame | null = null;
  private opened: SpriteFrame | null = null;
  private readonly beam: FxQuad;
  private readonly halo: FxQuad;
  private readonly rays: AuraQuad;
  private readonly rune: FxQuad;
  private on = false;
  private t = 0;
  private x = 0;
  private z = 0;
  private y = 7;
  private vy = 0;
  private landed = 0;
  private open = false;
  private style: ChestStyle = CHEST_STYLE.Wooden;
  private acc = 0;
  /** Chest position for the coin fountain while it is on stage. */
  get chestAt(): { x: number; z: number } | null {
    return this.on ? { x: this.x, z: this.z } : null;
  }

  constructor(
    private readonly world: RenderWorld,
    private readonly kit: FxKit,
    /** Fallback spawn point when no enemy anchor exists (the last death, else ahead of the hero). */
    private readonly fallback: () => { x: number; z: number },
  ) {
    this.beam = new FxQuad(world, FxKind.Beam, 8);
    this.halo = new FxQuad(world, FxKind.Beam, 7);
    this.rays = new AuraQuad(world, AuraKind.Burst, 6, 2.2, 0.6);
    this.rune = new FxQuad(world, FxKind.Rune, 5);
    this.rune.mesh.rotation.x = -Math.PI / 2;
  }

  private ensureActor(): boolean {
    if (this.actor) return true;
    try {
      const src = this.world.source;
      if (!src.has("chest")) return false;
      this.closed = src.frames("chest", "closed")[0] ?? null;
      this.opened = src.frames("chest", "open")[0] ?? null;
      if (!this.closed) return false;
      this.actor = this.world.addActor("chest", "closed", { rim: 1.2, blobW: 1.1 });
      this.actor.visible = false;
      return true;
    } catch {
      return false;
    }
  }

  chestDropped(e: EventOf<"ChestDropped">): void {
    const kit = this.kit;
    if (!this.ensureActor() || !this.actor || !this.closed) return;
    let x: number;
    let z: number;
    if (e.enemyId !== null && kit.deps.anchors.enemy(e.enemyId, EN)) {
      x = EN.x - 0.9;
      z = EN.z + 0.6;
    } else {
      const fb = this.fallback();
      x = fb.x - 0.9;
      z = fb.z + 0.6;
    }
    this.on = true;
    this.t = 0;
    this.x = x;
    this.z = z;
    this.y = 7;
    this.vy = 0;
    this.landed = 0;
    this.open = false;
    this.acc = 0;
    this.style = CHEST_STYLE[e.tier];
    this.actor.setFrame(this.closed);
    this.actor.visible = true;
    this.actor.place(x, this.y, z);
    this.world.shadowFor(this.actor, x, z);
  }

  private opening(): void {
    const kit = this.kit;
    const st = this.style;
    this.open = true;
    if (this.actor && this.opened) this.actor.setFrame(this.opened);
    kit.star(this.x, 0.7, this.z + 0.5, 4, 0.5, 0.4, [2, 1.6, 0.8], 1.0);
    kit.ring(this.x, 0.06, this.z, 0.5, 5, 0.5, st.beamCore, st.beamCol, 1.1, true);
    if (st.rune)
      kit.ring(this.x, 0.7, this.z + 0.4, 0.5, 7, 0.7, [2.4, 1.2, 3.4], [1, 0.4, 1.6], 1.2);
    // sparkle burst going up (the coins themselves belong to GoldGained)
    for (let i = 0; i < kit.n(st.burst); i++) {
      const a = kit.rnd() * Math.PI * 2;
      const s = 1 + kit.rnd() * 2.6;
      const sp = kit.p(
        this.x,
        0.6,
        this.z + 0.2,
        Math.cos(a) * s * 0.7,
        3 + kit.rnd() * 4,
        Math.sin(a) * s * 0.5,
        1.2 + kit.rnd() * 0.8,
        0.09,
        PK_PIXEL,
        st.prism ? hueRgb(kit.rnd() * 360, 2.4, RGB) : st.beamCore,
      );
      // forest: the HDR sparkle pixels pile up into a white blob; keep their hue
      const hs = 0.35 + 0.65 * Math.min(1, kit.glare);
      sp.r *= hs;
      sp.g *= hs;
      sp.b *= hs;
      sp.grav = 6;
      sp.delay = kit.rnd() * 0.3;
      kit.emitA(sp);
    }
    kit.flash(this.x, 1.2, this.z + 0.6, st.light, st.lightPeak, 8, 0.6);
    kit.postFlash(st.prism ? 0.12 : 0.08, st.light, 160, 0.12);
  }

  // ------------------------------------------------------------------------------- GoldGained

  goldGained(e: EventOf<"GoldGained">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    let x: number;
    let z: number;
    let y = 0.7;
    if (this.on && this.landed >= 1) {
      x = this.x;
      z = this.z;
    } else if (e.source === "passive") {
      kit.deps.anchors.hero(kit.hero);
      x = kit.hero.x + 0.3;
      z = kit.hero.z + 0.3;
      y = 1.6;
    } else {
      const fb = this.fallback();
      x = fb.x;
      z = fb.z + 0.3;
    }
    const n = kit.n(coinCount(e.amount, e.source));
    const spin = kit.scale.reducedMotion ? 0 : 1;
    const big = e.source !== "passive";
    // a warm bloom under the fountain (the POC's loot pile glows)
    if (big) kit.glow(x, 0.9, z + 0.3, 1.0, 4.2, 0.7, [1.8, 1.1, 0.3], 0.9);
    for (let i = 0; i < n; i++) {
      const a = kit.rnd() * Math.PI * 2;
      const s = 1.2 + kit.rnd() * (big ? 4 : 2.6);
      const sp = kit.p(
        x,
        y,
        z + 0.2,
        Math.cos(a) * s * 0.85,
        (big ? 7 : 5) + kit.rnd() * (big ? 7 : 5),
        Math.sin(a) * s * 0.55,
        2.0 + kit.rnd() * 1.0,
        big ? 0.2 : 0.13,
        PK_PIXEL,
        GOLD,
      );
      // forest: HDR gold pixels read as white squares; keep them gold
      const cg = 0.3 + 0.7 * Math.min(1, kit.glare);
      sp.r *= cg;
      sp.g *= cg;
      sp.b *= cg;
      sp.grav = 15;
      sp.bounce = 0.45;
      sp.spin = spin * (10 + kit.rnd() * 14);
      sp.ph = kit.rnd() * 6;
      sp.delay = kit.rnd() * 0.65;
      kit.emitA(sp);
      // every second coin carries a soft golden glow, so the fountain reads as light and not just pixels
      if (big && (i & 1) === 0) {
        const gl = kit.p(
          x,
          y,
          z + 0.25,
          Math.cos(a) * s * 0.85,
          sp.vy,
          Math.sin(a) * s * 0.55,
          sp.life,
          0.55,
          PK_GLOW,
          [2.0, 1.3, 0.4],
          0.55 * kit.puffHdr * kit.puffHdr,
        );
        gl.grav = 15;
        gl.bounce = 0.3;
        gl.delay = sp.delay;
        kit.emitA(gl);
      }
    }
    kit.sparks(x, y, z, kit.n(big ? 26 : 10), [3.2, 2.6, 1.1], 3.2, {
      kind: PK_GLOW,
      size: big ? 0.2 : 0.13,
      life: 1.3,
      grav: -1,
      st: 0,
    });
    kit.star(x, 0.9, z + 0.6, 3.4, 0.6, 0.35, [2.6, 1.9, 0.7], 0.8);
    kit.flash(x, 1.1, z + 0.8, [1, 0.8, 0.4], big ? 2.6 : 1.8, 6, 0.6);
  }

  // ------------------------------------------------------------------------------- per frame

  /** @hot */
  update(dt: number): void {
    if (!this.on) return;
    const kit = this.kit;
    const sc = kit.scale;
    const st = this.style;
    this.t += dt;
    const t = this.t;
    const a = this.actor;
    if (!a) return;
    // fall + two bounces (POC `updateLoot`)
    if (this.landed < 2) {
      this.vy -= 30 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        if (this.vy < -3) {
          this.vy = -this.vy * 0.32;
          this.landed++;
          kit.ring(
            this.x,
            0.05,
            this.z,
            0.4,
            3.2,
            0.4,
            [1.2, 1.0, 0.7],
            [0.6, 0.5, 0.3],
            0.7,
            true,
          );
          kit.puffs(this.x, 0.1, this.z, kit.n(10), [0.5, 0.42, 0.32], 0.4, 0.8, 0.6);
          kit.deps.anchors.hero(kit.hero);
        } else {
          this.vy = 0;
          this.landed = 2;
        }
      }
    }
    a.place(this.x, this.y, this.z);
    this.world.shadowFor(a, this.x, this.z);
    if (t >= OPEN_AT && !this.open) this.opening();

    if (this.open) {
      const ramp = Math.min(1, (t - OPEN_AT) * 3);
      const fade = t > BEAM_HOLD_END ? Math.max(0, 1 - (t - BEAM_HOLD_END) * 1.2) : 1;
      const k = ramp * fade;
      const g = sc.k <= 0 ? 0.55 : 0.6 + 0.4 * sc.k;
      const wob = sc.reducedMotion ? 0 : 0.05 * Math.sin(t * 5);
      this.beam
        .color(st.beamCol[0], st.beamCol[1], st.beamCol[2])
        .color2(st.beamCore[0], st.beamCore[1], st.beamCore[2])
        .at(this.x, 7.2, this.z - 0.1)
        .size(st.width * (1 + wob), 14.4)
        .intensity(st.beam * k * g * kit.glare * kit.glareSoft);
      this.halo
        .color(st.beamCol[0] * 0.6, st.beamCol[1] * 0.6, st.beamCol[2] * 0.6)
        .color2(st.beamCol[0] * 0.4, st.beamCol[1] * 0.4, st.beamCol[2] * 0.4)
        .at(this.x, 7.2, this.z - 0.2)
        .size(st.width * 2.7, 14.4)
        .intensity(st.halo * k * g * kit.glare * kit.glareSoft);
      if (st.rays && sc.k > 0) {
        this.rays
          .color(st.beamCol[0], st.beamCol[1], st.beamCol[2])
          .at(this.x, 2.2, this.z - 0.3)
          .size(9);
        this.rays.mesh.rotation.z = sc.reducedMotion ? 0 : t * 0.15;
        this.rays.alpha(0.5 * k * g * kit.glare * kit.glareSoft);
      }
      if (st.rune) {
        this.rune.color(2.4, 1.0, 3.2).at(this.x, 0.05, this.z).size(5.2);
        this.rune.intensity(1.1 * k * g);
      }
      kit.lights.setAura(
        this.x,
        1.2,
        this.z + 0.6,
        st.light[0],
        st.light[1],
        st.light[2],
        st.lightPeak * k * g * kit.glare * (sc.k > 0 ? 1 : 0),
        8,
      );
      if (sc.k > 0) {
        this.acc += dt * (st.motes + 6) * sc.k * sc.q;
        while (this.acc >= 1) {
          this.acc -= 1;
          const col = st.prism ? hueRgb(kit.time * 140 + kit.rnd() * 90, 2.4, RGB) : st.beamCore;
          const sp = kit.p(
            this.x + (kit.rnd() - 0.5) * 0.9,
            0.4,
            this.z,
            0,
            2.5 + kit.rnd() * 2,
            0,
            1.2,
            0.06,
            PK_PIXEL,
            col,
            k,
          );
          kit.emitA(sp);
        }
      }
    }
    if (t >= END_AT) this.stop();
  }

  private stop(): void {
    this.on = false;
    if (this.actor) this.actor.visible = false;
    this.beam.intensity(0);
    this.halo.intensity(0);
    this.rays.alpha(0);
    this.rune.intensity(0);
    const l = this.kit.lights.aura;
    l.intensity = 0;
    l.radius = 0;
  }

  clear(): void {
    this.stop();
  }

  dispose(): void {
    this.actor?.dispose();
    this.actor = null;
    this.beam.dispose();
    this.halo.dispose();
    this.rays.dispose();
    this.rune.dispose();
  }
}

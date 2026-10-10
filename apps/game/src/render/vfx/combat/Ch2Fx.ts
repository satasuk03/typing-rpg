/**
 * Ch2Fx (T3.2): the Chapter II world effects, bound to the v2.0 events (brief `docs/vfx/ch2-art-direction.md` section 5).
 *
 *   EnemyHealed         heal beam moth -> target, 14 green motes spiralling up the target, a heal pop, a target rim flash
 *   healer wind-up      (derived from `EnemyView.healer.ticksLeft`, brief naming note) a green ground ring under the moth
 *   elite (EnemyView)   gold ground sigil, rim breathing, rising motes (`ELITE_FX`); howl telegraph = gold ground rings
 *   Riddle*             3 neutral leaves drift from the Willow's fronds, a pick highlight, right = bloom + 24 petals fly to the
 *                       Willow, wrong / timeout = wither (brown flakes, the leaf curls and falls) and a hit flash on the hero
 *   freed Willow        the finale timeline (warm flash 900 ms, a warm rune ring, leaves rise, blossoms, light returns)
 *
 * Keep-out (brief K1 / K2): every bright spawn asks `kit.keepOutK` (the plate rects the HUD supplies each frame, 40 px band)
 * and is dimmed to <= 1.5 HDR inside it. Everything is allocation-free per event and per frame; pools are built once.
 * Nothing here reads or mutates the sim.
 */
import type { EventOf, LevelView } from "@hd2d/sim";
import { Vector3 } from "three";
import { FxKind } from "../../materials/fx";
import type { RenderWorld } from "../../RenderWorld";
import { ELITE_FX, WILLOW_FACE_Y_M } from "../../sprites/ch2Monsters";
import { FxQuad } from "../FxQuad";
import { PK_GLOW, PK_PIXEL } from "../PooledParticles";
import { screenToActionPlane } from "../screenToWorld";
import type { EnemyInfo, FxKit } from "./kit";
import type { Rgb } from "./params";

const INFO: EnemyInfo = { frame: null, scale: 1, x: 0, y: 0, z: 0, height: 2 };
const INFO2: EnemyInfo = { frame: null, scale: 1, x: 0, y: 0, z: 0, height: 2 };
const PR = { x: 0, y: 0, w: 0, h: 0 };
const V3 = new Vector3();
/** A world leaf hovers this many CSS px above its lane's leaf plate (> the 40 px keep-out band). */
const LEAF_ABOVE_PX = 70;

// ---- palette (HDR). Green is reserved for healing, gold for elite / riddle-right (brief K3).
const HEAL_BEAM: Rgb = [0.3, 1.6, 0.6];
const HEAL_BEAM2: Rgb = [1.4, 2.4, 1.6];
const HEAL_MOTE: Rgb = [0.5, 1.9, 0.8];
const HEAL_RIM: Rgb = [0.6, 2.0, 0.9];
const HEAL_RING: Rgb = [0.4, 2.0, 0.7];
const GOLD_A: Rgb = [1.8, 1.3, 0.4];
const GOLD_B: Rgb = [0.6, 0.3, 0.1];
const LEAF: Rgb = [0.28, 0.62, 0.34];
const LEAF_HI: Rgb = [0.7, 1.15, 0.55];
const PETAL_GOLD: Rgb = [1.7, 1.5, 0.5];
const PETAL_GREEN: Rgb = [0.7, 1.6, 0.6];
const WITHER: Rgb = [0.55, 0.38, 0.22];
const SILVER: Rgb = [0.9, 1.0, 1.1];
const BLOSSOM: Rgb = [1.5, 1.0, 1.1];
const WARM: Rgb = [1.0, 0.95, 0.8];
const HERO_HIT: Rgb = [2.0, 0.5, 0.4];

const MAX_ELITE = 4;
const MAX_LEAF = 3;
/** The heal wind-up is 600 ms (36 sim ticks at 60 Hz) before the cadence tick. */
const HEAL_WINDUP_TICKS = 36;
const HOWL_RING_EVERY = 0.45;

type LeafState = 0 | 1 | 2 | 3; // idle | bloom | wither | fade
interface Leaf {
  on: boolean;
  lane: number;
  st: LeafState;
  t: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  /** Seconds the leaf spends drifting from the frond to its lane. */
  arrive: number;
  pick: number;
  rot: number;
  vy: number;
}

interface HealerSeen {
  id: number;
  casting: boolean;
}

export type Ch2Rim = (who: "hero" | number, amount: number, rgb: Rgb, dur: number) => void;

export class Ch2Fx {
  private readonly sigil: FxQuad[] = [];
  private readonly eliteAcc: number[] = [];
  private readonly eliteSeen: number[] = [];
  private howlT = 0;
  private readonly leaves: Leaf[] = [];
  private leafAcc = 0;
  private readonly leafPlate = [-1, -1, -1];
  /** Where the Willow's face / fronds are (riddle origin, petal target). */
  private willowId = -1;
  private readonly seen: HealerSeen[] = [];
  // freed finale
  private freedOn = false;
  private freedT = 0;
  private freedX = 0;
  private freedZ = 0;
  private freedDidFlash = false;
  private freedDidRing = false;
  private freedDidLight = false;
  private freedDidBlossom = false;
  private freedAcc = 0;

  constructor(
    world: RenderWorld,
    private readonly kit: FxKit,
    private readonly rim: Ch2Rim,
  ) {
    for (let i = 0; i < MAX_ELITE; i++) {
      const q = new FxQuad(world, FxKind.Rune, 3, i * 2.3);
      q.mesh.rotation.x = -Math.PI / 2;
      this.sigil.push(q);
      this.eliteAcc.push(0);
      this.eliteSeen.push(-1);
    }
    for (let i = 0; i < MAX_LEAF; i++)
      this.leaves.push({
        on: false,
        lane: i,
        st: 0,
        t: 0,
        x: 0,
        y: 0,
        z: 0,
        tx: 0,
        ty: 0,
        tz: 0,
        fromX: 0,
        fromY: 0,
        fromZ: 0,
        arrive: 1,
        pick: 0,
        rot: 0,
        vy: 0,
      });
  }

  // ------------------------------------------------------------------------------- helpers

  isWillow(id: number): boolean {
    return this.kit.deps.enemyInfo(id, INFO2) && INFO2.sprite === "willow";
  }

  /** Dim factor for a bright spawn at a world point: 1 clear, `KEEP_OUT_DIM` within 40 px of a plate. */
  private gate(x: number, y: number, z: number): number {
    return this.kit.keepOutK(x, y, z);
  }

  // ------------------------------------------------------------------------------- 5.1 heal

  /** `EnemyHealed`: a beam from the healer to the target's chest, motes spiralling up the target, a pop and a rim flash. */
  healed(e: EventOf<"EnemyHealed">): void {
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    if (!kit.deps.enemyInfo(e.targetId, INFO)) return;
    const tx = INFO.x;
    const ty = INFO.y + INFO.height * 0.55;
    const tz = INFO.z;
    const hs = Math.min(1.3, INFO.scale);
    let sx = tx;
    let sy = ty + 1.4;
    if (e.sourceId !== e.targetId && kit.deps.enemyInfo(e.sourceId, INFO2)) {
      sx = INFO2.x;
      sy = INFO2.y + INFO2.height * 0.5;
    }
    const lowTier = kit.scale.q <= 0.55;
    const g = Math.min(
      this.gate(tx, ty, tz),
      this.gate(sx, sy, tz),
      this.gate((sx + tx) / 2, (sy + ty) / 2, tz),
    );
    // the beam: a thin tall quad rotated onto the segment (width 0.10 u, 220 ms, tail fades first)
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.max(0.5, Math.hypot(dx, dy));
    const q = kit.quad();
    q.x = sx + dx / 2;
    q.y = sy + dy / 2;
    q.z = tz + 0.25;
    q.s0 = q.s1 = 1;
    q.ax = 0.6;
    q.ay = len;
    q.rot = Math.atan2(dy, dx) - Math.PI / 2;
    q.life = 0.22;
    q.i = 2.4 * (0.5 + 0.5 * kit.scale.k) * kit.glareSoft * g;
    q.r = HEAL_BEAM[0];
    q.g = HEAL_BEAM[1];
    q.b = HEAL_BEAM[2];
    q.r2 = HEAL_BEAM2[0];
    q.g2 = HEAL_BEAM2[1];
    q.b2 = HEAL_BEAM2[2];
    kit.beams.spawn(q);
    // motes: spiral up the target (r 0.5, rise 1.2 u/s, life 0.7 s); tier 2 = 6 of them
    const n = kit.n(lowTier ? 6 : 14);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      const r = 0.5 * hs;
      const sp = kit.p(
        tx + Math.cos(a) * r,
        INFO.y + 0.2 + kit.rnd() * 0.6,
        tz + Math.sin(a) * r * 0.5 + 0.1,
        0,
        1.2 + kit.rnd() * 0.5,
        0,
        0.7,
        0.15 + kit.rnd() * 0.05,
        PK_GLOW,
        HEAL_MOTE,
        0.9,
      );
      sp.r *= g;
      sp.g *= g;
      sp.b *= g;
      sp.sway = 0.5;
      sp.ph = a;
      sp.delay = (i / Math.max(1, n)) * 0.25;
      kit.emitA(sp);
    }
    // the pop: a small green star + a light on the target, then a rim flash decaying over 250 ms
    kit.star(tx, ty, tz + 0.5, 0.4, 1.6, 0.25, [1.2 * g + 0.2, 2.2 * g + 0.2, 1.4 * g + 0.2], 0.7);
    kit.flash(tx, ty, tz + 0.8, [0.3, 1, 0.5], 1.2 * g, 4.5, 0.4);
    this.rim(e.targetId, 0.6, HEAL_RIM, 0.25);
  }

  /** Ground ring under a healer whose cast starts (derived wind-up: `healer.ticksLeft <= 36`). */
  private healerWindup(id: number): void {
    const kit = this.kit;
    if (kit.scale.k <= 0 || kit.scale.q <= 0.55) return; // tier 2: no ring
    if (!kit.deps.enemyInfo(id, INFO)) return;
    kit.ring(INFO.x, 0.06, INFO.z, 0.2, 2.4, 0.6, HEAL_RING, [0.1, 0.7, 0.3], 0.9, true);
  }

  // ------------------------------------------------------------------------------- 5.4 riddle

  /** Where the Willow's riddle leaves detach from, and the lane targets. Lanes follow the HUD plates when it supplies them. */
  riddleStarted(e: EventOf<"RiddleStarted">): void {
    const kit = this.kit;
    if (!kit.deps.enemyInfo(e.enemyId, INFO)) return;
    this.willowId = e.enemyId;
    for (let i = 0; i < MAX_LEAF; i++) {
      const lf = this.leaves[i] as Leaf;
      lf.on = true;
      lf.lane = i;
      lf.st = 0;
      lf.t = 0;
      lf.pick = 0;
      lf.rot = 0;
      lf.vy = 0;
      // detach point: one of the front fronds (x +-3.7 / 0 at 9 m, brief 3.7), spread over the three leaves
      lf.fromX = INFO.x + (i - 1) * 3.3;
      lf.fromY = INFO.y + 8.8 + (i === 1 ? 0.6 : 0);
      lf.fromZ = INFO.z + 0.5;
      lf.arrive = 1.1 + i * 0.18;
      // lane target: the fallback hangs left of the Willow, spread in x; `retarget` moves it above the lane's HUD leaf plate
      // (LEAF_ABOVE_PX over its top edge, i.e. outside the 40 px keep-out band) as soon as the HUD has the plate
      lf.tx = INFO.x - 7.4 + i * 2.4;
      lf.ty = INFO.y + 3.1;
      lf.tz = INFO.z + 0.4;
      this.leafPlate[i] = e.leafPlateIds[i] as number;
    }
    this.leafAcc = 0;
  }

  /** Follow the lane's HUD leaf plate: the world leaf hovers above it. */
  private retarget(lf: Leaf): void {
    const id = this.leafPlate[lf.lane] as number;
    const kit = this.kit;
    if (id < 0 || !kit.deps.plateRectOf || typeof window === "undefined") return;
    if (!kit.deps.plateRectOf(id, PR)) return;
    if (
      !screenToActionPlane(
        kit.deps.world.camera.camera,
        PR.x + PR.w / 2,
        PR.y - LEAF_ABOVE_PX,
        window.innerWidth,
        window.innerHeight,
        V3,
      )
    )
      return;
    lf.tx = V3.x;
    lf.ty = V3.y;
    lf.tz = INFO.z + 0.4;
  }

  riddleLeafPicked(e: EventOf<"RiddleLeafPicked">): void {
    const lf = this.leaves[e.lane];
    if (!lf?.on) return;
    lf.pick = 1;
    const kit = this.kit;
    if (kit.scale.k <= 0) return;
    const g = this.gate(lf.x, lf.y, lf.z);
    kit.glow(
      lf.x,
      lf.y,
      lf.z + 0.2,
      0.3,
      1.1,
      0.35,
      [0.7 * g + 0.2, 1.2 * g + 0.2, 0.9 * g + 0.2],
      0.7,
    );
    kit.sparks(lf.x, lf.y, lf.z + 0.1, kit.n(5), [0.8, 1.4, 1.0], 1.6, {
      kind: PK_GLOW,
      size: 0.09,
      life: 0.45,
      grav: -0.4,
      st: 0,
    });
  }

  riddleResolved(e: EventOf<"RiddleResolved">): void {
    const kit = this.kit;
    const lane =
      e.outcome === "right"
        ? e.answerLane
        : e.pickedPlateId !== null
          ? this.pickedLane(e)
          : e.answerLane;
    for (const lf of this.leaves) {
      if (!lf.on) continue;
      if (lf.lane === lane) {
        lf.st = e.outcome === "right" ? 1 : 2;
        lf.t = 0;
        lf.vy = e.outcome === "right" ? 0 : -2.5;
      } else lf.st = 3;
    }
    const lf = this.leaves[lane];
    if (!lf) return;
    if (kit.scale.k <= 0) return;
    if (e.outcome === "right") this.petals(lf);
    else {
      // wither: 8 brown flakes; the hero takes the hit (the HeroDamaged binding does the shake / hurt pose)
      kit.chips(lf.x, lf.y, lf.z + 0.1, kit.n(8), WITHER, 1.6, 0.07, 0.8, 7, "norm");
      this.rim("hero", 0.7, HERO_HIT, 0.22);
    }
  }

  /** The lane of the plate the player picked (lane order = leafPlateIds order); falls back to the answer lane. */
  private pickedLane(e: EventOf<"RiddleResolved">): number {
    const rd = this.kit.deps.getView()?.minigame?.riddle;
    if (rd) {
      for (let i = 0; i < 3; i++) if (rd.leafPlateIds[i] === e.pickedPlateId) return i;
    }
    return e.answerLane;
  }

  /** Right: the leaf blooms and bursts into 24 gold-green petals that fly to the Willow. */
  private petals(lf: Leaf): void {
    const kit = this.kit;
    if (!kit.deps.enemyInfo(this.willowId, INFO)) return;
    const g = this.gate(lf.x, lf.y, lf.z);
    const wx = INFO.x;
    const wy = INFO.y + WILLOW_FACE_Y_M;
    const wz = INFO.z + 0.4;
    const n = kit.n(24);
    for (let i = 0; i < n; i++) {
      const dx = wx - lf.x;
      const dy = wy - lf.y;
      const d = Math.hypot(dx, dy);
      const life = 0.9 + kit.rnd() * 0.4;
      const spd = d / life;
      const col = i % 3 === 0 ? PETAL_GOLD : PETAL_GREEN;
      const sp = kit.p(
        lf.x + (kit.rnd() - 0.5) * 0.3,
        lf.y + (kit.rnd() - 0.5) * 0.3,
        lf.z + 0.1,
        (dx / d) * spd * 0.8 + (kit.rnd() - 0.5) * 2.4,
        (dy / d) * spd * 0.8 + 1 + kit.rnd() * 1.6,
        (wz - lf.z) * 0.3,
        life,
        0.13 + kit.rnd() * 0.05,
        i % 2 ? PK_PIXEL : PK_GLOW,
        col,
        0.95,
      );
      sp.r *= g;
      sp.g *= g;
      sp.b *= g;
      sp.drag = 0.9;
      sp.sway = 0.6;
      sp.ph = kit.rnd() * 6;
      sp.delay = kit.rnd() * 0.1;
      kit.emitA(sp);
    }
    kit.glow(
      lf.x,
      lf.y,
      lf.z + 0.2,
      0.4,
      1.8,
      0.3,
      [1.4 * g + 0.2, 1.3 * g + 0.2, 0.5 * g + 0.1],
      0.8,
    );
    this.rim(this.willowId, 0.8, [1.6, 1.3, 0.5], 0.3);
  }

  // ------------------------------------------------------------------------------- 5.6 freed Willow

  /** `FinisherCompleted` on the Willow: arm the finale timeline (0 = the finisher's last key). */
  finisherCompleted(e: EventOf<"FinisherCompleted">): void {
    if (!this.isWillow(e.enemyId)) return;
    const kit = this.kit;
    kit.deps.enemyInfo(e.enemyId, INFO);
    this.willowId = e.enemyId;
    this.freedX = INFO.x;
    this.freedZ = INFO.z;
    this.freedOn = true;
    this.freedT = 0;
    this.freedDidFlash = this.freedDidRing = this.freedDidLight = this.freedDidBlossom = false;
    this.freedAcc = 0;
  }

  get freedPlaying(): boolean {
    return this.freedOn;
  }

  private freedStep(dt: number): void {
    const kit = this.kit;
    const sc = kit.scale;
    // area lights and the face flare stay low while any plate is on screen (K2); the real finale has none left
    const pk = kit.plateK;
    this.freedT += dt;
    const t = this.freedT;
    const x = this.freedX;
    const z = this.freedZ;
    if (!this.freedDidFlash && t >= 0.9) {
      this.freedDidFlash = true;
      kit.postFlash(0.35, WARM, 260, 0.35); // warm white; `postFlash` is a no-op under reducedFlash
    }
    if (!this.freedDidRing && t >= 1.06) {
      this.freedDidRing = true;
      if (sc.k > 0) {
        // the violet rune ring turns to warm white, expands to r 14 over 1.2 s and fades
        kit.ring(x, 0.06, z, 1, 28, 1.2, [1.6, 1.5, 1.2], [0.6, 0.55, 0.4], 1.3, true);
        kit.ring(x, 0.07, z, 0.5, 18, 1.0, [1.3, 1.2, 1.0], [0.5, 0.45, 0.35], 1.0, true);
        kit.star(x, 4.75, z + 1.0, 0.6, 6, 0.6, [1.6, 1.4, 1.0], 0.9 * pk);
      }
    }
    if (!this.freedDidLight && t >= 1.4) {
      this.freedDidLight = true;
      // "light returns": the grove-dawn mood crossfade is a biome-side change (T2.1); the world lights carry it here
      kit.flash(x, 5, z + 2, [1.0, 0.85, 0.5], 1.4 * pk, 16, 1.8);
      kit.flash(x - 6, 3, z + 2, [1.0, 0.85, 0.5], 0.8 * pk, 12, 1.6);
    }
    if (!this.freedDidBlossom && t >= 1.06 && sc.k > 0) {
      this.freedDidBlossom = true;
      const n = kit.n(40);
      for (let i = 0; i < n; i++) {
        const sp = kit.p(
          x + (kit.rnd() - 0.5) * 10,
          1 + kit.rnd() * 7,
          z + (kit.rnd() - 0.5) * 3,
          (kit.rnd() - 0.5) * 0.8,
          0.3 + kit.rnd() * 0.8,
          0,
          1.8 + kit.rnd() * 1.2,
          0.11 + kit.rnd() * 0.05,
          PK_GLOW,
          BLOSSOM,
          0.9,
        );
        sp.sway = 0.8;
        sp.ph = kit.rnd() * 6;
        sp.delay = kit.rnd() * 0.5;
        kit.emitA(sp);
      }
    }
    // leaves rise 1.06 - 3.0 s: vy +0.4..0.9, silver -> green-gold, 30 / s
    if (t >= 1.06 && t < 3.0 && sc.k > 0) {
      this.freedAcc += dt * 30 * sc.k * sc.q;
      const k = (t - 1.06) / 1.94;
      while (this.freedAcc >= 1) {
        this.freedAcc -= 1;
        const col: Rgb = [
          SILVER[0] + (1.0 - SILVER[0]) * k,
          SILVER[1] + (1.5 - SILVER[1]) * k,
          SILVER[2] + (0.5 - SILVER[2]) * k,
        ];
        const sp = kit.p(
          x + (kit.rnd() - 0.5) * 14,
          0.3 + kit.rnd() * 5,
          z + (kit.rnd() - 0.4) * 3,
          (kit.rnd() - 0.5) * 0.6,
          0.4 + kit.rnd() * 0.5,
          0,
          1.4 + kit.rnd() * 0.8,
          0.1 + kit.rnd() * 0.04,
          PK_PIXEL,
          col,
          0.95,
        );
        sp.sway = 0.7;
        sp.ph = kit.rnd() * 6;
        kit.emitA(sp);
      }
    }
    if (t > 3.2) this.freedOn = false;
  }

  // ------------------------------------------------------------------------------- per frame

  /**
   * @hot Once a frame after the combat rim decay. `rimBusy(id)` is true while a combat rim flash owns that actor's outline
   * (the elite breathing then yields to it for the length of the flash).
   */
  update(dt: number, view: LevelView | null, rimBusy: (id: number) => boolean): void {
    const kit = this.kit;
    const sc = kit.scale;
    if (this.freedOn) this.freedStep(dt);
    if (!view) {
      for (const q of this.sigil) q.intensity(0);
      return;
    }
    // ---- healer wind-ups (derived from the heal cadence) ----
    for (const ev of view.enemies) {
      if (!ev.healer) continue;
      const casting =
        ev.alive &&
        ev.healer.ticksLeft !== null &&
        ev.healer.ticksLeft <= HEAL_WINDUP_TICKS &&
        ev.healer.ticksLeft > 0;
      let s: HealerSeen | null = null;
      for (const h of this.seen) if (h.id === ev.id) s = h;
      if (!s) {
        s = { id: ev.id, casting: false };
        this.seen.push(s);
      }
      if (casting && !s.casting) this.healerWindup(ev.id);
      s.casting = casting;
    }
    // ---- elites: sigil, rim breathing, motes, howl rings ----
    let slot = 0;
    let howling = false;
    const t = kit.time;
    for (const ev of view.enemies) {
      if (!ev.elite || !ev.alive || slot >= MAX_ELITE) continue;
      if (!kit.deps.enemyInfo(ev.id, INFO)) continue;
      const i = slot++;
      const windup = ev.pose === "windup";
      const wind = windup ? Math.min(1, Math.max(0, ev.atbFrac)) : 0;
      if (windup) howling = true;
      const g = sc.k <= 0 ? 0.5 : 0.6 + 0.4 * sc.k;
      const q = this.sigil[i] as FxQuad;
      // sigil 0.55 -> 1.0 over the howl telegraph; always on (it is the elite's information layer)
      const level = ELITE_FX.sigil.strength + (1.0 - ELITE_FX.sigil.strength) * wind;
      q.color(ELITE_FX.sigil.color[0], ELITE_FX.sigil.color[1], ELITE_FX.sigil.color[2])
        .at(INFO.x, 0.05, INFO.z)
        .size(ELITE_FX.sigil.radius * 2 * Math.max(1, INFO.scale / 1.3));
      q.mesh.rotation.z = sc.reducedMotion ? 0 : t * 0.12;
      q.intensity(level * 2.2 * g);
      // rim breathing at 0.7 Hz (static under reduced motion / flash); a combat rim flash owns the outline while it runs
      if (!rimBusy(ev.id)) {
        const br =
          sc.reducedMotion || sc.reducedFlash
            ? 0
            : ELITE_FX.rim.breathe * Math.sin(t * Math.PI * 2 * ELITE_FX.rim.hz);
        kit.deps.rim(ev.id, ELITE_FX.rim.strength + br, ELITE_FX.rim.color);
      }
      // rising motes (7 / s)
      if (sc.k > 0) {
        this.eliteAcc[i] = (this.eliteAcc[i] as number) + dt * ELITE_FX.motes.rate * sc.k * sc.q;
        while ((this.eliteAcc[i] as number) >= 1) {
          this.eliteAcc[i] = (this.eliteAcc[i] as number) - 1;
          const life =
            ELITE_FX.motes.life[0] + kit.rnd() * (ELITE_FX.motes.life[1] - ELITE_FX.motes.life[0]);
          const mx = INFO.x + (kit.rnd() - 0.5) * 1.2 * INFO.scale;
          const my = INFO.y + 0.2 + kit.rnd() * INFO.height * 0.6;
          const k = this.gate(mx, my, INFO.z);
          const sp = kit.p(
            mx,
            my,
            INFO.z + 0.1,
            0,
            0.5 + kit.rnd() * 0.4,
            0,
            life,
            0.07,
            PK_GLOW,
            ELITE_FX.motes.color as unknown as Rgb,
            0.9,
          );
          sp.r *= k;
          sp.g *= k;
          sp.b *= k;
          sp.sway = 0.4;
          sp.ph = kit.rnd() * 6;
          kit.emitA(sp);
        }
      }
      // howl telegraph: two gold ground rings every 450 ms while the wind-up holds (brief: from the head; on the ground so the
      // expanding line never crosses the plates above the head)
      if (windup && sc.k > 0) {
        this.howlT -= dt;
        if (this.howlT <= 0) {
          this.howlT = HOWL_RING_EVERY;
          kit.lineRing(INFO.x, 0.07, INFO.z, 0.4, 7, 0.45, GOLD_A, GOLD_B, 0.8, true);
          kit.lineRing(INFO.x, 0.07, INFO.z, 0.2, 5, 0.45, GOLD_A, GOLD_B, 0.6, true);
          if (wind > 0.5) kit.shake(0.15, 0.15);
        }
      }
    }
    for (let i = slot; i < MAX_ELITE; i++) (this.sigil[i] as FxQuad).intensity(0);
    if (!howling) this.howlT = 0;
    // ---- riddle leaves ----
    this.updateLeaves(dt, view);
  }

  private updateLeaves(dt: number, view: LevelView): void {
    const kit = this.kit;
    const sc = kit.scale;
    const live = view.minigame?.kind === "riddle";
    for (const lf of this.leaves) {
      if (!lf.on) continue;
      lf.t += dt;
      if (!live && lf.st === 0) {
        lf.on = false;
        continue;
      }
      // position
      if (lf.st === 0 || lf.st === 1) {
        const k = Math.min(1, lf.t / lf.arrive);
        const e = 1 - (1 - k) ** 3;
        if (lf.st === 0) {
          this.retarget(lf);
          lf.x = lf.fromX + (lf.tx - lf.fromX) * e;
          lf.y =
            lf.fromY + (lf.ty - lf.fromY) * e + Math.sin(kit.time * 1.6 + lf.lane * 2) * 0.08 * k;
          lf.z = lf.fromZ + (lf.tz - lf.fromZ) * e;
        }
      } else if (lf.st === 2) {
        lf.vy -= dt * 3;
        lf.y += lf.vy * dt;
        lf.rot += dt * ((Math.PI * 0.7) / 0.5); // +40 deg over ~0.5 s then keeps curling
        if (lf.y < 0.1) {
          lf.on = false;
          continue;
        }
      } else if (lf.st === 3 && lf.t > 0.35) {
        lf.on = false;
        continue;
      }
      if (lf.st === 1 && lf.t > 0.2) {
        lf.on = false;
        continue;
      }
      // draw: a 3-pixel leaf (a tilted bar + a vein pixel) as short-lived pixel particles: one emit per leaf per frame
      // (none while the stage clock is frozen, or the pool would fill with particles that never age)
      if (dt <= 0) continue;
      const sizeK =
        lf.st === 1
          ? 1 + 0.6 * Math.min(1, lf.t / 0.2)
          : lf.st === 2
            ? 1 - 0.2 * Math.min(1, lf.t / 0.4)
            : 1;
      const fade = lf.st === 3 ? 1 - lf.t / 0.35 : 1;
      const hi = lf.pick > 0 ? 1 : 0;
      if (lf.pick > 0) lf.pick = Math.max(0, lf.pick - dt * 2.5);
      const col: Rgb = lf.st === 2 ? WITHER : hi > 0 || lf.st === 1 ? LEAF_HI : LEAF;
      const ca = Math.cos(lf.rot);
      const sa = Math.sin(lf.rot);
      const gl = this.gate(lf.x, lf.y, lf.z);
      for (let j = -1; j <= 1; j++) {
        const ox = j * 0.17 * sizeK;
        const sp = kit.p(
          lf.x + ox * ca,
          lf.y + ox * sa + (j === 0 ? 0.04 : 0),
          lf.z,
          0,
          0,
          0,
          0.06,
          0.16 * sizeK,
          PK_PIXEL,
          col,
          fade,
        );
        sp.r *= gl;
        sp.g *= gl;
        sp.b *= gl;
        kit.emitA(sp);
      }
      // a few drifting motes behind the leaf while it is alive
      if (lf.st === 0 && sc.k > 0) {
        this.leafAcc += dt * 3 * sc.k * sc.q;
        if (this.leafAcc >= 1) {
          this.leafAcc -= 1;
          const sp = kit.p(
            lf.x,
            lf.y,
            lf.z,
            (kit.rnd() - 0.5) * 0.3,
            -0.3,
            0,
            0.8,
            0.05,
            PK_GLOW,
            LEAF,
            0.6,
          );
          sp.sway = 0.3;
          kit.emitA(sp);
        }
      }
    }
  }

  clear(): void {
    for (const q of this.sigil) q.intensity(0);
    for (const l of this.leaves) l.on = false;
    this.seen.length = 0;
    this.freedOn = false;
    this.howlT = 0;
    this.willowId = -1;
  }

  dispose(): void {
    for (const q of this.sigil) q.dispose();
  }
}

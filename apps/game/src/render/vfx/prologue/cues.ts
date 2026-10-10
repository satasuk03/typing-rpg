/**
 * The prologue cue renderers (P3.2): one pure function per `PrologueVfxId`, `(ctx, cue) -> draw calls`. Each is a function of
 * (seed, age, params) and the anchors only: no state, no clock, no Math.random. The cutscene engine hands them the same
 * `ActiveVfx` (fixed seed + age) every frame, so `seek(t)` and a second capture reproduce the frame (pixel diff < 0.5%).
 * Spec: `docs/vfx/prologue-art-direction.md` §3 (one row per id: shape, colour, timing, counts, keep-out).
 *
 * Space: metres, y up, the action plane z = 0 (the camera looks down -z). Nul faces the hero (screen left), so his palm, nib and
 * mask are at -x from his foot anchor (§1.2: palm (cx+25 tx, u 41) = 1.56 m out and 2.56 m up; mask u 53 = 3.3 m).
 */
import { hash as spriteNoise } from "../../sprites/ch2Props";
import { wordgateLetters } from "../../sprites/prologueProps";
import type { FxCtx } from "./ctx";
import { glyphIndex } from "./GlyphBatch";
import { CardShape } from "./InkCards";
import {
  ASH_GREY,
  BONE,
  bezier3,
  CATCH,
  clamp01,
  EMBER,
  EMBER_LIGHT,
  easeInCubic,
  easeInOutSine,
  easeInQuad,
  easeOutCubic,
  emberLevel,
  FIRE_ASH,
  FIRE_GREY,
  FIRE_HOT,
  FOG_GREY,
  GATE_DARKEN,
  GOLD_SPARK,
  HUSH_BOLT,
  INK_DRIP,
  INK_POOL,
  INK_RISE,
  INK_WRITE,
  inkPoolRadius,
  LETTER_VORTEX,
  lerp,
  litFrom,
  MASK_FLASH,
  nulLift,
  type Rgb,
  rnd,
  SILENCE_FOG,
  SKY_TEAR,
  silenceFogDensity,
  skyTearWidth,
  smoothstep,
  TEAR_CORE,
  TEAR_EDGE,
  THEFT,
  THEFT_RGB,
  VIOLET_HEAD,
  VIOLET_IMPACT,
  VIOLET_RIM,
  VIOLET_RIM_END,
  VIOLET_SPARK,
  WARD,
} from "./params";
import type { CueInstance, CueRenderer, PrologueVfxId, RuneStone, V3 } from "./types";

const TAU = Math.PI * 2;

/** A numeric cue param with a default. */
function num(i: CueInstance, name: string, def: number): number {
  const v = i.params?.[name];
  return typeof v === "number" ? v : def;
}

// ---- the three Nul points, in world space (he faces -x, toward the hero)
export const NUL_MASK = { dx: -0.1, y: 3.3, dz: 0.3 } as const;
export const NUL_PALM = { dx: -1.56, y: 2.56, dz: 0.25 } as const;
export const NUL_NIB_CAST = { dx: -2.5, y: 3.4, dz: 0.3 } as const;
const HERO_CHEST_Y = 1.1;
const SCRATCH_A: [number, number, number] = [0, 0, 0];
const SCRATCH_B: [number, number, number] = [0, 0, 0];

/** Nul's point (falls back to an assumed spot 10 m ahead of the hero when no boss is on stage, so a cue never throws). */
function bossAt(c: FxCtx, p: { dx: number; y: number; dz: number }, out: V3): V3 {
  const bx = c.bossOk ? c.boss.x : c.hero.x + 10;
  const by = c.bossOk ? c.boss.y : 0;
  const bz = c.bossOk ? c.boss.z : c.hero.z - 1.7;
  out.x = bx + p.dx;
  out.y = by + p.y;
  out.z = bz + p.dz;
  return out;
}
const P1: V3 = { x: 0, y: 0, z: 0 };
const P2: V3 = { x: 0, y: 0, z: 0 };

// ================================================================================================ inkRise

/** An add rises out of an ink pool: a dark disc on the ground, a violet rim ring, upward ink drips and violet sparks. */
const inkRise: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0 || age >= INK_RISE.total + 700) return;
  const x = num(i, "x", c.boss.x - 4);
  const z = num(i, "z", c.boss.z + 0.8);
  const r = inkPoolRadius(age);
  if (r > 0.01) {
    c.card(CardShape.Disc, x, 0.035, z, r * 2.5, r * 2.5, INK_POOL, 0.9, true);
    // a violet underglow breathes in the pool while it is open
    c.glow(x, 0.12, z, r * 3.2, VIOLET_IMPACT, 0.55 * Math.min(1, r / 0.5));
  }
  if (age >= INK_RISE.rimFrom && age < INK_RISE.rimTo) {
    const u = (age - INK_RISE.rimFrom) / (INK_RISE.rimTo - INK_RISE.rimFrom);
    const rr = lerp(INK_RISE.radius, INK_RISE.rimRadius, easeOutCubic(u));
    c.line(
      x,
      0.05,
      z,
      rr * 2.5,
      rr * 2.5,
      u,
      VIOLET_RIM,
      VIOLET_RIM_END,
      1.8 * (1 - u * 0.4),
      true,
    );
  }
  // 18 upward ink drips (normal blend, vy +1.6..2.6 m/s, life 0.5-0.8 s)
  const nd = c.n(18);
  for (let j = 0; j < nd; j++) {
    const t0 = 120 + rnd(i.seed, j, 1) * 620;
    const life = 500 + rnd(i.seed, j, 2) * 300;
    const tau = (age - t0) / 1000;
    if (tau < 0 || tau * 1000 >= life) continue;
    const ang = rnd(i.seed, j, 3) * TAU;
    const rad = Math.sqrt(rnd(i.seed, j, 4)) * 0.8;
    const vy = 1.6 + rnd(i.seed, j, 5) * 1.0;
    const y = 0.06 + vy * tau - 0.5 * 4.5 * tau * tau;
    const a = Math.min(1, (1 - (tau * 1000) / life) * 2.2);
    c.pn(
      x + Math.cos(ang) * rad,
      Math.max(0.04, y),
      z + Math.sin(ang) * rad * 0.8,
      INK_DRIP,
      0.95 * a,
      0.13,
      1,
    );
  }
  // 10 violet sparks
  const ns = c.n(10);
  for (let j = 0; j < ns; j++) {
    const t0 = 250 + rnd(i.seed, j, 11) * 450;
    const tau = (age - t0) / 1000;
    if (tau < 0 || tau >= 0.55) continue;
    const ang = rnd(i.seed, j, 12) * TAU;
    const rad = Math.sqrt(rnd(i.seed, j, 13)) * 0.9;
    const a = Math.min(1, (1 - tau / 0.55) * 2.2);
    c.pa(
      x + Math.cos(ang) * rad,
      0.15 + 1.2 * tau,
      z + Math.sin(ang) * rad * 0.8,
      VIOLET_SPARK,
      1.0 * a,
      0.12,
      0,
    );
  }
};

// ================================================================================================ skyTear

/** A vertical violet slit with a white core above Nul: opens in 400 ms, holds, closes (`mode: "close"` or `closeAt` ms). */
const skyTear: CueRenderer = (c, i) => {
  const age = i.ageMs;
  const mode = i.params?.mode;
  const closeAtParam = i.params?.closeAt;
  const closeAt = mode === "close" ? 0 : typeof closeAtParam === "number" ? closeAtParam : null;
  if (age < 0) return;
  const w = skyTearWidth(age, closeAt);
  const tx = c.tear.x;
  const ty = c.tear.y;
  const tz = c.tear.z;
  const closing = closeAt !== null && age >= closeAt;
  const lineAge = closeAt !== null ? age - closeAt - SKY_TEAR.closeMs : -1;
  if (w > 0.01) {
    const pulse = 1 + 0.05 * Math.sin((age / 1000) * 9);
    const wd = w * pulse;
    const hh = SKY_TEAR.h * 0.6;
    const white = closing && lineAge >= 0 ? 1.8 : 1;
    // a dark ink lens behind the light: the tear reads as a hole against the bright dusk sky (normal blend)
    c.card(
      CardShape.Slit,
      tx,
      ty,
      tz - 0.05,
      wd * 1.9 + 0.2,
      SKY_TEAR.h * 1.25,
      [0.03, 0.012, 0.09],
      0.92,
      false,
    );
    // two beams meet at the tear anchor: bright at the middle, fading up and down (the slit is 9 m tall, top off frame)
    c.beam(tx, ty + hh / 2, tz, wd, hh, false, TEAR_EDGE, TEAR_CORE, 1.6 * white);
    c.beam(tx, ty - hh / 2, tz, wd, hh, true, TEAR_EDGE, TEAR_CORE, 1.6 * white);
    // a soft violet halo behind it
    c.glow(tx, ty, tz - 0.1, 3.6 + wd * 1.8, TEAR_EDGE, 0.8);
    // 6 short lightning crackles along the slit edge (re-rolled every 70 ms from the seed: a flicker, not a state)
    const tick = Math.floor(age / 70);
    for (let a = 0; a < 6; a++) {
      if (rnd(i.seed, a, tick * 3 + 1) < 0.3) continue;
      const side = a % 2 === 0 ? -1 : 1;
      let px = tx + side * wd * 0.4;
      let py = ty - 2.4 + rnd(i.seed, a, tick * 3 + 2) * 4.8;
      for (let s = 0; s < 6; s++) {
        const dx = (rnd(i.seed, a * 10 + s, tick * 3 + 3) - 0.5) * 0.5;
        const dy = (rnd(i.seed, a * 10 + s + 50, tick * 3 + 3) - 0.5) * 0.5;
        c.pa(px, py, tz + 0.05, TEAR_CORE, 0.9, 0.09, 2, dx * 8, dy * 8, 0, 0.9);
        px += dx;
        py += dy;
      }
    }
    // 24 motes falling out of the slit (vy -1.2), looping while it is open
    const nm = c.n(24);
    for (let m = 0; m < nm; m++) {
      const life = 2.0;
      const tau = (((age / 1000 + rnd(i.seed, m, 21) * life) % life) + life) % life;
      const x = tx + (rnd(i.seed, m, 22) - 0.5) * wd * 0.9;
      const y = ty - 1.2 * tau;
      const a = Math.sin((tau / life) * Math.PI);
      c.pa(
        x,
        y,
        tz + (rnd(i.seed, m, 23) - 0.5) * 0.4,
        VIOLET_SPARK,
        0.8 * a * Math.min(1, w / 0.8),
        0.06,
        0,
      );
    }
  }
  // post: an open flash 0.10 capped (R6) and a vignette pulse (+0.2)
  if (age < 600) {
    c.out.vignette = Math.max(c.out.vignette, 0.2 * (1 - age / 600) * c.k);
    if (age < 160) c.out.flash = Math.max(c.out.flash, 0.1 * (1 - age / 160) * c.flashK * c.k);
  }
  if (closeAt !== null && age >= closeAt && age < closeAt + SKY_TEAR.closeMs + SKY_TEAR.lineMs) {
    const u = (age - closeAt) / (SKY_TEAR.closeMs + SKY_TEAR.lineMs);
    c.out.vignette = Math.max(c.out.vignette, 0.2 * Math.sin(u * Math.PI) * c.k);
  }
};

// ================================================================================================ hushBolt

const NIB: V3 = { x: 0, y: 0, z: 0 };
const BOLT_A: [number, number, number] = [0, 0, 0];

/** Where the bolt is at flight progress u (0..1): a quick drop to the plate-free row (y <= 1.6), then straight at the chest. */
function boltPos(out: [number, number, number], u: number, s: V3, e: V3): [number, number, number] {
  const sx = easeInQuad(u);
  out[0] = lerp(s.x, e.x, sx);
  out[2] = lerp(s.z, e.z, sx);
  const low = e.y + 0.3;
  out[1] = u < 0.3 ? lerp(s.y, low, easeOutCubic(u / 0.3)) : lerp(low, e.y, (u - 0.3) / 0.7);
  return out;
}

/** Nul's ink lance: windup at the nib (160 ms), 280 ms flight nib -> hero chest, impact disc + flakes (220 ms). */
const hushBolt: CueRenderer = (c, i) => {
  const age = i.ageMs;
  const W = HUSH_BOLT;
  if (age < 0 || age > W.windupMs + W.flightMs + W.impactMs + 300) return;
  bossAt(c, NUL_NIB_CAST, NIB);
  const hx = c.hero.x + 0.1;
  const hz = c.hero.z + 0.2;
  const end: V3 = { x: hx, y: HERO_CHEST_Y, z: hz };
  if (age < W.windupMs) {
    const u = age / W.windupMs;
    const k = c.keepK(NIB.x, NIB.y, NIB.z);
    c.glow(NIB.x, NIB.y, NIB.z, 0.3 + 0.8 * u, VIOLET_HEAD, 1.3 * u * k);
    c.star(NIB.x, NIB.y, NIB.z + 0.05, 0.5 + 0.6 * u, VIOLET_HEAD, 0.9 * u * k);
    return;
  }
  const fu = clamp01((age - W.windupMs) / W.flightMs);
  if (fu < 1 || age < W.windupMs + W.flightMs + 40) {
    const head = boltPos(BOLT_A, fu, NIB, end);
    const k = c.keepK(head[0], head[1], head[2]);
    const cap = Math.min(1.4, 1.6) * k;
    // 14 dark trail blobs behind the head (normal blend) + the 2.4 m dark body streak
    const nt = c.n(14);
    for (let j = 1; j <= nt; j++) {
      const uj = Math.max(0, fu - j * 0.028);
      const p = boltPos(SCRATCH_A, uj, NIB, end);
      c.pn(
        p[0],
        p[1],
        p[2],
        [0.05, 0.03, 0.1],
        0.7 * (1 - j / (nt + 2)),
        0.6 * (1 - j / (nt * 1.6)),
        0,
      );
      if (j % 2 === 0) c.pa(p[0], p[1], p[2], VIOLET_SPARK, 0.7 * (1 - j / (nt + 2)) * k, 0.1, 0);
    }
    const back = boltPos(SCRATCH_B, Math.max(0, fu - 0.09), NIB, end);
    const vx = head[0] - back[0];
    const vy = head[1] - back[1];
    const vz = head[2] - back[2];
    const vl = Math.hypot(vx, vy, vz) || 1;
    c.pn(
      (head[0] + back[0]) / 2,
      (head[1] + back[1]) / 2,
      (head[2] + back[2]) / 2,
      [0.05, 0.03, 0.1],
      0.97,
      0.5,
      2,
      (vx / vl) * 11,
      (vy / vl) * 11,
      (vz / vl) * 11,
      1.0,
    );
    // a thin bright violet core streak along the lance
    c.pa(
      (head[0] + back[0]) / 2,
      (head[1] + back[1]) / 2,
      (head[2] + back[2]) / 2 + 0.05,
      VIOLET_HEAD,
      0.9 * k,
      0.12,
      2,
      (vx / vl) * 11,
      (vy / vl) * 11,
      (vz / vl) * 11,
      1.0,
    );
    // the violet head: a glow 0.5 m and a ring 0.3 m (<= 1.4 HDR near plates)
    c.glow(head[0], head[1], head[2], 1.5, VIOLET_HEAD, cap);
    c.star(head[0], head[1], head[2] + 0.03, 0.7, VIOLET_HEAD, 0.8 * k);
    c.line(
      head[0],
      head[1],
      head[2] + 0.02,
      0.55,
      0.55,
      0.2,
      VIOLET_HEAD,
      VIOLET_IMPACT,
      1.2 * k,
      false,
    );
    c.light(1, head[0], head[1], head[2] + 0.5, VIOLET_IMPACT, 0.5 * k, 3);
  }
  const ia = age - W.windupMs - W.flightMs;
  if (ia >= 0 && ia < W.impactMs) {
    const u = ia / W.impactMs;
    const k = c.keepK(end.x, end.y, end.z);
    c.disc(
      end.x,
      end.y,
      end.z + 0.1,
      1.6 * easeOutCubic(u),
      VIOLET_IMPACT,
      VIOLET_HEAD,
      1.0 * (1 - u) * k,
    );
    c.out.heroRim = Math.max(c.out.heroRim, 0.5 * (1 - u));
    const nf = c.n(10);
    for (let j = 0; j < nf; j++) {
      const ang = rnd(i.seed, j, 31) * TAU;
      const sp = 1.2 + rnd(i.seed, j, 32) * 1.6;
      const tau = ia / 1000;
      c.pn(
        end.x + Math.cos(ang) * sp * tau,
        end.y + Math.sin(ang) * sp * tau - 3 * tau * tau,
        end.z + 0.15,
        [0.05, 0.03, 0.1],
        0.9 * (1 - u),
        0.09,
        1,
      );
    }
    const ns = c.n(6);
    for (let j = 0; j < ns; j++) {
      const ang = rnd(i.seed, j, 33) * TAU;
      const sp = 2 + rnd(i.seed, j, 34) * 2;
      const tau = ia / 1000;
      c.pa(
        end.x + Math.cos(ang) * sp * tau,
        end.y + Math.sin(ang) * sp * tau,
        end.z + 0.2,
        VIOLET_SPARK,
        0.9 * (1 - u) * k,
        0.07,
        2,
        Math.cos(ang) * sp,
        Math.sin(ang) * sp,
        0,
        0.06,
      );
    }
  }
};

// ================================================================================================ ward

/**
 * Nul's ward while his HP is clamped: a RIM-ONLY ellipse outline (never an additive fill over the body: P3), 10 slow violet
 * sparks riding it and 6 ink flakes peeling off. `params.out` = ms since the ward ended (fades out 400 ms); `params.hit` = ms
 * since the last hit while clamped (a ripple 1.0 -> 1.06 -> 1.0 in 180 ms plus 6 sparks).
 */
const ward: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0) return;
  const outAge = num(i, "out", -1);
  const env =
    clamp01(age / WARD.fadeInMs) * (outAge >= 0 ? 1 - clamp01(outAge / WARD.fadeOutMs) : 1);
  if (env <= 0.01) return;
  const hitAge = num(i, "hit", -1);
  const ripple =
    hitAge >= 0 && hitAge < WARD.rippleMs
      ? 1 + 0.06 * Math.sin((hitAge / WARD.rippleMs) * Math.PI)
      : 1;
  bossAt(c, { dx: 0, y: WARD.cy, dz: WARD.dz }, P1);
  const pulse = 0.9 + 0.15 * Math.sin((age / 1000) * TAU * 0.8);
  const k = c.keepK(P1.x, P1.y + WARD.h * 0.5, P1.z);
  c.line(
    P1.x,
    P1.y,
    P1.z,
    WARD.w * ripple,
    WARD.h * ripple,
    0.35,
    VIOLET_RIM,
    VIOLET_RIM_END,
    0.9 * pulse * env * k,
  );
  const rx = (WARD.w / 2) * ripple;
  const ry = (WARD.h / 2) * ripple;
  const ns = c.n(10);
  for (let j = 0; j < ns; j++) {
    const th = (j / ns) * TAU + (age / 1000) * 0.35;
    c.pa(
      P1.x + Math.cos(th) * rx,
      P1.y + Math.sin(th) * ry,
      P1.z + 0.05,
      VIOLET_SPARK,
      1.0 * env * k,
      0.12,
      0,
    );
  }
  const nf = c.n(6);
  for (let j = 0; j < nf; j++) {
    const period = 1.8;
    const ph = (((age / 1000 / period + j / nf) % 1) + 1) % 1;
    const th = rnd(i.seed, j, 41) * TAU;
    const nx = Math.cos(th);
    const ny = Math.sin(th);
    c.pn(
      P1.x + nx * (rx + 0.55 * ph),
      P1.y + ny * (ry + 0.55 * ph) - 0.6 * ph * ph,
      P1.z + 0.1,
      [0.06, 0.04, 0.12],
      0.95 * (1 - ph) * env,
      0.12,
      1,
    );
  }
  if (hitAge >= 0 && hitAge < 500) {
    const u = hitAge / 500;
    for (let j = 0; j < c.n(6); j++) {
      const th = rnd(i.seed, j, 43 + Math.floor(hitAge * 0)) * TAU;
      const sp = 1.4 + rnd(i.seed, j, 44) * 1.4;
      c.pa(
        P1.x + Math.cos(th) * (rx + sp * u * 0.5),
        P1.y + Math.sin(th) * (ry + sp * u * 0.5),
        P1.z + 0.1,
        VIOLET_SPARK,
        0.9 * (1 - u) * k,
        0.08,
        2,
        Math.cos(th) * sp,
        Math.sin(th) * sp,
        0,
        0.06,
      );
    }
  }
};

// ================================================================================================ surgeAura

/** The surge is `HeroAura`'s (floor tier + build-up): this cue only asks for it; `PrologueFx` forwards `params.mult` (1/2/4/8/16). */
const surgeAura: CueRenderer = (c, i) => {
  if (i.ageMs < 0) return;
  c.out.auraSurge = num(i, "mult", 1);
};

// ================================================================================================ catchFireball

/** Part C 0.0: the last Fireball freezes in Nul's palm, goes orange -> grey ink, cracks and crumbles into falling ink grains. */
const catchFireball: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0 || age > CATCH.crumbleTo + 600) return;
  bossAt(c, NUL_PALM, P1);
  const { x, y, z } = P1;
  const u = smoothstep(CATCH.lerpFrom, CATCH.lerpTo, age);
  const flick = 1 + 0.08 * Math.sin((age / 1000) * 31) + 0.05 * Math.sin((age / 1000) * 17 + 1);
  const bodyOn = age < CATCH.crackTo + 100;
  const shrink = age < CATCH.crackTo ? 1 : 1 - clamp01((age - CATCH.crackTo) / 100);
  if (bodyOn) {
    const col: Rgb = [
      lerp(FIRE_HOT[0], FIRE_GREY[0], u),
      lerp(FIRE_HOT[1], FIRE_GREY[1], u),
      lerp(FIRE_HOT[2], FIRE_GREY[2], u),
    ];
    c.glow(x, y, z, 2.4 * flick * shrink, col, 0.7 * (1 - 0.35 * u));
    c.glow(
      x,
      y,
      z + 0.05,
      1.1 * flick * shrink,
      [col[0] * 1.2, col[1] * 1.1, col[2]],
      0.9 * (1 - 0.6 * u),
    );
    c.star(x, y, z + 0.08, 1.5 * shrink, col, 0.9 * (1 - u));
    // flame pixels licking the frozen ball (die out as it greys)
    const nf = c.n(10);
    for (let j = 0; j < nf; j++) {
      const ph = ((age / 1000) * 1.7 + rnd(i.seed, j, 51)) % 1;
      const th = rnd(i.seed, j, 52) * TAU;
      c.pa(
        x + Math.cos(th) * 0.6 * (1 - 0.4 * ph),
        y + 0.1 + ph * 1.1,
        z + 0.1,
        col,
        0.95 * (1 - ph) * (1 - u) * shrink,
        0.16,
        1,
      );
    }
    // the fire light fades with the colour (1.0 -> 0)
    c.light(0, x, y, z + 0.9, FIRE_HOT, 1.0 * (1 - u), 4.5);
  }
  // crack: 6 radial slivers (1100-1200)
  if (age >= CATCH.lerpTo && age < CATCH.crackTo) {
    const cu = (age - CATCH.lerpTo) / (CATCH.crackTo - CATCH.lerpTo);
    for (let j = 0; j < 6; j++) {
      const th = (j / 6) * TAU + 0.4;
      const r0 = 0.12 + 0.4 * cu;
      c.pa(
        x + Math.cos(th) * r0,
        y + Math.sin(th) * r0,
        z + 0.12,
        [1.6, 1.6, 1.7],
        0.9,
        0.05,
        2,
        Math.cos(th) * 6,
        Math.sin(th) * 6,
        0,
        1.4,
      );
    }
  }
  // crumble: 22 ink grains (gravity 3, vy -0.4), 8 dying sparks, 1 grey smoke puff
  if (age >= CATCH.crackTo) {
    const ng = c.n(22);
    for (let j = 0; j < ng; j++) {
      const tau = (age - CATCH.crackTo - rnd(i.seed, j, 53) * 160) / 1000;
      if (tau < 0 || tau > 0.8) continue;
      const th = rnd(i.seed, j, 54) * TAU;
      const rr = Math.sqrt(rnd(i.seed, j, 55)) * 0.38;
      const a = Math.min(1, (1 - tau / 0.8) * 2.2);
      c.pn(
        x + Math.cos(th) * rr + (rnd(i.seed, j, 56) - 0.5) * 0.3 * tau,
        Math.max(0.05, y + Math.sin(th) * rr * 0.6 - 0.4 * tau - 1.5 * tau * tau),
        z + 0.1,
        FIRE_ASH,
        0.95 * a,
        0.06 + rnd(i.seed, j, 57) * 0.04,
        1,
      );
    }
    const nsp = c.n(8);
    for (let j = 0; j < nsp; j++) {
      const tau = (age - CATCH.crackTo - rnd(i.seed, j, 58) * 120) / 1000;
      if (tau < 0 || tau > 0.5) continue;
      const th = rnd(i.seed, j, 59) * TAU;
      c.pa(
        x + Math.cos(th) * 0.3 * (1 + tau * 2),
        y - 0.25 * tau - 2 * tau * tau,
        z + 0.1,
        FIRE_GREY,
        0.8 * (1 - tau / 0.5),
        0.05,
        0,
      );
    }
    const su = clamp01((age - CATCH.lerpTo) / (CATCH.crumbleTo - CATCH.lerpTo));
    c.pn(
      x,
      y + 0.2 + 0.5 * su,
      z - 0.05,
      [0.18, 0.18, 0.2],
      0.45 * (1 - su) * Math.min(1, su * 6),
      0.5 + 0.9 * su,
      0,
    );
  }
};

// ================================================================================================ inkWrite

/** Where the quill nib is for letter `idx` (3 strokes at chest height: the `write` frames' arc, hand 2.4 / 2.56 / 2.75 m). */
function nibWrite(c: FxCtx, idx: number, out: V3): V3 {
  const s = idx % 3;
  return bossAt(c, { dx: -1.55 + 0.2 * s, y: 2.4 + 0.18 * s, dz: 0.3 }, out);
}

/** The world half of the ink line: nib sparks per letter (4 each, 260 ms) and a small violet glow that follows the nib. */
const inkWrite: CueRenderer = (c, i) => {
  const age = i.ageMs;
  const charMs = num(i, "charMs", INK_WRITE.charMs);
  const n = Math.max(1, Math.round(num(i, "chars", 14)));
  if (age < 0 || age > n * charMs + 400) return;
  const idx = Math.min(n - 1, Math.floor(age / charMs));
  const frac = clamp01((age - idx * charMs) / charMs);
  nibWrite(c, idx, P1);
  nibWrite(c, idx + 1, P2);
  const gx = lerp(P1.x, P2.x, easeInOutSine(frac));
  const gy = lerp(P1.y, P2.y, easeInOutSine(frac));
  const live = age < n * charMs ? 1 : 1 - (age - n * charMs) / 400;
  const k = c.keepK(gx, gy, P1.z);
  c.glow(gx, gy, P1.z, 0.5, [1.0, 0.4, 2.2], 0.9 * live * k);
  for (let j = Math.max(0, idx - 2); j <= idx; j++) {
    const tau = (age - j * charMs) / INK_WRITE.sparkLifeMs;
    if (tau < 0 || tau >= 1) continue;
    nibWrite(c, j, P2);
    const kk = c.keepK(P2.x, P2.y, P2.z);
    const ns = c.n(4);
    for (let s = 0; s < ns; s++) {
      const th = rnd(i.seed, j * 4 + s, 61) * TAU;
      const sp = 0.8 + rnd(i.seed, j * 4 + s, 62) * 1.2;
      const t = tau * (INK_WRITE.sparkLifeMs / 1000);
      c.pa(
        P2.x + Math.cos(th) * sp * t,
        P2.y + Math.sin(th) * sp * t - 2.4 * t * t,
        P2.z + 0.1,
        VIOLET_HEAD,
        1.0 * (1 - tau) * kk,
        0.1,
        2,
        Math.cos(th) * sp,
        Math.sin(th) * sp,
        0,
        0.09,
      );
    }
  }
};

// ================================================================================================ theftStream

/** One stolen skill: a bezier ribbon of 40 motes in the skill's colour from the hero's chest to Nul's mask, with a bright head. */
const theftStream: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0 || age > THEFT.drainEnd + 360) return;
  const kIdx = Math.min(6, Math.max(1, Math.round(num(i, "k", 1))));
  const col = THEFT_RGB[kIdx - 1] as Rgb;
  const p0: V3 = { x: c.hero.x + 0.15, y: HERO_CHEST_Y, z: c.hero.z + 0.2 };
  bossAt(c, NUL_MASK, P1);
  const p3: V3 = P1;
  const sgn = kIdx % 2 === 1 ? 1 : -1;
  const A: [number, number, number] = [
    lerp(p0.x, p3.x, 0.33),
    lerp(p0.y, p3.y, 0.33) + (sgn > 0 ? 2.2 : 1.1),
    lerp(p0.z, p3.z, 0.33) + sgn * 1.0,
  ];
  const B: [number, number, number] = [
    lerp(p0.x, p3.x, 0.66) + (sgn > 0 ? 0 : 1.6),
    lerp(p0.y, p3.y, 0.66) + (sgn > 0 ? 1.8 : 2.2),
    lerp(p0.z, p3.z, 0.66) - sgn * 1.0,
  ];
  const p0t: [number, number, number] = [p0.x, p0.y, p0.z];
  const p3t: [number, number, number] = [p3.x, p3.y, p3.z];
  // 0-120: the icon cracks (HUD); a small charge flash at the chest
  if (age < THEFT.crackMs + 100) {
    const u = age / THEFT.crackMs;
    c.glow(
      p0.x,
      p0.y,
      p0.z + 0.1,
      0.45 + 0.4 * u,
      col,
      0.6 * Math.min(1, u * 1.5) * (1 - clamp01((age - THEFT.crackMs) / 100)),
    );
  }
  const fu = easeInOutSine((age - THEFT.crackMs) / (THEFT.flyEnd - THEFT.crackMs));
  const drain = clamp01((age - THEFT.flyEnd) / (THEFT.drainEnd - THEFT.flyEnd));
  if (age >= THEFT.crackMs && age < THEFT.drainEnd) {
    const nm = c.n(THEFT.motes);
    const tail = 0.36;
    for (let j = nm - 1; j >= 0; j--) {
      const f = j / nm;
      const s = clamp01(fu - f * tail * (1 - drain));
      const pt = bezier3(SCRATCH_A, s, p0t, A, B, p3t);
      const wob = 0.1 * (1 - f) * Math.sin((age / 1000) * 11 + j * 1.9);
      const a =
        (1 - f) ** 1.3 * (1 - drain) * (age < THEFT.crackMs + 60 ? (age - THEFT.crackMs) / 60 : 1);
      c.pa(pt[0], pt[1] + wob, pt[2] + wob * 0.6, col, 1.0 * a, 0.3 + 0.45 * (1 - f), 0);
      if (j % 2 === 0) {
        const ahead = bezier3(SCRATCH_B, clamp01(s + 0.02), p0t, A, B, p3t);
        c.pa(
          pt[0],
          pt[1] + wob,
          pt[2] + wob * 0.6,
          col,
          1.0 * a,
          0.12,
          2,
          (ahead[0] - pt[0]) * 60,
          (ahead[1] - pt[1]) * 60,
          (ahead[2] - pt[2]) * 60,
          0.5,
        );
      }
      if (j % 3 === 0) c.pa(pt[0] + wob * 2, pt[1] - wob, pt[2], col, 1.0 * a, 0.09, 1);
    }
    const head = bezier3(SCRATCH_B, clamp01(fu), p0t, A, B, p3t);
    const k = c.keepK(head[0], head[1], head[2]);
    c.glow(head[0], head[1], head[2], 1.9, col, 1.6 * (1 - drain) * k);
    c.star(head[0], head[1], head[2] + 0.05, 1.3, col, 1.0 * (1 - drain) * k);
    c.light(1, head[0], head[1], head[2] + 0.6, col, 0.8 * (1 - drain) * k, 3.2);
  }
  // 820: arrival: the mask flares (the eye slits go to #f2d8ff for 120 ms)
  if (age >= THEFT.flyEnd && age < THEFT.flyEnd + 280) {
    const u = (age - THEFT.flyEnd) / 280;
    const k = c.keepK(p3.x, p3.y, p3.z);
    c.glow(p3.x, p3.y, p3.z + 0.1, 0.9 + 0.5 * u, MASK_FLASH, 1.2 * (1 - u) * c.flashK * k);
    c.star(
      p3.x,
      p3.y,
      p3.z + 0.12,
      0.9,
      [col[0] * 0.8 + 0.6, col[1] * 0.8 + 0.6, col[2] * 0.8 + 0.6],
      0.9 * (1 - u) * c.flashK * k,
    );
  }
};

// ================================================================================================ auraCollapse

/** Part C 20.0: the aura's rings and pillar are `HeroAura.setCollapse`; this adds the grey smoke puff and the last sparks falling. */
const auraCollapse: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0) return;
  c.out.auraCollapseMs = age;
  const hx = c.hero.x;
  const hz = c.hero.z;
  const nsm = c.n(14);
  for (let j = 0; j < nsm; j++) {
    const tau = (age - 760 - j * 30) / 1000;
    if (tau < 0 || tau > 1.0) continue;
    const th = rnd(i.seed, j, 71) * TAU;
    const a = Math.min(1, (1 - tau) * 2.2);
    c.pn(
      hx + Math.cos(th) * 0.45 * (0.4 + tau),
      0.5 + (j % 4) * 0.22 + 0.7 * tau,
      hz + 0.2 + Math.sin(th) * 0.25,
      [0.18, 0.18, 0.2],
      0.8 * a,
      0.5 + 0.7 * tau,
      0,
    );
  }
  const nsp = c.n(8);
  for (let j = 0; j < nsp; j++) {
    const tau = (age - 700 - rnd(i.seed, j, 72) * 140) / 1000;
    if (tau < 0 || tau > 0.9) continue;
    const th = rnd(i.seed, j, 73) * TAU;
    const rr = 0.3 + rnd(i.seed, j, 74) * 0.6;
    c.pa(
      hx + Math.cos(th) * rr,
      1.5 + 0.4 * Math.sin(th) - 0.4 * tau - 2.2 * tau * tau,
      hz + 0.2,
      [1.4, 1.4, 1.5],
      0.85 * (1 - tau / 0.9),
      0.05,
      0,
    );
  }
};

// ================================================================================================ gateDarken

/** Texel -> world for the gate's glyph cells (192 x 200 texels, 16 tx/m, foot-centre anchor, scaled by the layout). */
const GATE_TX = { w: 192, h: 200, ppm: 16, cx: 96 } as const;
const GLYPHS = wordgateLetters() as readonly { x: number; y: number; ch: string }[];
export const GATE_GLYPH_COUNT = GLYPHS.length;

/** The three runestones (`registerPrologueProps`): sprite seed, width, height, letters, lean. The glyph column is `makeRunestone`'s. */
const RUNESTONES = [
  { seed: 3, w: 36, h: 76, text: "FIRE", lean: 1 },
  { seed: 11, w: 30, h: 58, text: "WORD", lean: -1 },
  { seed: 19, w: 42, h: 50, text: "HOPE", lean: 0 },
] as const;

/** World offsets (m from the stone's foot, unflipped) of stone `n`'s lit letters, top to bottom. */
export function runeGlyphOffsets(n: number): { dx: number; y: number }[] {
  const s = RUNESTONES[n];
  if (!s) return [];
  const W = s.w + 8;
  const cx = W / 2;
  const top = 6 + Math.abs(spriteNoise(Math.floor((cx + s.seed) / 5), s.seed)) * 7;
  const y0 = top + 12;
  const span = s.h - 14 - y0;
  const out: { dx: number; y: number }[] = [];
  for (let k = 0; k < s.text.length; k++) {
    const gy = y0 + ((k + 0.5) * span) / s.text.length;
    const gx = cx + s.lean * (1 - gy / s.h) * 3;
    out.push({ dx: (gx - cx) / GATE_TX.ppm, y: (s.h + 3 - gy) / GATE_TX.ppm });
  }
  return out;
}

/**
 * The gate's lit letters go dark one by one (120 ms apart, left to right, each fading over 160 ms) with a gold spark each. The
 * runestones' letters go with it: a stone's column starts when the sweep reaches its x (left stones at once, right stones at the
 * end) and goes top to bottom at the same 120 ms pace.
 */
const gateDarken: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0) return;
  const g = c.gate;
  const sc = g.scale;
  const cell = (8 / GATE_TX.ppm) * sc * 1.0;
  const patch = (
    j: number,
    startMs: number,
    wx: number,
    wy: number,
    wz: number,
    size: number,
  ): void => {
    const lit = litFrom(startMs, age);
    if (lit < 0.999) c.pn(wx, wy, wz, [0.016, 0.012, 0.009], 0.98 * (1 - lit), size, 1);
    // 2 gold motes (up 0.4 m) as it goes out
    const tau = (age - startMs) / GATE_DARKEN.sparkMs;
    if (tau > 0 && tau < 1) {
      for (let s = 0; s < 2; s++) {
        const dx = (rnd(i.seed, j, 80 + s) - 0.5) * 0.25;
        c.pa(
          wx + dx,
          wy + 0.4 * easeOutCubic(tau),
          wz + 0.04,
          GOLD_SPARK,
          0.9 * (1 - tau),
          0.05,
          0,
        );
      }
    }
  };
  for (let j = 0; j < GLYPHS.length; j++) {
    const gl = GLYPHS[j] as { x: number; y: number };
    patch(
      j,
      j * GATE_DARKEN.perGlyphMs,
      g.x + ((gl.x - GATE_TX.cx) / GATE_TX.ppm) * sc,
      g.y + ((GATE_TX.h - gl.y) / GATE_TX.ppm) * sc,
      g.z + 0.06,
      cell * 0.88,
    );
  }
  const sweep = (GLYPHS.length - 1) * GATE_DARKEN.perGlyphMs;
  for (let r = 0; r < c.runeN; r++) {
    const st = c.runes[r] as RuneStone;
    const offs = runeGlyphOffsets(st.n);
    const t0 = clamp01((st.x - (g.x - 5.5)) / 11) * sweep;
    for (let k = 0; k < offs.length; k++) {
      const o = offs[k] as { dx: number; y: number };
      patch(
        1000 + r * 10 + k,
        t0 + k * GATE_DARKEN.perGlyphMs,
        st.x + (st.flip ? -o.dx : o.dx) * st.scale,
        st.y + o.y * st.scale,
        st.z + 0.06,
        cell * 0.88 * (st.scale / sc),
      );
    }
  }
};

// ================================================================================================ letterVortex

const VORTEX_TEXT = "SILENCEHUSHWORDSFADEQUIETUNWRITEMUTEBLANKVOID";

/** Part C 31.0: a spiral of 3x5 pixel letters around Nul as he rises (2 rev/s, radius 1.8 -> 0.6 m, <= 120 live at tier 0). */
const letterVortex: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0) return;
  const V = LETTER_VORTEX;
  const rate = V.ratePerS * c.q * c.k;
  if (rate <= 0) return;
  const nTotal = Math.floor((V.spawnMs / 1000) * rate);
  const first = Math.max(0, Math.floor((age / 1000 - V.lifeS) * rate));
  const last = Math.min(nTotal - 1, Math.floor((age / 1000) * rate));
  const bossY = c.bossOk ? c.boss.y : 0;
  const bx = c.bossOk ? c.boss.x : c.hero.x + 10;
  const bz = c.bossOk ? c.boss.z : c.hero.z - 1.7;
  let live = 0;
  for (let n = last; n >= first && live < V.maxLive; n--) {
    const tau = age / 1000 - n / rate;
    if (tau < 0 || tau >= V.lifeS) continue;
    const u = tau / V.lifeS;
    const th = rnd(i.seed, n, 91) * TAU + TAU * 2 * tau;
    // P3.6: the spiral never closes in on the cloak (a glyph on his body read as a sticker): 2.8 -> 1.9 m, and a letter whose
    // column is over the cloak (in front of it OR behind it: the glyph pass draws over the sprite) is dimmed, so Nul stays
    // readable while he rises and the letters read as a ring around him
    const r = lerp(2.8, 1.9, u);
    const y = Math.max(1.5, 1.5 + bossY + u * 5 + (rnd(i.seed, n, 92) - 0.5) * 1.2);
    const x = bx + Math.cos(th) * r;
    const z = bz + Math.sin(th) * r * 0.7;
    const onCloak = Math.abs(x - bx) < 1.35 ? 0.12 : 1;
    const a = smoothstep(0, 0.1, u) * (1 - smoothstep(0.7, 1, u)) * onCloak;
    const ch = VORTEX_TEXT[
      (n * 7 + Math.floor(rnd(i.seed, n, 93) * 5)) % VORTEX_TEXT.length
    ] as string;
    c.glyph(x, y, z, 0.72, glyphIndex(ch), Math.sin(th) * 0.25, BONE, a);
    if (n % 3 === 0) c.pa(x, y, z - 0.02, [0.8, 0.4, 2.0], 0.22 * a, 0.55, 0);
    live++;
  }
};

// ================================================================================================ silenceFog

/** Part C 31.0+: the mood fog density ramps (`out.fogDensity`), 6 grey fog cards roll toward the camera, grey ash falls. */
const silenceFog: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0) return;
  const S = SILENCE_FOG;
  c.out.fogDensity = silenceFogDensity(age);
  const g = c.gate;
  const nc = Math.max(1, Math.round(S.cards * (c.tier >= 2 ? 0.7 : 1)));
  for (let j = 0; j < nc; j++) {
    const t = age / 1000 - S.cardFromMs / 1000 - j * 0.22;
    if (t < 0) continue;
    const zz = g.z + S.speed * t;
    const span = 22;
    if (zz - g.z > span) continue;
    const f = smoothstep(0, 3, zz - g.z) * (1 - smoothstep(span - 4, span, zz - g.z));
    const x = c.hero.x + 4 + (j - (nc - 1) / 2) * 3.2 + (rnd(i.seed, j, 101) - 0.5) * 1.5;
    // keep the hero's silhouette: a card passing the hero's depth thins out in front of him
    const nearHero = Math.abs(x - c.hero.x) < 3.2 && Math.abs(zz - c.hero.z) < 1.6 ? 0.4 : 1;
    c.card(
      CardShape.Fog,
      x,
      1.7,
      zz,
      7,
      3.6,
      FOG_GREY,
      0.55 * f * nearHero,
      false,
      j * 3.1 + rnd(i.seed, j, 102) * 10,
    );
  }
  const rate = S.ashPerS * c.q * c.k * (c.tier === 0 ? 1.0 : 1.0);
  if (rate <= 0) return;
  const first = Math.max(0, Math.floor((age / 1000 - S.ashLifeS) * rate));
  const last = Math.floor((age / 1000) * rate);
  let live = 0;
  for (let n = last; n >= first && live < 48; n--) {
    const tau = age / 1000 - n / rate;
    if (tau < 0 || tau >= S.ashLifeS) continue;
    const u = tau / S.ashLifeS;
    const x =
      c.hero.x +
      4 +
      (rnd(i.seed, n, 111) - 0.5) * 16 +
      Math.sin(tau * 0.8 + rnd(i.seed, n, 112) * TAU) * 0.6;
    const y = 0.5 + rnd(i.seed, n, 113) * 5.5 - 0.25 * tau;
    const z = c.hero.z - 3 + rnd(i.seed, n, 114) * 6;
    c.pn(x, y, z, ASH_GREY, 0.85 * smoothstep(0, 0.12, u) * (1 - smoothstep(0.8, 1, u)), 0.06, 1);
    live++;
  }
};

// ================================================================================================ ember

/** Part C 41.0: the one warm light left in the world: a point light in the knight's hand (+ a tiny glow and 3 rising motes). */
const ember: CueRenderer = (c, i) => {
  const age = i.ageMs;
  if (age < 0) return;
  const hx = num(i, "x", c.hero.x + 0.5);
  const hy = num(i, "y", 0.8);
  const hz = num(i, "z", c.hero.z + 0.25);
  const lvl = emberLevel(age);
  const shrink = age > num(i, "closeAt", 1e9) ? 0.55 : 1;
  c.light(
    0,
    hx,
    hy + 0.15,
    hz + 0.4,
    EMBER_LIGHT,
    EMBER.intensity * 1.5 * lvl * shrink,
    EMBER.radius * 1.3,
  );
  c.glow(hx, hy, hz, 0.34 * shrink, [1.0, 0.55, 0.2], 1.6 * Math.min(1, lvl));
  c.glow(hx, hy, hz - 0.02, 1.1 * shrink, [1.0, 0.45, 0.15], 0.45 * Math.min(1, lvl));
  for (let j = 0; j < 3; j++) {
    const life = 1.4;
    const ph = (((age / 1000 + j * 0.47) % life) + life) % life;
    const u = ph / life;
    c.pa(
      hx + (rnd(i.seed, j, 121) - 0.5) * 0.14,
      hy + 0.35 * u,
      hz + 0.05,
      [1.0, 0.55, 0.2],
      1.0 * Math.min(1, lvl) * Math.sin(u * Math.PI),
      0.1,
      0,
    );
  }
};

// ================================================================================================ registry

/**
 * Every `PrologueVfxId` has a renderer (the table type makes a missing id a compile error; `tests/vfx/prologueFx.test.ts` also
 * enumerates `DEFAULT_REGISTRIES.vfx` at runtime, the cutscene's own registry).
 */
export const CUE_RENDERERS: { readonly [K in PrologueVfxId]: CueRenderer } = {
  inkRise,
  skyTear,
  hushBolt,
  ward,
  surgeAura,
  catchFireball,
  inkWrite,
  theftStream,
  auraCollapse,
  gateDarken,
  letterVortex,
  silenceFog,
  ember,
};

/** Cues that draw nothing but a `PrologueOut` request, so they need no scene resources. */
export const REQUEST_ONLY_CUES: ReadonlySet<PrologueVfxId> = new Set<PrologueVfxId>(["surgeAura"]);

/** Nul's lift as `letterVortex` plays (re-exported for the dev scene / stage). */
export { easeInCubic, nulLift };

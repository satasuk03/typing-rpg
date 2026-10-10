/**
 * The Grimoire bar (plan §4.3): N active skill orbs (the existing 16x16 pixel icons, charge rings, ready glow) and the
 * passive row (chips that flash on `PassiveTriggered`). Replaces the 2-slot skill panel in prologue mode only.
 * Drawn in the bar's own space: the caller has set the design-px transform.
 */
import type { Ctx } from "../draw";
import { clamp, txt } from "../draw";
import {
  DEFAULT_ACCENT,
  FRAME_CELLS,
  getOrbFrame,
  getRingCells,
  getSkillIcon,
  ICON_PX,
  SKILL_ACCENT,
} from "../skillIcons";
import { FONT_UI, GOLD_HI } from "../theme";
import type { GrimoireGeom } from "./geometry";
import { CHIP, CHIP_PITCH, GR_PAD, ORB, ORB_PITCH, ROW_GAP } from "./geometry";
import { GREY, GREY_DARK, passiveGlyph, THEFT_COLOURS } from "./palette";
import { drawShatter, SHATTER_DONE_S } from "./shatter";

const S = 2; // texel scale of an orb (ORB = FRAME_CELLS * 2)

export interface OrbState {
  id: string;
  charge: number;
  ready: boolean;
  /** The first WordCompleted happened: charged icons are "live" (before it they stay dim, no ready glow). */
  armed: boolean;
  /** 1 -> 0 over 0.6 s after SkillCast. */
  castFlash: number;
  /** Seconds since the shatter cue (null = intact). */
  shatterAge: number | null;
  /** 0..1 wake sweep (armed edge). */
  wake: number;
}
export interface ChipState {
  id: string;
  /** 1 -> 0 over 0.6 s after PassiveTriggered. */
  flash: number;
  /** 0 = lit, 1 = grey outline (passivesDim). */
  dim: number;
}
export interface GrimoireEnv {
  time: number;
  intensity: number;
  reducedFlash: boolean;
  reducedMotion: boolean;
  alpha: number;
}

export const orbCentre = (i: number): { x: number; y: number } => ({
  x: GR_PAD + ORB / 2 + i * ORB_PITCH,
  y: GR_PAD + ORB / 2,
});

export function drawGrimoire(
  c: Ctx,
  g: GrimoireGeom,
  orbs: readonly OrbState[],
  chips: readonly ChipState[],
  env: GrimoireEnv,
): void {
  if (env.alpha <= 0.01) return;
  const { rect, k } = g;
  const w = rect.w / k;
  const h = rect.h / k;
  c.save();
  c.globalAlpha = env.alpha;
  c.translate(rect.x, rect.y);
  c.scale(k, k);
  c.imageSmoothingEnabled = false;
  // backing plate: keeps the bar readable over a bright sky
  c.fillStyle = "rgba(10,7,16,0.62)";
  c.beginPath();
  c.roundRect(0, 0, w, h, 8);
  c.fill();
  c.strokeStyle = "rgba(184,149,90,0.55)";
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(1, 1, w - 2, h - 2, 7);
  c.stroke();

  const ring = getRingCells();
  for (let i = 0; i < orbs.length; i++) {
    const o = orbs[i] as OrbState;
    const { x: cx, y: cy } = orbCentre(i);
    const fx = Math.round(cx - (FRAME_CELLS * S) / 2);
    const fy = Math.round(cy - (FRAME_CELLS * S) / 2);
    const col = SKILL_ACCENT[o.id] ?? DEFAULT_ACCENT;
    const shattering = o.shatterAge !== null;
    const gone = shattering && (o.shatterAge as number) >= SHATTER_DONE_S;
    // empty socket after the theft
    if (gone) {
      c.globalAlpha = env.alpha * 0.5;
      c.drawImage(getOrbFrame(), fx, fy, FRAME_CELLS * S, FRAME_CELLS * S);
      c.globalAlpha = env.alpha;
      continue;
    }
    const bump = 1 + (env.reducedMotion ? 0 : 0.1 * o.castFlash);
    c.save();
    c.translate(cx, cy);
    c.scale(bump, bump);
    c.translate(-cx, -cy);
    const live = o.armed && !shattering;
    if (o.ready && live && env.intensity > 0) {
      const pulse = env.reducedFlash ? 0.5 : 0.5 + 0.5 * Math.sin(env.time * 5 + i);
      c.save();
      c.globalCompositeOperation = "lighter";
      const a = (0.25 + 0.2 * pulse) * env.intensity;
      const rg = c.createRadialGradient(cx, cy, 0, cx, cy, ORB * 0.95);
      rg.addColorStop(0, `rgba(255,200,110,${a * 0.7})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = rg;
      c.fillRect(cx - ORB, cy - ORB, ORB * 2, ORB * 2);
      c.restore();
    }
    c.drawImage(getOrbFrame(), fx, fy, FRAME_CELLS * S, FRAME_CELLS * S);
    if (shattering) {
      drawShatter(
        c,
        o.id,
        cx,
        cy,
        S,
        o.shatterAge as number,
        THEFT_COLOURS[o.id] ?? col,
        { reducedMotion: env.reducedMotion, intensity: env.intensity },
        i,
      );
    } else {
      const ic = getSkillIcon(o.id);
      const ix = Math.round(cx - (ICON_PX * S) / 2);
      const iy = Math.round(cy - (ICON_PX * S) / 2);
      const prog = clamp(o.ready ? 1 : o.charge, 0, 1);
      const rows = o.ready ? ICON_PX : Math.floor(prog * ICON_PX);
      if (rows < ICON_PX || !o.armed)
        c.drawImage(ic.dim, 0, 0, ICON_PX, ICON_PX, ix, iy, ICON_PX * S, ICON_PX * S);
      if (rows > 0 && (o.armed || o.charge > 0)) {
        const sy = ICON_PX - rows;
        c.drawImage(ic.color, 0, sy, ICON_PX, rows, ix, iy + sy * S, ICON_PX * S, rows * S);
        if (rows < ICON_PX) {
          c.fillStyle = "rgba(255,255,255,0.55)";
          c.fillRect(ix, iy + sy * S, ICON_PX * S, 1);
        }
      }
      c.fillStyle = col;
      c.beginPath();
      for (const cell of ring) if (cell.t <= prog) c.rect(fx + cell.x * S, fy + cell.y * S, S, S);
      c.fill();
      if (o.ready && live && env.intensity > 0) {
        const tw = env.reducedFlash ? 1 : Math.sin(env.time * 5 + i) > 0 ? 1 : 0.5;
        c.globalAlpha = env.alpha * 0.6 * tw * env.intensity;
        c.fillStyle = "#ffffff";
        c.beginPath();
        for (const cell of ring)
          if ((cell.x + cell.y) % 5 === 0) c.rect(fx + cell.x * S, fy + cell.y * S, S, S);
        c.fill();
        c.globalAlpha = env.alpha;
      }
      if (o.castFlash > 0.01 && env.intensity > 0) {
        // cast: a white-hot icon flash and an expanding ring in the skill's accent
        const f = o.castFlash;
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = env.alpha * f * 0.55 * (env.reducedFlash ? 0.5 : 1);
        c.drawImage(ic.color, 0, 0, ICON_PX, ICON_PX, ix, iy, ICON_PX * S, ICON_PX * S);
        c.globalAlpha = env.alpha * f * 0.8 * env.intensity;
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx, cy, ORB * (0.5 + 0.5 * (1 - f)), 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      if (o.wake > 0.01 && o.wake < 0.999 && env.intensity > 0) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = env.alpha * (1 - o.wake) * 0.7;
        c.fillStyle = GOLD_HI;
        c.fillRect(fx, Math.round(fy + o.wake * FRAME_CELLS * S), FRAME_CELLS * S, 2);
        c.restore();
      }
    }
    c.restore();
  }

  // ---- passive row
  const rowW = chips.length * CHIP_PITCH - (CHIP_PITCH - CHIP);
  const rx0 = (w - rowW) / 2;
  const ry = GR_PAD + ORB + ROW_GAP;
  for (let i = 0; i < chips.length; i++) {
    const ch = chips[i] as ChipState;
    const pg = passiveGlyph(ch.id);
    const x = rx0 + i * CHIP_PITCH;
    const sc = 1 + (env.reducedMotion ? 0 : 0.22 * ch.flash);
    c.save();
    c.translate(x + CHIP / 2, ry + CHIP / 2);
    c.scale(sc, sc);
    const lit = 1 - ch.dim;
    // grey outline when dimmed; coloured gem when lit
    c.fillStyle = lit > 0.5 ? "#18121f" : "rgba(24,18,31,0.35)";
    c.beginPath();
    c.roundRect(-CHIP / 2, -CHIP / 2, CHIP, CHIP, 4);
    c.fill();
    c.strokeStyle = lit > 0.5 ? pg.colour : GREY_DARK;
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(-CHIP / 2 + 1, -CHIP / 2 + 1, CHIP - 2, CHIP - 2, 3);
    c.stroke();
    if (ch.dim < 1) {
      c.globalAlpha = env.alpha * (0.35 + 0.65 * lit);
    }
    txt(c, pg.code, 0, 1, 10, lit > 0.5 ? pg.colour : GREY, {
      align: "center",
      f: FONT_UI,
      w: 700,
      stroke: false,
    });
    c.globalAlpha = env.alpha;
    if (ch.flash > 0.01 && env.intensity > 0) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = env.alpha * ch.flash * 0.8 * env.intensity;
      c.fillStyle = pg.colour;
      c.beginPath();
      c.roundRect(-CHIP / 2, -CHIP / 2, CHIP, CHIP, 4);
      c.fill();
    }
    c.restore();
  }
  c.restore();
}

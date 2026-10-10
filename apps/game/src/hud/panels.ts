/** Bars and panels: hero HP/ATB, skills, stats, combo + key streak, enemy bars, boss plate. */
import type { EnemyView, LevelView, SkillView } from "@hd2d/sim";
import { drawHealCross } from "./ch2Glyphs";
import type { Ctx } from "./draw";
import { bar, clamp, damageIcon, diamond, frame, shieldBadge, txt } from "./draw";
import type { Rect } from "./layout";
import type { HudSettings } from "./settings";
import {
  DEFAULT_ACCENT,
  FRAME_CELLS,
  getOrbFrame,
  getRingCells,
  getSkillIcon,
  ICON_PX,
  ICON_SCALE,
  SKILL_ACCENT,
} from "./skillIcons";
import {
  COMBO_TIER_COLORS,
  COMBO_TIER_NAMES,
  FONT_DISP,
  FONT_UI,
  GOLD,
  GOLD_HI,
  INK,
  KEY_STREAK_NAMES,
  KEY_STREAK_THRESHOLDS,
  keyStreakColor,
  keyStreakProgress,
} from "./theme";

export const HERO_PANEL = { x: 22, y: 18, w: 340, h: 104 } as const;
export const STATS_PANEL_W = 220;
export const BOSS_PLATE_W = 500;
export const BOSS_PLATE_H = 78;
export const SKILL_R = 32;

export interface PanelCtx {
  c: Ctx;
  W: number;
  H: number;
  time: number;
  settings: HudSettings;
  /** Smoothed (interpolated) values supplied by the Hud. */
  heroHpTrail: number;
  atbPulse: number;
  atbIgnite: number;
  comboPulse: number;
  tierFlash: number;
  /** Debug collector: text rects (design px) of the hero-panel rows, checked for overlap by invariants. */
  textRects?: { id: string; rect: Rect }[];
}

/** Records the rect of a text run that is about to be drawn (design px). */
function noteText(
  p: PanelCtx,
  id: string,
  text: string,
  x: number,
  y: number,
  size: number,
  align: "left" | "right" = "left",
  ls = 0,
): void {
  if (!p.textRects) return;
  const { c } = p;
  c.font = `${size}px ${FONT_UI}`;
  c.letterSpacing = `${ls}px`;
  const w = c.measureText(text).width;
  c.letterSpacing = "0px";
  p.textRects.push({
    id,
    rect: { x: align === "right" ? x - w : x, y: y - size / 2, w, h: size },
  });
}

export const heroAtbRect = (): Rect => ({
  x: HERO_PANEL.x + 136,
  y: HERO_PANEL.y + 82,
  w: 150,
  h: 8,
});

export function drawHeroPanel(p: PanelCtx, v: LevelView, atbFrac: number, hpFrac: number): void {
  const { c, time, settings } = p;
  const { x, y, w, h } = HERO_PANEL;
  frame(c, x, y, w, h);
  // diamond emblem
  const sz = 70;
  const px = x + 12;
  const py = y + 17;
  c.save();
  c.translate(px + sz / 2, py + sz / 2);
  c.rotate(Math.PI / 4);
  const d = sz * 0.7;
  c.fillStyle = "#0a0810";
  c.fillRect(-d / 2 - 3, -d / 2 - 3, d + 6, d + 6);
  const gr = c.createLinearGradient(-d / 2, -d / 2, d / 2, d / 2);
  gr.addColorStop(0, "#3a5a68");
  gr.addColorStop(1, "#16222e");
  c.fillStyle = gr;
  c.fillRect(-d / 2, -d / 2, d, d);
  c.strokeStyle = GOLD;
  c.lineWidth = 2;
  c.strokeRect(-d / 2, -d / 2, d, d);
  c.rotate(-Math.PI / 4);
  txt(c, "A", 0, 2, 26, "#fff4dc", { f: FONT_DISP, w: 900, align: "center", sw: 4 });
  c.restore();
  const tx = x + 92;
  txt(c, "ARIN", tx, y + 27, 24, "#fff4dc", { f: FONT_DISP, w: 700, ls: 2 });
  txt(c, v.hero.archetype.toUpperCase(), x + w - 18, y + 27, 12, "#b8a8c8", {
    align: "right",
    ls: 2,
  });
  const hpCol0 = hpFrac > 0.5 ? "#a8f290" : hpFrac > 0.25 ? "#ffe070" : "#ff7a6a";
  const hpCol1 = hpFrac > 0.5 ? "#3a9a48" : hpFrac > 0.25 ? "#c08a20" : "#b02838";
  txt(c, "HP", tx, y + 56, 12, "#9ff0a0");
  bar(c, tx + 28, y + 51, w - 92 - 28 - 12, 11, hpFrac, hpCol0, hpCol1, p.heroHpTrail, {
    trailCol: "#ff6a5a",
  });
  const hpText = `${Math.max(0, Math.round(v.hero.hp))} / ${v.hero.maxHp}`;
  txt(c, hpText, x + w - 14, y + 72, 12, INK, { align: "right" });
  noteText(p, "hp", hpText, x + w - 14, y + 72, 12, "right");
  // ATB gauge: full / ignite state
  const r = heroAtbRect();
  const full = atbFrac >= 0.999;
  txt(c, "ATB", tx, y + 86, 12, "#8fe0ff");
  const blink = full && !settings.reducedFlash && Math.floor(time * 8) % 2 === 0;
  bar(
    c,
    r.x,
    r.y,
    r.w,
    r.h,
    atbFrac,
    full ? (blink ? "#fff4b0" : "#ffd25a") : "#a8f0ff",
    full ? "#ff9a30" : "#2f88e8",
    undefined,
    { ticks: 4 },
  );
  if (full || p.atbIgnite > 0) {
    c.save();
    if (settings.effectsIntensity > 0) {
      c.shadowColor = "rgba(255,200,90,0.9)";
      c.shadowBlur = 14 * settings.effectsIntensity;
    }
    c.strokeStyle = "rgba(255,220,140,0.9)";
    c.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
    c.restore();
    if (full) txt(c, "FULL", r.x + r.w + 6, r.y + 5, 11, GOLD_HI, { stroke: true });
  }
  if (p.atbPulse > 0) {
    c.save();
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = p.atbPulse * (settings.reducedFlash ? 0.4 : 0.8);
    c.fillStyle = "#bfe8ff";
    c.fillRect(r.x, r.y - 2, r.w * clamp(atbFrac, 0, 1), r.h + 4);
    c.restore();
  }
  // barrier (12 px shield glyph + count) + second wind; the row ends >= 8 px before the HP text
  let cx = tx;
  if (v.hero.barrierCharges > 0) {
    const n = String(v.hero.barrierCharges);
    shieldBadge(c, cx + 6, y + 71, "", false, 6);
    txt(c, `x${n}`, cx + 16, y + 71, 11, "#9fd8ff");
    noteText(p, "barrier", `x${n}`, cx + 16, y + 71, 11);
    p.textRects?.push({ id: "barrier-glyph", rect: { x: cx, y: y + 65, w: 12, h: 12 } });
    const lw = 16 + Math.max(10, 7 * (n.length + 1));
    cx += lw + 6;
  }
  if (v.hero.secondWindAvailable) {
    diamond(c, cx + 5, y + 71, 5, "#5af0e0");
    txt(c, "2ND WIND", cx + 14, y + 71, 11, "#9ffff0");
    noteText(p, "secondwind", "2ND WIND", cx + 14, y + 71, 11);
  }
}

export function drawStatsPanel(p: PanelCtx, v: LevelView): void {
  const { c, W } = p;
  const w = STATS_PANEL_W;
  const x = W - 22 - w;
  const y = 18;
  const h = 104;
  frame(c, x, y, w, h);
  // view.stats.accuracy is basis points (0..10000), like accuracyBp elsewhere
  const acc = Math.round(v.stats.accuracy / 100);
  const rows: [string, string, string][] = [
    ["WPM", String(Math.round(v.stats.netWpm)), "#fff3d6"],
    ["ACCURACY", `${acc}%`, acc >= 95 ? "#a8f290" : acc >= 85 ? "#ffe070" : "#ff8a7a"],
    ["GOLD", String(v.goldCollected), "#ffd860"],
  ];
  rows.forEach(([k, val, col], i) => {
    txt(c, k, x + 20, y + 28 + i * 25, 12, "#b0a0c0", { ls: 1 });
    txt(c, val, x + w - 20, y + 28 + i * 25, 16, col, { align: "right", f: FONT_DISP, w: 700 });
  });
}

/** Key-streak area; h 226 also reserves the SWIFT / BLAZING plate (BURST_RECT at y 300..352). */
export const COMBO_AREA = (W: number): Rect => ({ x: W - 252, y: 128, w: 232, h: 226 });

/** Word combo (mechanical) + key streak (VFX tier colours) - hybrid PO decision. */
export function drawComboDisplay(p: PanelCtx, v: LevelView): void {
  const { c, W, time, settings } = p;
  const rm = settings.reducedMotion;
  const right = W - 30;
  const y0 = 128;
  if (v.combo >= 2) {
    const sc = 1 + (rm ? 0 : p.comboPulse * 0.28);
    const col = COMBO_TIER_COLORS[v.comboTier] ?? "#fff0c8";
    txt(c, String(v.combo), right - 96, y0 + 34, 50 * sc, col, {
      align: "right",
      f: FONT_DISP,
      w: 900,
      sw: 7,
      glow: v.comboTier >= 2 && settings.effectsIntensity > 0 ? "rgba(255,150,60,0.8)" : null,
      gb: 18 * settings.effectsIntensity,
    });
    txt(c, "COMBO", right, y0 + 26, 15, INK, { align: "right", ls: 2 });
    const tn = COMBO_TIER_NAMES[v.comboTier] ?? "";
    txt(c, `x${v.comboMult.toFixed(1)}${tn ? `  ${tn}` : ""}`, right, y0 + 48, 12, col, {
      align: "right",
    });
  }
  // key streak
  const ks = v.keyStreak;
  const prog = keyStreakProgress(ks);
  const tier = Math.max(v.keyStreakTier, prog.tier);
  const col = keyStreakColor(tier, time, rm);
  const sy = y0 + 76;
  if (ks > 0) {
    const sc = 1 + (rm ? 0 : p.tierFlash * 0.25);
    txt(c, String(ks), right - 132, sy + 2, 30 * sc, col, {
      align: "right",
      f: FONT_DISP,
      w: 900,
      sw: 5,
      glow: tier >= 1 && settings.effectsIntensity > 0 ? col : null,
      gb: 12 * settings.effectsIntensity,
    });
    txt(c, "KEY STREAK", right, sy - 8, 12, INK, { align: "right", ls: 1 });
    const name = KEY_STREAK_NAMES[tier] ?? "";
    if (name) txt(c, name, right, sy + 8, 12, col, { align: "right", ls: 2 });
    // progress to next tier, segmented at 10 / 25 / 50 / 100
    const bw = 190;
    const bx = right - bw;
    const by = sy + 22;
    c.fillStyle = "rgba(0,0,0,0.8)";
    c.fillRect(bx - 2, by - 2, bw + 4, 9);
    c.fillStyle = "#1e1624";
    c.fillRect(bx, by, bw, 5);
    const total = KEY_STREAK_THRESHOLDS[KEY_STREAK_THRESHOLDS.length - 1] ?? 100;
    c.fillStyle = col;
    c.fillRect(bx, by, bw * clamp(ks / total, 0, 1), 5);
    for (let i = 1; i < KEY_STREAK_THRESHOLDS.length; i++) {
      const t = KEY_STREAK_THRESHOLDS[i] ?? 0;
      const mx = bx + (bw * t) / total;
      c.fillStyle = ks >= t ? "#ffffff" : "rgba(255,255,255,0.45)";
      c.fillRect(mx - 1, by - 3, 2, 11);
    }
  }
}

function skillName(id: string): string {
  const m: Record<string, string> = {
    slashWave: "SLASH WAVE",
    piercingThrust: "PIERCE",
    fireball: "FIREBALL",
    frostLock: "FROST LOCK",
    mendingLight: "MENDING",
    aegis: "AEGIS",
  };
  return m[id] ?? id.toUpperCase();
}

export const skillCenter = (i: number, H: number): { x: number; y: number } => ({
  x: 64 + i * 92,
  y: H - 82,
});
export const SKILL_AREA = (H: number): Rect => ({ x: 20, y: H - 150, w: 200, h: 134 });

export function drawSkill(p: PanelCtx, sk: SkillView, charge: number): void {
  const { c, time, settings } = p;
  const { x: cx, y: cy } = skillCenter(sk.slot, p.H);
  const R = SKILL_R;
  const col = SKILL_ACCENT[sk.id] ?? DEFAULT_ACCENT;
  const prog = clamp(sk.ready ? 1 : charge, 0, 1);
  const S = ICON_SCALE;
  const fo = (FRAME_CELLS * S) / 2;
  const fx = Math.round(cx - fo);
  const fy = Math.round(cy - fo);
  c.save();
  c.imageSmoothingEnabled = false;
  // ready: soft additive glow behind the frame, pulsing
  if (sk.ready && settings.effectsIntensity > 0) {
    const pulse = settings.reducedFlash ? 0.5 : 0.5 + 0.5 * Math.sin(time * 5);
    const a = (0.25 + 0.2 * pulse) * settings.effectsIntensity;
    c.save();
    c.globalCompositeOperation = "lighter";
    const rg = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
    rg.addColorStop(0, `rgba(255,200,110,${a * 0.7})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = rg;
    c.fillRect(cx - R * 2, cy - R * 2, R * 4, R * 4);
    c.restore();
  }
  c.drawImage(getOrbFrame(), fx, fy, FRAME_CELLS * S, FRAME_CELLS * S);
  const ic = getSkillIcon(sk.id);
  const ix = Math.round(cx - (ICON_PX * S) / 2);
  const iy = Math.round(cy - (ICON_PX * S) / 2);
  const rows = sk.ready ? ICON_PX : Math.floor(prog * ICON_PX);
  if (rows < ICON_PX) {
    c.drawImage(ic.dim, 0, 0, ICON_PX, ICON_PX, ix, iy, ICON_PX * S, ICON_PX * S);
  }
  if (rows > 0) {
    // colour fills bottom-up in whole pixel rows
    const sy = ICON_PX - rows;
    c.drawImage(ic.color, 0, sy, ICON_PX, rows, ix, iy + sy * S, ICON_PX * S, rows * S);
    if (rows < ICON_PX) {
      c.fillStyle = "rgba(255,255,255,0.55)";
      c.fillRect(ix, iy + sy * S, ICON_PX * S, 1);
    }
  }
  // pixel charge ring: cells filled clockwise from 12 o'clock
  const ring = getRingCells();
  c.fillStyle = col;
  c.beginPath();
  for (const cell of ring) {
    if (cell.t <= prog) c.rect(fx + cell.x * S, fy + cell.y * S, S, S);
  }
  c.fill();
  if (sk.ready && settings.effectsIntensity > 0) {
    // ready: sparkling pixels on the full ring
    const tw = settings.reducedFlash ? 1 : Math.sin(time * 5) > 0 ? 1 : 0.5;
    c.globalAlpha = 0.6 * tw * settings.effectsIntensity;
    c.fillStyle = "#ffffff";
    c.beginPath();
    for (const cell of ring) {
      if ((cell.x + cell.y) % 5 === 0) c.rect(fx + cell.x * S, fy + cell.y * S, S, S);
    }
    c.fill();
    c.globalAlpha = 1;
  }
  c.restore();
  txt(c, skillName(sk.id), cx, cy + R + 22, 11, "#d8c8e8", { align: "center", ls: 1 });
  txt(
    c,
    sk.ready ? "READY" : `${Math.round(prog * 100)}%`,
    cx,
    cy + R + 38,
    11,
    sk.ready ? GOLD_HI : "#a898b8",
    {
      align: "center",
    },
  );
}

// ---------------------------------------------------------------- enemies

export const ENEMY_BAR_W = 88;
export const enemyBarsRect = (fx: number, fy: number, leak = false, tags = false): Rect =>
  tags
    ? { x: fx - 74, y: fy - 14, w: 156, h: 70 }
    : leak
      ? { x: fx - 74, y: fy - 6, w: 156, h: 62 }
      : {
          x: fx - 74,
          y: fy + 8,
          w: 156,
          h: 48,
        };

/** v1.9 guard leak: "20%" when the enemy's typed guard lets damage through, else null (no badge at all). */
export function leakBadgeLabel(e: { leakBp?: number }): string | null {
  const bp = e.leakBp ?? 0;
  return bp > 0 ? `${Math.max(1, Math.round(bp / 100))}%` : null;
}

export const LEAK_BADGE_H = 18;

/** Cracked-shield pill (pixel icon + leak %). `x` is the right edge, `cy` the vertical centre (design px). */
export function drawLeakBadge(c: Ctx, label: string, x: number, cy: number): void {
  const sz = 13;
  c.font = `700 ${sz}px ${FONT_UI}`;
  const tw = c.measureText(label).width;
  const w = ICON_PX + 8 + tw + 4;
  const x0 = x - w;
  const y0 = cy - LEAK_BADGE_H / 2;
  c.save();
  c.fillStyle = "rgba(10,6,14,0.92)";
  c.fillRect(x0 - 1, y0 - 1, w + 2, LEAK_BADGE_H + 2);
  c.fillStyle = "#3a0c18";
  c.fillRect(x0, y0, w, LEAK_BADGE_H);
  c.fillStyle = "rgba(255,90,90,0.35)";
  c.fillRect(x0, y0, w, 2);
  c.imageSmoothingEnabled = false;
  c.drawImage(
    getSkillIcon("crackedShield").color,
    Math.round(x0 + 3),
    Math.round(cy - ICON_PX / 2),
  );
  c.restore();
  txt(c, label, x0 + 3 + ICON_PX + 3, cy + 1, sz, "#ff9a8a", { w: 700, stroke: false });
}

/** v2.0: healer badge and/or elite tag need the tall bars rect (a tag row above the HP bar). */
export const enemyHasTags = (e: { elite?: boolean; healer?: unknown }): boolean =>
  e.elite === true || !!e.healer;

/** Healer charge in 0..1 (fills as the heal comes due); null = paused / no heals left (ring hidden). */
export function healerCharge(h: NonNullable<EnemyView["healer"]>): number | null {
  if (h.ticksLeft === null || h.totalTicks <= 0) return null;
  return clamp(1 - h.ticksLeft / h.totalTicks, 0, 1);
}

/**
 * v2.0 tag row above the HP bar: the green healer badge (disc + pixel cross + charge ring + heals left) and
 * the gold ELITE tag. Green is reserved for healing; gold matches the elite sprite rim. Both are static
 * except a small badge swell in the last 600 ms before a heal (off in reduced motion).
 */
export function drawEnemyTags(p: PanelCtx, e: EnemyView, x: number, cy: number): void {
  const { c } = p;
  let tx = x - 44;
  const h = e.healer;
  if (h) {
    const charge = healerCharge(h);
    const cx = tx + 10;
    const soon = h.ticksLeft !== null && h.ticksLeft <= 36 && !p.settings.reducedMotion;
    const px = soon ? 2 + Math.round(0.5 + 0.5 * Math.sin(p.time * 14)) : 2;
    c.fillStyle = "rgba(0,0,0,0.9)";
    c.beginPath();
    c.arc(cx, cy, 11.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = charge === null ? "#18241c" : "#0c2a18";
    c.beginPath();
    c.arc(cx, cy, 9.5, 0, Math.PI * 2);
    c.fill();
    if (charge !== null) {
      c.lineWidth = 3;
      c.strokeStyle = "rgba(92,240,138,0.25)";
      c.beginPath();
      c.arc(cx, cy, 8, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "#5cf08a";
      c.beginPath();
      c.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
      c.stroke();
    }
    drawHealCross(c, cx, cy, px, charge === null ? "#6a8a74" : "#d8ffe4");
    tx += 24;
    if (h.healsLeft !== null) {
      const label = `x${h.healsLeft}`;
      txt(c, label, tx, cy + 1, 12, charge === null ? "#8aa894" : "#8af0ae", { w: 700 });
      tx += label.length * 8 + 8;
    }
  }
  if (e.elite) {
    const w = 50;
    c.fillStyle = "rgba(0,0,0,0.9)";
    c.fillRect(tx - 1, cy - 9, w + 2, 18);
    c.fillStyle = "#4a3208";
    c.fillRect(tx, cy - 8, w, 16);
    c.fillStyle = "#ffd25a";
    c.fillRect(tx, cy - 8, w, 2);
    c.fillRect(tx, cy + 6, w, 2);
    c.fillStyle = "#ffe08a";
    c.fillRect(tx + 4, cy - 2, 4, 4);
    txt(c, "ELITE", tx + 12, cy + 1, 11, "#ffe9a8", { w: 700, ls: 1, stroke: false });
  }
}

export interface EnemyBarState {
  hpFrac: number;
  hpTrail: number;
  atbFrac: number;
  /** v2.0: 0..1 green fill flash on the HP bar after an EnemyHealed (absent / 0 = none). */
  healFlash?: number;
}

/** The heal read (brief 5.1): the filled part of an HP bar floods green `#5cf08a` and settles. */
export function healFlashOverlay(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  k: number,
): void {
  if (!(k > 0.01)) return;
  const fw = w * clamp(frac, 0, 1);
  c.save();
  c.globalAlpha *= Math.min(1, k) * 0.85;
  c.fillStyle = "#5cf08a";
  c.fillRect(x, y, fw, h);
  c.fillStyle = "#d8ffe4";
  c.fillRect(x, y, fw, Math.max(1, h * 0.3));
  c.restore();
}

export function drawEnemyBars(
  p: PanelCtx,
  e: EnemyView,
  fx: number,
  fy: number,
  st: EnemyBarState,
): void {
  const { c } = p;
  const x = fx;
  const y = fy + 14;
  const broken = e.brokenTicksLeft > 0;
  bar(c, x - 44, y, ENEMY_BAR_W, 7, st.hpFrac, "#ff8a7a", "#b42838", st.hpTrail);
  if (st.healFlash) healFlashOverlay(c, x - 44, y, ENEMY_BAR_W, 7, st.hpFrac, st.healFlash);
  bar(
    c,
    x - 44,
    y + 12,
    ENEMY_BAR_W,
    4,
    broken ? 0 : st.atbFrac,
    e.isGuard ? "#ff8060" : "#ffd070",
    e.isGuard ? "#c02818" : "#ff8a30",
    undefined,
    { edge: "rgba(0,0,0,0)" },
  );
  if (e.shieldMax > 0) shieldBadge(c, x - 58, y + 6, String(e.shield), broken, 13);
  const leak = leakBadgeLabel(e);
  if (leak) drawLeakBadge(c, leak, x + 44, fy + 2);
  if (enemyHasTags(e) && !e.isBoss) drawEnemyTags(p, e, x, fy + 1);
  e.weaknesses.forEach((wk, i) => {
    damageIcon(c, wk.type, x + 58 + i * 20, y + 6, 6, wk.revealed);
  });
  if (broken) {
    txt(c, `BREAK ${Math.ceil(e.brokenTicksLeft / 60)}`, x, y + 32, 13, "#ffffff", {
      align: "center",
      glow: "rgba(120,180,255,0.9)",
    });
  } else if (e.statuses.length > 0) {
    e.statuses.slice(0, 4).forEach((s, i) => {
      const sx = x - 44 + i * 30;
      c.fillStyle = "rgba(0,0,0,0.75)";
      c.fillRect(sx, y + 22, 28, 14);
      txt(
        c,
        `${s.id.slice(0, 3).toUpperCase()}${s.stacks > 1 ? s.stacks : ""}`,
        sx + 14,
        y + 29,
        10,
        "#e8d8ff",
        {
          align: "center",
          stroke: false,
        },
      );
    });
  }
}

export const bossPlateRect = (W: number): Rect => ({
  x: Math.round(W / 2 - BOSS_PLATE_W / 2),
  y: 18,
  w: BOSS_PLATE_W,
  h: BOSS_PLATE_H,
});

export function drawBossPlate(p: PanelCtx, v: LevelView, e: EnemyView, st: EnemyBarState): void {
  const { c, W } = p;
  const boss = v.boss;
  if (!boss) return;
  const r = bossPlateRect(W);
  frame(c, r.x, r.y, r.w, r.h, { col: "#c06a5a" });
  txt(c, boss.name.toUpperCase(), W / 2, r.y + 24, 22, "#ffe0c0", {
    align: "center",
    f: FONT_DISP,
    w: 900,
    ls: 4,
    glow: "rgba(255,120,80,0.6)",
    gb: 10 * p.settings.effectsIntensity,
  });
  const bx = r.x + 56;
  const bw = r.w - 112;
  bar(c, bx, r.y + 40, bw, 11, st.hpFrac, "#ff9a6a", "#a82030", st.hpTrail, {
    trailCol: "#fff0d0",
    ticks: 3,
  });
  if (st.healFlash) healFlashOverlay(c, bx, r.y + 40, bw, 11, st.hpFrac, st.healFlash);
  if (boss.gateHpFrac !== null) {
    const gx = bx + bw * clamp(boss.gateHpFrac, 0, 1);
    c.fillStyle = "#ffffff";
    c.fillRect(gx - 1, r.y + 36, 2, 19);
    diamond(c, gx, r.y + 35, 4, "#ffffff");
  }
  const broken = e.brokenTicksLeft > 0;
  bar(c, bx, r.y + 56, bw, 4, broken ? 0 : st.atbFrac, "#ffd070", "#ff8a30", undefined, {
    edge: "rgba(0,0,0,0)",
  });
  // phase pips
  txt(c, "PHASE", bx, r.y + 68, 10, "#c8b8d8", { ls: 1, stroke: false });
  for (let i = 1; i <= 3; i++) {
    const px = bx + 52 + i * 18;
    diamond(c, px, r.y + 68, 6, "#0c0910");
    diamond(c, px, r.y + 68, 4.5, i <= boss.phase ? GOLD : "#3a3040");
  }
  if (e.brokenTicksLeft <= 0)
    txt(c, boss.title.toUpperCase(), r.x + r.w - 60, r.y + 68, 10, "#c8b8d8", {
      align: "right",
      ls: 1,
      stroke: false,
    });
  if (e.shieldMax > 0) shieldBadge(c, r.x + 30, r.y + 46, String(e.shield), broken, 17);
  const leak = leakBadgeLabel(e);
  if (leak) drawLeakBadge(c, leak, r.x + r.w - 12, r.y + 18);
  e.weaknesses.forEach((wk, i) => {
    damageIcon(c, wk.type, r.x + r.w - 40 + (i - 0.5) * 22, r.y + 46, 7, wk.revealed);
  });
  if (broken) {
    // T6.3 #13: BREAK status is a chip inside the boss-bar row (nothing hangs below the plate)
    const label = `BREAK ${Math.ceil(e.brokenTicksLeft / 60)}`;
    const cw = 76;
    const cxm = W / 2;
    const cyc = r.y + 68;
    c.fillStyle = "#06101e";
    c.fillRect(cxm - cw / 2 - 1, cyc - 9, cw + 2, 18);
    const cg = c.createLinearGradient(0, cyc - 8, 0, cyc + 8);
    cg.addColorStop(0, "#6aa8ff");
    cg.addColorStop(1, "#2a58c0");
    c.fillStyle = cg;
    c.fillRect(cxm - cw / 2, cyc - 8, cw, 16);
    txt(c, label, cxm, cyc + 1, 11, "#ffffff", { align: "center", ls: 1, w: 700 });
  }
}

export const TOP_LABEL_RECT = (W: number): Rect => ({ x: W / 2 - 150, y: 18, w: 300, h: 34 });

export function drawTopLabel(p: PanelCtx, v: LevelView): void {
  const { c, W } = p;
  const r = TOP_LABEL_RECT(W);
  frame(c, r.x, r.y, r.w, r.h, { crest: false });
  const enc =
    v.encounterIndex === null ? "" : `ENCOUNTER ${v.encounterIndex + 1}/${v.encounterCount}`;
  const wave = v.waveIndex === null ? "" : `  WAVE ${v.waveIndex + 1}`;
  const label = enc ? enc + wave : v.phase === "walk" ? "EXPLORING" : v.levelId.toUpperCase();
  txt(c, label, W / 2, r.y + 18, 14, "#f6e6c4", { align: "center", f: FONT_DISP, w: 700, ls: 2 });
}

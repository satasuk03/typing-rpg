/**
 * HUD-layer colour that survives the grey grade (art direction §3): the stolen-colour swirl inside Nul's cloak, the
 * two shards that fall into the knight's hand, and the HUD half of the `ember` (the world half is a point light that
 * the grade greys out). All closed-form in time; flat fills only (no shadowBlur, no per-frame gradients but the ember
 * halo).
 */
import type { Ctx } from "../draw";
import { clamp } from "../draw";
import { getSkillIcon, hasSkillIcon, ICON_PX } from "../skillIcons";
import { FONT_UI } from "../theme";
import type { P2 } from "./geometry";
import { DEFAULT_KIT, GREY, passiveGlyph, THEFT_COLOURS } from "./palette";

const STREAMS = 6;
const MOTES = 14;

function hash(n: number): number {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Seconds between two streams starting to show (the build-up, stream by stream). */
export const SWIRL_STAGGER_S = 0.15;

export function drawSwirl(
  c: Ctx,
  trap: { pts: [P2, P2, P2, P2]; pxm: number },
  time: number,
  onT: number,
  alpha: number,
  quality: 0 | 1 | 2,
  reducedMotion: boolean,
): void {
  if (alpha <= 0.01) return;
  const [a, b, d, e] = trap.pts; // top-left, top-right, bottom-right, bottom-left
  const pxm = trap.pxm;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + e.y) / 2;
  c.save();
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.lineTo(d.x, d.y);
  c.lineTo(e.x, e.y);
  c.closePath();
  c.clip();
  c.globalCompositeOperation = "lighter";
  const moteStep = quality === 2 ? 2 : 1;
  const head = Math.max(3, Math.round(pxm * 0.05));
  for (let s = 0; s < STREAMS; s++) {
    const born = clamp((onT - s * SWIRL_STAGGER_S) / 0.5, 0, 1);
    if (born <= 0) continue;
    const id = DEFAULT_KIT[s] as string;
    const col = THEFT_COLOURS[id] as string;
    const dir = s % 2 === 0 ? 1 : -1;
    const w = (0.5 + 0.5 * hash(s * 17 + 1)) * dir;
    const rx0 = pxm * (0.42 + 0.06 * s);
    const ry0 = pxm * (0.62 + 0.16 * (s % 3));
    const tilt = (s - 2.5) * 0.12;
    for (let m = 0; m < MOTES; m += moteStep) {
      const ph = (m / MOTES) * Math.PI * 2 + s * 1.047 + hash(s * 101 + m) * 0.6;
      const th = ph + (reducedMotion ? 0 : w * time);
      // every mote has its own orbit size, so the colours fill the cloak instead of drawing six rings
      const f = 0.25 + 0.75 * hash(s * 53 + m * 7 + 3);
      const rx = rx0 * f;
      const ry = ry0 * (0.4 + 0.6 * f);
      for (let tr = 0; tr < 4; tr++) {
        const t2 = th - w * 0.07 * tr;
        const ex = Math.cos(t2) * rx;
        const ey = Math.sin(t2) * ry;
        const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt) * 0.35;
        const y = cy + ey * Math.cos(tilt) + ex * Math.sin(tilt) * 0.35;
        const al = alpha * born * (tr === 0 ? 0.95 : tr === 1 ? 0.4 : tr === 2 ? 0.2 : 0.13);
        c.globalAlpha = al;
        c.fillStyle = col;
        const sz = tr === 0 ? head : Math.max(2, head - tr);
        if (tr === 0 && m % 4 === 0) {
          c.globalAlpha = al * 0.22;
          c.beginPath();
          c.arc(x, y, 6, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = al;
        }
        c.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
      }
    }
  }
  c.restore();
}

/** The HUD half of the ember: a 4x4 core (#ffd28a, 2x2 centre #fff4d8) and a 26 px halo (rgba(255,170,70,.75) -> 0). */
export function drawEmber(
  c: Ctx,
  p: P2,
  ageMs: number,
  closeAtMs: number,
  time: number,
  alpha: number,
  reducedMotion: boolean,
): void {
  if (alpha <= 0.01) return;
  const light = clamp(ageMs / 600, 0, 1);
  const closed = clamp((ageMs - closeAtMs) / 400, 0, 1);
  const breathe = reducedMotion ? 1 : 1 + 0.12 * Math.sin(Math.PI * 2 * 0.6 * time);
  const r = (26 + (14 - 26) * closed) * breathe * light;
  c.save();
  c.globalAlpha = alpha;
  if (r > 0.5) {
    c.globalCompositeOperation = "lighter";
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, "rgba(255,170,70,0.75)");
    g.addColorStop(1, "rgba(255,170,70,0)");
    c.fillStyle = g;
    c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    c.globalCompositeOperation = "source-over";
  }
  if (light > 0) {
    // a tighter inner glow so the spark still reads as the one warm thing in a grey frame
    c.globalCompositeOperation = "lighter";
    const g2 = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 11 * breathe);
    g2.addColorStop(0, `rgba(255,200,110,${0.85 * light})`);
    g2.addColorStop(1, "rgba(255,170,70,0)");
    c.fillStyle = g2;
    c.fillRect(p.x - 12, p.y - 12, 24, 24);
    c.globalCompositeOperation = "source-over";
  }
  c.globalAlpha = alpha * light;
  c.fillStyle = "#ffd28a";
  c.fillRect(Math.round(p.x - 2), Math.round(p.y - 2), 4, 4);
  c.fillStyle = "#fff4d8";
  c.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2);
  c.restore();
}

export const SHARDS_FALL_MS = 1900;
export const SHARDS_STAGGER_MS = 350;
/** Total time until the last shard has landed (and started to fade into the ember). */
export const shardsLandMs = (n: number): number =>
  SHARDS_FALL_MS + SHARDS_STAGGER_MS * Math.max(0, n - 1);

/**
 * The starter-kit shards drifting down from the tear into the open hand: dim icons (no colour: the grade took it),
 * a slow sway, landing one after the other, then fading into the ember's light.
 */
export function drawShardsReturn(
  c: Ctx,
  ids: readonly string[],
  ageMs: number,
  from: P2,
  to: P2,
  alpha: number,
  reducedMotion: boolean,
): void {
  if (alpha <= 0.01) return;
  c.save();
  c.imageSmoothingEnabled = false;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as string;
    const p = clamp((ageMs - i * SHARDS_STAGGER_MS) / SHARDS_FALL_MS, 0, 1);
    if (p <= 0) continue;
    const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // easeInOutQuad
    const side = i % 2 === 0 ? -1 : 1;
    const sway = reducedMotion ? 0 : Math.sin(p * 7 + i * 2) * 16 * (1 - p);
    const x = from.x + side * 34 * (1 - e) + (to.x + side * 9 - from.x - side * 34) * e + sway;
    const y = from.y + (to.y - 6 - from.y) * e;
    const fadeOut = 1 - clamp((ageMs - (i * SHARDS_STAGGER_MS + SHARDS_FALL_MS + 250)) / 450, 0, 1);
    c.save();
    c.globalAlpha = alpha * fadeOut;
    c.translate(x, y);
    c.rotate(reducedMotion ? 0 : Math.sin(p * 5 + i) * 0.3 * (1 - p));
    if (hasSkillIcon(id)) {
      const S = 2;
      c.drawImage(
        getSkillIcon(id).dim,
        0,
        0,
        ICON_PX,
        ICON_PX,
        (-ICON_PX * S) / 2,
        (-ICON_PX * S) / 2,
        ICON_PX * S,
        ICON_PX * S,
      );
    } else {
      // a passive (Clean Cut): its chip in grey outline
      const pg = passiveGlyph(id);
      c.strokeStyle = GREY;
      c.lineWidth = 2;
      c.strokeRect(-14, -14, 28, 28);
      c.fillStyle = "rgba(24,18,31,0.7)";
      c.fillRect(-13, -13, 26, 26);
      c.font = `700 13px ${FONT_UI}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = GREY;
      c.fillText(pg.code, 0, 1);
    }
    c.restore();
  }
  c.restore();
}

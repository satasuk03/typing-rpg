/**
 * HUD-layer colour that survives the grey grade (art direction §3): the stolen-colour swirl inside Nul's cloak, the
 * two shards that fall into the knight's hand, and the HUD half of the `ember` (the world half is a point light that
 * the grade greys out). All closed-form in time; flat fills only (no shadowBlur, no per-frame gradients but the ember
 * halo and the shard halos).
 *
 * P4.2 WP-B: the swirl fills the whole cloak trapezoid with crossing spirals (P2-7); the ember is a 12 px core (1080p) with a
 * 90 px halo on the palm, and the two shards are big warm-rimmed icons that fall from the tear with a trail and merge into
 * the ember (P1-8).
 */
import type { Ctx } from "../draw";
import { clamp } from "../draw";
import { getSkillIcon, hasSkillIcon, ICON_PX } from "../skillIcons";
import type { P2 } from "./geometry";
import { DEFAULT_KIT, THEFT_COLOURS } from "./palette";
import { getPassiveIcon, PASSIVE_ICON_PX } from "./passiveIcons";

const STREAMS = 6;
const MOTES = 18;
const TRAIL = 6;
const TRAIL_A = [0.95, 0.5, 0.32, 0.22, 0.15, 0.1] as const;

function hash(n: number): number {
  let x = (n | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Seconds between two streams starting to show (the build-up, stream by stream). */
export const SWIRL_STAGGER_S = 0.15;

/**
 * The six stolen colours spiral inside the full cloak trapezoid (clipped to it): every mote has its own orbit, the streams
 * turn in opposite directions so they cross, and the whole thing pulses gently while Nul speaks (`speak` 0..1).
 */
export function drawSwirl(
  c: Ctx,
  trap: { pts: [P2, P2, P2, P2]; pxm: number },
  time: number,
  onT: number,
  alpha: number,
  quality: 0 | 1 | 2,
  reducedMotion: boolean,
  speak = 0,
): void {
  if (alpha <= 0.01) return;
  const [a, b, d, e] = trap.pts; // top-left, top-right, bottom-right, bottom-left
  const pxm = trap.pxm;
  const cx = (a.x + b.x) / 2;
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
  const head = Math.max(3, Math.round(pxm * 0.055));
  const pulse = reducedMotion ? 1 : 1 + 0.22 * speak * Math.sin(time * 8);
  // the cloak runs from its hem (u 0) to the collar (u 1); the half-width shrinks from the hem to the collar
  const yBot = (d.y + e.y) / 2;
  const yTop = (a.y + b.y) / 2;
  const hwBot = Math.abs(d.x - e.x) / 2;
  const hwTop = Math.abs(b.x - a.x) / 2;
  for (let s = 0; s < STREAMS; s++) {
    const born = clamp((onT - s * SWIRL_STAGGER_S) / 0.5, 0, 1);
    if (born <= 0) continue;
    const id = DEFAULT_KIT[s] as string;
    const col = THEFT_COLOURS[id] as string;
    const dir = s % 2 === 0 ? 1 : -1;
    const turns = 1.2 + 0.25 * (s % 3);
    const phase = s * 1.047;
    for (let m = 0; m < MOTES; m += moteStep) {
      const lane = hash(s * 101 + m) * 0.5 + 0.5; // how far out from the cloak's spine this mote spirals
      // each mote rises slowly up the cloak (the stolen colours drift toward the heart), the six streams turning against each other
      const u0 = (m / MOTES + s * 0.17 + (reducedMotion ? 0 : time * (0.05 + 0.01 * (s % 3)))) % 1;
      for (let tr = 0; tr < TRAIL; tr++) {
        const u = (u0 - tr * 0.012 + 1) % 1;
        const ang = u * Math.PI * 2 * turns * dir + phase + (reducedMotion ? 0 : dir * time * 0.5);
        const hw = hwBot + (hwTop - hwBot) * u;
        const x = cx + Math.sin(ang) * hw * 0.86 * lane;
        const y = yBot + (yTop - yBot) * u + Math.cos(ang) * pxm * 0.1;
        const fadeEnds = Math.min(1, u * 5, (1 - u) * 5);
        const al = Math.min(1, alpha * born * fadeEnds * (TRAIL_A[tr] ?? 0.1) * pulse);
        c.globalAlpha = al;
        c.fillStyle = col;
        const sz = tr === 0 ? head : Math.max(2, head - tr);
        if (tr === 0 && m % 2 === 0) {
          // a halo on every second mote
          c.globalAlpha = al * 0.16;
          c.beginPath();
          c.arc(x, y, head * 1.7, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = al;
        }
        c.fillRect(Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
      }
    }
  }
  c.restore();
}

/** Ember design-px sizes (1280-wide design = 1.5x CSS at 1080p): core 8 (12 px at 1080p), halo radius 60 (90 px). */
export const EMBER_CORE = 8;
export const EMBER_HALO = 70;

/**
 * The HUD half of the ember, centred on the palm: an 8 px core (#ffd28a with a #fff4d8 centre), a 60 px warm halo that breathes,
 * a tight inner glow and a few sparks lifting off. `kick` (0..1) swells it when a shard lands and merges into it.
 */
export function drawEmber(
  c: Ctx,
  p: P2,
  ageMs: number,
  closeAtMs: number,
  time: number,
  alpha: number,
  reducedMotion: boolean,
  kick = 0,
): void {
  if (alpha <= 0.01) return;
  const light = clamp(ageMs / 600, 0, 1);
  const closed = clamp((ageMs - closeAtMs) / 400, 0, 1);
  const breathe = reducedMotion ? 1 : 1 + 0.12 * Math.sin(Math.PI * 2 * 0.6 * time);
  const swell = 1 + 0.45 * kick;
  const r = (EMBER_HALO - 24 * closed) * breathe * light * swell;
  c.save();
  c.globalAlpha = alpha;
  c.globalCompositeOperation = "lighter";
  if (r > 0.5) {
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, "rgba(255,186,90,1)");
    g.addColorStop(0.3, "rgba(255,160,64,0.6)");
    g.addColorStop(0.6, "rgba(255,140,50,0.22)");
    g.addColorStop(1, "rgba(255,150,60,0)");
    c.fillStyle = g;
    c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
  if (light > 0) {
    const r2 = 26 * breathe * swell;
    const g2 = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r2);
    g2.addColorStop(0, `rgba(255,214,130,${0.9 * light})`);
    g2.addColorStop(1, "rgba(255,170,70,0)");
    c.fillStyle = g2;
    c.fillRect(p.x - r2, p.y - r2, r2 * 2, r2 * 2);
    if (!reducedMotion && closed < 1) {
      // sparks lifting off the open palm
      c.fillStyle = "#ffd28a";
      for (let i = 0; i < 6; i++) {
        const u = (time * 0.55 + i / 6) % 1;
        c.globalAlpha = alpha * light * (1 - u) * 0.85;
        c.fillRect(
          Math.round(p.x + (hash(i * 5 + 1) - 0.5) * 22 + Math.sin(time * 2 + i) * 3),
          Math.round(p.y - 5 - u * 36),
          2,
          2,
        );
      }
    }
  }
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = alpha * light;
  const core = Math.round(EMBER_CORE * (1 - 0.25 * closed));
  const h = core / 2;
  c.fillStyle = "#c8661e";
  c.fillRect(Math.round(p.x - h - 1), Math.round(p.y - h - 1), core + 2, core + 2);
  c.fillStyle = "#ffd28a";
  c.fillRect(Math.round(p.x - h), Math.round(p.y - h), core, core);
  c.fillStyle = "#fff4d8";
  c.fillRect(Math.round(p.x - h / 2), Math.round(p.y - h / 2), core / 2, core / 2);
  c.restore();
}

export const SHARDS_FALL_MS = 1900;
export const SHARDS_STAGGER_MS = 350;
/** Total time until the last shard has landed (and started to fade into the ember). */
export const shardsLandMs = (n: number): number =>
  SHARDS_FALL_MS + SHARDS_STAGGER_MS * Math.max(0, n - 1);

/** 0..1: how hard the ember swells as each shard lands and merges into it (decays over ~350 ms per shard). */
export function shardKick(ageMs: number, n: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) {
    const dt = ageMs - (i * SHARDS_STAGGER_MS + SHARDS_FALL_MS);
    if (dt >= 0) k = Math.max(k, Math.exp(-dt / 320));
  }
  return k;
}

const easeInOutQuad = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/**
 * The starter-kit shards falling from where the tear closed into the open hand: warm-rimmed colour icons (the Fireball and the
 * Clean Cut passive) with a falling trail, a slow sway, landing one after the other, then merging into the ember (the ember swells).
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
  const S = 2; // texel scale of a skill icon (32 design px = 48 px at 1080p); a passive gem (12 px) draws at 3x
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] as string;
    const born = i * SHARDS_STAGGER_MS;
    const side = i % 2 === 0 ? -1 : 1;
    const at = (age: number): { x: number; y: number; p: number } => {
      const p = clamp((age - born) / SHARDS_FALL_MS, 0, 1);
      const e = easeInOutQuad(p);
      const sway = reducedMotion ? 0 : Math.sin(p * 7 + i * 2) * 16 * (1 - p);
      return {
        p,
        x: from.x + side * 34 * (1 - e) + (to.x + side * 9 - from.x - side * 34) * e + sway,
        y: from.y + (to.y - 4 - from.y) * e,
      };
    };
    const head = at(ageMs);
    if (head.p <= 0) continue;
    const fadeOut = 1 - clamp((ageMs - (born + SHARDS_FALL_MS + 120)) / 380, 0, 1);
    if (fadeOut <= 0) continue;
    const hot = id === "fireball" ? "255,150,60" : "255,214,120";
    // the falling trail: a column of warm sparks along the path the shard has just flown
    c.globalCompositeOperation = "lighter";
    for (let j = TRAIL * 3; j >= 1; j--) {
      const t = at(ageMs - j * 38);
      if (t.p <= 0) continue;
      const u = 1 - j / (TRAIL * 3 + 1);
      c.globalAlpha = alpha * fadeOut * u * 0.55;
      c.fillStyle = `rgb(${hot})`;
      const sz = Math.max(2, Math.round(8 * u));
      c.fillRect(Math.round(t.x - sz / 2), Math.round(t.y - sz / 2), sz, sz);
    }
    // a soft warm halo under the icon
    const hr = 30;
    const hg = c.createRadialGradient(head.x, head.y, 0, head.x, head.y, hr);
    hg.addColorStop(0, `rgba(${hot},0.5)`);
    hg.addColorStop(1, `rgba(${hot},0)`);
    c.globalAlpha = alpha * fadeOut;
    c.fillStyle = hg;
    c.fillRect(head.x - hr, head.y - hr, hr * 2, hr * 2);
    c.globalCompositeOperation = "source-over";
    c.save();
    c.globalAlpha = alpha * fadeOut;
    c.translate(head.x, head.y);
    c.rotate(reducedMotion ? 0 : Math.sin(head.p * 5 + i) * 0.25 * (1 - head.p));
    const pic = hasSkillIcon(id) ? getSkillIcon(id) : getPassiveIcon(id);
    const px = hasSkillIcon(id) ? ICON_PX : PASSIVE_ICON_PX;
    const sc = hasSkillIcon(id) ? S : 3;
    const half = (px * sc) / 2;
    // a dark plate and a 2 px warm rim, so the shard reads over any world
    c.fillStyle = "rgba(20,12,24,0.78)";
    c.fillRect(-half - 3, -half - 3, half * 2 + 6, half * 2 + 6);
    c.strokeStyle = `rgb(${hot})`;
    c.lineWidth = 2;
    c.strokeRect(-half - 3, -half - 3, half * 2 + 6, half * 2 + 6);
    if (pic) c.drawImage(pic.color, 0, 0, px, px, -half, -half, px * sc, px * sc);
    c.restore();
  }
  c.restore();
}

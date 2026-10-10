/** Damage pops and tags: lifetime + stacking logic (pure, no DOM). */
import type { Rect } from "./layout";

export type PopKind =
  | "dmg"
  | "crit"
  | "chip"
  | "hurt"
  | "leak"
  | "heal"
  | "weak"
  | "break"
  | "perfect"
  | "block"
  | "parry"
  | "skill"
  | "gold"
  | "tag";

/** Where a pop is anchored: an enemy/hero (resolved by the projector) or a screen point (CSS px). */
export type PopAnchor =
  | { kind: "enemy"; id: number; part?: "head" | "body" }
  | { kind: "hero" }
  | { kind: "screen"; x: number; y: number };

export interface Pop {
  uid: number;
  kind: PopKind;
  text: string;
  anchor: PopAnchor;
  /** Seconds since spawn. */
  age: number;
  /** Lifetime seconds. */
  dur: number;
  /** Vertical stack slot at spawn (0 = first). */
  slot: number;
  /** Upward offset in px so pops on one anchor never overlap (sum of the older pops' heights). */
  stackY: number;
  /** Horizontal drift in px/s (deterministic). */
  vx: number;
  /** Size multiplier (1 = default). */
  size: number;
  /** Placement offset (design px) chosen by the HUD to dodge plates; cached so pops do not jitter. */
  offX: number;
  offY: number;
}

export const POP_LIFETIME: Record<PopKind, number> = {
  dmg: 1.15,
  crit: 1.4,
  chip: 0.8,
  hurt: 1.2,
  leak: 1.3,
  heal: 1.2,
  weak: 1.0,
  break: 0.9,
  perfect: 1.3,
  block: 1.1,
  parry: 1.2,
  skill: 1.3,
  gold: 1.8,
  tag: 1.0,
};

/** Height in px that one stacked pop of this kind takes up. */
export const POP_STACK_STEP: Record<PopKind, number> = {
  dmg: 64,
  crit: 80,
  chip: 28,
  hurt: 56,
  leak: 48,
  heal: 40,
  weak: 34,
  break: 84,
  perfect: 36,
  block: 36,
  parry: 36,
  skill: 34,
  gold: 34,
  tag: 34,
};

/** Pops spawned on the same anchor within this window are stacked instead of overlapped. */
export const STACK_WINDOW = 0.45;
export const MAX_POPS = 28;
/** Cap on the stack height so many same-tick pops cannot climb the whole screen. */
export const MAX_STACK_Y = 170;

const TAG_KINDS: readonly PopKind[] = ["weak", "tag", "perfect"];
/** T6.3 #11: at most this many tag pops are alive on one anchor. */
export const MAX_TAGS_PER_ANCHOR = 3;

const anchorKey = (a: PopAnchor): string =>
  a.kind === "enemy"
    ? `e${a.id}`
    : a.kind === "hero"
      ? "h"
      : `s${Math.round(a.x / 40)},${Math.round(a.y / 40)}`;

export class PopSystem {
  readonly pops: Pop[] = [];
  private uid = 1;
  private seed = 0x9e3779b9;

  /** Deterministic jitter in [-1, 1) (HUD only; keeps screenshots reproducible). */
  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 31 - 1;
  }

  spawn(kind: PopKind, text: string, anchor: PopAnchor, size = 1): Pop {
    const key = anchorKey(anchor);
    let slot = 0;
    let stackY = 0;
    for (const p of this.pops) {
      if (anchorKey(p.anchor) === key && p.age < STACK_WINDOW) {
        slot++;
        stackY += POP_STACK_STEP[p.kind];
      }
    }
    const pop: Pop = {
      uid: this.uid++,
      kind,
      text,
      anchor,
      age: 0,
      dur: POP_LIFETIME[kind],
      slot,
      stackY,
      vx: this.rnd() * 14,
      size,
      offX: 0,
      offY: 0,
    };
    pop.stackY = Math.min(pop.stackY, MAX_STACK_Y);
    this.pops.push(pop);
    while (this.pops.length > MAX_POPS) {
      // drop the least important oldest pop (chips first)
      let idx = this.pops.findIndex((p) => p.kind === "chip");
      if (idx < 0) idx = 0;
      this.pops.splice(idx, 1);
    }
    return pop;
  }

  /**
   * Tags spawned on one anchor in the same moment are merged into ONE row ("CRIT · WEAK").
   * A "...WEAK" part replaces a shorter "WEAK" part instead of duplicating it.
   */
  spawnTag(kind: PopKind, text: string, anchor: PopAnchor): Pop {
    const key = anchorKey(anchor);
    const live = this.pops.filter((p) => TAG_KINDS.includes(p.kind) && anchorKey(p.anchor) === key);
    // WEAK merges with the element WEAK ("FIRE WEAK") for as long as either one is alive
    const weakPop = text.endsWith("WEAK")
      ? live.find((p) => p.text.split(" · ").some((x) => x.endsWith("WEAK")))
      : undefined;
    const cur = weakPop ?? live.find((p) => p.age < STACK_WINDOW);
    if (!cur) {
      if (live.length >= MAX_TAGS_PER_ANCHOR) return live[live.length - 1] as Pop;
      return this.spawn(kind, text, anchor);
    }
    const parts = cur.text.split(" · ");
    for (const np of text.split(" · ")) {
      if (parts.includes(np)) continue;
      const i = np.endsWith("WEAK") ? parts.findIndex((x) => x.endsWith("WEAK")) : -1;
      if (i >= 0) {
        if (np.length > (parts[i] ?? "").length) parts[i] = np;
      } else parts.push(np);
    }
    cur.text = parts.join(" · ");
    if (parts.some((x) => x.endsWith("WEAK"))) cur.kind = "weak";
    return cur;
  }

  update(dt: number): void {
    for (const p of this.pops) p.age += dt;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (p && p.age >= p.dur) this.pops.splice(i, 1);
    }
  }

  clear(): void {
    this.pops.length = 0;
  }
}

/** Fade multiplier: 1 until 78% of the lifetime, then linear to 0 (POC). */
export function popAlpha(p: Pick<Pop, "age" | "dur">): number {
  const k = p.age / p.dur;
  return Math.min(1, Math.max(0, k > 0.78 ? (1 - k) / 0.22 : 1));
}

/** Punch-in scale: 2.1 -> 1 over the first 0.14 s (easeOutBack-like), 1 afterwards. */
export function popScale(age: number, reducedMotion = false): number {
  if (reducedMotion || age >= 0.14) return 1;
  const k = age / 0.14;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const e = 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
  return 2.1 + (1 - 2.1) * e;
}

/** Boss BREAK pop: max design-px distance of its centre from the boss head anchor. */
export const BOSS_BREAK_MAX_DIST = 160;
/** Any other enemy's BREAK pop: max design-px distance of its centre from its head (hard clamp, even when crowded). */
export const BREAK_MAX_DIST = 140;
/** Size factors tried (largest first) when a crowded BREAK pop does not fit within its clamp at full size. */
export const BREAK_SHRINK = [1, 0.8, 0.64, 0.5] as const;

export function inflate(r: Rect, n: number): Rect {
  return { x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n };
}
export function overlapsRect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Smallest offset that clears every obstacle and satisfies `ok`; NaN when nothing fits (hide the pop). */
export function freeSpot(
  base: Rect,
  obst: readonly Rect[],
  ok: (r: Rect) => boolean,
): { x: number; y: number } {
  const gap = 6;
  const dxs = [0];
  const dys = [0];
  for (const o of obst) {
    if (!overlapsRect(base, o)) continue;
    dys.push(o.y - gap - (base.y + base.h), o.y + o.h + gap - base.y);
    dxs.push(o.x - gap - (base.x + base.w), o.x + o.w + gap - base.x);
  }
  let best: { x: number; y: number; c: number } | null = null;
  for (const dx of dxs)
    for (const dy of dys) {
      const r: Rect = { ...base, x: base.x + dx, y: base.y + dy };
      if (!ok(r)) continue;
      const c = dx * dx + (dy > 0 ? 1.15 : 1) * dy * dy;
      if (!best || c < best.c) best = { x: dx, y: dy, c };
    }
  if (!best) {
    // crowded: scan a grid around the pop for the nearest free spot
    for (let dy = -320; dy <= 320; dy += 10)
      for (let dx = -420; dx <= 420; dx += 12) {
        const r: Rect = { ...base, x: base.x + dx, y: base.y + dy };
        if (!ok(r)) continue;
        const c = dx * dx + dy * dy;
        if (!best || c < best.c) best = { x: dx, y: dy, c };
      }
  }
  // still nothing (screen full of plates): hide this pop rather than cover a word
  return best ?? { x: Number.NaN, y: Number.NaN };
}

/**
 * Crowded BREAK pop: find a spot that satisfies `ok` (which embeds the max-distance clamp and the keep-out rects) by
 * shrinking the pop instead of drifting it away. `baseAt(k)` is the pop box at size factor k. Null = skip this frame.
 */
export function fitBreakPop(
  baseAt: (k: number) => Rect,
  ok: (r: Rect) => boolean,
  obst: readonly Rect[],
): { k: number; x: number; y: number } | null {
  for (const k of BREAK_SHRINK) {
    const best = freeSpot(baseAt(k), obst, ok);
    if (!Number.isNaN(best.x)) return { k, ...best };
  }
  return null;
}

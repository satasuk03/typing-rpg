/**
 * Plate layout solver (pure, no DOM). Guarantees:
 *  - plates never overlap each other or any `avoid` rect (by at least `gap`),
 *  - plates stay inside [margin, size - margin],
 *  - the result does not depend on input order (priority, then id) and is stable frame to frame
 *    (anchor changes within `deadband` px reuse the previous anchor).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutBox {
  id: number;
  w: number;
  h: number;
  /** Desired anchor: bottom-centre of the plate (over the enemy's head). */
  ax: number;
  ay: number;
  /** Lower places first (keeps its desired spot). Default 1. */
  priority?: number;
}

export interface LayoutOpts {
  width: number;
  height: number;
  margin: number;
  gap: number;
  avoid: readonly Rect[];
  /** Anchor movement smaller than this keeps the previous anchor (anti-jitter). */
  deadband: number;
}

export interface LayoutState {
  prev: Map<number, { ax: number; ay: number; w: number; h: number }>;
}

export const newLayoutState = (): LayoutState => ({ prev: new Map() });

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
  );
}

export function rectInside(r: Rect, width: number, height: number, margin = 0): boolean {
  return (
    r.x >= margin - 1e-6 &&
    r.y >= margin - 1e-6 &&
    r.x + r.w <= width - margin + 1e-6 &&
    r.y + r.h <= height - margin + 1e-6
  );
}

export function solveLayout(
  boxes: readonly LayoutBox[],
  opts: LayoutOpts,
  state: LayoutState = newLayoutState(),
): Map<number, Rect> {
  const { width, height, margin, gap, avoid, deadband } = opts;
  const order = [...boxes].sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1) || a.id - b.id);
  const placed: Rect[] = [];
  const out = new Map<number, Rect>();
  const nextPrev: LayoutState["prev"] = new Map();

  for (const b of order) {
    const w = Math.ceil(b.w);
    const h = Math.ceil(b.h);
    let ax = b.ax;
    let ay = b.ay;
    const p = state.prev.get(b.id);
    if (
      p &&
      p.w === w &&
      p.h === h &&
      Math.abs(ax - p.ax) <= deadband &&
      Math.abs(ay - p.ay) <= deadband
    ) {
      ax = p.ax;
      ay = p.ay;
    }
    nextPrev.set(b.id, { ax, ay, w, h });

    const maxX = Math.max(margin, width - margin - w);
    const maxY = Math.max(margin, height - margin - h);
    const clampX = (x: number) => Math.round(Math.min(maxX, Math.max(margin, x)));
    const clampY = (y: number) => Math.round(Math.min(maxY, Math.max(margin, y)));
    const dx = clampX(ax - w / 2);
    const dy = clampY(ay - h);
    const obstacles = [...avoid, ...placed];
    const valid = (x: number, y: number): boolean => {
      const r = { x, y, w, h };
      for (const o of obstacles) if (rectsOverlap(r, o, gap)) return false;
      return true;
    };
    const cost = (x: number, y: number): number => (x - dx) ** 2 + 0.7 * (y - dy) ** 2;

    let best: { x: number; y: number; c: number } | null = null;
    const consider = (x: number, y: number): void => {
      const cx = clampX(x);
      const cy = clampY(y);
      if (!valid(cx, cy)) return;
      const c = cost(cx, cy);
      if (
        !best ||
        c < best.c - 1e-9 ||
        (Math.abs(c - best.c) <= 1e-9 && (cy < best.y || (cy === best.y && cx < best.x)))
      )
        best = { x: cx, y: cy, c };
    };

    const xs = [dx];
    const ys = [dy];
    for (const o of obstacles) {
      xs.push(o.x - w - gap, o.x + o.w + gap);
      ys.push(o.y - h - gap, o.y + o.h + gap);
    }
    for (const x of xs) for (const y of ys) consider(x, y);
    if (!best) {
      for (let y = margin; y <= maxY; y += 6)
        for (let x = margin; x <= maxX; x += 8) consider(x, y);
    }
    const fin = (best as { x: number; y: number } | null) ?? { x: dx, y: dy };
    const r: Rect = { x: fin.x, y: fin.y, w, h };
    placed.push(r);
    out.set(b.id, r);
  }
  state.prev = nextPrev;
  return out;
}

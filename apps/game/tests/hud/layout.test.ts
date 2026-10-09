import { describe, expect, it } from "vitest";
import type { LayoutBox, LayoutOpts, Rect } from "../../src/hud/layout";
import { newLayoutState, rectInside, rectsOverlap, solveLayout } from "../../src/hud/layout";

const W = 1280;
const H = 720;
const AVOID: Rect[] = [
  { x: 22, y: 18, w: 340, h: 104 },
  { x: 1038, y: 18, w: 220, h: 104 },
  { x: 1028, y: 128, w: 232, h: 170 },
  { x: 20, y: 570, w: 200, h: 134 },
];
const OPTS: LayoutOpts = { width: W, height: H, margin: 10, gap: 6, avoid: AVOID, deadband: 3 };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBoxes(r: () => number, n: number): LayoutBox[] {
  const out: LayoutBox[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: i + 1,
      w: 110 + Math.floor(r() * 220),
      h: 60 + Math.floor(r() * 30),
      ax: r() * W,
      ay: 120 + r() * 480,
      priority: r() < 0.3 ? 0 : 1,
    });
  }
  return out;
}

function assertValid(boxes: LayoutBox[], res: Map<number, Rect>, opts = OPTS): void {
  const rects = boxes.map((b) => res.get(b.id) as Rect);
  for (const r of rects) {
    expect(r).toBeDefined();
    expect(rectInside(r, opts.width, opts.height, opts.margin)).toBe(true);
    for (const a of opts.avoid) expect(rectsOverlap(r, a, 0)).toBe(false);
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      expect(rectsOverlap(rects[i] as Rect, rects[j] as Rect, 0)).toBe(false);
}

describe("layout solver", () => {
  it("random stress: 1-6 plates never overlap each other or the HUD, and stay on screen", () => {
    const r = mulberry(12345);
    for (let iter = 0; iter < 600; iter++) {
      const n = 1 + Math.floor(r() * 6);
      const boxes = randomBoxes(r, n);
      assertValid(boxes, solveLayout(boxes, OPTS));
    }
  });

  it("is independent of input order (stable ordering)", () => {
    const r = mulberry(777);
    for (let iter = 0; iter < 200; iter++) {
      const boxes = randomBoxes(r, 1 + Math.floor(r() * 6));
      const a = solveLayout(boxes, OPTS);
      const shuffled = [...boxes].sort(() => r() - 0.5);
      const b = solveLayout(shuffled, OPTS);
      for (const bx of boxes) expect(b.get(bx.id)).toEqual(a.get(bx.id));
    }
  });

  it("does not jitter: sub-deadband anchor noise leaves every rect untouched", () => {
    const r = mulberry(99);
    for (let iter = 0; iter < 100; iter++) {
      const boxes = randomBoxes(r, 1 + Math.floor(r() * 6));
      const st = newLayoutState();
      const first = solveLayout(boxes, OPTS, st);
      for (let f = 0; f < 10; f++) {
        const noisy = boxes.map((b) => ({
          ...b,
          ax: b.ax + (r() - 0.5) * 4,
          ay: b.ay + (r() - 0.5) * 4,
        }));
        const again = solveLayout(noisy, OPTS, st);
        for (const b of boxes) expect(again.get(b.id)).toEqual(first.get(b.id));
      }
    }
  });

  it("keeps a plate over its enemy when there is room", () => {
    const res = solveLayout([{ id: 1, w: 150, h: 60, ax: 640, ay: 400 }], OPTS);
    const r = res.get(1) as Rect;
    expect(r.x + r.w / 2).toBeCloseTo(640, -1);
    expect(r.y + r.h).toBe(400);
  });

  it("pushes a plate that would sit under the HUD out of it", () => {
    const res = solveLayout([{ id: 1, w: 200, h: 60, ax: 150, ay: 100 }], OPTS);
    const r = res.get(1) as Rect;
    expect(AVOID.some((a) => rectsOverlap(r, a, 0))).toBe(false);
  });

  it("separates identical anchors (3 plates on one enemy)", () => {
    const boxes: LayoutBox[] = [1, 2, 3].map((id) => ({ id, w: 160, h: 64, ax: 640, ay: 380 }));
    assertValid(boxes, solveLayout(boxes, OPTS));
  });

  it("handles a tall wrapped boss sentence plate plus guard plate", () => {
    const boxes: LayoutBox[] = [
      { id: 1, w: 600, h: 100, ax: 640, ay: 260 },
      { id: 2, w: 190, h: 76, ax: 640, ay: 260, priority: 0 },
    ];
    assertValid(
      boxes,
      solveLayout(boxes, { ...OPTS, avoid: [...AVOID, { x: 390, y: 18, w: 500, h: 100 }] }),
    );
  });
});

import { describe, expect, it } from "vitest";
import type { Rect } from "../../src/hud/layout";
import { BREAK_MAX_DIST, fitBreakPop, inflate, overlapsRect } from "../../src/hud/pops";

const W = 1280;
const H = 720;

/** A crowded layout: the head anchor sits in a wall of word plates, free space only far away. */
describe("crowded BREAK pop (small enemy)", () => {
  const head = { x: 640, y: 300 };
  const plates: Rect[] = [];
  // a dense block of plates around the head, 330 px wide
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) plates.push({ x: 470 + i * 85, y: 200 + j * 70, w: 80, h: 64 });
  const obst = plates.map((r) => inflate(r, 4));
  const popBox = (k: number): Rect => {
    const w = 190 * k;
    const h = 60 * k;
    return { x: head.x - w / 2, y: head.y - h / 2, w, h };
  };
  const ok = (r: Rect): boolean =>
    Math.hypot(r.x + r.w / 2 - head.x, r.y + r.h / 2 - head.y) <= BREAK_MAX_DIST &&
    r.x >= 4 &&
    r.x + r.w <= W - 4 &&
    r.y >= 56 &&
    r.y + r.h <= H - 4 &&
    !obst.some((o) => overlapsRect(r, o));

  it("never lands farther than BREAK_MAX_DIST from the head and never covers a plate", () => {
    const fit = fitBreakPop(popBox, ok, obst);
    if (!fit) return; // skipped (faded) is allowed; drifting away is not
    const b = popBox(fit.k);
    const r = { ...b, x: b.x + fit.x, y: b.y + fit.y };
    expect(Math.hypot(r.x + r.w / 2 - head.x, r.y + r.h / 2 - head.y)).toBeLessThanOrEqual(
      BREAK_MAX_DIST,
    );
    expect(obst.some((o) => overlapsRect(r, o))).toBe(false);
  });

  it("shrinks rather than drifting when a gap only fits a smaller pop", () => {
    // free band 80 px tall under the head: a 60 px pop at k=1 fits only after the keep-out gap; make it tighter
    const tight: Rect[] = [
      { x: 0, y: 0, w: W, h: 290 },
      { x: 0, y: 330, w: W, h: H - 330 },
    ].map((r) => inflate(r, 0));
    const okT = (r: Rect): boolean =>
      Math.hypot(r.x + r.w / 2 - head.x, r.y + r.h / 2 - head.y) <= BREAK_MAX_DIST &&
      r.y >= 56 &&
      !tight.some((o) => overlapsRect(r, o));
    const fit = fitBreakPop(popBox, okT, tight);
    expect(fit).not.toBeNull();
    expect(fit?.k).toBeLessThan(1);
  });

  it("returns null (pop skipped) when no free spot exists within the clamp", () => {
    const wall: Rect[] = [{ x: 0, y: 56, w: W, h: H }];
    const okW = (r: Rect): boolean =>
      Math.hypot(r.x + r.w / 2 - head.x, r.y + r.h / 2 - head.y) <= BREAK_MAX_DIST &&
      !overlapsRect(r, wall[0] as Rect);
    expect(fitBreakPop(popBox, okW, wall)).toBeNull();
  });
});

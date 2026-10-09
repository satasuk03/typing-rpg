import type { SimEvent } from "@hd2d/sim";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GuardGlyphs } from "../../src/hud/fx/typing/guardGlyphs";
import { WordOrbs } from "../../src/hud/fx/typing/wordOrb";
import { FIN_T } from "../../src/render/vfx/FinisherCinematic";
import { PresentationQueue } from "../../src/render/vfx/PresentationQueue";
import { boltScale } from "../../src/render/vfx/SentenceBolts";
import { screenToActionPlane } from "../../src/render/vfx/screenToWorld";

describe("screenToActionPlane", () => {
  it("inverts the camera projection on the z = 0 plane", () => {
    const cam = new PerspectiveCamera(32, 16 / 9, 0.5, 260);
    cam.position.set(4, 5, 18);
    cam.lookAt(4, 1.5, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    for (const [x, y] of [
      [4, 1.5],
      [2.5, 3.1],
      [8.2, 0.4],
      [-1, 2],
    ] as const) {
      const n = new Vector3(x, y, 0).project(cam);
      const out = new Vector3();
      const ok = screenToActionPlane(
        cam,
        (n.x * 0.5 + 0.5) * 1280,
        (-n.y * 0.5 + 0.5) * 720,
        1280,
        720,
        out,
      );
      expect(ok).toBe(true);
      expect(out.x).toBeCloseTo(x, 3);
      expect(out.y).toBeCloseTo(y, 3);
      expect(out.z).toBe(0);
    }
  });

  it("returns false when the ray never reaches the plane", () => {
    const cam = new PerspectiveCamera(32, 16 / 9, 0.5, 260);
    cam.position.set(0, 5, 18);
    cam.lookAt(0, 5, 0); // looking straight along -z: the centre ray hits the plane, a ray above the horizon...
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const out = new Vector3(9, 9, 9);
    // the ray through the very top of a camera looking at the horizon still descends toward z = 0: fine;
    // a camera facing away from the plane cannot see it
    const away = new PerspectiveCamera(32, 16 / 9, 0.5, 260);
    away.position.set(0, 5, 18);
    away.lookAt(0, 5, 40);
    away.updateMatrixWorld();
    away.updateProjectionMatrix();
    expect(screenToActionPlane(away, 640, 360, 1280, 720, out)).toBe(false);
    expect(out.x).toBe(9);
  });
});

describe("sentence bolts", () => {
  it("escalate through the sentence", () => {
    expect(boltScale(0, 4)).toBeCloseTo(0.85);
    expect(boltScale(3, 4)).toBeCloseTo(1.3);
    expect(boltScale(1, 4)).toBeLessThan(boltScale(2, 4));
  });
});

describe("word orb hand-off", () => {
  it("collapses for 120 ms, then hands the orb to the world exactly once", () => {
    const orbs = new WordOrbs();
    const got: { x: number; y: number; w: number; exit: number }[] = [];
    orbs.onLaunch = (x, y, p) => got.push({ x, y, w: p.wordIndex, exit: p.exitY });
    orbs.start([100, 200, 140, 200, 180, 200], 3, 0, {
      plateId: 5,
      kind: "doom",
      wordIndex: 1,
      wordCount: 4,
      final: false,
      exitY: 230,
    });
    for (let i = 0; i < 6; i++) orbs.update(1 / 60); // 100 ms
    expect(got).toHaveLength(0);
    for (let i = 0; i < 3; i++) orbs.update(1 / 60);
    expect(got).toHaveLength(1);
    // the bolt leaves from the plate's bottom edge so it is not hidden behind the opaque plate
    expect(got[0]).toEqual({ x: 140, y: 230, w: 1, exit: 230 });
    for (let i = 0; i < 20; i++) orbs.update(1 / 60);
    expect(got).toHaveLength(1);
    expect(orbs.count).toBe(0);
  });
});

describe("guard glyphs", () => {
  const S = 1;
  it("fly to their slots, lock, snap into a wall, pop and vanish", () => {
    const g = new GuardGlyphs();
    g.cx = 300;
    g.cy = 400;
    let landed = 0;
    let pops = 0;
    g.onLand = () => landed++;
    g.onPop = () => pops++;
    for (let i = 0; i < 5; i++) g.add(9, 3, i, 5, 600 + i * 20, 200, S);
    expect(g.count).toBe(5);
    expect(g.has(9)).toBe(true);
    for (let i = 0; i < 14; i++) g.update(1 / 60, S); // 233 ms > the 200 ms flight
    expect(landed).toBe(5);
    g.snap(9, 100);
    for (let i = 0; i < 12; i++) g.update(1 / 60, S);
    expect(pops).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) g.update(1 / 60, S);
    expect(g.count).toBe(0);
    expect(g.has(9)).toBe(false);
  });

  it("crumble removes them after 400 ms; a guard typo flicker keeps them", () => {
    const g = new GuardGlyphs();
    g.cx = 300;
    g.cy = 400;
    for (let i = 0; i < 4; i++) g.add(2, 8, i, 4, 500, 200, S);
    for (let i = 0; i < 14; i++) g.update(1 / 60, S);
    g.flicker();
    for (let i = 0; i < 10; i++) g.update(1 / 60, S);
    expect(g.count).toBe(4); // flicker does not remove glyphs
    expect(g.hasOwner(8)).toBe(true);
    g.crumbleOwner(8);
    for (let i = 0; i < 20; i++) g.update(1 / 60, S);
    expect(g.count).toBe(4); // 333 ms: still falling
    for (let i = 0; i < 6; i++) g.update(1 / 60, S);
    expect(g.count).toBe(0);
  });

  it("letters beyond 10 share a slot", () => {
    const g = new GuardGlyphs();
    for (let i = 0; i < 14; i++) g.add(1, 1, i, 14, 400, 200, S);
    expect(g.count).toBeLessThanOrEqual(10);
  });
});

describe("finisher timeline and the presentation queue", () => {
  const hit = { type: "Hit", targetId: 7, kind: "finisher" } as unknown as SimEvent;
  const death = { type: "EnemyDeath", enemyId: 7, byKind: "finisher" } as unknown as SimEvent;
  const cleared = { type: "EncounterCleared" } as unknown as SimEvent;

  it("matches the spec table", () => {
    expect(FIN_T.slashMs).toEqual([300, 420, 540, 660, 780]);
    expect(FIN_T.slashDeg).toEqual([-35, 30, -10, 55, -60]);
    expect(FIN_T.crossMs).toBe(900);
    expect(FIN_T.deathMs).toBe(1060);
    expect(FIN_T.returnMs).toBe(1600);
    expect(FIN_T.endMs).toBe(2400);
  });

  it("holds the finishing hit and the death until 1060 ms, in order", () => {
    const q = new PresentationQueue();
    q.holdEntity(7, 1060 - 16);
    expect(q.gate(hit, 0)).toBe(true);
    expect(q.gate(death, 0)).toBe(true);
    const out: SimEvent[] = [];
    q.flush(1000, (e) => out.push(e));
    expect(out).toHaveLength(0);
    q.flush(1060, (e) => out.push(e));
    expect(out.map((e) => e.type)).toEqual(["Hit"]);
    // the death follows the hit by the 16 ms gate gap (the spec's t = 1060 ms, give or take one frame)
    q.flush(1080, (e) => out.push(e));
    expect(out.map((e) => e.type)).toEqual(["Hit", "EnemyDeath"]);
  });

  it("a clear event waits behind a live hold", () => {
    const q = new PresentationQueue();
    q.holdEntity(7, 1044);
    expect(q.holdUntil(0)).toBe(1044);
    expect(q.holdUntil(1044)).toBe(-1);
    q.defer(cleared, 1044 + 32);
    const out: SimEvent[] = [];
    q.flush(1060, (e) => out.push(e));
    expect(out).toHaveLength(0);
    q.flush(1100, (e) => out.push(e));
    expect(out.map((e) => e.type)).toEqual(["EncounterCleared"]);
  });

  it("events for other enemies are not held", () => {
    const q = new PresentationQueue();
    q.holdEntity(7, 1044);
    expect(q.gate({ type: "Hit", targetId: 8, kind: "auto" } as unknown as SimEvent, 0)).toBe(
      false,
    );
  });
});

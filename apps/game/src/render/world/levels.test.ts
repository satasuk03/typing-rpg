import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ProceduralSpriteSource } from "../sprites/ProceduralSpriteSource";
import {
  anchorMap,
  battleCameraName,
  heroAnchorName,
  LANE_Z,
  LayoutError,
  type LevelLayout,
  parseLevelLayout,
  propSignature,
  slotAnchorName,
} from "./layout";
import { levelIds, loadLevel, rawLevel } from "./registry";
import { moodAtX, WalkPath } from "./WorldBuilder";

const IDS = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe("chapter 1 level layouts", () => {
  it("has exactly ch1-l01 .. ch1-l10", () => {
    expect(levelIds()).toEqual(IDS);
  });

  for (const id of IDS) {
    describe(id, () => {
      const l = loadLevel(id);
      const anchors = anchorMap(l);

      it("is schema-valid and keeps its id", () => {
        expect(l.id).toBe(id);
        expect(l.chapter).toBe(1);
        expect(l.name.length).toBeGreaterThan(0);
      });

      it("has anchors for every encounter, hero and enemy slot", () => {
        expect(l.encounters.length).toBeGreaterThanOrEqual(2);
        for (const e of l.encounters) {
          expect(anchors.has(heroAnchorName(e.index)), heroAnchorName(e.index)).toBe(true);
          expect(e.slots).toBeGreaterThanOrEqual(1);
          const xs: number[] = [];
          for (let s = 0; s < e.slots; s++) {
            const a = anchors.get(slotAnchorName(e.index, s));
            expect(a, slotAnchorName(e.index, s)).toBeDefined();
            xs.push(a?.x ?? 0);
          }
          // slots stand to the right of the hero
          const hero = anchors.get(heroAnchorName(e.index));
          for (const x of xs) expect(x).toBeGreaterThan(hero?.x ?? 0);
          expect(l.cameras.some((c) => c.name === battleCameraName(e.index))).toBe(true);
        }
      });

      it("encounters are ordered along the walk, between start and end", () => {
        const start = anchors.get("start")?.x ?? 0;
        const end = anchors.get("end")?.x ?? 0;
        let prev = start;
        for (const e of l.encounters) {
          const x = anchors.get(heroAnchorName(e.index))?.x ?? 0;
          expect(x).toBeGreaterThan(prev + 8);
          expect(x).toBeLessThan(end);
          prev = x;
        }
        expect(l.walkPath[0]?.[0]).toBe(start);
        expect(l.walkPath[l.walkPath.length - 1]?.[0]).toBe(end);
      });

      it("has foreground framing, light and a dressed ground (no bare level)", () => {
        const fg =
          l.props.filter((p) => p.foreground).length +
          l.scatters.filter((s) => s.foreground).length;
        expect(fg).toBeGreaterThanOrEqual(5);
        expect(l.props.length + l.scatters.length).toBeGreaterThanOrEqual(15);
        expect(
          l.rayFields.length +
            l.godRays.length +
            l.lights.length +
            l.props.filter((p) => p.flame > 0 || p.light).length +
            l.scatters.filter((s) => s.flame > 0 || s.light).length,
        ).toBeGreaterThan(0);
        expect(l.zones.length).toBeGreaterThanOrEqual(1);
      });

      it("keeps ground props out of the hero lane and uses real sprite keys", () => {
        const src = new ProceduralSpriteSource();
        const keys = [...l.props.map((p) => p.key), ...l.scatters.flatMap((s) => s.keys)];
        for (const k of keys) expect(src.has(k), k).toBe(true);
        for (const p of l.props.filter((p) => !p.foreground && p.y < 6)) {
          expect(p.z <= LANE_Z[0] || p.z >= LANE_Z[1], `${p.key}@${p.x},${p.z}`).toBe(true);
        }
        for (const s of l.scatters.filter((s) => !s.foreground && s.y[1] < 6)) {
          expect(s.z1 <= LANE_Z[0] || s.z0 >= LANE_Z[1], `scatter ${s.keys[0]}`).toBe(true);
        }
      });
    });
  }

  it("L1-L2 have 2 encounters, L3-L10 have 3, L10 ends in a boss arena with waves", () => {
    const counts = IDS.map((id) => loadLevel(id).encounters.length);
    expect(counts).toEqual([2, 2, 3, 3, 3, 3, 3, 3, 3, 3]);
    const l10 = loadLevel("ch1-l10");
    expect(l10.encounters.some((e) => e.waves > 1)).toBe(true);
    const boss = l10.encounters.find((e) => e.boss);
    expect(boss).toBeDefined();
    expect(l10.cameras.some((c) => c.name === "boss")).toBe(true);
    expect(l10.runes.length).toBeGreaterThan(0);
    for (const id of IDS.slice(0, 9))
      expect(loadLevel(id).encounters.some((e) => e.boss)).toBe(false);
  });

  it("biome progression: forest early, ruins mid, cave late, hollow boss", () => {
    expect(IDS.map((id) => loadLevel(id).biome)).toEqual([
      "forest",
      "forest",
      "forest",
      "ruins",
      "ruins",
      "ruins",
      "ruins",
      "cave",
      "cave",
      "hollow",
    ]);
  });

  it("no two levels share a prop composition, mood or name", () => {
    const levels = IDS.map((id) => loadLevel(id));
    const sigs = new Set(levels.map((l) => propSignature(l)));
    expect(sigs.size).toBe(levels.length);
    expect(new Set(levels.map((l) => l.name)).size).toBe(levels.length);
    expect(
      new Set(levels.map((l) => JSON.stringify(l.segments.map((s) => [s.biome, s.mood])))).size,
    ).toBe(levels.length);
    // ...and they are not near-duplicates either: prop-key histograms differ noticeably
    const hist = (l: LevelLayout): Map<string, number> => {
      const m = new Map<string, number>();
      for (const p of l.props) m.set(p.key, (m.get(p.key) ?? 0) + 1);
      for (const s of l.scatters) {
        const n = (s.x1 - s.x0) / ((s.spacing[0] + s.spacing[1]) / 2);
        for (const k of s.keys) m.set(k, (m.get(k) ?? 0) + n / s.keys.length);
      }
      return m;
    };
    const dist = (a: Map<string, number>, b: Map<string, number>): number => {
      let d = 0;
      let tot = 0;
      for (const k of new Set([...a.keys(), ...b.keys()])) {
        d += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
        tot += (a.get(k) ?? 0) + (b.get(k) ?? 0);
      }
      return d / tot;
    };
    for (let i = 0; i < levels.length; i++) {
      for (let j = i + 1; j < levels.length; j++) {
        const d = dist(hist(levels[i] as LevelLayout), hist(levels[j] as LevelLayout));
        expect(d, `${IDS[i]} vs ${IDS[j]}`).toBeGreaterThan(0.12);
      }
    }
  });

  it("transition levels blend moods across their segments", () => {
    for (const id of ["ch1-l03", "ch1-l07", "ch1-l10"]) {
      const l = loadLevel(id);
      expect(l.segments.length).toBeGreaterThanOrEqual(2);
      const segs = [...l.segments].sort((a, b) => a.x0 - b.x0);
      const a = segs[0];
      const b = segs[1];
      if (!a || !b) throw new Error("segments");
      const early = moodAtX(segs, a.x0 + 2);
      const late = moodAtX(segs, b.x0 + b.x1 - b.x0 - 2);
      const edge = moodAtX(segs, a.x1);
      expect(JSON.stringify(early.amb)).not.toBe(JSON.stringify(late.amb));
      // at the boundary the blend sits strictly between the two
      const k = (m: { caveK: number; fogCol: readonly number[] }): number =>
        (m.fogCol[0] ?? 0) + m.caveK;
      const lo = Math.min(k(early), k(late));
      const hi = Math.max(k(early), k(late));
      expect(k(edge)).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(k(edge)).toBeLessThanOrEqual(hi + 1e-9);
    }
  });
});

describe("layout validation rejects bad data", () => {
  const good = rawLevel("ch1-l01");
  const entities = (
    j: unknown,
  ): { __identifier: string; fieldInstances: { __identifier: string; __value: unknown }[] }[] =>
    (j as { levels: { layerInstances: { entityInstances: never[] }[] }[] }).levels[0]
      ?.layerInstances[0]?.entityInstances ?? [];

  it("accepts the good file", () => {
    expect(() => parseLevelLayout(clone(good))).not.toThrow();
  });

  it("rejects a missing enemy slot anchor", () => {
    const j = clone(good);
    const ents = entities(j);
    const i = ents.findIndex((e) => e.fieldInstances.some((f) => f.__value === "enc1.slot1"));
    ents.splice(i, 1);
    expect(() => parseLevelLayout(j)).toThrow(LayoutError);
    expect(() => parseLevelLayout(j)).toThrow(/enc1\.slot1/);
  });

  it("rejects unknown fields, unknown entity types and out-of-range values", () => {
    const j1 = clone(good);
    entities(j1)[0]?.fieldInstances.push({ __identifier: "bogus", __value: 1 });
    expect(() => parseLevelLayout(j1)).toThrow(LayoutError);
    const j2 = clone(good);
    const e = entities(j2)[0];
    if (e) e.__identifier = "Spaceship";
    expect(() => parseLevelLayout(j2)).toThrow(/unknown entity type/);
    expect(() => parseLevelLayout({ nope: 1 })).toThrow(LayoutError);
  });

  it("rejects a mid-ground scatter overlapping the hero lane", () => {
    const j = clone(good);
    const ents = entities(j);
    const p = ents.find(
      (e) =>
        e.__identifier === "Scatter" &&
        !e.fieldInstances.some((f) => f.__identifier === "foreground" && f.__value === true),
    );
    expect(p).toBeDefined();
    // move the scatter's depth rect to z = 0 (px = (z - zOrigin) * 16, zOrigin = -16)
    if (p) (p as unknown as { px: number[] }).px[1] = 256;
    expect(() => parseLevelLayout(j)).toThrow(/hero lane/);
  });
});

describe("WalkPath sampler", () => {
  const path = new WalkPath([
    [0, 0],
    [10, 0],
    [10, 10],
  ]);
  it("measures arc length and samples by distance / t", () => {
    expect(path.length).toBeCloseTo(20);
    expect(path.sample(0)).toMatchObject({ x: 0, z: 0 });
    expect(path.sample(0.5)).toMatchObject({ x: 10, z: 0 });
    const mid = path.sample(0.75);
    expect(mid.x).toBeCloseTo(10);
    expect(mid.z).toBeCloseTo(5);
    expect(mid.tz).toBeCloseTo(1);
    expect(path.sample(2).z).toBeCloseTo(10);
    expect(path.zAtX(5)).toBeCloseTo(0);
  });

  it("every level's walk path samples start..end monotonically", () => {
    for (const id of IDS) {
      const l = loadLevel(id);
      const p = new WalkPath(l.walkPath);
      let prev = -Infinity;
      for (let t = 0; t <= 1; t += 0.05) {
        const s = p.sample(t);
        expect(s.x).toBeGreaterThanOrEqual(prev);
        prev = s.x;
      }
      expect(p.startX).toBe(anchorMap(l).get("start")?.x);
      expect(p.endX).toBe(anchorMap(l).get("end")?.x);
    }
  });
});

describe("render/world code has no hard-coded coordinates", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const CALLS =
    /\b(addProp|addFlame|addGodRay|addGround|addWall|addBackdrop|addRuneCircle|addStatic|hold|place|addLight|shadowFor)\s*\(/g;
  const NUMBER = /(?<![\w.$])-?\d+(?:\.\d+)?(?![\w.])/;

  function callArgs(src: string, open: number): string {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) return src.slice(open + 1, i);
    }
    return src.slice(open + 1);
  }

  it("scans at least the builder and layout sources", () => {
    expect(files).toContain("WorldBuilder.ts");
    expect(files).toContain("layout.ts");
  });

  for (const f of files) {
    it(`${f}: no numeric literals in prop / anchor / light / terrain calls`, () => {
      const src = readFileSync(join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const offenders: string[] = [];
      for (const m of src.matchAll(CALLS)) {
        // skip method/function *definitions* (`place = (` / `addLight = (`) and declarations
        const before = src.slice(Math.max(0, m.index - 12), m.index);
        if (/(const|function|get|set)\s+$/.test(before)) continue;
        const open = m.index + m[0].length - 1;
        const args = callArgs(src, open).replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
        if (NUMBER.test(args.replace(/\[\d+\]/g, "")))
          offenders.push(`${m[1]}(${args.replace(/\s+/g, " ").trim()})`);
      }
      expect(offenders).toEqual([]);
    });
  }

  it("never constructs anchors or props from literals", () => {
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/getAnchor\(\s*\d/);
      expect(src, f).not.toMatch(/\bx:\s*-?\d+(\.\d+)?\s*,\s*y:\s*-?\d+(\.\d+)?\s*,\s*z:/);
    }
  });
});

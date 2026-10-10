import { describe, expect, it } from "vitest";
import type { RenderWorld } from "../RenderWorld";
import { ProceduralSpriteSource } from "../sprites/ProceduralSpriteSource";
import {
  anchorMap,
  battleCameraName,
  heroAnchorName,
  LANE_Z,
  type LayoutBiome,
  type LevelLayout,
  propSignature,
  slotAnchorName,
} from "./layout";
import { levelIds, loadLevel } from "./registry";
import { buildWorld, moodAtX } from "./WorldBuilder";

const IDS = Array.from({ length: 10 }, (_, i) => `ch2-l${String(i + 1).padStart(2, "0")}`);
/** CH2_PLAN section 3.1: hushwood L1-L4, fen L5-L9, grove L10. */
const BIOMES: LayoutBiome[] = [
  "hushwood",
  "hushwood",
  "hushwood",
  "hushwood",
  "fen",
  "fen",
  "fen",
  "fen",
  "fen",
  "grove",
];
const GROUND = { hushwood: "leaf", fen: "fen", grove: "roots" } as const;
const ENCOUNTERS = [2, 2, 3, 3, 3, 3, 3, 3, 3, 3];
/** Static-light budget (C0.2 brief 1.2): at most 9 inside camX +- 17. */
const MAX_STATIC_LIGHTS = 9;
/** Mirrored-twin cap (brief 4): 60 in camX +- 22, minus the actors (hero + up to 5 enemies). */
const MAX_PROP_TWINS = 54;

interface Recorded {
  props: { key: string; x: number; y: number; z: number; fg: boolean }[];
  lights: number[];
  glows: number;
}

/** Build a layout against a recording stub (no GPU): the placed props and static lights, exactly as the builder places them. */
function record(layout: LevelLayout): Recorded {
  const out: Recorded = { props: [], lights: [], glows: 0 };
  const noop = (): void => undefined;
  const src = new ProceduralSpriteSource();
  const world = {
    source: { has: (k: string) => src.has(k) },
    scene: { children: [] },
    fgScene: { children: [] },
    lights: {
      staticLights: [],
      addStatic: (l: { x: number }) => out.lights.push(l.x),
      truncateStatics: noop,
    },
    lighting: { uBiome: { value: { set: noop } } },
    addGround: noop,
    addFogCards: noop,
    addWall: noop,
    addBackdrop: noop,
    addProp: (key: string, x: number, y: number, z: number, o: { foreground?: boolean } = {}) =>
      out.props.push({ key, x, y, z, fg: o.foreground === true }),
    addFlame: noop,
    flameY: () => 0,
    addGodRay: noop,
    addRuneCircle: noop,
    addGlow: () => out.glows++,
    remove: noop,
    pruneRemoved: noop,
  };
  buildWorld(layout, world as unknown as RenderWorld);
  return out;
}

describe("chapter 2 level layouts (T2.4)", () => {
  it("has ch2-l01 .. ch2-l10", () => {
    expect(levelIds().filter((i) => i.startsWith("ch2-"))).toEqual(IDS);
  });

  IDS.forEach((id, n) => {
    describe(id, () => {
      const l = loadLevel(id);
      const anchors = anchorMap(l);
      const rec = record(l);

      it("is a chapter-2 layout in the planned biome with its planned ground", () => {
        expect(l.chapter).toBe(2);
        expect(l.biome).toBe(BIOMES[n]);
        expect(l.ground.kind).toBe(GROUND[l.biome as keyof typeof GROUND]);
        expect(l.encounters.length).toBe(ENCOUNTERS[n]);
        expect(l.encounters.some((e) => e.boss)).toBe(n === 9);
        expect(l.backdrops.length).toBe(3);
        expect(
          l.backdrops.every((b) => (l.biome === "fen" ? /Dusk$/ : /Night$/).test(b.kind)),
        ).toBe(true);
      });

      it("has hero, slot and camera anchors per encounter, in order along the walk", () => {
        const start = anchors.get("start")?.x ?? 0;
        let prev = start;
        for (const e of l.encounters) {
          const hero = anchors.get(heroAnchorName(e.index));
          expect(hero, heroAnchorName(e.index)).toBeDefined();
          expect(hero?.x ?? 0).toBeGreaterThan(prev + 8);
          prev = hero?.x ?? 0;
          for (let s = 0; s < e.slots; s++) {
            const a = anchors.get(slotAnchorName(e.index, s));
            expect(a, slotAnchorName(e.index, s)).toBeDefined();
            expect(a?.x ?? 0).toBeGreaterThan(hero?.x ?? 0);
          }
          expect(l.cameras.some((c) => c.name === battleCameraName(e.index))).toBe(true);
          // the warm lantern pool over each fight
          expect(anchors.get(`enc${e.index}.pool`)?.kind).toBe("marker");
        }
        expect(prev).toBeLessThan(anchors.get("end")?.x ?? 0);
        expect(anchors.has("walkshot")).toBe(true);
      });

      it("keeps the hero lane clear and every sprite key real", () => {
        const src = new ProceduralSpriteSource();
        for (const k of [...l.props.map((p) => p.key), ...l.scatters.flatMap((s) => s.keys)])
          expect(src.has(k), k).toBe(true);
        for (const p of rec.props.filter((p) => !p.fg && p.y < 6))
          expect(p.z <= LANE_Z[0] || p.z >= LANE_Z[1], `${p.key}@${p.x},${p.z}`).toBe(true);
      });

      it("is dressed: foreground framing at every battle pose, lights, rays, ambience", () => {
        expect(l.props.length + l.scatters.length).toBeGreaterThanOrEqual(15);
        expect(l.zones.length).toBeGreaterThanOrEqual(1);
        expect(l.lights.length + l.props.filter((p) => p.light).length).toBeGreaterThan(0);
        expect(l.rayFields.length + l.godRays.length).toBeGreaterThan(0);
        for (const c of l.cameras.filter((c) => c.name.startsWith("battle:"))) {
          // brief 2.2: at least 2 foreground pieces inside the frame
          const fg = rec.props.filter((p) => p.fg && Math.abs(p.x - c.x) <= 9);
          expect(fg.length, `${id} ${c.name} foreground pieces`).toBeGreaterThanOrEqual(2);
        }
      });

      it("respects the static-light budget and the water-twin cap at every battle pose", () => {
        for (const c of l.cameras.filter((c) => c.name.startsWith("battle:"))) {
          const lights = rec.lights.filter((x) => Math.abs(x - c.x) <= 17).length;
          expect(lights, `${c.name} static lights`).toBeLessThanOrEqual(MAX_STATIC_LIGHTS);
          if (l.biome === "fen") {
            const twins = rec.props.filter(
              (p) => !p.fg && p.y <= 1.5 && Math.abs(p.x - c.x) <= 22,
            ).length;
            expect(twins, `${c.name} mirrored props`).toBeLessThanOrEqual(MAX_PROP_TWINS);
          }
        }
      });

      it("fen levels put reflective props in the water (columns, cypress, posts, lamps)", () => {
        if (l.biome !== "fen") return;
        const wet = rec.props.filter((p) => !p.fg && p.y <= 1.5 && p.z <= -2.4);
        expect(wet.length).toBeGreaterThan(20);
        expect(rec.lights.length).toBeGreaterThanOrEqual(6);
      });
    });
  });

  it("only L10 has the boss arena, with the Willow, adds and the riddle lane anchored", () => {
    const l = loadLevel("ch2-l10");
    const a = anchorMap(l);
    const boss = l.encounters.find((e) => e.boss);
    expect(boss?.index).toBe(3);
    expect(l.ground.arena[0]).toBeCloseTo(a.get("enc3.slot0")?.x ?? -1, 1);
    expect(a.get("enc3.slot0")?.kind).toBe("boss");
    expect(boss?.slots).toBeGreaterThanOrEqual(3); // boss + >= 2 adds
    for (let s = 1; s < (boss?.slots ?? 0); s++) expect(a.get(`enc3.slot${s}`)?.kind).toBe("slot");
    expect(l.cameras.some((c) => c.name === "boss")).toBe(true);
    expect(l.runes.length).toBeGreaterThan(0);
    // plate at the Willow's face
    const face = a.get("boss.face");
    expect(face?.y).toBeGreaterThan(3);
    expect(Math.abs((face?.x ?? 0) - (a.get("enc3.slot0")?.x ?? 99))).toBeLessThan(1);
    // riddle lane: 3 leaf anchors in lane order (left to right), between the hero and the Willow
    const leaves = [0, 1, 2].map((k) => a.get(`riddle.leaf${k}`));
    for (const f of leaves) expect(f?.y).toBeGreaterThan(1);
    const xs = leaves.map((f) => f?.x ?? 0);
    expect(xs[0]).toBeLessThan(xs[1] as number);
    expect(xs[1]).toBeLessThan(xs[2] as number);
    expect(xs[0]).toBeGreaterThan(a.get("enc3.hero")?.x ?? 0);
    expect(xs[2]).toBeLessThan((a.get("enc3.slot0")?.x ?? 0) + 3);
    expect(a.has("riddle.clue")).toBe(true);
  });

  it("no two levels share a prop composition, name or mood, and are not near-duplicates", () => {
    const levels = IDS.map((id) => loadLevel(id));
    expect(new Set(levels.map((l) => propSignature(l))).size).toBe(levels.length);
    expect(new Set(levels.map((l) => l.name)).size).toBe(levels.length);
    expect(
      new Set(levels.map((l) => JSON.stringify(l.segments.map((s) => [s.biome, s.mood])))).size,
    ).toBe(levels.length);
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
    for (let i = 0; i < levels.length; i++)
      for (let j = i + 1; j < levels.length; j++)
        expect(
          dist(hist(levels[i] as LevelLayout), hist(levels[j] as LevelLayout)),
          `${IDS[i]} vs ${IDS[j]}`,
        ).toBeGreaterThan(0.1);
  });

  it("P2-1 variety: every level carries its own signature set piece, flip twins exist, and moods differ per level", () => {
    const src = new ProceduralSpriteSource();
    const SIGNATURE: Record<string, string> = {
      "ch2-l03": "prop.ch2.hollowTrunk.",
      "ch2-l04": "prop.ch2.owlPerch",
      "ch2-l05": "prop.ch2.lily.",
      "ch2-l06": "prop.ch2.shrineGate",
      "ch2-l08": "prop.ch2.bridge",
      "ch2-l09": "prop.ch2.weeper.",
    };
    for (const [id, key] of Object.entries(SIGNATURE)) {
      const l = loadLevel(id);
      expect(
        l.props.some((p) => p.key.startsWith(key)),
        `${id} uses ${key}`,
      ).toBe(true);
    }
    for (const k of [
      "shrineGate",
      "bridge",
      "lily.0",
      "lily.1",
      "weeper.0",
      "weeper.1",
      "hollowTrunk.0",
      "hollowTrunk.1",
      "owlPerch",
    ]) {
      expect(src.has(`prop.ch2.${k}`), k).toBe(true);
      expect(src.has(`prop.ch2.${k}.flip`), `${k}.flip`).toBe(true);
    }
    // L2 drops L1's root arch, and every level has its own light colour
    expect(loadLevel("ch2-l02").props.some((p) => p.key === "prop.ch2.rootarch")).toBe(false);
    const sunCols = new Set(
      IDS.slice(0, 9).map((i) => JSON.stringify(loadLevel(i).segments[0]?.mood.sunCol ?? null)),
    );
    expect(sunCols.size).toBe(9);
    // hushwood L3 is a violet-black forest, L4 a pale silver-gold moonlit clearing; every battle camera has its own mood
    const sun = (id: string) => loadLevel(id).segments[0]?.mood.sunCol ?? [0, 0, 0];
    expect(sun("ch2-l03")[2]).toBeGreaterThan(sun("ch2-l03")[1] + 0.3); // violet: blue far above green
    expect(sun("ch2-l04")[0]).toBeGreaterThan(sun("ch2-l04")[2]); // silver-gold: warm, not teal
    for (const id of ["ch2-l03", "ch2-l04"]) {
      const l = loadLevel(id);
      expect(l.segments.length, `${id} one mood per battle camera`).toBe(3);
      expect(
        new Set(
          l.cameras
            .filter((c) => c.name.startsWith("battle:"))
            .map((c) => JSON.stringify([c.y, c.dist, c.pitch, c.fov])),
        ).size,
        `${id} per-battle camera framing`,
      ).toBe(3);
    }
  });

  it("multi-segment levels crossfade moods (L8 dusk deepens, L10 outer grove to the heart)", () => {
    for (const id of ["ch2-l08", "ch2-l10"]) {
      const l = loadLevel(id);
      const segs = [...l.segments].sort((a, b) => a.x0 - b.x0);
      expect(segs.length).toBe(2);
      const early = moodAtX(segs, 0);
      const late = moodAtX(segs, l.segments[0] ? l.segments[0].x1 + 60 : 0);
      expect(early.exposure).not.toBe(late.exposure);
    }
  });
});

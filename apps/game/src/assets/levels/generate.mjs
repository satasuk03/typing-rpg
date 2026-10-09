#!/usr/bin/env node
/**
 * Authoring script for the Chapter 1 level layouts (ch1-l01 .. ch1-l10).
 *
 * It is a convenience for hand-authoring: it writes the LDtk-compatible JSON subset documented in
 * src/render/world/README.md (one file per level). The JSON files are the source of truth that the game
 * loads; this script only exists so ten dense layouts do not have to be typed as raw JSON.
 *
 *   node src/assets/levels/generate.mjs      (from apps/game; then `pnpm exec biome format --write src/assets`)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = dirname(fileURLToPath(import.meta.url));
const XO = -30; // x origin: px 0 = world x -30
const ZO = -16; // z origin: px 0 = world z -16
const PXM = 16;

// ------------------------------------------------------------------ tiny DSL

function typeOf(v) {
  if (typeof v === "string") return "String";
  if (typeof v === "boolean") return "Bool";
  if (typeof v === "number") return Number.isInteger(v) ? "Int" : "Float";
  if (Array.isArray(v))
    return `Array<${typeof v[0] === "string" ? "String" : typeof v[0] === "number" ? "Float" : "Json"}>`;
  return "Json";
}
const fi = (fields) =>
  Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ({ __identifier: k, __type: typeOf(v), __value: v }));

class Lvl {
  constructor(id, head) {
    this.id = id;
    this.head = head;
    this.ents = [];
    this.encs = [];
    this.centers = [];
  }
  e(type, x, z, fields, w = 0, d = 0) {
    this.ents.push({
      __identifier: type,
      px: [Math.round((x - XO) * PXM), Math.round((z - ZO) * PXM)],
      width: Math.round(w * PXM),
      height: Math.round(d * PXM),
      fieldInstances: fi(fields),
    });
  }
  segment(x0, x1, biome, mood = {}, blend = 14) {
    this.e("Segment", x0, ZO, { biome, mood, blend }, x1 - x0, 26);
  }
  ground(x0, x1, caveFrom, caveTo) {
    this.e("Ground", x0, -28, { caveFrom, caveTo }, x1 - x0, 44);
  }
  wall(x0, x1, edgeX, o = {}) {
    this.e(
      "Wall",
      x0,
      ZO,
      { cy: o.cy ?? 9, height: o.height ?? 18, z: o.z ?? -9.2, edgeX },
      x1 - x0,
      1,
    );
  }
  backdrops(o = {}) {
    const sky = o.sky ?? [1.05, 1.0, 0.98];
    const mtn = o.mtn ?? [1, 1, 1];
    const tl = o.tl ?? [0.95, 1.0, 0.95];
    this.e("Backdrop", 40, -16, {
      kind: "sky",
      width: 300,
      height: 70,
      pos: [40, 22, -150],
      tint: sky,
      fogK: 0,
      rep: 1,
      follow: true,
    });
    this.e("Backdrop", 40, -16, {
      kind: "mountains",
      width: 460,
      height: 43.2,
      pos: [40, 11, -105],
      tint: mtn,
      fogK: o.mtnFog ?? 0.42,
      rep: 3,
    });
    this.e("Backdrop", 30, -16, {
      kind: "treeline",
      width: 420,
      height: 19.44,
      pos: [30, 6.4, -58],
      tint: tl,
      fogK: o.tlFog ?? 0.3,
      rep: 6,
    });
  }
  prop(key, x, z, f = {}) {
    this.e("Prop", x, z, { key, ...f });
  }
  scatter(x0, x1, z0, z1, f) {
    this.e("Scatter", x0, z0, f, x1 - x0, z1 - z0);
  }
  fgScatter(x0, x1, z0, z1, f) {
    this.scatter(x0, x1, z0, z1, {
      foreground: true,
      dark: 0.4,
      rim: 1.6,
      wrap: 0.6,
      avoidBattle: 5.8,
      ...f,
    });
  }
  light(x, y, z, f) {
    this.e("Light", x, z, { y, ...f });
  }
  rays(x0, x1, z0, z1, f) {
    this.e("RayField", x0, z0, { y: 6.5, h: 17, rotZ: -0.42, ...f }, x1 - x0, z1 - z0);
  }
  rune(x, z, size, intensity) {
    this.e("Rune", x, z, { size, intensity });
  }
  zone(kind, x0, x1, density, f = {}) {
    const z0 = f.z0 ?? -6;
    const z1 = f.z1 ?? 5;
    this.e("AmbientZone", x0, z0, { kind, density, y: f.y ?? [0.3, 5] }, x1 - x0, z1 - z0);
  }
  anchor(name, kind, x, z, extra = {}) {
    this.e("Anchor", x, z, { name, kind, ...extra });
  }
  cam(name, x, f = {}) {
    this.e("Camera", x, 0, { name, ...f });
  }
  /** Walk-pose camera; the `walkshot` marker is where the hero stands for the static walk shot. */
  walkCam(x, f = {}) {
    this.walkX = x;
    this.cam("walk", x, f);
    this.anchor("walkshot", "marker", x - 3.2, 0.25);
  }
  walk(len, wave = 0.2) {
    const pts = [];
    for (let x = 0; x <= len; x += 12)
      pts.push([x, Math.round((0.25 + wave * Math.sin(x * 0.07)) * 100) / 100]);
    if (pts[pts.length - 1][0] !== len) pts.push([len, 0.25]);
    this.e("WalkPath", 0, 0, { points: pts });
    this.anchor("start", "start", 0, 0.25);
    this.anchor("end", "end", len, 0.25);
  }
  /** Encounter `i`: hero stop anchor, enemy slot anchors, battle camera. */
  encounter(i, heroX, slots, o = {}) {
    const SLOT_DX = [4.8, 7.9, 10.9, 14.0, 17.0];
    const SLOT_Z = [-0.9, 0.9, -0.25, 0.7, -0.6];
    this.anchor(`enc${i}.hero`, "hero", heroX, 0.25, { encounter: i });
    for (let s = 0; s < slots; s++) {
      if (o.boss) {
        this.anchor(`enc${i}.slot${s}`, "boss", heroX + 8.3, -1.0, { encounter: i, slot: s });
      } else {
        this.anchor(`enc${i}.slot${s}`, "slot", heroX + SLOT_DX[s], SLOT_Z[s], {
          encounter: i,
          slot: s,
        });
      }
    }
    const cx = heroX + (o.camDx ?? 5.6);
    this.cam(`battle:${i}`, cx, o.cam ?? {});
    this.centers.push(cx);
    if (o.boss) this.cam("boss", heroX + 7.9, o.bossCam ?? {});
    this.encs.push({ index: i, slots, waves: o.waves ?? 1, boss: !!o.boss });
  }
  /** Foreground framing for each battle camera centre; `fn(i, cx)` returns [dx, key, y, z, extra][] */
  frames(fn) {
    this.centers.forEach((cx, k) => {
      for (const [dx0, key, y, z, extra] of fn(k + 1, cx)) {
        // keep the framing pieces out of the hero/enemy band: push them toward the screen edges
        const dx = dx0 <= -4 && y === 0 ? dx0 - 1.9 : dx0 >= 4 ? dx0 + 0.3 : dx0;
        this.prop(key, cx + dx, z, {
          y,
          foreground: true,
          dark: 0.4,
          rim: 1.6,
          wrap: 0.6,
          ...extra,
        });
      }
    });
  }
  /** Foreground framing for the walk camera: [dx, key, y, z, extra][] relative to the walk camera x. */
  walkFrames(list) {
    for (const [dx, key, y, z, extra] of list) {
      this.prop(key, this.walkX + dx, z, {
        y,
        foreground: true,
        dark: 0.4,
        rim: 1.6,
        wrap: 0.6,
        ...extra,
      });
    }
  }
  /** Soft "stage" light over every battle camera centre so heroes/enemies read in dark biomes. */
  stageLights(color, intensity, radius = 10) {
    for (const cx of this.centers) {
      this.light(cx, 3.0, 3.5, { radius, color, intensity, scatter: 0, flicker: false });
    }
  }
  json(len) {
    return {
      __header__: {
        fileType: "LDtk Project JSON (subset)",
        app: "hd2d-levels",
        doc: "src/render/world/README.md",
        schema: "https://ldtk.io/json",
      },
      jsonVersion: "1.5.3",
      levels: [
        {
          identifier: this.id,
          uid: Number(this.id.slice(-2)),
          worldX: 0,
          worldY: 0,
          pxWid: Math.round((len + 70) * PXM),
          pxHei: 26 * PXM,
          fieldInstances: fi({ xOrigin: XO, zOrigin: ZO, ...this.head, encounters: this.encs }),
          layerInstances: [
            {
              __identifier: "Entities",
              __type: "Entities",
              __cWid: 0,
              __cHei: 0,
              __gridSize: PXM,
              entityInstances: this.ents,
            },
          ],
        },
      ],
    };
  }
}

const FG = { dark: 0.4, rim: 1.6, wrap: 0.6 };
const posts = (L, xs, z = -2.9, f = {}) => {
  for (const x of xs) L.prop("prop.post", x, z, { flame: 0.5, ...f });
};
const TREES_G = ["prop.tree.0", "prop.tree.1", "prop.tree.2"];
const TREES_A = ["prop.tree.3", "prop.tree.4"];
const PILL = ["prop.pillar.0", "prop.pillar.1", "prop.pillar.2"];

/** Three rows of forest trees (back/mid/front), as in the POC. */
function treeRows(L, x0, x1, o = {}) {
  const keys = o.keys ?? TREES_G;
  const tint = o.tint ?? [1, 1, 1];
  const mul = (t, k) => t.map((v, i) => Math.round(v * k[i] * 1000) / 1000);
  const rows = [
    { z: -19, s: 1.35, t: [0.62, 0.7, 0.7], sp: 5.5 },
    { z: -13, s: 1.18, t: [0.8, 0.86, 0.82], sp: 6.5 },
    { z: -7.2, s: 1.0, t: [1, 1, 1], sp: o.frontSp ?? 9 },
  ];
  rows.forEach((r, i) => {
    L.scatter(x0, x1, r.z, r.z + 1.2, {
      keys,
      spacing: [r.sp * 0.7 * (o.dens ?? 1), r.sp * 1.3 * (o.dens ?? 1)],
      scale: [r.s * 0.9, r.s * 1.15],
      seed: (o.seed ?? 11) + i,
      gap: i === 2 ? (o.frontGap ?? 0.15) : 0,
      tint: mul(r.t, tint),
      rim: 0.5,
    });
  });
}

const GOLD = [1.0, 0.86, 0.6];
const WARM = [1.0, 0.62, 0.3];

// ================================================================== L1: Sunlit Glade
function l01() {
  const L = new Lvl("ch1-l01", {
    id: "ch1-l01",
    chapter: 1,
    name: "Sunlit Glade",
    note: "Bright morning forest, tall god rays, pollen in the air. Gentle tutorial level.",
    biome: "forest",
    seed: 101,
  });
  const LEN = 96;
  L.segment(-30, LEN + 30, "forest", {
    exposure: 1.04,
    fogCol: [0.66, 0.75, 0.72],
    clear: [0.66, 0.75, 0.72],
    rays: 1.3,
    bloom: 0.45,
  });
  L.ground(-30, LEN + 30, 1e5, 1e5 + 20);
  L.backdrops();
  L.walk(LEN);
  L.encounter(1, 24, 2);
  L.encounter(2, 62, 3);
  L.walkCam(14);
  treeRows(L, -30, 126, { seed: 11 });
  L.scatter(-26, 124, -5.8, -4.2, {
    keys: ["prop.bush.0", "prop.bush.1"],
    spacing: [2.4, 5.4],
    scale: [0.9, 1.4],
    seed: 21,
  });
  L.scatter(-26, 124, -3.8, -2.6, {
    keys: ["prop.grass.0", "prop.grass.1", "prop.grass.2", "prop.grass.3"],
    spacing: [1.2, 3.4],
    seed: 22,
  });
  L.scatter(-26, 124, 2.7, 5.4, {
    keys: ["prop.grass.0", "prop.grass.1", "prop.grass.2", "prop.grass.3"],
    spacing: [1.4, 3.6],
    seed: 23,
  });
  L.scatter(-20, 120, -5.7, -3.2, {
    keys: ["prop.rock.0", "prop.rock.1", "prop.rock.2"],
    spacing: [7, 16],
    seed: 24,
  });
  L.scatter(-20, 120, -4.6, -3.0, {
    keys: ["prop.fern.0", "prop.fern.1"],
    spacing: [6, 12],
    scale: [0.9, 1.2],
    seed: 25,
  });
  L.rays(-16, 112, -8.5, -4.5, {
    spacing: [5, 11],
    w: [1.6, 4.8],
    color: GOLD,
    intensity: [0.55, 0.9],
    seed: 26,
  });
  L.zone("pollen", -20, 120, 18);
  L.fgScatter(-24, 124, 6.4, 8.0, {
    keys: ["prop.fernD.0", "prop.fernD.1"],
    spacing: [4.5, 9],
    scale: [0.7, 1.1],
    seed: 31,
  });
  L.fgScatter(-24, 124, 7.0, 7.4, {
    keys: ["prop.vines.0", "prop.vines.1"],
    y: [8.8, 9.8],
    spacing: [9, 16],
    seed: 32,
  });
  L.fgScatter(-24, 124, 6.2, 6.4, {
    keys: ["prop.grass.3"],
    spacing: [10, 18],
    scale: [3, 3],
    seed: 33,
  });
  L.frames((i, cx) => [
    [-5.3, `prop.fernD.${i % 2}`, 0, 7.2, { scale: 0.9 }],
    [5.6, `prop.fernD.${(i + 1) % 2}`, 0, 7.6, { scale: 0.95, flip: true }],
    [-3.2, `prop.vines.${i % 2}`, 9.0, 7.4, {}],
  ]);
  L.prop("prop.trunk", 4, 8.4, { foreground: true, scale: 1.3, ...FG, dark: 0.45 });
  L.walkFrames([
    [-6.0, "prop.fernD.1", 0, 7.4, { scale: 1.1 }],
    [5.2, "prop.vines.0", 9.2, 7.3, {}],
    [6.2, "prop.fernD.0", 0, 7.6, { scale: 1.0, flip: true }],
  ]);
  return [L, LEN];
}

// ================================================================== L2: Whispering Wood
function l02() {
  const L = new Lvl("ch1-l02", {
    id: "ch1-l02",
    chapter: 1,
    name: "Whispering Wood",
    note: "Deep green shade, thick canopy, glowing mushrooms and fireflies. Cool and damp.",
    biome: "forest",
    seed: 102,
  });
  const LEN = 100;
  L.segment(-30, LEN + 30, "forest", {
    amb: [0.3, 0.42, 0.5],
    sunCol: [1.25, 1.35, 1.0],
    fogCol: [0.38, 0.52, 0.47],
    clear: [0.38, 0.52, 0.47],
    fog: [0.016, 12, 0.22],
    rays: 1.5,
    vig: 0.52,
    sat: 1.2,
    bloom: 0.5,
    gain: [0.98, 1.04, 0.95],
  });
  L.ground(-30, LEN + 30, 1e5, 1e5 + 20);
  L.backdrops({
    sky: [0.8, 0.95, 0.9],
    mtn: [0.7, 0.85, 0.8],
    mtnFog: 0.6,
    tl: [0.7, 0.85, 0.75],
    tlFog: 0.4,
  });
  L.walk(LEN, 0.3);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3);
  L.walkCam(18, { dist: 20.5, pitch: 10 });
  treeRows(L, -30, 130, {
    seed: 41,
    dens: 0.72,
    tint: [0.88, 1.0, 0.95],
    frontSp: 6.5,
    frontGap: 0.05,
  });
  L.scatter(-28, 128, -11, -9.4, {
    keys: TREES_G,
    spacing: [4, 8],
    scale: [1.1, 1.3],
    seed: 47,
    tint: [0.7, 0.8, 0.78],
    rim: 0.5,
  });
  L.scatter(-26, 124, -5.4, -3.8, {
    keys: ["prop.bush.0", "prop.bush.1", "prop.bush.1"],
    spacing: [1.8, 3.8],
    scale: [1.0, 1.5],
    seed: 42,
  });
  L.scatter(-26, 124, -3.7, -2.6, {
    keys: ["prop.fern.0", "prop.fern.1", "prop.grass.0", "prop.grass.2"],
    spacing: [1.1, 2.6],
    seed: 43,
  });
  L.scatter(-26, 124, 2.7, 5.2, {
    keys: ["prop.grass.0", "prop.grass.1", "prop.grass.3", "prop.grass.2"],
    spacing: [1.0, 2.4],
    scale: [1.0, 1.4],
    seed: 44,
  });
  L.scatter(-20, 120, -5.2, -3.4, {
    keys: ["prop.shroom"],
    spacing: [5, 11],
    scale: [1.1, 1.6],
    emis: 2.5,
    seed: 45,
    light: { color: [0.3, 1.0, 0.85], intensity: 0.55, radius: 2.8, dy: 0.5, dz: 0.6, scatter: 0 },
  });
  L.scatter(-20, 120, -4.2, -3.0, {
    keys: ["prop.trunk"],
    spacing: [14, 24],
    scale: [0.8, 1.0],
    seed: 46,
    tint: [0.8, 0.9, 0.85],
  });
  L.rays(-16, 112, -9, -4.5, {
    spacing: [4, 8],
    w: [1.4, 3.4],
    color: [0.7, 1.0, 0.7],
    intensity: [0.45, 0.8],
    seed: 48,
  });
  L.zone("fireflies", -20, 120, 7, { z0: -5, z1: 4, y: [0.5, 3.0] });
  L.zone("pollen", -20, 120, 8);
  L.fgScatter(-24, 124, 6.4, 8.0, {
    keys: ["prop.fernD.0", "prop.fernD.1"],
    spacing: [3.2, 6],
    scale: [0.9, 1.4],
    seed: 51,
    dark: 0.5,
  });
  L.fgScatter(-24, 124, 7.0, 7.6, {
    keys: ["prop.vines.0", "prop.vines.1"],
    y: [8.6, 9.8],
    spacing: [5, 9],
    seed: 52,
  });
  L.fgScatter(-24, 124, 8.0, 8.8, {
    keys: ["prop.trunk"],
    spacing: [20, 30],
    scale: [1.4, 1.7],
    seed: 53,
    dark: 0.55,
  });
  L.frames((i) => [
    [-5.6, "prop.fernD.0", 0, 7.4, { scale: 1.15, dark: 0.5 }],
    [5.2, "prop.fernD.1", 0, 7.0, { scale: 1.0, flip: true }],
    [5.6, "prop.vines.1", 9.2, 7.6, {}],
    [-2.6, "prop.vines.0", 9.4, 7.2, { scale: 1.1 }],
  ]);
  L.walkFrames([
    [-6.0, "prop.trunk", 0, 8.4, { scale: 1.5, dark: 0.5 }],
    [4.5, "prop.vines.1", 9.4, 7.4, {}],
    [6.0, "prop.fernD.1", 0, 7.5, { scale: 1.1, flip: true }],
  ]);
  return [L, LEN];
}

// ================================================================== L3: Amber Edge
function l03() {
  const L = new Lvl("ch1-l03", {
    id: "ch1-l03",
    chapter: 1,
    name: "Amber Edge",
    note: "Late-afternoon autumn forest that crumbles into the first ruined columns. Warm light, drifting leaves.",
    biome: "forest",
    seed: 103,
  });
  const LEN = 130;
  L.segment(
    -30,
    84,
    "forest",
    {
      sunCol: [1.95, 1.35, 0.78],
      sunDir: [-0.6, 0.55, 0.44],
      fogCol: [0.74, 0.6, 0.46],
      clear: [0.74, 0.6, 0.46],
      gain: [1.1, 1.0, 0.84],
      sat: 1.2,
      rays: 1.1,
      amb: [0.42, 0.42, 0.5],
    },
    30,
  );
  L.segment(84, LEN + 30, "ruins", { fogCol: [0.6, 0.44, 0.36], clear: [0.6, 0.44, 0.36] });
  L.ground(-30, LEN + 30, 1e5, 1e5 + 20);
  L.backdrops({ sky: [1.1, 0.98, 0.9], mtn: [1.05, 0.9, 0.85], tl: [1.05, 0.9, 0.8] });
  L.walk(LEN);
  L.encounter(1, 24, 3);
  L.encounter(2, 62, 3);
  L.encounter(3, 104, 3, { cam: { pitch: 15 } });
  L.walkCam(48);
  treeRows(L, -30, 60, {
    seed: 61,
    keys: ["prop.tree.0", "prop.tree.1", "prop.tree.3", "prop.tree.4", "prop.tree.4"],
  });
  treeRows(L, 60, 100, { seed: 71, keys: TREES_A, dens: 1.4, frontGap: 0.6 });
  L.scatter(100, 160, -19, -17.8, {
    keys: TREES_A,
    spacing: [5, 9],
    scale: [1.3, 1.5],
    seed: 72,
    tint: [0.62, 0.62, 0.66],
    rim: 0.5,
  });
  L.scatter(-26, 100, -5.8, -4.2, {
    keys: ["prop.bush.0", "prop.bush.2", "prop.bush.2"],
    spacing: [2.4, 5.0],
    scale: [0.9, 1.4],
    seed: 62,
  });
  L.scatter(-26, 124, -3.8, -2.6, {
    keys: ["prop.grass.0", "prop.grass.1", "prop.grass.2"],
    spacing: [1.4, 3.6],
    seed: 63,
    tint: [1.1, 1.0, 0.8],
  });
  L.scatter(-26, 124, 2.7, 5.4, {
    keys: ["prop.grass.0", "prop.grass.2", "prop.grass.3"],
    spacing: [1.4, 3.6],
    seed: 64,
    tint: [1.1, 1.0, 0.8],
  });
  L.scatter(30, 150, -5.7, -3.2, {
    keys: ["prop.rock.0", "prop.rock.1", "prop.rock.2"],
    spacing: [5, 11],
    scale: [1.0, 1.6],
    seed: 65,
  });
  // ruined columns creep in
  L.scatter(72, 150, -6.5, -3.6, { keys: PILL, spacing: [5, 8], seed: 66 });
  L.prop("prop.arch", 112, -6.8, { scale: 1.15 });
  L.prop("prop.arch", 90, -11.5, { scale: 1.0, tint: [0.75, 0.75, 0.8] });
  posts(L, [78, 96, 108, 120], -2.9);
  L.rays(-16, 90, -8.5, -4.5, {
    spacing: [4, 9],
    w: [1.6, 4.2],
    color: [1.0, 0.78, 0.42],
    intensity: [0.5, 0.9],
    seed: 67,
  });
  L.zone("leaves", -20, 100, 5, { y: [7, 9] });
  L.zone("pollen", -20, 100, 8);
  L.zone("dust", 84, 150, 8);
  L.fgScatter(-24, 80, 6.4, 8.0, {
    keys: ["prop.fernD.0", "prop.fernD.1"],
    spacing: [4.5, 8],
    scale: [0.7, 1.1],
    seed: 68,
    tint: [1.2, 0.95, 0.7],
  });
  L.fgScatter(-24, 80, 7.0, 7.4, {
    keys: ["prop.vines.0", "prop.vines.1"],
    y: [8.8, 9.8],
    spacing: [9, 14],
    seed: 69,
    tint: [1.1, 0.9, 0.7],
  });
  L.fgScatter(80, 150, 6.6, 8.0, {
    keys: ["prop.cRock.0", "prop.cRock.1"],
    spacing: [7, 11],
    scale: [1.0, 1.4],
    seed: 73,
  });
  L.frames((i) => [
    [
      -5.3,
      i < 3 ? `prop.fernD.${i % 2}` : "prop.rock.1",
      0,
      7.2,
      { scale: i < 3 ? 0.9 : 1.8, ...(i < 3 ? { tint: [1.2, 0.95, 0.7] } : {}) },
    ],
    [
      5.6,
      i < 3 ? "prop.fernD.1" : "prop.post",
      0,
      i < 3 ? 7.6 : 6.8,
      i < 3 ? { scale: 0.95, flip: true, tint: [1.2, 0.95, 0.7] } : { dark: 0.1, flame: 0.55 },
    ],
    [-3.2, "prop.vines.0", 9.0, 7.4, {}],
  ]);
  L.walkFrames([
    [-6.0, "prop.fernD.0", 0, 7.4, { scale: 1.1, tint: [1.2, 0.95, 0.7] }],
    [3.8, "prop.vines.0", 9.2, 7.2, { tint: [1.1, 0.9, 0.7] }],
    [6.2, "prop.fernD.1", 0, 7.6, { tint: [1.2, 0.95, 0.7] }],
  ]);
  return [L, LEN];
}

// ================================================================== L4: Ember Gate
function l04() {
  const L = new Lvl("ch1-l04", {
    id: "ch1-l04",
    chapter: 1,
    name: "Ember Gate",
    note: "Sunset over a ruined gatehouse, torch posts lit, long orange shadows.",
    biome: "ruins",
    seed: 104,
  });
  const LEN = 130;
  L.segment(-30, LEN + 30, "ruins", { exposure: 1.08, sunCol: [1.6, 0.8, 0.38] });
  L.ground(-30, LEN + 30, 1e5, 1e5 + 20);
  L.backdrops({
    sky: [1.15, 0.95, 0.85],
    mtn: [1.1, 0.85, 0.85],
    tl: [1.0, 0.85, 0.8],
    mtnFog: 0.5,
  });
  L.walk(LEN);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3);
  L.encounter(3, 104, 3);
  L.walkCam(51);
  treeRows(L, -30, 24, {
    seed: 81,
    keys: ["prop.tree.1", "prop.tree.2", "prop.tree.3"],
    tint: [1.0, 0.9, 0.85],
  });
  L.scatter(-30, 160, -19, -17.8, {
    keys: TREES_A,
    spacing: [5, 9],
    scale: [1.3, 1.5],
    seed: 82,
    tint: [0.65, 0.55, 0.55],
    rim: 0.5,
  });
  L.scatter(-26, 160, -6.4, -3.6, { keys: PILL, spacing: [4.5, 7.5], seed: 83 });
  L.prop("prop.arch", 20, -6.8, { scale: 1.15 });
  L.prop("prop.arch", 52, -10.5, { scale: 1.0, tint: [0.75, 0.75, 0.8] });
  L.prop("prop.arch", 79, -6.8, { scale: 1.2 });
  L.prop("prop.arch", 118, -10.5, { scale: 1.1, tint: [0.75, 0.75, 0.8] });
  posts(L, [10, 34, 58.5, 76.2, 94, 112, 130], -2.9);
  L.scatter(-26, 160, -12.5, -9.5, {
    keys: PILL,
    spacing: [6, 11],
    scale: [1.2, 1.5],
    seed: 84,
    tint: [0.6, 0.55, 0.62],
  });
  L.scatter(-20, 160, -5.2, -3.2, {
    keys: ["prop.rock.0", "prop.rock.1", "prop.rock.2"],
    spacing: [7, 14],
    scale: [0.8, 1.3],
    seed: 85,
  });
  L.scatter(-26, 160, -3.8, -2.6, {
    keys: ["prop.grass.0", "prop.grass.2"],
    spacing: [2.5, 5],
    seed: 86,
    tint: [1.0, 0.85, 0.7],
  });
  L.scatter(-26, 160, 2.7, 5.2, {
    keys: ["prop.grass.1", "prop.grass.3"],
    spacing: [2.5, 5],
    seed: 87,
    tint: [1.0, 0.85, 0.7],
  });
  L.rays(-10, 140, -8, -5, {
    spacing: [9, 16],
    w: [1.6, 3.4],
    color: WARM,
    intensity: [0.5, 0.8],
    seed: 88,
    rotZ: -0.5,
  });
  L.zone("dust", -20, 150, 14);
  L.zone("embers", -10, 150, 6, { y: [0.3, 3.5] });
  L.fgScatter(-24, 150, 6.4, 8.0, {
    keys: ["prop.fernD.0", "prop.fernD.1", "prop.cRock.1"],
    spacing: [6, 10],
    scale: [0.9, 1.4],
    seed: 89,
  });
  L.fgScatter(-24, 150, 7.6, 8.4, {
    keys: ["prop.pillar.1", "prop.pillar.0"],
    spacing: [16, 26],
    scale: [1.0, 1.2],
    seed: 90,
    dark: 0.55,
  });
  L.frames((i) => [
    [i % 2 ? -5.0 : 4.6, "prop.post", 0, 6.8, { dark: 0.1, flame: 0.55 }],
    [i % 2 ? 5.4 : -5.4, "prop.pillar.2", 0, 7.4, { scale: 1.1, dark: 0.55 }],
    [-2.8, "prop.vines.1", 9.0, 7.4, {}],
  ]);
  L.walkFrames([
    [-6.0, "prop.pillar.2", 0, 7.6, { scale: 1.1, dark: 0.55 }],
    [6.0, "prop.post", 0, 6.8, { dark: 0.1, flame: 0.55 }],
  ]);
  return [L, LEN];
}

// ================================================================== L5: Overgrown Court
function l05() {
  const L = new Lvl("ch1-l05", {
    id: "ch1-l05",
    chapter: 1,
    name: "Overgrown Court",
    note: "Ruined courtyard reclaimed by green: thick undergrowth, strong light shafts through broken arches.",
    biome: "ruins",
    seed: 105,
  });
  const LEN = 130;
  L.segment(-30, LEN + 30, "ruins", {
    amb: [0.32, 0.4, 0.4],
    sunCol: [1.55, 1.3, 0.75],
    sunDir: [-0.5, 0.7, 0.5],
    fogCol: [0.5, 0.55, 0.45],
    clear: [0.5, 0.55, 0.45],
    rays: 1.6,
    gain: [1.04, 1.02, 0.9],
    sat: 1.2,
    fill: 0.1,
    bloom: 0.5,
  });
  L.ground(-30, LEN + 30, 1e5, 1e5 + 20);
  L.backdrops({
    sky: [0.95, 1.0, 0.9],
    mtn: [0.85, 0.95, 0.85],
    tl: [0.8, 0.95, 0.8],
    tlFog: 0.38,
  });
  L.walk(LEN, 0.28);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3, { cam: { dist: 17.5 } });
  L.encounter(3, 104, 3);
  L.walkCam(50);
  treeRows(L, -30, 160, { seed: 111, dens: 1.1, frontGap: 0.7, tint: [0.95, 1.05, 0.95] });
  L.scatter(-26, 160, -6.0, -3.6, { keys: PILL, spacing: [7, 12], seed: 112 });
  L.scatter(-26, 160, -5.8, -3.8, {
    keys: ["prop.bush.0", "prop.bush.1", "prop.bush.2"],
    spacing: [1.5, 3.0],
    scale: [1.0, 1.7],
    seed: 113,
  });
  L.scatter(-26, 160, -3.8, -2.6, {
    keys: ["prop.fern.0", "prop.fern.1", "prop.grass.0", "prop.grass.2"],
    spacing: [1.5, 3.4],
    seed: 114,
  });
  L.scatter(-26, 160, 2.7, 5.2, {
    keys: ["prop.grass.2", "prop.grass.1", "prop.grass.0", "prop.grass.3"],
    spacing: [0.9, 2.0],
    scale: [1.0, 1.5],
    seed: 115,
  });
  L.scatter(-26, 160, -8.5, -6.8, {
    keys: ["prop.arch"],
    spacing: [24, 32],
    scale: [1.0, 1.25],
    seed: 116,
    tint: [0.85, 0.95, 0.85],
  });
  L.scatter(-20, 160, -5.2, -3.2, {
    keys: ["prop.rock.0", "prop.rock.1", "prop.rock.2"],
    spacing: [8, 14],
    scale: [1.2, 1.8],
    seed: 117,
    tint: [0.85, 1.0, 0.85],
  });
  L.scatter(-20, 160, -4.6, -3.2, {
    keys: ["prop.trunk"],
    spacing: [16, 26],
    scale: [0.9, 1.1],
    seed: 118,
  });
  posts(L, [40, 88, 128], -2.9);
  L.rays(-14, 150, -9, -4.5, {
    spacing: [3, 6],
    w: [1.6, 4.5],
    color: [1.0, 0.9, 0.55],
    intensity: [0.6, 1.0],
    seed: 119,
  });
  L.zone("pollen", -20, 150, 22);
  L.zone("fireflies", -20, 150, 5, { y: [0.4, 2.5] });
  L.fgScatter(-24, 150, 6.4, 8.0, {
    keys: ["prop.fernD.0", "prop.fernD.1", "prop.fernD.1"],
    spacing: [2.8, 5.5],
    scale: [0.9, 1.4],
    seed: 120,
  });
  L.fgScatter(-24, 150, 7.0, 7.6, {
    keys: ["prop.vines.0", "prop.vines.1"],
    y: [8.6, 9.8],
    spacing: [5, 10],
    seed: 121,
  });
  L.fgScatter(-24, 150, 7.8, 8.6, {
    keys: ["prop.pillar.1"],
    spacing: [22, 30],
    scale: [1.1, 1.3],
    seed: 122,
    dark: 0.55,
  });
  L.frames((i) => [
    [-5.6, "prop.fernD.0", 0, 7.4, { scale: 1.2 }],
    [5.4, "prop.pillar.0", 0, 7.8, { scale: 1.05, dark: 0.55 }],
    [-3.0, "prop.vines.1", 9.2, 7.2, { scale: 1.1 }],
    [3.2, "prop.vines.0", 9.4, 7.6, {}],
  ]);
  L.walkFrames([
    [-6.0, "prop.fernD.0", 0, 7.4, { scale: 1.2 }],
    [4.0, "prop.vines.1", 9.2, 7.4, {}],
    [6.2, "prop.pillar.0", 0, 7.8, { scale: 1.0, dark: 0.55 }],
  ]);
  return [L, LEN];
}

// ================================================================== L6: Moonlit Colonnade
function l06() {
  const L = new Lvl("ch1-l06", {
    id: "ch1-l06",
    chapter: 1,
    name: "Moonlit Colonnade",
    note: "Night in the ruins: cold blue moonlight, a line of tall columns, torches as the only warmth.",
    biome: "ruins",
    seed: 106,
  });
  const LEN = 130;
  L.segment(-30, LEN + 30, "ruins", {
    amb: [0.13, 0.19, 0.38],
    gamb: [0.1, 0.1, 0.16],
    sunCol: [0.55, 0.7, 1.15],
    sunDir: [-0.4, 0.75, 0.5],
    fogCol: [0.1, 0.14, 0.28],
    clear: [0.1, 0.14, 0.28],
    exposure: 1.2,
    fog: [0.016, 11, 0.25],
    rays: 0.5,
    ambient: "none",
    hi: [0, 0.015, 0.045],
    vig: 0.55,
    sat: 1.1,
    gain: [0.96, 1.0, 1.1],
    bloom: 0.6,
    thr: 0.9,
    fill: 0.3,
  });
  L.ground(-30, LEN + 30, 1e5, 1e5 + 20);
  L.backdrops({
    sky: [0.5, 0.6, 1.0],
    mtn: [0.5, 0.55, 0.85],
    tl: [0.45, 0.5, 0.8],
    mtnFog: 0.55,
    tlFog: 0.4,
  });
  L.walk(LEN);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3);
  L.encounter(3, 104, 3, { cam: { pitch: 13 } });
  L.walkCam(51, { pitch: 10 });
  L.scatter(-30, 160, -19, -17.8, {
    keys: TREES_G,
    spacing: [5, 9],
    scale: [1.3, 1.5],
    seed: 131,
    tint: [0.4, 0.5, 0.65],
    rim: 0.5,
  });
  L.scatter(-30, 160, -13, -11.8, {
    keys: TREES_G,
    spacing: [6, 11],
    scale: [1.1, 1.3],
    seed: 132,
    tint: [0.5, 0.6, 0.75],
    rim: 0.5,
  });
  // the colonnade: two ranks of tall columns with arches between
  L.scatter(-26, 160, -6.4, -5.6, {
    keys: ["prop.pillar.0", "prop.pillar.2"],
    spacing: [5.2, 5.8],
    scale: [1.25, 1.35],
    flipRandom: false,
    seed: 133,
  });
  L.scatter(-26, 160, -11, -10, {
    keys: PILL,
    spacing: [5.2, 6.5],
    scale: [1.4, 1.6],
    seed: 134,
    tint: [0.7, 0.75, 0.9],
  });
  L.scatter(-26, 160, -9.6, -8.8, {
    keys: ["prop.arch"],
    spacing: [20, 24],
    seed: 135,
    tint: [0.75, 0.8, 0.95],
  });
  posts(L, [6, 20, 34, 48, 62, 76, 90, 104, 118, 132], -2.9);
  L.scatter(-20, 160, -5.2, -3.2, {
    keys: ["prop.rock.0", "prop.rock.2"],
    spacing: [10, 18],
    seed: 136,
    tint: [0.7, 0.8, 1.0],
  });
  L.scatter(-26, 160, -3.8, -2.6, {
    keys: ["prop.grass.0", "prop.grass.2"],
    spacing: [3, 6],
    seed: 137,
    tint: [0.6, 0.8, 0.9],
  });
  L.scatter(-26, 160, 2.7, 5.2, {
    keys: ["prop.grass.1", "prop.grass.3"],
    spacing: [3, 6],
    seed: 138,
    tint: [0.6, 0.8, 0.9],
  });
  L.rays(-10, 150, -9, -6, {
    spacing: [10, 18],
    w: [2.0, 3.6],
    color: [0.5, 0.65, 1.0],
    intensity: [0.35, 0.6],
    seed: 139,
    rotZ: -0.3,
  });
  L.zone("fireflies", -20, 150, 6, { y: [0.4, 3.0] });
  L.zone("motes", -20, 150, 12, { y: [0.5, 5.5] });
  L.fgScatter(-24, 150, 6.4, 8.0, {
    keys: ["prop.fernD.0", "prop.fernD.1", "prop.rock.1"],
    spacing: [6, 11],
    scale: [0.9, 1.5],
    seed: 140,
    dark: 0.5,
    tint: [0.7, 0.8, 1.0],
  });
  L.fgScatter(-24, 150, 7.0, 7.6, {
    keys: ["prop.vines.0"],
    y: [8.8, 9.8],
    spacing: [14, 24],
    seed: 141,
    tint: [0.7, 0.8, 1.0],
  });
  L.frames((i) => [
    [i % 2 ? -4.9 : 4.7, "prop.post", 0, 6.7, { dark: 0.1, flame: 0.55 }],
    [i % 2 ? 5.6 : -5.6, "prop.pillar.1", 0, 7.6, { scale: 1.25, dark: 0.6 }],
    [-3.0, "prop.vines.0", 9.2, 7.4, { tint: [0.7, 0.8, 1.0] }],
  ]);
  L.stageLights([0.75, 0.85, 1.0], 0.8);
  L.walkFrames([
    [-6.0, "prop.post", 0, 6.7, { dark: 0.1, flame: 0.55 }],
    [6.2, "prop.pillar.1", 0, 7.6, { scale: 1.2, dark: 0.6 }],
    [-3.6, "prop.vines.0", 9.2, 7.4, { tint: [0.7, 0.8, 1.0] }],
  ]);
  return [L, LEN];
}

// ================================================================== L7: The Descent
function l07() {
  const L = new Lvl("ch1-l07", {
    id: "ch1-l07",
    chapter: 1,
    name: "The Descent",
    note: "Dusk ruins give way to the cave mouth: columns, then stalagmites, torchlight swallowing the sky.",
    biome: "ruins",
    seed: 107,
  });
  const LEN = 140;
  L.segment(
    -30,
    74,
    "ruins",
    { sunCol: [1.45, 0.72, 0.4], fogCol: [0.5, 0.36, 0.34], clear: [0.5, 0.36, 0.34], rays: 0.5 },
    28,
  );
  L.segment(74, LEN + 30, "cave", { amb: [0.06, 0.065, 0.1] });
  L.ground(-30, LEN + 30, 70, 96);
  L.wall(60, 200, 66);
  L.backdrops({ sky: [1.1, 0.95, 0.9], mtn: [1.0, 0.85, 0.85], tl: [0.9, 0.8, 0.8] });
  L.walk(LEN);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3);
  L.encounter(3, 108, 3);
  L.walkCam(74);
  treeRows(L, -30, 60, { seed: 141, keys: TREES_G, tint: [1.0, 0.85, 0.8], frontGap: 0.5 });
  L.scatter(-26, 66, -6.4, -3.6, { keys: PILL, spacing: [5, 8], seed: 142 });
  L.prop("prop.arch", 44, -6.8, { scale: 1.2 });
  L.prop("prop.arch", 62, -9.2, { scale: 1.5 });
  posts(L, [12, 30, 52, 70], -2.9);
  L.scatter(-20, 70, -5.2, -3.2, {
    keys: ["prop.rock.0", "prop.rock.1", "prop.rock.2"],
    spacing: [6, 12],
    seed: 143,
  });
  L.scatter(-26, 70, -3.8, -2.6, {
    keys: ["prop.grass.0", "prop.grass.2", "prop.fern.0"],
    spacing: [2, 4.5],
    seed: 144,
    tint: [1.0, 0.85, 0.7],
  });
  L.scatter(-26, 70, 2.7, 5.2, {
    keys: ["prop.grass.1", "prop.grass.3"],
    spacing: [2.5, 5],
    seed: 145,
    tint: [1.0, 0.85, 0.7],
  });
  // cave half
  L.scatter(70, 175, -8.4, -7.2, {
    keys: ["prop.cRock.0", "prop.cRock.1"],
    spacing: [3.4, 7.4],
    scale: [0.7, 1.2],
    seed: 146,
    rim: 0.7,
  });
  L.scatter(72, 175, -7.6, -5.2, {
    keys: ["prop.smite.0", "prop.smite.1", "prop.smite.2", "prop.smite.3"],
    spacing: [4.5, 9.5],
    scale: [0.6, 1.0],
    seed: 147,
    rim: 0.8,
  });
  L.scatter(72, 175, -8.5, -4.5, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    spacing: [2.6, 5.6],
    scale: [0.45, 0.75],
    seed: 148,
    rim: 0.6,
    y: [7.2, 8.4],
  });
  L.scatter(76, 175, -9.0, -8.9, {
    keys: ["prop.sconce"],
    spacing: [7.4, 7.4],
    seed: 149,
    flipRandom: false,
    y: [3.1, 3.1],
    flame: 0.5,
  });
  posts(L, [80, 94, 128, 146], -2.9);
  L.scatter(78, 175, -6.6, -5.0, {
    keys: ["prop.crystalB", "prop.crystalP"],
    spacing: [16, 24],
    scale: [1.2, 1.5],
    seed: 150,
    emis: 0.5,
    rim: 0.6,
    tint: [0.7, 0.7, 0.8],
    light: {
      color: [0.4, 0.65, 1.0],
      intensity: 0.55,
      radius: 5.0,
      dy: 1.8,
      dz: 1.8,
      scatter: 0.003,
    },
  });
  L.rays(-14, 62, -8.5, -5, {
    spacing: [8, 14],
    w: [1.6, 3.4],
    color: WARM,
    intensity: [0.45, 0.75],
    seed: 151,
    rotZ: -0.5,
  });
  L.zone("dust", -20, 74, 10);
  L.zone("embers", 60, 170, 14, { y: [0.2, 4] });
  L.fgScatter(-24, 74, 6.4, 8.0, {
    keys: ["prop.fernD.1", "prop.fernD.0"],
    spacing: [6, 10],
    scale: [1.0, 1.4],
    seed: 152,
  });
  L.fgScatter(-24, 74, 7.0, 7.6, {
    keys: ["prop.vines.0", "prop.vines.1"],
    y: [8.8, 9.8],
    spacing: [12, 20],
    seed: 153,
  });
  L.fgScatter(78, 175, 6.4, 7.6, {
    keys: ["prop.smite.0", "prop.smite.1", "prop.smite.2", "prop.cRock.2"],
    spacing: [3.5, 6.5],
    scale: [0.7, 1.1],
    seed: 154,
  });
  L.fgScatter(78, 175, 7.0, 7.8, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    y: [8.4, 9.0],
    spacing: [5, 9],
    scale: [0.55, 0.8],
    seed: 155,
  });
  L.frames((i, cx) => {
    if (cx < 76)
      return [
        [-5.2, "prop.pillar.2", 0, 7.4, { scale: 1.1, dark: 0.55 }],
        [5.4, "prop.pillar.0", 0, 7.4, { scale: 1.0, dark: 0.55 }],
        [-3, "prop.vines.1", 9, 7.4, {}],
      ];
    return [
      [-5.0, "prop.smite.2", 0, 7.4, { scale: 0.85 }],
      [5.2, "prop.cRock.2", 0, 7.0, { scale: 0.9, flip: true }],
      [3.6, "prop.stite.2", 8.9, 7.6, { scale: 0.5 }],
    ];
  });
  L.stageLights([1.0, 0.7, 0.45], 0.8);
  L.walkFrames([
    [-6.0, "prop.pillar.2", 0, 7.4, { scale: 1.1, dark: 0.55 }],
    [6.0, "prop.smite.2", 0, 7.2, { scale: 0.9 }],
    [3.5, "prop.stite.2", 8.9, 7.6, { scale: 0.55 }],
  ]);
  return [L, LEN];
}

// ================================================================== L8: Crystal Gallery
function l08() {
  const L = new Lvl("ch1-l08", {
    id: "ch1-l08",
    chapter: 1,
    name: "Crystal Gallery",
    note: "Deep cave lit by blue crystal clusters; cold glow against warm sconces. Open, tall cavern.",
    biome: "cave",
    seed: 108,
  });
  const LEN = 130;
  L.segment(-30, LEN + 30, "cave", {
    amb: [0.09, 0.14, 0.26],
    gamb: [0.05, 0.06, 0.09],
    fogCol: [0.02, 0.04, 0.09],
    clear: [0.02, 0.04, 0.09],
    exposure: 1.45,
    gain: [0.98, 1.02, 1.1],
    hi: [0, 0.02, 0.05],
    bloom: 0.75,
    ambient: "none",
  });
  L.ground(-30, LEN + 30, -1e5, -1e5 + 20);
  L.wall(-40, 190, -50);
  L.backdrops({ sky: [0.2, 0.25, 0.4], mtn: [0.2, 0.25, 0.4], tl: [0.2, 0.25, 0.4] });
  L.walk(LEN);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3);
  L.encounter(3, 106, 3);
  L.walkCam(44);
  L.scatter(-30, 170, -8.4, -7.2, {
    keys: ["prop.cRock.0", "prop.cRock.1", "prop.cRock.2"],
    spacing: [3.4, 7.4],
    scale: [0.7, 1.2],
    seed: 161,
    rim: 0.7,
  });
  L.scatter(-30, 170, -7.6, -5.2, {
    keys: ["prop.smite.0", "prop.smite.2"],
    spacing: [5, 10],
    scale: [0.6, 1.0],
    seed: 162,
    rim: 0.8,
  });
  L.scatter(-30, 170, -4.0, -3.4, {
    keys: ["prop.smite.3"],
    spacing: [5, 11],
    scale: [0.7, 1.0],
    seed: 163,
    rim: 0.8,
  });
  L.scatter(-30, 170, -8.5, -4.5, {
    keys: ["prop.stite.0", "prop.stite.2"],
    spacing: [3.4, 7],
    scale: [0.45, 0.8],
    seed: 164,
    rim: 0.6,
    y: [7.2, 8.4],
  });
  L.scatter(-30, 170, -9.0, -8.9, {
    keys: ["prop.sconce"],
    spacing: [7.4, 7.4],
    seed: 165,
    flipRandom: false,
    y: [3.1, 3.1],
    flame: 0.5,
  });
  // crystal clusters, the star of the level: pairs of big crystals with blue/violet light
  L.scatter(-24, 170, -7.6, -5.4, {
    keys: ["prop.crystalB", "prop.crystalB2"],
    spacing: [4.5, 8],
    scale: [1.3, 1.9],
    seed: 166,
    emis: 0.5,
    rim: 0.6,
    tint: [0.7, 0.7, 0.8],
    light: {
      color: [0.35, 0.7, 1.0],
      intensity: 1.0,
      radius: 7.5,
      dy: 1.8,
      dz: 1.8,
      scatter: 0.003,
    },
  });
  L.scatter(-20, 170, -6.4, -5.0, {
    keys: ["prop.crystalP"],
    spacing: [11, 17],
    scale: [1.4, 1.8],
    seed: 167,
    emis: 0.5,
    rim: 0.6,
    tint: [0.7, 0.7, 0.8],
    light: {
      color: [0.62, 0.42, 1.0],
      intensity: 0.95,
      radius: 7.0,
      dy: 1.8,
      dz: 1.8,
      scatter: 0.003,
    },
  });
  posts(L, [14, 46, 80, 118, 146], -2.9);
  L.zone("motes", -20, 150, 16, { y: [0.4, 6], z0: -6, z1: 6 });
  L.fgScatter(-24, 170, 6.8, 8.0, {
    keys: ["prop.smite.0", "prop.smite.1", "prop.cRock.2"],
    spacing: [5, 8],
    scale: [0.7, 1.1],
    seed: 168,
  });
  L.fgScatter(-24, 170, 7.0, 7.6, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    y: [8.4, 9.0],
    spacing: [4.5, 8],
    scale: [0.55, 0.85],
    seed: 169,
  });
  L.fgScatter(-24, 170, 6.6, 7.4, {
    keys: ["prop.crystalB2"],
    spacing: [24, 34],
    scale: [1.4, 1.8],
    seed: 170,
    emis: 0.4,
    dark: 0.5,
    light: { color: [0.35, 0.7, 1.0], intensity: 0.6, radius: 6, dy: 1.5, dz: -1.5, scatter: 0 },
  });
  L.frames((i) => [
    [-5.0, "prop.crystalB", 0, 7.2, { scale: 1.0, emis: 0.4, dark: 0.5 }],
    [5.2, "prop.cRock.2", 0, 7.0, { scale: 1.0, flip: true }],
    [3.6, "prop.stite.2", 8.9, 7.6, { scale: 0.55 }],
  ]);
  L.stageLights([0.6, 0.8, 1.0], 1.0);
  L.walkFrames([
    [-6.0, "prop.smite.2", 0, 7.4, { scale: 0.9 }],
    [6.0, "prop.crystalB2", 0, 7.2, { scale: 1.5, emis: 0.4, dark: 0.5 }],
    [3.2, "prop.stite.2", 8.9, 7.6, { scale: 0.6 }],
  ]);
  return [L, LEN];
}

// ================================================================== L9: Fungal Warren
function l09() {
  const L = new Lvl("ch1-l09", {
    id: "ch1-l09",
    chapter: 1,
    name: "Fungal Warren",
    note: "Low, wet cave thick with glowing teal mushrooms, dripping stalactites, spores drifting. Few torches.",
    biome: "cave",
    seed: 109,
  });
  const LEN = 130;
  L.segment(-30, LEN + 30, "cave", {
    amb: [0.08, 0.17, 0.16],
    gamb: [0.04, 0.07, 0.06],
    fogCol: [0.012, 0.045, 0.04],
    clear: [0.012, 0.045, 0.04],
    gain: [0.95, 1.06, 1.0],
    sh: [0, 0.03, 0.02],
    exposure: 1.45,
    bloom: 0.65,
    ambient: "none",
    fog: [0.034, 11, 0.35],
  });
  L.ground(-30, LEN + 30, -1e5, -1e5 + 20);
  L.wall(-40, 190, -50);
  L.backdrops({ sky: [0.15, 0.25, 0.22], mtn: [0.15, 0.25, 0.22], tl: [0.15, 0.25, 0.22] });
  L.walk(LEN, 0.3);
  L.encounter(1, 26, 3);
  L.encounter(2, 66, 3);
  L.encounter(3, 106, 3, { cam: { dist: 17.8 } });
  L.walkCam(56);
  L.scatter(-30, 170, -8.4, -7.2, {
    keys: ["prop.cRock.0", "prop.cRock.1", "prop.cRock.2"],
    spacing: [2.8, 5.8],
    scale: [0.7, 1.2],
    seed: 181,
    rim: 0.7,
    tint: [0.8, 1.0, 0.9],
  });
  L.scatter(-30, 170, -7.4, -5.2, {
    keys: ["prop.smite.1", "prop.smite.3", "prop.smite.0"],
    spacing: [4.0, 8.0],
    scale: [0.6, 1.0],
    seed: 182,
    rim: 0.8,
    tint: [0.8, 1.0, 0.9],
  });
  L.scatter(-30, 170, -8.5, -4.5, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    spacing: [1.8, 3.8],
    scale: [0.5, 0.95],
    seed: 183,
    rim: 0.6,
    y: [6.6, 8.6],
    tint: [0.8, 1.0, 0.9],
  });
  L.scatter(-30, 170, -5.6, -3.4, {
    keys: ["prop.shroom"],
    spacing: [1.8, 3.6],
    scale: [1.0, 2.0],
    emis: 2.6,
    seed: 184,
    light: { color: [0.3, 1.0, 0.85], intensity: 1.0, radius: 4.2, dy: 0.5, dz: 0.6, scatter: 0 },
  });
  L.scatter(-30, 170, 2.8, 4.6, {
    keys: ["prop.shroom"],
    spacing: [5, 9],
    scale: [0.9, 1.4],
    emis: 2.6,
    seed: 185,
    light: { color: [0.3, 1.0, 0.85], intensity: 0.8, radius: 3.5, dy: 0.4, dz: 0.4, scatter: 0 },
  });
  L.scatter(-30, 170, -9.0, -8.9, {
    keys: ["prop.sconce"],
    spacing: [22, 22],
    seed: 186,
    flipRandom: false,
    y: [3.1, 3.1],
    flame: 0.5,
  });
  L.scatter(-20, 170, -7.0, -5.4, {
    keys: ["prop.crystalP"],
    spacing: [14, 22],
    scale: [1.2, 1.7],
    seed: 187,
    emis: 0.5,
    rim: 0.6,
    tint: [0.7, 0.7, 0.8],
    light: {
      color: [0.62, 0.42, 1.0],
      intensity: 0.9,
      radius: 6.5,
      dy: 1.8,
      dz: 1.8,
      scatter: 0.003,
    },
  });
  posts(L, [20, 52, 84, 116, 140], -2.9);
  L.zone("spores", -20, 150, 26, { y: [0.3, 5] });
  L.fgScatter(-24, 170, 6.6, 7.8, {
    keys: ["prop.shroom"],
    spacing: [8, 14],
    scale: [2.0, 3.0],
    seed: 188,
    emis: 2.0,
    dark: 0.5,
    light: { color: [0.3, 1.0, 0.85], intensity: 0.45, radius: 4, dy: 0.8, dz: -1.0, scatter: 0 },
  });
  L.fgScatter(-24, 170, 6.8, 8.0, {
    keys: ["prop.smite.0", "prop.smite.3", "prop.cRock.2"],
    spacing: [5, 9],
    scale: [0.7, 1.0],
    seed: 189,
    tint: [0.8, 1.0, 0.9],
  });
  L.fgScatter(-24, 170, 7.0, 7.8, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    y: [8.0, 9.0],
    spacing: [3.2, 6],
    scale: [0.55, 0.9],
    seed: 190,
    dark: 0.55,
  });
  L.frames((i) => [
    [-5.2, "prop.shroom", 0, 7.2, { scale: 2.6, emis: 2.0, dark: 0.45 }],
    [5.4, "prop.smite.2", 0, 7.0, { scale: 0.9, flip: true }],
    [-2.0, "prop.stite.1", 9.0, 7.4, { scale: 0.6 }],
    [3.6, "prop.stite.2", 8.9, 7.6, { scale: 0.5 }],
  ]);
  L.stageLights([0.55, 1.0, 0.85], 1.0);
  L.walkFrames([
    [-6.0, "prop.shroom", 0, 7.2, { scale: 2.4, emis: 2.0, dark: 0.45 }],
    [6.0, "prop.smite.2", 0, 7.0, { scale: 0.9, flip: true }],
    [3.0, "prop.stite.1", 9.0, 7.4, { scale: 0.6 }],
  ]);
  return [L, LEN];
}

// ================================================================== L10: Golem Hollow
function l10() {
  const L = new Lvl("ch1-l10", {
    id: "ch1-l10",
    chapter: 1,
    name: "Golem Hollow",
    note: "Violet-lit hollow: two wave fights in the approach cave, then the rune-ringed arena of the Ruin Golem.",
    biome: "hollow",
    seed: 110,
  });
  const LEN = 160;
  L.segment(
    -30,
    84,
    "cave",
    {
      amb: [0.07, 0.05, 0.12],
      fogCol: [0.02, 0.012, 0.03],
      clear: [0.02, 0.012, 0.03],
      hi: [0.03, 0.01, 0.05],
      ambient: "embers",
    },
    30,
  );
  L.segment(84, LEN + 30, "hollow", {
    amb: [0.08, 0.06, 0.15],
    fogCol: [0.022, 0.014, 0.034],
    clear: [0.022, 0.014, 0.034],
    gain: [1.04, 0.97, 1.06],
    bloom: 0.7,
  });
  L.ground(-30, LEN + 30, -1e5, -1e5 + 20);
  L.wall(-40, 200, -50);
  L.backdrops({ sky: [0.2, 0.2, 0.3], mtn: [0.2, 0.2, 0.3], tl: [0.2, 0.2, 0.3] });
  L.walk(LEN);
  L.encounter(1, 26, 3, { waves: 2 });
  L.encounter(2, 66, 3, { waves: 3 });
  L.encounter(3, 124, 1, { boss: true, cam: { dist: 19 }, bossCam: {} });
  L.walkCam(90);
  L.scatter(-30, 190, -8.4, -7.2, {
    keys: ["prop.cRock.0", "prop.cRock.1", "prop.cRock.2"],
    spacing: [3.4, 7.4],
    scale: [0.8, 1.4],
    seed: 201,
    rim: 0.7,
    tint: [0.9, 0.85, 1.0],
  });
  L.scatter(-30, 190, -7.6, -5.2, {
    keys: ["prop.smite.0", "prop.smite.1", "prop.smite.2", "prop.smite.3"],
    spacing: [4.5, 9.5],
    scale: [0.7, 1.2],
    seed: 202,
    rim: 0.8,
  });
  L.scatter(-30, 190, -8.5, -4.5, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    spacing: [2.6, 5.6],
    scale: [0.5, 0.9],
    seed: 203,
    rim: 0.6,
    y: [7.2, 8.4],
  });
  L.scatter(-30, 190, -9.0, -8.9, {
    keys: ["prop.sconce"],
    spacing: [7.4, 7.4],
    seed: 204,
    flipRandom: false,
    y: [3.1, 3.1],
    flame: 0.5,
  });
  L.scatter(-24, 110, -6.8, -5.0, {
    keys: ["prop.crystalB", "prop.crystalP"],
    spacing: [10, 16],
    scale: [1.3, 1.6],
    seed: 205,
    emis: 0.5,
    rim: 0.6,
    tint: [0.7, 0.7, 0.8],
    light: { color: [0.5, 0.5, 1.0], intensity: 0.6, radius: 6, dy: 1.8, dz: 1.8, scatter: 0.003 },
  });
  // arena ring
  L.scatter(112, 160, -8.2, -5.0, {
    keys: ["prop.crystalP", "prop.crystalB2", "prop.crystalP", "prop.crystalB"],
    spacing: [5, 8],
    scale: [1.7, 2.3],
    seed: 206,
    emis: 0.55,
    rim: 0.7,
    tint: [0.7, 0.7, 0.8],
    light: {
      color: [0.62, 0.42, 1.0],
      intensity: 0.8,
      radius: 8,
      dy: 2.2,
      dz: 1.8,
      scatter: 0.004,
    },
  });
  posts(L, [4, 14, 46, 86, 100, 114, 140, 152], -2.9);
  L.scatter(90, 160, -5.0, -3.4, {
    keys: ["prop.cRock.0", "prop.cRock.1"],
    spacing: [6, 11],
    scale: [1.4, 2.0],
    seed: 207,
  });
  L.prop("prop.arch", 100, -8.2, { scale: 1.6, tint: [0.7, 0.65, 0.8] });
  L.rune(132.3, -1.0, 6.4, 1.0);
  L.zone("embers", -20, 190, 14, { y: [0.2, 4.5] });
  L.zone("spores", 100, 190, 14, { y: [0.3, 5] });
  L.fgScatter(-24, 190, 6.6, 8.0, {
    keys: ["prop.smite.0", "prop.smite.1", "prop.cRock.2", "prop.smite.2"],
    spacing: [4.5, 8],
    scale: [0.7, 1.1],
    seed: 208,
  });
  L.fgScatter(-24, 190, 7.0, 7.8, {
    keys: ["prop.stite.0", "prop.stite.1", "prop.stite.2"],
    y: [8.2, 9.2],
    spacing: [3.5, 7],
    scale: [0.55, 0.9],
    seed: 209,
    dark: 0.55,
  });
  L.fgScatter(100, 190, 6.8, 7.8, {
    keys: ["prop.crystalP"],
    spacing: [14, 20],
    scale: [1.6, 2.0],
    seed: 210,
    emis: 0.4,
    dark: 0.5,
    light: { color: [0.62, 0.42, 1.0], intensity: 0.6, radius: 6, dy: 1.5, dz: -1.5, scatter: 0 },
  });
  L.frames((i, cx) => {
    if (i === 3)
      return [
        [-4.6, "prop.post", 0, 6.8, { dark: 0.1, flame: 0.55 }],
        [5.4, "prop.cRock.2", 0, 7.0, { scale: 1.0, flip: true }],
        [3.6, "prop.stite.2", 8.9, 7.6, { scale: 0.55 }],
        [-3.0, "prop.stite.0", 9.2, 7.4, { scale: 0.5 }],
      ];
    return [
      [-5.0, "prop.smite.2", 0, 7.4, { scale: 0.85 }],
      [5.2, "prop.cRock.2", 0, 7.0, { scale: 0.9, flip: true }],
      [3.6, "prop.stite.2", 8.9, 7.6, { scale: 0.5 }],
    ];
  });
  L.stageLights([0.95, 0.65, 0.95], 1.0);
  L.walkFrames([
    [-6.0, "prop.smite.2", 0, 7.4, { scale: 0.9 }],
    [6.0, "prop.crystalP", 0, 7.2, { scale: 1.5, emis: 0.4, dark: 0.5 }],
    [3.4, "prop.stite.2", 8.9, 7.6, { scale: 0.55 }],
  ]);
  return [L, LEN];
}

mkdirSync(OUT, { recursive: true });
for (const make of [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10]) {
  const [L, len] = make();
  writeFileSync(join(OUT, `${L.id}.json`), `${JSON.stringify(L.json(len))}\n`);
  console.log("wrote", L.id, L.ents.length, "entities");
}

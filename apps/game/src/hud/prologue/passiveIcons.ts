/**
 * Passive icons (P4.2 P2-12): 12x12 pixel gems for the Grimoire's passive row and the returning Clean Cut shard. Authored as strings
 * like the skill icons in `hud/skillIcons.ts`; each is pre-rendered ONCE to a colour canvas and a dimmed one (the dim variant is the
 * grey outline the passives take on `passivesDim`).
 */
import type { IconDef, SkillIconSet } from "../skillIcons";

export const PASSIVE_ICON_PX = 12;
const PK = "#150d1e";

export const PASSIVE_ICON_DEFS: Readonly<Record<string, IconDef>> = {
  cleanCut: {
    pal: { k: PK, w: "#ffffff", l: "#c8dcff", g: "#ffd24a", G: "#b8842c", b: "#8a5a2c" },
    rows: [
      "..........kk",
      ".........kwk",
      "........kwlk",
      ".......kwlk.",
      "......kwlk..",
      "..k..kwlk...",
      "..kkkwlk....",
      "...kkgk.....",
      "..kgGkk.....",
      ".kgGk.k.....",
      "kbbk........",
      ".kk.........",
    ],
  },
  bulwarkStreak: {
    pal: { k: PK, w: "#ffffff", l: "#cfe2ff", b: "#6f9cf0", d: "#2c4a9c" },
    rows: [
      "kkkkkkkkkkkk",
      "kllllbbbbbdk",
      "kllllbbbbbdk",
      "kllllbbbbbdk",
      "kwwwwwwwwwwk",
      ".kbbbbbbbbk.",
      ".kbbbbbbbdk.",
      "..kbbbbbdk..",
      "...kbbbdk...",
      "....kbdk....",
      ".....kk.....",
      "............",
    ],
  },
  steadyHands: {
    pal: { k: PK, g: "#9cf0a8", d: "#3ea65a", w: "#e8ffe8" },
    rows: [
      "....kk......",
      "..kkgkk.kk..",
      "..kgwgkkgk..",
      "..kgggkggk..",
      "kkkgggggggk.",
      "kgkgggggggk.",
      "kggggggggdk.",
      ".kgggggggdk.",
      "..kgggggdk..",
      "..kgggggdk..",
      "...kkkkkk...",
      "............",
    ],
  },
  riposte: {
    pal: { k: PK, w: "#ffffff", l: "#c8dcff", g: "#ff9a6a", b: "#8a3a1c" },
    rows: [
      "k..........k",
      "kwk......kwk",
      ".kwk....kwk.",
      "..kwk..kwk..",
      "...kwkkwk...",
      "....kwwk....",
      "...kgkkgk...",
      "..kbk..kbk..",
      ".kgk....kgk.",
      "kbk......kbk",
      "............",
      "............",
    ],
  },
  ironWill: {
    pal: { k: PK, w: "#ffffff", l: "#d8d2e8", b: "#8a84a0", d: "#4a4660" },
    rows: [
      "...kkkkkk...",
      "..kllllllk..",
      ".kllwwlllbk.",
      ".klllllllbk.",
      ".klllllllbk.",
      ".kkkkkkkkkk.",
      ".kdddkkdddk.",
      ".kdddkkdddk.",
      ".kddkkkkddk.",
      "..kk....kk..",
      "............",
      "............",
    ],
  },
  openingGambit: {
    pal: { k: PK, y: "#ffc83c", w: "#fff6cc", o: "#ff7a22" },
    rows: [
      "......kkkk..",
      ".....kwyyk..",
      "....kwyyk...",
      "...kwyyk....",
      "..kyyyyyk...",
      "...kkkyyok..",
      "......kyok..",
      ".....kyok...",
      "....kyok....",
      "...kook.....",
      "...kk.......",
      "............",
    ],
  },
  lastStand: {
    pal: { k: PK, w: "#ffe0e0", r: "#ff5a6a", d: "#a82038" },
    rows: [
      ".kkk....kkk.",
      "kwrrk..krrrk",
      "krrrrkkrrrrk",
      "krrrrrrrrrdk",
      "krrrrrrrrrdk",
      ".krrrrrrrdk.",
      "..krrrrrdk..",
      "...krrrdk...",
      "....krdk....",
      ".....kk.....",
      "............",
      "............",
    ],
  },
  comeback: {
    pal: { k: PK, w: "#fbe8ff", v: "#e08aff", d: "#8a3ac0" },
    rows: [
      ".....kk.....",
      "....kwvk....",
      "...kwvvvk...",
      "..kwvvvvvk..",
      ".kwvvvvvvvk.",
      "kkkkvvvvkkkk",
      "...kvvvdk...",
      "...kvvvdk...",
      "...kvvvdk...",
      "...kvvvdk...",
      "...kkkkkk...",
      "............",
    ],
  },
  calmMind: {
    pal: { k: PK, w: "#e8ffff", t: "#6fe0e0", d: "#2a8a96" },
    rows: [
      ".....kk.....",
      "....kwtk....",
      "...kwttk....",
      "...kttttk...",
      "..kttttttk..",
      ".kwttttttdk.",
      ".kttttttttk.",
      ".kttttttddk.",
      ".kdtttttddk.",
      "..kdddddk...",
      "...kkkkk....",
      "............",
    ],
  },
};

function hexRgb(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function build(def: IconDef): SkillIconSet {
  const mk = (): HTMLCanvasElement => {
    const cv = document.createElement("canvas");
    cv.width = PASSIVE_ICON_PX;
    cv.height = PASSIVE_ICON_PX;
    return cv;
  };
  const color = mk();
  const dim = mk();
  const cc = color.getContext("2d");
  const dc = dim.getContext("2d");
  if (!cc || !dc) return { color, dim };
  for (let y = 0; y < PASSIVE_ICON_PX; y++) {
    const row = def.rows[y] ?? "";
    for (let x = 0; x < PASSIVE_ICON_PX; x++) {
      const ch = row[x] ?? ".";
      const hex = def.pal[ch];
      if (!hex) continue;
      cc.fillStyle = hex;
      cc.fillRect(x, y, 1, 1);
      const [r, g, b] = hexRgb(hex);
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      const k = ch === "k" ? 0.6 : 0.34;
      const f = (v: number): number => Math.round((l * 0.75 + v * 0.25) * k + 16);
      dc.fillStyle = `rgb(${f(r)},${f(g)},${f(b)})`;
      dc.fillRect(x, y, 1, 1);
    }
  }
  return { color, dim };
}

const cache = new Map<string, SkillIconSet>();
/** The 12x12 icon pair (colour + dimmed) of a passive, or null when it has no authored art. */
export function getPassiveIcon(id: string): SkillIconSet | null {
  const def = PASSIVE_ICON_DEFS[id];
  if (!def) return null;
  let s = cache.get(id);
  if (!s) {
    s = build(def);
    cache.set(id, s);
  }
  return s;
}

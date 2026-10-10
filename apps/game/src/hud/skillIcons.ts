/**
 * Pixel-art skill icons (16x16, limited palette, 1 px dark outline) + the pixel orb frame.
 * Authored as strings; every sprite is pre-rendered ONCE to a 16x16 offscreen canvas (colour + dimmed variant)
 * and blitted with imageSmoothingEnabled=false at an integer scale. Nothing here runs per-pixel per frame.
 */
export const ICON_PX = 16;
export const ICON_SCALE = 3;
export const FRAME_CELLS = 26;

export interface IconDef {
  rows: string[];
  pal: Record<string, string>;
}

const FIREBALL: IconDef = {
  pal: { k: "#1c0806", d: "#8a1a14", r: "#d63a1c", o: "#ff7a22", y: "#ffc83c", w: "#fff6cc" },
  rows: [
    "......kk........",
    ".....kork..k....",
    "....kordk.kok...",
    "..k.kordkkork...",
    ".kokkorodordk.k.",
    ".kookorooroodkok",
    "kdroordoyyoorokk",
    "kdrooyyywwyyookk",
    "kdrooyywwwwyorok",
    "kdrroyywwwwyoork",
    ".kdrooyywwyyook.",
    ".kddrooyyyyoodk.",
    "..kddrroooorddk.",
    "...kkddrrrrdkk..",
    ".....kkkddkkk...",
    "........kk......",
  ],
};

const AEGIS: IconDef = {
  pal: {
    k: "#0a0c1c",
    g: "#ffd860",
    G: "#b8842c",
    w: "#ffffff",
    l: "#9cc4ff",
    b: "#4a78e0",
    d: "#24388c",
    e: "#ffe89a",
  },
  rows: [
    "..kkkkkkkkkkkk..",
    ".kgggggggggggGk.",
    "kgwlllllklbbbbGk",
    "kgllllllklbbbdGk",
    "kgllllllkkbbbdGk",
    "kglllllkeekbbdGk",
    "kglllllkeekbbdGk",
    "kgllllkkeekkbdGk",
    "kglllllkeekbbdGk",
    ".kglllllkkbbddk.",
    ".kGlllllkbbbddk.",
    "..kGllllbbbdGk..",
    "...kGlllbbdGk...",
    "....kGllbdGk....",
    ".....kGlbGk.....",
    "......kkkk......",
  ],
};

const SLASH: IconDef = {
  pal: { k: "#0c1220", w: "#ffffff", l: "#c8dcff", b: "#6a98e8", d: "#2c4a9c" },
  rows: [
    "............kkk.",
    "..........kkwwk.",
    "........kkwwllk.",
    ".......kwwllbbk.",
    "......kwwllbbk..",
    ".....kwllbbdk...",
    "....kwllbbdk....",
    "...kwllbbdk.....",
    "..kkwlbbdk......",
    ".kllkbbdkk......",
    "kllbkddk........",
    "kbbdkkk.........",
    "kddk............",
    "kkk.............",
    "................",
    "................",
  ],
};

const PIERCE: IconDef = {
  pal: {
    k: "#0c1220",
    w: "#ffffff",
    l: "#bfe4ff",
    b: "#5aa6ee",
    d: "#2a5ca8",
    h: "#8a5a30",
    H: "#5a3418",
    g: "#ffd860",
  },
  rows: [
    "..............kk",
    ".............kwk",
    "............kwlk",
    "...........kwlbk",
    "..........kwlbk.",
    ".........kwlbdk.",
    "........kwlbdk..",
    ".......kwlbdk...",
    "......kwlbdk....",
    ".....kgglbk.....",
    "....kgggkk......",
    "...khgggk.......",
    "..khhHk.........",
    ".khhHk..........",
    "khHkk...........",
    "kkk.............",
  ],
};

const MENDING: IconDef = {
  pal: { k: "#0a2412", w: "#ffffff", y: "#fff08a", g: "#5ee07a", d: "#1f9a4a", D: "#146a34" },
  rows: [
    "......kkkk......",
    ".....kwyygk.....",
    ".....kyyggk.....",
    ".....kyggdk.....",
    "..kkkkyggdkkkk..",
    ".kwyyyyyggggddk.",
    ".kyyyyyggggdddk.",
    ".kyyyggggdddDDk.",
    ".kgggggggdddDDk.",
    "..kkkkgggdkkkk..",
    ".....kgggdk.....",
    ".....kggddk.....",
    ".....kgddDk.....",
    "......kkkk......",
    "................",
    "................",
  ],
};

const FROST: IconDef = {
  pal: { k: "#081428", w: "#ffffff", l: "#cdf4ff", c: "#7ad8ff", b: "#3a96e0", d: "#1c4c9c" },
  rows: [
    ".......kk.......",
    "......kwwk......",
    ".k....kclk....k.",
    "kck...kclk...kck",
    ".kclk.kcbk.klck.",
    "..kclkkcbkklck..",
    "...kclkcbklck...",
    "kkkkkcwwwwckkkkk",
    "kwlccccwwcccclwk",
    "kkkkkcwwwwckkkkk",
    "...kclkcbklbk...",
    "..kclkkcbkkblk..",
    ".kclk.kcbk.klbk.",
    "kck...kcbk...kbk",
    ".k....kbdk....k.",
    "......kkkk......",
  ],
};

const FALLBACK: IconDef = {
  pal: { k: "#14081c", p: "#d49aff", w: "#fff0ff", d: "#7a3ab0" },
  rows: [
    "................",
    ".......kk.......",
    "......kwpk......",
    ".....kwppdk.....",
    "....kwppppdk....",
    "...kwppppppdk...",
    "..kwpppppppdk...",
    ".kwppppppppppdk.",
    "..kpppppppppdk..",
    "...kpppppppdk...",
    "....kppppppk....",
    ".....kpppdk.....",
    "......kppk......",
    ".......kk.......",
    "................",
    "................",
  ],
};

const DEFS: Record<string, IconDef> = {
  fireball: FIREBALL,
  aegis: AEGIS,
  slashWave: SLASH,
  piercingThrust: PIERCE,
  mendingLight: MENDING,
  frostLock: FROST,
};

/** Accent colour per skill (charge ring). */
export const SKILL_ACCENT: Record<string, string> = {
  fireball: "#ff9a40",
  aegis: "#8ab8ff",
  slashWave: "#c8dcff",
  piercingThrust: "#8ad0ff",
  mendingLight: "#7aeb90",
  frostLock: "#8ae0ff",
};
export const DEFAULT_ACCENT = "#d49aff";

export interface SkillIconSet {
  color: HTMLCanvasElement;
  dim: HTMLCanvasElement;
}

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  return cv;
}

function hexRgb(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Paint a def to a colour canvas + a desaturated/darkened one (the "charging" look). */
export function buildIcon(def: IconDef): SkillIconSet {
  const color = mkCanvas(ICON_PX, ICON_PX);
  const dim = mkCanvas(ICON_PX, ICON_PX);
  const cc = color.getContext("2d");
  const dc = dim.getContext("2d");
  if (!cc || !dc) return { color, dim };
  for (let y = 0; y < ICON_PX; y++) {
    const row = def.rows[y] ?? "";
    for (let x = 0; x < ICON_PX; x++) {
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

/** Icon pair for a skill id (built lazily, once). Unknown ids get the generic arcane gem, never nothing. */
export function getSkillIcon(id: string): SkillIconSet {
  let s = cache.get(id);
  if (!s) {
    s = buildIcon(DEFS[id] ?? FALLBACK);
    cache.set(id, s);
  }
  return s;
}

export const hasSkillIcon = (id: string): boolean => id in DEFS;
export const ICON_DEFS: Readonly<Record<string, IconDef>> = DEFS;
export const FALLBACK_ICON: IconDef = FALLBACK;

// ---- pixel orb frame -------------------------------------------------------------------------------------------
export interface RingCell {
  x: number;
  y: number;
  /** 0..1 clockwise from 12 o'clock */
  t: number;
}
const C0 = (FRAME_CELLS - 1) / 2;
export const RING_IN = 11;
export const RING_OUT = 12.5;
let frameCv: HTMLCanvasElement | null = null;
let ringCells: RingCell[] | null = null;

/** Ring cells (clockwise from the top) used for the pixel charge progress. */
export function getRingCells(): RingCell[] {
  if (ringCells) return ringCells;
  const out: RingCell[] = [];
  for (let y = 0; y < FRAME_CELLS; y++)
    for (let x = 0; x < FRAME_CELLS; x++) {
      const d = Math.hypot(x - C0, y - C0);
      if (d > RING_IN && d <= RING_OUT) {
        const a = Math.atan2(x - C0, -(y - C0));
        out.push({ x, y, t: (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2) });
      }
    }
  ringCells = out;
  return out;
}

/** Pre-rendered pixel-circle frame: black outline, bevelled bronze rim, dark well. */
export function getOrbFrame(): HTMLCanvasElement {
  if (frameCv) return frameCv;
  const cv = mkCanvas(FRAME_CELLS, FRAME_CELLS);
  const c = cv.getContext("2d");
  if (c) {
    for (let y = 0; y < FRAME_CELLS; y++)
      for (let x = 0; x < FRAME_CELLS; x++) {
        const d = Math.hypot(x - C0, y - C0);
        let col: string | null = null;
        if (d <= 13.2) col = "#000000";
        if (d <= RING_OUT) {
          const lit = x - C0 + (y - C0) < -4;
          const shade = x - C0 + (y - C0) > 6;
          col = lit ? "#c8aa78" : shade ? "#4a3a28" : "#7a6448";
        }
        if (d <= RING_IN) col = "#0c0912";
        if (d <= RING_IN - 1) col = "#14101c";
        if (col) {
          c.fillStyle = col;
          c.fillRect(x, y, 1, 1);
        }
      }
  }
  frameCv = cv;
  return cv;
}

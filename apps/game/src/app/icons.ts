/**
 * Placeholder pixel icons for gear, skills and passives (T3.2). Each glyph is drawn on a 16x16 grid with a few
 * primitives, then an automatic highlight + dark outline pass gives them one consistent look. Output is a PNG data
 * URL shown with `image-rendering: pixelated` inside a rarity-coloured frame (`.hd-ico`, hud/uiTheme.ts).
 * Real art replaces `iconFor` later; the call sites only pass the content `spriteId` / `iconId`.
 */

const N = 16;
type Cell = string | null;

class Px {
  readonly g: Cell[] = new Array<Cell>(N * N).fill(null);
  put(x: number, y: number, c: string): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= N || yi >= N) return;
    this.g[yi * N + xi] = c;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, w = 1): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      this.put(x, y, c);
      if (w > 1) {
        this.put(x + 1, y, c);
        if (w > 2) this.put(x, y + 1, c);
      }
    }
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c);
  }
  disc(cx: number, cy: number, r: number, c: string): void {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r + r * 0.6) this.put(cx + x, cy + y, c);
  }
  ring(cx: number, cy: number, r: number, c: string): void {
    for (let y = -r - 1; y <= r + 1; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        const d = x * x + y * y;
        if (d <= r * r + r && d >= (r - 1) * (r - 1) - 1) this.put(cx + x, cy + y, c);
      }
  }
  poly(pts: [number, number][], c: string): void {
    let minY = N;
    let maxY = 0;
    for (const p of pts) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let x = 0; x < N; x++) {
        if (inside(pts, x + 0.5, y + 0.5)) this.put(x, y, c);
      }
    }
  }
  erase(f: (x: number, y: number) => boolean): void {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (f(x, y)) this.g[y * N + x] = null;
  }
  get(x: number, y: number): Cell {
    return x < 0 || y < 0 || x >= N || y >= N ? null : (this.g[y * N + x] ?? null);
  }
}

function inside(pts: [number, number][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i] as [number, number];
    const [xj, yj] = pts[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const OUT = "#150d1e";

const mix = (hex: string, to: string, t: number): string => {
  const a = parse(hex);
  const b = parse(to);
  const m = a.map((v, i) => Math.round(v + ((b[i] as number) - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
const parse = (h: string): number[] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Highlight (top-left rim) and shade (bottom-right rim), then a 1px dark outline. */
function finish(p: Px): Px {
  const o = new Px();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = p.get(x, y);
      if (!c) continue;
      let col = c;
      if (!p.get(x - 1, y - 1) || !p.get(x, y - 1)) col = mix(c, "#ffffff", 0.32);
      else if (!p.get(x + 1, y + 1) || !p.get(x, y + 1)) col = mix(c, "#000000", 0.28);
      o.put(x, y, col);
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (p.get(x, y)) continue;
      if (p.get(x - 1, y) || p.get(x + 1, y) || p.get(x, y - 1) || p.get(x, y + 1))
        o.put(x, y, OUT);
    }
  return o;
}

const STEEL = "#aab4c8";
const IRON = "#6f7a92";
const WOOD = "#8a5a2c";
const LEATHER = "#a0673a";
const GOLDC = "#e9c46a";

type Draw = (p: Px) => void;

const GLYPHS: Record<string, Draw> = {
  // ---- gear (keyed by content spriteId prefix)
  "weapon.sword": (p) => {
    p.line(13, 2, 6, 9, STEEL, 2);
    p.line(13, 2, 6, 9, "#dfe6f2");
    p.line(4, 7, 9, 12, GOLDC, 2);
    p.line(5, 10, 2, 13, WOOD, 2);
    p.disc(2, 14, 1, GOLDC);
  },
  "weapon.dagger": (p) => {
    p.line(12, 3, 7, 8, "#c9e6c0", 2);
    p.line(5, 6, 9, 10, "#4f8a4a", 2);
    p.line(6, 9, 3, 12, WOOD, 2);
    p.put(2, 13, GOLDC);
  },
  "weapon.staff": (p) => {
    p.line(11, 5, 3, 14, WOOD, 2);
    p.disc(11, 4, 2, "#7ee6a0");
    p.put(10, 3, "#e8fff0");
    p.line(8, 2, 14, 6, WOOD, 1);
  },
  "weapon.hammer": (p) => {
    p.line(3, 14, 10, 7, WOOD, 2);
    p.rect(7, 2, 8, 5, IRON);
    p.rect(7, 2, 8, 1, "#aab4c8");
    p.rect(14, 3, 1, 3, "#3d4458");
  },
  armor: (p) => {
    p.poly(
      [
        [3, 3],
        [6, 3],
        [8, 4.5],
        [10, 3],
        [13, 3],
        [15, 6],
        [12.5, 7.5],
        [12.5, 14],
        [3.5, 14],
        [3.5, 7.5],
        [1, 6],
      ],
      LEATHER,
    );
    p.rect(4, 10, 9, 1, GOLDC);
    p.rect(8, 5, 1, 9, mix(LEATHER, "#000000", 0.25));
    p.put(8, 10, "#fff0b8");
  },
  charm: (p) => {
    p.ring(8, 6, 4, "#8a5a2c");
    p.erase((_x, y) => y < 3);
    p.poly(
      [
        [8, 8],
        [12, 11.5],
        [8, 15],
        [4, 11.5],
      ],
      GOLDC,
    );
    p.poly(
      [
        [8, 9.5],
        [10.4, 11.5],
        [8, 13.5],
        [5.6, 11.5],
      ],
      "#59c58a",
    );
  },
  // ---- active skills (by content iconId: icon.skill.*)
  "skill.fireball": (p) => {
    p.poly(
      [
        [3, 2],
        [8, 6],
        [11, 5],
        [4, 8],
      ],
      "#ff8a3c",
    );
    p.disc(9, 9, 5, "#ff6a2a");
    p.disc(9, 10, 3, "#ffc04a");
    p.disc(9, 10, 1, "#fff4c0");
  },
  "skill.aegis": (p) => {
    p.poly(
      [
        [2, 2],
        [14, 2],
        [14, 8],
        [8, 15],
        [2, 8],
      ],
      "#4f86d6",
    );
    p.rect(7, 4, 2, 8, GOLDC);
    p.rect(4, 6, 8, 2, GOLDC);
  },
  "skill.slashWave": (p) => {
    p.disc(7, 8, 7, "#dff6ff");
    p.erase((x, y) => (x - 10) ** 2 + (y - 8) ** 2 <= 6.2 ** 2);
    p.erase((x) => x > 13);
  },
  "skill.piercingThrust": (p) => {
    p.line(1, 14, 11, 4, "#8a5a2c", 2);
    p.poly(
      [
        [14.5, 1.5],
        [8, 3],
        [13, 8],
      ],
      "#e6eefc",
    );
    p.line(2, 13, 6, 9, "#c9d4ec");
  },
  "skill.mendingLight": (p) => {
    p.disc(8, 8, 7, "#2f6a4a");
    p.rect(7, 3, 2, 10, "#e8fff0");
    p.rect(3, 7, 10, 2, "#e8fff0");
    p.put(8, 8, "#ffffff");
  },
  "skill.frostLock": (p) => {
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ] as const) {
      p.line(8 - dx * 6, 8 - dy * 6, 8 + dx * 6, 8 + dy * 6, "#9fe4ff");
    }
    p.disc(8, 8, 2, "#e6f8ff");
  },
  // ---- passives (by iconId: icon.passive.*)
  "passive.cleanCut": (p) => {
    p.line(2, 9, 6, 13, "#7ee6a0", 2);
    p.line(6, 13, 14, 3, "#7ee6a0", 2);
  },
  "passive.bulwarkStreak": (p) => {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++)
        p.rect(1 + c * 5 + (r % 2) * 2, 2 + r * 3, 4, 2, r % 2 ? "#8a93a8" : "#6a7388");
  },
  "passive.steadyHands": (p) => {
    p.ring(8, 8, 5, "#9fe8f0");
    p.rect(7, 1, 2, 14, "#9fe8f0");
    p.rect(1, 7, 14, 2, "#9fe8f0");
    p.disc(8, 8, 1, "#ffffff");
  },
  "passive.riposte": (p) => {
    p.line(2, 2, 13, 13, STEEL, 2);
    p.line(13, 2, 2, 13, "#dfe6f2", 2);
    p.put(1, 14, GOLDC);
    p.put(14, 14, GOLDC);
  },
  "passive.ironWill": (p) => {
    p.poly(
      [
        [3, 14],
        [3, 7],
        [5, 3],
        [11, 3],
        [13, 7],
        [13, 14],
      ],
      IRON,
    );
    p.rect(5, 8, 6, 2, "#0b0813");
    p.rect(7, 3, 2, 5, "#aab4c8");
  },
  "passive.openingGambit": (p) => {
    p.poly(
      [
        [9, 1],
        [3, 9],
        [7, 9],
        [6, 15],
        [13, 6],
        [9, 6],
      ],
      "#ffd24a",
    );
  },
  "passive.lastStand": (p) => {
    p.disc(5, 6, 3, "#e0505a");
    p.disc(11, 6, 3, "#e0505a");
    p.poly(
      [
        [2, 7],
        [14, 7],
        [8, 14.5],
      ],
      "#e0505a",
    );
    p.line(8, 5, 7, 9, "#150d1e");
  },
  "passive.comeback": (p) => {
    p.ring(8, 8, 5, "#ffb43a");
    p.erase((x, y) => x > 8 && y < 6 && x < 12);
    p.poly(
      [
        [9, 1],
        [14, 5],
        [9, 7],
      ],
      "#ffb43a",
    );
  },
  // ---- the cache
  cache: (p) => {
    p.rect(2, 7, 12, 7, "#8a5a2c");
    p.poly(
      [
        [2, 7],
        [3, 3],
        [13, 3],
        [14, 7],
      ],
      "#a8703a",
    );
    p.rect(2, 7, 12, 1, "#2a1406");
    p.rect(2, 5, 12, 1, GOLDC);
    p.rect(2, 11, 12, 1, GOLDC);
    p.rect(7, 6, 2, 4, "#fff0b8");
    p.put(8, 8, "#2a1406");
  },
};

const cache = new Map<string, string>();

function key(id: string): string {
  // content ids: gear.weapon.sword.t1 | gear.armor.t1 | gear.charm.t1 | icon.skill.fireball | icon.passive.cleanCut
  const m = /^gear\.(weapon\.[a-z]+|armor|charm)/.exec(id);
  if (m) return m[1] as string;
  const k = /^icon\.(skill|passive)\.(.+)$/.exec(id);
  if (k) return `${k[1]}.${k[2]}`;
  return id;
}

/** PNG data URL (16x16) for a content icon/sprite id. Unknown ids get a neutral gem. */
export function iconUrl(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const k = key(id);
  const px = new Px();
  (
    GLYPHS[k] ??
    ((p: Px) => {
      p.poly(
        [
          [8, 2],
          [13, 8],
          [8, 14],
          [3, 8],
        ],
        "#9a8fb8",
      );
    })
  )(px);
  const f = finish(px);
  let url = "";
  try {
    const cv = document.createElement("canvas");
    cv.width = N;
    cv.height = N;
    const c = cv.getContext("2d");
    if (c) {
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const col = f.get(x, y);
          if (col) {
            c.fillStyle = col;
            c.fillRect(x, y, 1, 1);
          }
        }
      url = cv.toDataURL("image/png");
    }
  } catch {
    url = "";
  }
  cache.set(id, url);
  return url;
}

/** Rarity-framed icon markup (frame + pixel glyph). `rarity` null = plain frame (skills). */
export function iconHtml(
  id: string,
  opt: { rarity?: string | null; size?: "sm" | "lg"; level?: number; alt?: string } = {},
): string {
  const cls = ["hd-ico", opt.size ?? "", opt.rarity ? `r-${opt.rarity}` : "plain"].join(" ");
  const lv = opt.level && opt.level > 0 ? `<span class="lv">+${opt.level}</span>` : "";
  return `<span class="${cls}" role="img" aria-label="${(opt.alt ?? "").replace(/"/g, "")}"><img alt="" src="${iconUrl(id)}">${lv}</span>`;
}

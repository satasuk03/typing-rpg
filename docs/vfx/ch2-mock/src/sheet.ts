/**
 * C0.2 SCRATCH contact sheet: Ch1 roster vs the Ch2 direction sprites (frames, normal maps, emissive), plus
 * a silhouette row (pure black fill) to judge the read at a glance. Pixel scale 4x (Willow 2x).
 */
import { ProceduralSpriteSource } from "../../../../apps/game/src/render/sprites/ProceduralSpriteSource";
import type { SpriteFrame } from "../../../../apps/game/src/render/sprites/SpriteSource";
import * as A from "./ch2Art";

const W = 1920;
const H = 1080;
const cv = document.getElementById("gl") as HTMLCanvasElement;
cv.width = W;
cv.height = H;
const g = cv.getContext("2d") as CanvasRenderingContext2D;
g.imageSmoothingEnabled = false;
g.fillStyle = "#14141c";
g.fillRect(0, 0, W, H);
const label = (t: string, x: number, y: number, size = 15, col = "#cfc6b0"): void => {
  g.font = `${size}px monospace`;
  g.fillStyle = col;
  g.fillText(t, x, y);
};
const silhouette = (img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext("2d") as CanvasRenderingContext2D;
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = "#000";
  x.fillRect(0, 0, c.width, c.height);
  return c;
};
/** Draw a frame foot-anchored on a baseline at (x, base). Returns the drawn width. */
const draw = (src: CanvasImageSource & { width: number; height: number }, x: number, base: number, s: number): number => {
  g.drawImage(src, x, base - src.height * s, src.width * s, src.height * s);
  return src.width * s;
};
const rowLine = (y: number): void => {
  g.fillStyle = "#26263a";
  g.fillRect(20, y + 2, W - 40, 2);
};

const ch1 = new ProceduralSpriteSource();
type Img = CanvasImageSource & { width: number; height: number };
const img = (f: SpriteFrame): Img => f.img as Img;

// Row 1: Ch1 roster (reference scale) + silhouettes
label("CH1 ROSTER (reference, 4x)", 24, 30, 16, "#ffd27a");
let x = 30;
let base = 240;
for (const k of ["hero", "monster.slimeG", "monster.bat", "monster.goblin", "monster.golem"]) {
  const f = ch1.frames(k)[0] as SpriteFrame;
  x += draw(img(f), x, base, 4) + 24;
}
x += 40;
for (const k of ["hero", "monster.slimeG", "monster.bat", "monster.goblin", "monster.golem"]) {
  const f = ch1.frames(k)[0] as SpriteFrame;
  x += draw(silhouette(img(f)), x, base, 2) + 14;
}
label("silhouettes 2x", x - 360, base + 22, 13, "#8a8aa0");
rowLine(base + 26);

// Row 2: Ch2 enemies, all frames, 4x
label("CH2 ENEMIES (4x): idle frames | attack / cast / howl", 24, base + 56, 16, "#ffd27a");
base = 560;
x = 30;
const groups: [string, SpriteFrame[]][] = [
  ["Lantern Wisp", [A.makeWisp(0), A.makeWisp(1.6), A.makeWisp(0, true)]],
  ["Hush Shade", [A.makeShade(0), A.makeShade(1.5), A.makeShade(0, true)]],
  ["Moth Mender (healer)", [A.makeMoth(0), A.makeMoth(1.6), A.makeMoth(0, true)]],
  ["Mire Toad (brute)", [A.makeToad(0), A.makeToad(0, true)]],
  ["Gloom Wolf (elite)", [A.makeWolf(0), A.makeWolf(0, "howl"), A.makeWolf(0, "atk")]],
];
for (const [name, frames] of groups) {
  const x0 = x;
  const s = name.startsWith("Gloom") || name.startsWith("Mire") ? 3 : 4;
  for (const f of frames) x += draw(img(f), x, base, s) + 8;
  label(name, x0, base + 20, 14);
  x += 26;
}
rowLine(base + 28);

// Row 3: normal maps + emissive + silhouettes of the idle frames
label("authored normal maps | emissive layer | silhouette (2x)", 24, base + 58, 16, "#ffd27a");
base = 760;
x = 30;
for (const [, frames] of groups) {
  const f = frames[0] as SpriteFrame;
  if (f.normal) x += draw(f.normal as Img, x, base, 2) + 6;
  if (f.glow) {
    g.fillStyle = "#000";
    g.fillRect(x, base - f.h * 2, f.w * 2, f.h * 2);
    x += draw(f.glow as Img, x, base, 2) + 6;
  }
  x += draw(silhouette(img(f)), x, base, 2) + 30;
}
rowLine(base + 8);

// Row 4: the Willow (2x): four states + frond tints + riddle leaves
label("THE WHISPERING WILLOW (2x): phase 1 | Hush Spell | Riddle | Freed      fronds: silver / hush / gold / bloom      riddle leaf: neutral / bloom / wither (4x)", 24, base + 36, 15, "#ffd27a");
base = 1066;
x = 30;
for (const st of ["p1", "spell", "riddle", "freed"]) x += draw(img(A.makeWillowCore(st)), x, base, 2) + 12;
for (const t of ["silver", "hush", "gold", "bloom"]) {
  const f = A.makeWillowFronds(3, t, 60, 120);
  g.drawImage(img(f), x, base - 250, f.w * 2, f.h * 2);
  x += f.w * 2 + 6;
}
x += 16;
for (const t of ["neutral", "bloom", "wither"]) x += draw(img(A.makeRiddleLeaf(t)), x, base - 120, 4) + 10;
(window as unknown as { __ready: boolean }).__ready = true;

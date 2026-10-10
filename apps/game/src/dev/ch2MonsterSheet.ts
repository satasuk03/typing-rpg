/**
 * DEV-ONLY contact sheets for the T2.3 Chapter II sprites: `?scene=render-test&biome=hushwood&sheet=enemies|willow`.
 * enemies: Ch1 roster (reference) | the five Ch2 enemies, every frame, plus the elite variant | authored normal maps |
 *          emissive layers | pure-black silhouettes | fog-backlit read.  willow: every state of the core + lash roots + frond tints.
 * Sets `window.__renderTest = { ready: true, step() {} }` so the Playwright capture helpers work unchanged.
 */
import { ProceduralSpriteSource } from "../render/sprites/ProceduralSpriteSource";
import type { SpriteFrame } from "../render/sprites/SpriteSource";

type Img = CanvasImageSource & { width: number; height: number };

export function startSheet(canvas: HTMLCanvasElement, which: string): void {
  const src = new ProceduralSpriteSource();
  const W = 1920;
  const H = which === "willow" ? 760 : which === "zoom" ? 640 : 1440;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#14141c";
  g.fillRect(0, 0, W, H);
  const label = (t: string, x: number, y: number, size = 15, col = "#cfc6b0"): void => {
    g.font = `${size}px monospace`;
    g.fillStyle = col;
    g.fillText(t, x, y);
  };
  const sil = (img: Img): HTMLCanvasElement => {
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
  const draw = (im: Img, x: number, base: number, s: number): number => {
    g.drawImage(im, x, base - im.height * s, im.width * s, im.height * s);
    return im.width * s;
  };
  const rule = (y: number): void => {
    g.fillStyle = "#26263a";
    g.fillRect(20, y, W - 40, 2);
  };
  const fr = (k: string, a = "idle", i = 0): SpriteFrame => src.frames(k, a)[i] as SpriteFrame;
  const done = (): void => {
    (window as unknown as { __renderTest: unknown }).__renderTest = {
      ready: true,
      step: () => undefined,
    };
  };

  if (which === "zoom") {
    // dev aid: ?sheet=zoom&k=monster.toad&a=idle,crouch,atk&s=9 : the first frame of every listed anim, big, on dusk grey
    const q = new URLSearchParams(location.search);
    const k = q.get("k") ?? "monster.toad";
    const sc = Number(q.get("s") ?? "9");
    g.fillStyle = "#3a4152";
    g.fillRect(0, 0, W, H);
    let zx = 20;
    for (const a of (q.get("a") ?? "idle").split(",")) {
      const f = fr(k, a);
      zx += draw(f.img as Img, zx, H - 40, sc) + 20;
    }
    done();
    return;
  }
  if (which === "willow") {
    label(
      "THE WHISPERING WILLOW core (1.5x): intro | phase 1 | Hush Spell | Riddle | Freed",
      24,
      28,
      16,
      "#ffd27a",
    );
    const base = 440;
    let x = 24;
    for (const st of ["intro", "p1", "spell", "riddle", "freed"]) {
      const f = fr("monster.willow", st);
      label(st, x + 60, base + 18, 13);
      x += draw(f.img as Img, x, base, 1.5) + 6;
    }
    const ay = base - 4.75 * 16 * 1.5;
    g.strokeStyle = "#ffd27a";
    g.setLineDash([6, 6]);
    g.beginPath();
    g.moveTo(24, ay);
    g.lineTo(x, ay);
    g.stroke();
    g.setLineDash([]);
    label("plate anchor: the face (4.75 m)", 30, ay - 6, 12, "#ffd27a");
    x += 20;
    label("lash roots 3x: coil | whip | recoil", x, 60, 14, "#ffd27a");
    let lx = x;
    for (const a of ["coil", "whip", "recoil"])
      lx += draw(fr("monster.willow.lash", a).img as Img, lx, 190, 3) + 12;
    label("fronds (T2.1 locks, reused): silver / hush / gold / bloom", x, 232, 14, "#ffd27a");
    let fx = x;
    for (const t of ["silver", "hush", "gold", "bloom"]) {
      const f = fr(`prop.ch2.fronds.${t}.1`);
      g.drawImage(f.img as Img, fx, 244, f.w * 1.3, f.h * 1.3);
      fx += f.w * 1.3 + 8;
    }
    rule(base + 34);
    label(
      "normals (shape-derived) | emissive (on black) | silhouette : phase 1, Hush Spell, riddle (1x)",
      24,
      base + 58,
      15,
      "#ffd27a",
    );
    let nx = 24;
    const nb = H - 12;
    for (const st of ["p1", "spell", "riddle"]) {
      const f = fr("monster.willow", st);
      const s = 0.8;
      nx += draw(f.normal as Img, nx, nb, s) + 6;
      g.fillStyle = "#000";
      g.fillRect(nx, nb - f.h * s, f.w * s, f.h * s);
      nx += draw(f.glow as Img, nx, nb, s) + 6;
      nx += draw(sil(f.img as Img), nx, nb, s) + 22;
    }
    done();
    return;
  }

  // ---- enemies sheet
  label("CH1 ROSTER (reference, 3x) + silhouettes", 24, 26, 15, "#ffd27a");
  let x = 24;
  const ch1 = ["hero", "monster.slimeG", "monster.bat", "monster.goblin", "monster.golem"];
  for (const k of ch1) x += draw(fr(k).img as Img, x, 200, 3) + 18;
  x += 20;
  for (const k of ch1) x += draw(sil(fr(k).img as Img), x, 200, 2) + 12;
  rule(214);
  label(
    "CH2 ENEMIES (all frames; wisp/shade/moth 4x, toad/wolf 3x): idle | attack / cast | crouch / howl | ELITE wolf (gold rim)",
    24,
    238,
    15,
    "#ffd27a",
  );
  const rows: [string, string[]][] = [
    ["monster.wisp", ["idle:0", "idle:1", "idle:2", "atk:0"]],
    ["monster.shade", ["idle:0", "idle:1", "atk:0"]],
    ["monster.moth", ["idle:0", "idle:1", "idle:2", "cast:0"]],
    ["monster.toad", ["idle:0", "idle:1", "crouch:0", "atk:0"]],
    ["monster.wolf", ["idle:0", "idle:1", "howl:0", "atk:0"]],
  ];
  const lane = (list: [string, string[]][], bs: number, s: number): number => {
    let lx = 24;
    for (const [k, frames] of list) {
      const x0 = lx;
      for (const spec of frames) {
        const [a, i] = spec.split(":");
        lx += draw(fr(k, a, Number(i)).img as Img, lx, bs, s) + 8;
      }
      label(k.replace("monster.", ""), x0, bs + 18, 13);
      lx += 16;
    }
    return lx;
  };
  lane(rows.slice(0, 3), 520, 3.6);
  const base = 780;
  x = lane(rows.slice(3), base, 3.4);
  label("elite wolf", x, base + 18, 13, "#ffd27a");
  draw(fr("monster.wolf.elite").img as Img, x, base, 3.4);
  rule(base + 30);
  label(
    "authored normal maps | emissive layer (on black) | silhouette",
    24,
    base + 54,
    15,
    "#ffd27a",
  );
  x = 24;
  const b3 = 1060;
  for (const [k] of rows) {
    const f = fr(k);
    x += draw(f.normal as Img, x, b3, 2.4) + 4;
    g.fillStyle = "#000";
    g.fillRect(x, b3 - f.h * 2.4, f.w * 2.4, f.h * 2.4);
    if (f.glow) draw(f.glow as Img, x, b3, 2.4);
    x += f.w * 2.4 + 4;
    x += draw(sil(f.img as Img), x, b3, 2.4) + 28;
  }
  rule(b3 + 12);
  label(
    "fog-backlit read: idle frames at 2x over a dusk-fog grey and over near-black (interior colour check)",
    24,
    b3 + 36,
    15,
    "#ffd27a",
  );
  x = 24;
  const b4 = 1426;
  for (const bg of ["#586070", "#12121c"]) {
    g.fillStyle = bg;
    g.fillRect(x - 8, b4 - 104, 900, 108);
    for (const [k] of rows) x += draw(fr(k).img as Img, x, b4, 2) + 14;
    x += 70;
  }
  done();
}

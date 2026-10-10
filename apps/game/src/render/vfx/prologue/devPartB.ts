/**
 * DEV-ONLY: Part B at max FX (P3.2 keep-out + perf probe). `?scene=prologue&part=vfx&cue=partB[&wpm=90][&quality=0|1|2][&intensity=1]`.
 *
 * The real prologue session does not exist yet (P3.5), so this is the `tests/level/fxProbe.ts` pattern on the pieces that do:
 * the real Hud with the mock sim driver (a wpm bot typing the plates at the pinned tier 4 streak), the real typing VFX handle, the
 * Word Gate world, and `PrologueFx` fed through the SAME event sink the bindings use (`EnemySpawned`, `BossIntroStarted`,
 * `EnemyAttack`, `Hit`) plus a patched `view.prologue` (surge x16, boss clamped, so the ward and the surge aura are on). Every
 * cue of Part B runs at once: ink pools, the sky tear, Nul's ink lances, the ward and the x16 surge aura.
 *
 * `window.__partB.sweep(seconds, everySec)` steps the bot and, each sample, (1) runs the HUD invariants (`checkSnapshot`: next letter
 * legible, ring / cell contrast, no pop or tag over a letter, no letter outside its plate), and (2) renders the world twice, with the
 * prologue cues and without, and compares the pixels in every plate rect inflated by 40 px: what the cues ADD next to a word plate.
 * `bench(frames)` records rAF frame times for the perf AC.
 */
import type { LevelView, SimEvent } from "@hd2d/sim";
import { makeWorldBackdrop, type WorldBackdrop } from "../../../dev/hudTestScene";
import { Hud } from "../../../hud";
import { loadHudFonts } from "../../../hud/fonts";
import { checkSnapshot } from "../../../hud/invariants";
import { MockDriver } from "../../../hud/mock/mockDriver";
import { loadLevel } from "../../world";
import { createTypingFx, type TypingFxHandle } from "../TypingFxHandle";
import { KEEP_OUT_PX } from "./ctx";
import { devSeed, PrologueFx } from "./PrologueFx";
import type { CueInstance } from "./types";

const DT = 1 / 60;

export interface PartBSample {
  t: number;
  plates: number;
  /** Largest luma delta (0..1) the cues add inside any inflated plate rect. */
  maxDelta: number;
  /** Mean luma delta over those rects. */
  meanDelta: number;
  violations: string[];
}

declare global {
  interface Window {
    __partB?: {
      ready: boolean;
      sweep(
        seconds: number,
        everySec: number,
      ): {
        samples: PartBSample[];
        violations: string[];
        maxDelta: number;
        maxMeanDelta: number;
        keepOut: { checked: number; dimmed: number };
        diag: ReturnType<PrologueFx["diagnostics"]>;
        events: Record<string, number>;
        tier: number;
      };
      bench(
        frames: number,
      ): Promise<{ avgMs: number; p95Ms: number; maxMs: number; frames: number }>;
      consoleErrors: string[];
      fx: PrologueFx;
      typing: TypingFxHandle;
      /** The page as a composite: a screenshot-ready redraw. */
      redraw(): void;
    };
  }
}

export function startPartB(glCanvas: HTMLCanvasElement, q: URLSearchParams): void {
  const wpm = Number(q.get("wpm") ?? 90) || 90;
  const quality = Math.max(0, Math.min(2, Number(q.get("quality") ?? 0) || 0)) as 0 | 1 | 2;
  const intensity = q.has("intensity") ? Number(q.get("intensity")) : 1;
  const consoleErrors: string[] = [];
  window.addEventListener("error", (e) => consoleErrors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String(e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    origErr(...args);
  };

  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
  const hud = new Hud(hudCanvas);
  const settings = {
    effectsIntensity: intensity,
    reducedFlash: q.get("reducedFlash") === "1",
    reducedMotion: q.get("reducedMotion") === "1",
  };
  hud.setSettings(settings);
  let backdrop: WorldBackdrop | null = null;
  let fx!: TypingFxHandle;
  let pfx!: PrologueFx;
  const resize = (): void => {
    hud.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    if (backdrop) hud.setProjector(backdrop.projector);
  };
  window.addEventListener("resize", resize);
  resize();

  const driver = new MockDriver({
    scenario: "boss",
    wpm,
    seed: Number(q.get("seed") ?? 7) || 7,
    tier: 4,
    pace: Number(q.get("pace") ?? 40) || 40,
    mode: "gentle",
    typoAt: [],
    guard: true,
    script: true,
  });
  const counts: Record<string, number> = {};
  const feed = (ev: readonly SimEvent[]): void => {
    for (const e of ev) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      if (e.type === "EnemyAttack") pfx.enemyAttack(e);
      else if (e.type === "EnemySpawned") pfx.enemySpawned(e);
      else if (e.type === "BossIntroStarted") pfx.bossIntro(e);
      else if (e.type === "Hit") pfx.hit(e);
      if (fx.onEvent(e)) hud.pushEvent(e);
    }
  };
  /** The mock view with the prologue strip the sim would give: surge x16, Nul clamped at his gate. */
  const pview = (): LevelView =>
    ({
      ...driver.view,
      prologue: { surgeMult: 16, bossClamped: true, armed: true },
    }) as LevelView;
  let tMs = 0;
  /** What the cutscene would feed `frame`: the sky tear held open (the heaviest world cue of the intro). */
  const scripted = (): CueInstance[] => [
    { id: "skyTear", ageMs: tMs, seed: devSeed("skyTear"), params: { closeAt: 1e9 } },
  ];
  const runPfx = (dt: number): void => {
    pfx.setView(pview());
    pfx.frame(dt, scripted(), 0);
  };
  const tick = (): void => {
    feed(driver.step());
    tMs += 1000 / 60;
    const wdt = fx.update(DT, DT, driver.view);
    runPfx(DT);
    backdrop?.advance(wdt);
    if (backdrop) pfx.applyPost(backdrop.world.postFx.effects);
    hud.render(driver.view, 1, DT);
  };
  const present = (): void => {
    backdrop?.frame(0);
    hud.render(driver.view, 1, 0);
  };

  const off = document.createElement("canvas");
  const grab = (): ImageData => {
    off.width = glCanvas.width;
    off.height = glCanvas.height;
    const c = off.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    c.clearRect(0, 0, off.width, off.height);
    // the GL back buffer is only readable in the same task as its render
    c.drawImage(glCanvas, 0, 0);
    return c.getImageData(0, 0, off.width, off.height);
  };
  const lum = (d: Uint8ClampedArray, i: number): number =>
    (0.2126 * (d[i] as number) + 0.7152 * (d[i + 1] as number) + 0.0722 * (d[i + 2] as number)) /
    255;

  /** Luma the cues add inside the inflated plate rects: with minus without, same frame, same state. */
  const plateDelta = (): { max: number; mean: number; plates: number } => {
    const v = driver.view;
    const k = glCanvas.width / window.innerWidth;
    const rect = { x: 0, y: 0, w: 0, h: 0 };
    const rects: number[][] = [];
    for (const p of v.plates) {
      if (!hud.getPlateRectInto(p.id, rect)) continue;
      const x0 = Math.max(0, Math.floor((rect.x - KEEP_OUT_PX) * k));
      const y0 = Math.max(0, Math.floor((rect.y - KEEP_OUT_PX) * k));
      const x1 = Math.min(glCanvas.width, Math.ceil((rect.x + rect.w + KEEP_OUT_PX) * k));
      const y1 = Math.min(glCanvas.height, Math.ceil((rect.y + rect.h + KEEP_OUT_PX) * k));
      rects.push([x0, y0, x1, y1]);
    }
    pfx.setCuesVisible(true);
    runPfx(0);
    backdrop?.frame(0);
    const withCues = grab();
    pfx.setCuesVisible(false);
    runPfx(0);
    backdrop?.frame(0);
    const without = grab();
    pfx.setCuesVisible(true);
    runPfx(0);
    backdrop?.frame(0);
    let max = 0;
    let sum = 0;
    let n = 0;
    for (const [x0, y0, x1, y1] of rects as [number, number, number, number][]) {
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * glCanvas.width + x) * 4;
          const d = lum(withCues.data, i) - lum(without.data, i);
          if (d > max) max = d;
          sum += Math.max(0, d);
          n++;
        }
    }
    return { max, mean: n > 0 ? sum / n : 0, plates: rects.length };
  };

  const boot = async (): Promise<void> => {
    await loadHudFonts();
    const qb = new URLSearchParams(q);
    qb.set("id", "prologue");
    qb.set("pose", "battle");
    backdrop = await makeWorldBackdrop(glCanvas, "boss", qb);
    const bd = backdrop;
    hud.setProjector(bd.projector);
    const layout = loadLevel("prologue");
    const anchor = (name: string) => layout.anchors.find((a) => a.name === name);
    const gateA = anchor("gate");
    const tearA = anchor("tear");
    const tmp = { x: 0, y: 0, z: 0 };
    pfx = new PrologueFx({
      world: bd.world,
      anchors: {
        hero: (o) => {
          o.x = bd.hero.x;
          o.y = 0;
          o.z = bd.hero.z;
        },
        boss: (o) => {
          if (!bd.slotBody(0, tmp)) return false;
          o.x = tmp.x;
          o.y = 0;
          o.z = tmp.z;
          return true;
        },
        gate: (o) => {
          o.x = gateA?.x ?? 0;
          o.y = 0;
          o.z = gateA?.z ?? 0;
          o.scale = 0.85;
        },
        tear: (o) => {
          o.x = tearA?.x ?? 0;
          o.y = tearA?.y ?? 7;
          o.z = tearA?.z ?? 0;
        },
        enemy: (id, o) => {
          const e = driver.view.enemies.find((x) => x.id === id);
          if (!e || !bd.slotBody(e.slot, tmp)) return false;
          o.x = tmp.x;
          o.y = 0;
          o.z = tmp.z;
          return true;
        },
      },
      keepOutRects: (out) => {
        let n = 0;
        const r = { x: 0, y: 0, w: 0, h: 0 };
        for (const p of driver.view.plates) {
          if (n >= out.length / 4) break;
          if (!hud.getPlateRectInto(p.id, r)) continue;
          out[n * 4] = r.x;
          out[n * 4 + 1] = r.y;
          out[n * 4 + 2] = r.w;
          out[n * 4 + 3] = r.h;
          n++;
        }
        return n;
      },
      // every Mock enemy attacks as Nul would (the live hushBolt path)
      defOf: () => "nul",
    });
    pfx.setSettings(settings, quality);
    fx = createTypingFx({
      hud,
      world: bd.world,
      seed: 7,
      quality,
      anchors: {
        hero(out) {
          out.x = bd.hero.x;
          out.z = bd.hero.z;
        },
        enemy(id, out) {
          const e = driver.view.enemies.find((x) => x.id === id);
          if (!e || !bd.slotBody(e.slot, tmp)) return false;
          out.x = tmp.x;
          out.y = tmp.y;
          out.z = tmp.z;
          return true;
        },
      },
      callbacks: {
        actorFlash(who, amount, rgb) {
          if (who === "hero") bd.hero.actor.setRimFlash(amount, rgb);
        },
      },
      onPresent: (e) => hud.pushEvent(e),
    });
    fx.setSettings(settings);
    pfx.attachAura(fx.worldFx.aura);
    feed(driver.start());
    for (let i = 0; i < 90; i++) tick();
    present();

    window.__partB = {
      ready: true,
      consoleErrors,
      fx: pfx,
      typing: fx,
      redraw: present,
      sweep(seconds, everySec) {
        const samples: PartBSample[] = [];
        const violations: string[] = [];
        const every = Math.max(1, Math.round(everySec * 60));
        const n = Math.round(seconds * 60);
        let maxDelta = 0;
        let maxMean = 0;
        for (let i = 0; i < n; i++) {
          tick();
          if (i % every !== 0) continue;
          present();
          const snap = hud.debugSnapshot();
          const vs = checkSnapshot(snap).map((v) => `t=${(driver.tick / 60).toFixed(2)}s ${v}`);
          violations.push(...vs);
          const d = plateDelta();
          maxDelta = Math.max(maxDelta, d.max);
          maxMean = Math.max(maxMean, d.mean);
          samples.push({
            t: driver.tick / 60,
            plates: d.plates,
            maxDelta: d.max,
            meanDelta: d.mean,
            violations: vs,
          });
        }
        return {
          samples,
          violations,
          maxDelta,
          maxMeanDelta: maxMean,
          keepOut: pfx.diagnostics().keepOut,
          diag: pfx.diagnostics(),
          events: { ...counts },
          tier: fx.worldFx.aura.visualTier,
        };
      },
      bench: (frames) =>
        new Promise((resolve) => {
          const times: number[] = [];
          let last = performance.now();
          let acc = 0;
          const loop = (now: number): void => {
            const dt = now - last;
            times.push(dt);
            last = now;
            acc += Math.min(0.1, dt / 1000);
            while (acc >= DT) {
              tick();
              acc -= DT;
            }
            backdrop?.frame(0);
            hud.render(driver.view, 1, 0);
            if (times.length >= frames + 5) {
              const t = times.slice(5).sort((a, b) => a - b);
              resolve({
                avgMs: t.reduce((s, v) => s + v, 0) / t.length,
                p95Ms: t[Math.floor(t.length * 0.95)] ?? 0,
                maxMs: t[t.length - 1] ?? 0,
                frames: t.length,
              });
              return;
            }
            requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        }),
    };
  };
  void boot();
}

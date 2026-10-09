/**
 * DEV-ONLY HUD test scene:
 *   ?scene=hud-test&scenario=forest|cave|boss|stress&wpm=40|90
 *     &at=SECONDS (fast-forward the mock first) &pause=1 (freeze after the seek)
 *     &intensity=0..1 &reducedFlash=1 &reducedMotion=1 &fonts=0 (skip Google Fonts)
 * A plain painted backdrop stands in for the 3D scene (placeholder silhouettes show where the
 * fake projector puts the enemies). Test hooks: `window.__hudDebug`.
 */

import type { HudAnchor, HudDebugSnapshot } from "../hud";
import { Hud } from "../hud";
import { checkSnapshot } from "../hud/invariants";
import type { MockScenario } from "../hud/mock/mockDriver";
import { MockDriver } from "../hud/mock/mockDriver";
import { GOOGLE_FONTS_URL } from "../hud/theme";

export interface HudDebugApi {
  ready: boolean;
  hud: Hud;
  driver: () => MockDriver;
  snapshot(): HudDebugSnapshot;
  /** Step the mock for `seconds`, rendering each tick, checking invariants every `stepSec`. */
  sweep(
    seconds: number,
    stepSec: number,
  ): { samples: number; maxPlates: number; violations: string[] };
  /** Render `frames` frames of the current scenario and return per-frame HUD cost stats (ms). */
  bench(frames: number): HudDebugSnapshot["frame"] & { maxPlates: number; maxPops: number };
  consoleErrors: string[];
}

declare global {
  interface Window {
    __hudDebug?: HudDebugApi;
  }
}

const SCENARIOS: MockScenario[] = ["forest", "cave", "boss", "stress"];

function loadFonts(): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_URL;
    const done = () => resolve();
    link.onload = () => {
      const loads = ['22px "Press Start 2P"', '12px "Silkscreen"', '700 22px "Cinzel"'].map((f) =>
        document.fonts.load(f).catch(() => []),
      );
      void Promise.all(loads).then(done);
    };
    link.onerror = done;
    document.head.appendChild(link);
    setTimeout(done, 2500);
  });
}

/** Fake projector: placeholder world positions per scenario (CSS px). */
function makeProjector(scenario: MockScenario, w: number, h: number) {
  return (a: HudAnchor): { x: number; y: number } | null => {
    if (a.kind === "hero")
      return { x: w * 0.2, y: h * (a.part === "head" ? 0.5 : a.part === "feet" ? 0.74 : 0.62) };
    const boss = scenario === "boss";
    const x = boss ? w * 0.56 : w * (0.36 + a.slot * 0.2);
    const headY = boss ? h * 0.36 : h * (0.5 + (a.slot % 2) * 0.03);
    const feetY = boss ? h * 0.74 : h * (0.72 + (a.slot % 2) * 0.04);
    return { x, y: a.part === "head" ? headY : a.part === "feet" ? feetY : (headY + feetY) / 2 };
  };
}

function drawBackdrop(cv: HTMLCanvasElement, scenario: MockScenario): void {
  const c = cv.getContext("2d");
  if (!c) return;
  const w = cv.width;
  const h = cv.height;
  const cols: Record<string, [string, string]> = {
    forest: ["#5d8a5a", "#1c3a26"],
    cave: ["#5a2a1c", "#120a0e"],
    boss: ["#3a2a2a", "#0a0608"],
    stress: ["#46506a", "#14161e"],
  };
  const [a, b] = cols[scenario] ?? cols.forest ?? ["#444", "#111"];
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a);
  g.addColorStop(0.62, b);
  g.addColorStop(1, "#06060a");
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.fillRect(0, h * 0.7, w, h * 0.3);
  // silhouettes where the projector puts the actors
  const proj = makeProjector(scenario, w, h);
  const blob = (x: number, headY: number, feetY: number, col: string, ww: number) => {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, (headY + feetY) / 2, ww, (feetY - headY) / 2, 0, 0, Math.PI * 2);
    c.fill();
  };
  const hero = proj({ kind: "hero", part: "feet" });
  if (hero) blob(hero.x, h * 0.5, hero.y, "#2c4a6a", 30);
  const slots = scenario === "boss" ? [1] : scenario === "cave" ? [0, 1] : [0, 1, 2];
  for (const slot of slots) {
    const head = proj({ kind: "enemy", id: 0, slot, part: "head" });
    const feet = proj({ kind: "enemy", id: 0, slot, part: "feet" });
    if (head && feet)
      blob(
        head.x,
        head.y,
        feet.y,
        scenario === "boss" ? "#5a4a44" : (["#3aa890", "#6a3a8a", "#c0508a"][slot] ?? "#888"),
        scenario === "boss" ? 110 : 48,
      );
  }
}

export function start(glCanvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const scenarioParam = q.get("scenario") as MockScenario | null;
  const scenario: MockScenario = SCENARIOS.includes(scenarioParam as MockScenario)
    ? (scenarioParam as MockScenario)
    : "forest";
  const wpm = Number(q.get("wpm") ?? 40) || 40;
  const at = Number(q.get("at") ?? 0) || 0;
  const pause = q.get("pause") === "1";

  const consoleErrors: string[] = [];
  window.addEventListener("error", (e) => consoleErrors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => consoleErrors.push(String(e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
    origErr(...args);
  };

  const hudCanvas = document.getElementById("hud") as HTMLCanvasElement;
  // backdrop canvas behind the HUD in place of the WebGL scene
  glCanvas.style.display = "none";
  const back = document.createElement("canvas");
  back.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  glCanvas.parentElement?.insertBefore(back, hudCanvas);

  const hud = new Hud(hudCanvas);
  hud.setSettings({
    effectsIntensity: q.has("intensity") ? Number(q.get("intensity")) : 1,
    reducedFlash: q.get("reducedFlash") === "1",
    reducedMotion: q.get("reducedMotion") === "1",
  });

  const resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    back.width = w;
    back.height = h;
    drawBackdrop(back, scenario);
    hud.resize(w, h, window.devicePixelRatio || 1);
    hud.setProjector(makeProjector(scenario, w, h));
  };
  window.addEventListener("resize", resize);
  resize();

  const driver = new MockDriver({ scenario, wpm });
  const DT = 1 / 60;
  const stepOnce = (renderFrame: boolean): void => {
    const ev = driver.step();
    hud.pushEvents(ev);
    if (renderFrame) hud.render(driver.view, 1, DT);
    else hud.update(driver.view, 1, DT);
  };

  const api: HudDebugApi = {
    ready: false,
    hud,
    driver: () => driver,
    snapshot: () => hud.debugSnapshot(),
    sweep(seconds, stepSec) {
      const violations: string[] = [];
      let samples = 0;
      let maxPlates = 0;
      const every = Math.max(1, Math.round(stepSec * 60));
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) {
        stepOnce(true);
        if (i % every === 0) {
          const snap = hud.debugSnapshot();
          samples++;
          maxPlates = Math.max(maxPlates, snap.plates.length);
          for (const v of checkSnapshot(snap))
            violations.push(`t=${(driver.tick / 60).toFixed(2)}s ${v}`);
        }
      }
      return { samples, maxPlates, violations };
    },
    bench(frames) {
      hud.resetFrameStats();
      let maxPlates = 0;
      let maxPops = 0;
      for (let i = 0; i < frames; i++) {
        stepOnce(true);
        const s = hud.debugSnapshot();
        maxPlates = Math.max(maxPlates, s.plates.length);
        maxPops = Math.max(maxPops, s.pops);
      }
      return { ...hud.debugSnapshot().frame, maxPlates, maxPops };
    },
    consoleErrors,
  };
  window.__hudDebug = api;

  const boot = async (): Promise<void> => {
    if (q.get("fonts") !== "0") await loadFonts();
    hud.pushEvents(driver.start());
    const total = Math.round(at * 60);
    for (let i = 0; i < total; i++) stepOnce(i >= total - 90);
    if (total === 0) hud.render(driver.view, 1, 0);
    api.ready = true;

    if (pause) {
      const loop = (): void => {
        hud.render(driver.view, 1, 0);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return;
    }
    let last = performance.now();
    let acc = 0;
    const loop = (now: number): void => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      let stepped = false;
      while (acc >= DT) {
        const ev = driver.step();
        hud.pushEvents(ev);
        acc -= DT;
        stepped = true;
        if (acc >= DT) hud.update(driver.view, 1, DT);
      }
      void stepped;
      hud.render(driver.view, acc / DT, stepped ? DT : 0);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  void boot();
}

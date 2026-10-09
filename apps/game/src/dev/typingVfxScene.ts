/**
 * DEV-ONLY typing VFX scene (T2.6):
 *   ?scene=typing-vfx&wpm=40|90&tier=0|1|2|3|4|cycle&intensity=0..1&reducedFlash=1&reducedMotion=1
 *     &mode=gentle|strict|zen&quality=0|1|2&boss=1&biome=forest|cave&seed=N&at=SECONDS&pause=1
 *     &pace=40&typoAt=9.5,12 &fonts=0 (skip font loading)
 * Mock sim driver + the REAL RenderWorld backdrop (via WorldBuilder) + the real projector + TypingHudFx.
 * Test hooks: `window.__typingVfx` with frame-exact stepping (fixed 1/60 s substeps, no rAF).
 */
import type { SimEvent } from "@hd2d/sim";
import { Hud } from "../hud";
import { loadHudFonts } from "../hud/fonts";
import { type TypingFxStats, TypingHudFx } from "../hud/fx/typing/TypingHudFx";
import { checkSnapshot } from "../hud/invariants";
import type { MockScenario } from "../hud/mock/mockDriver";
import { MockDriver } from "../hud/mock/mockDriver";
import { makeWorldBackdrop, type WorldBackdrop } from "./hudTestScene";

export interface TypingVfxApi {
  ready: boolean;
  hud: Hud;
  typing: TypingHudFx;
  driver: () => MockDriver;
  /** Advance the mock, HUD and world by ms in fixed 1/60 s substeps, then render one frame. */
  step(ms: number): void;
  /** Step until the nth next event of `type` (default 1st), then `afterMs` more. False on timeout. */
  stepToEvent(type: string, afterMs: number, nth?: number, maxMs?: number): boolean;
  /** Step until a CharCorrect whose keyStreakTier >= tier and index >= minIndex, then `afterMs`. */
  stepToKey(afterMs: number, o?: { minIndex?: number; notLast?: boolean }): boolean;
  /** Force a typo on the next key press. */
  queueTypo(): void;
  setEnabled(on: boolean): void;
  setSettings(s: {
    effectsIntensity?: number;
    reducedFlash?: boolean;
    reducedMotion?: boolean;
  }): void;
  /** Re-render the current frame without advancing time. */
  redraw(): void;
  /** Re-draw only the HUD canvas (fast; no WebGL frame). */
  redrawHud(): void;
  stats(): TypingFxStats;
  /** Run `keys` correct keystrokes at the scene's WPM with bench instrumentation on. */
  bench(keys: number): TypingFxStats & { frames: number; ms: number; perKeyMs: number };
  /** Count of every event seen since the scene started, by type. */
  eventCounts(): Record<string, number>;
  readability(): string[];
  consoleErrors: string[];
}

declare global {
  interface Window {
    __typingVfx?: TypingVfxApi;
  }
}

const DT = 1 / 60;

export function start(glCanvas: HTMLCanvasElement): void {
  const q = new URLSearchParams(location.search);
  const boss = q.get("boss") === "1";
  const biome = q.get("biome") === "cave" ? "cave" : "forest";
  const scenario: MockScenario = boss ? "boss" : biome;
  const wpm = Number(q.get("wpm") ?? 90) || 90;
  const tierParam = q.get("tier") ?? "cycle";
  const tier: number | "cycle" =
    tierParam === "cycle" ? "cycle" : Math.max(0, Math.min(4, Number(tierParam) || 0));
  const seed = Number(q.get("seed") ?? 7) || 7;
  const at = Number(q.get("at") ?? 0) || 0;
  const pause = q.get("pause") === "1";
  const quality = Math.max(0, Math.min(2, Number(q.get("quality") ?? 0) || 0)) as 0 | 1 | 2;
  const mode = (
    ["gentle", "strict", "zen"].includes(q.get("mode") ?? "") ? q.get("mode") : "gentle"
  ) as "gentle" | "strict" | "zen";
  const typoAt = (q.get("typoAt") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);

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
  hud.setSettings({
    effectsIntensity: q.has("intensity") ? Number(q.get("intensity")) : 1,
    reducedFlash: q.get("reducedFlash") === "1",
    reducedMotion: q.get("reducedMotion") === "1",
  });
  const typing = new TypingHudFx(hud, { seed, quality });
  typing.attach();

  let backdrop: WorldBackdrop | null = null;
  const resize = (): void => {
    hud.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    if (backdrop) hud.setProjector(backdrop.projector);
  };
  window.addEventListener("resize", resize);
  resize();

  const driver = new MockDriver({
    scenario,
    wpm,
    seed,
    tier,
    pace: Number(q.get("pace") ?? 40) || 40,
    mode,
    typoAt,
  });
  const counts: Record<string, number> = {};
  let lastEvents: readonly SimEvent[] = [];
  const feed = (ev: readonly SimEvent[]): void => {
    lastEvents = ev;
    hud.pushEvents(ev);
    for (const e of ev) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      typing.onEvent(e);
    }
  };
  const tick = (): void => {
    feed(driver.step());
    // a full HUD frame per substep: the plate layout (letter rects) is resolved while drawing
    hud.render(driver.view, 1, DT);
  };
  const present = (worldDt = 0): void => {
    backdrop?.frame(worldDt);
    hud.render(driver.view, 1, 0);
  };

  const api: TypingVfxApi = {
    ready: false,
    hud,
    typing,
    driver: () => driver,
    step(ms) {
      const n = Math.max(0, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < n; i++) tick();
      present(DT);
    },
    stepToEvent(type, afterMs, nth = 1, maxMs = 30000) {
      const max = Math.round(maxMs / (1000 / 60));
      let seen = 0;
      for (let i = 0; i < max; i++) {
        tick();
        if (lastEvents.some((e) => e.type === type) && ++seen >= nth) {
          api.step(afterMs);
          return true;
        }
      }
      present();
      return false;
    },
    stepToKey(afterMs, o = {}) {
      for (let i = 0; i < 60 * 40; i++) {
        tick();
        const ok = lastEvents.some(
          (e) =>
            e.type === "CharCorrect" &&
            e.index >= (o.minIndex ?? 0) &&
            !(o.notLast && e.isLast) &&
            e.kind !== "guard",
        );
        if (ok) {
          api.step(afterMs);
          return true;
        }
      }
      present();
      return false;
    },
    queueTypo() {
      driver.queueTypoNow();
    },
    setEnabled(on) {
      typing.setEnabled(on);
      present();
    },
    setSettings(s) {
      hud.setSettings(s);
      present();
    },
    redraw: () => present(0),
    redrawHud: () => hud.render(driver.view, 1, 0),
    stats: () => typing.stats(),
    bench(keys) {
      typing.startBench();
      let frames = 0;
      let done = 0;
      const t0 = performance.now();
      while (done < keys && frames < keys * 60) {
        feed(driver.step());
        done += lastEvents.filter((e) => e.type === "CharCorrect").length;
        hud.render(driver.view, 1, DT);
        frames++;
      }
      const ms = performance.now() - t0;
      typing.stopBench();
      const st = typing.stats();
      const per = st.keys > 0 ? (st.handlerMs + st.updateMs + st.drawMs) / st.keys : 0;
      return { ...st, frames, ms, perKeyMs: per };
    },
    eventCounts: () => ({ ...counts }),
    readability: () => checkSnapshot(hud.debugSnapshot()),
    consoleErrors,
  };
  window.__typingVfx = api;

  const boot = async (): Promise<void> => {
    if (q.get("fonts") !== "0") await loadHudFonts();
    backdrop = await makeWorldBackdrop(glCanvas, scenario, q);
    hud.setProjector(backdrop.projector);
    feed(driver.start());
    const n = Math.round(at * 60);
    for (let i = 0; i < n; i++) tick();
    present(DT);
    api.ready = true;
    if (pause) {
      const loop = (): void => {
        present();
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
        tick();
        acc -= DT;
        stepped = true;
      }
      backdrop?.frame(stepped ? DT : 0);
      hud.render(driver.view, 1, 0);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  void boot();
}

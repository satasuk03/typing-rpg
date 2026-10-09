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
import type { TypingFxStats, TypingHudFx } from "../hud/fx/typing/TypingHudFx";
import { checkSnapshot } from "../hud/invariants";
import type { MockScenario } from "../hud/mock/mockDriver";
import { MockDriver } from "../hud/mock/mockDriver";
import { WEAPON_ANCHOR_OFFSET } from "../level/typingFxParams";
import { analyseHero } from "../render/vfx/heroProbe";
import { createTypingFx, type TypingFxHandle } from "../render/vfx/TypingFxHandle";
import { makeWorldBackdrop, type WorldBackdrop } from "./hudTestScene";

export interface TypingVfxApi {
  ready: boolean;
  hud: Hud;
  typing: TypingHudFx;
  /** The whole T2.6 handle (HUD + world + queue + time dilation). */
  fx: TypingFxHandle;
  driver: () => MockDriver;
  /** Advance the mock, HUD and world by ms in fixed 1/60 s substeps, then render one frame. */
  step(ms: number): void;
  /** Step until the nth next event of `type` (default 1st), then `afterMs` more. False on timeout. */
  stepToEvent(type: string, afterMs: number, nth?: number, maxMs?: number): boolean;
  /** Step until a CharCorrect whose keyStreakTier >= tier and index >= minIndex, then `afterMs`. */
  stepToKey(
    afterMs: number,
    o?: { minIndex?: number; notLast?: boolean; guard?: boolean },
  ): boolean;
  /** Step to the next non-guard WordCompleted (optionally perfect), then `afterMs` more. */
  stepToWord(afterMs: number, o?: { perfect?: boolean; minLen?: number }): boolean;
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
  bench(keys: number): TypingFxStats & {
    frames: number;
    ms: number;
    perKeyMs: number;
    /** World part per key (world fx update + world event handling), ms. */
    worldPerKeyMs: number;
    /** Whole event handling per key (HUD + world + queue), ms. */
    eventPerKeyMs: number;
  };
  /** World-side counters for tests (particles, lights, time scale). */
  worldStats(): ReturnType<TypingFxHandle["worldFx"]["diagnostics"]> & {
    timeScale: number;
    queued: number;
    presented: number;
  };
  /** Count of every event seen since the scene started, by type. */
  eventCounts(): Record<string, number>;
  readability(): string[];
  /** Sim time of the mock (s). */
  time(): number;
  /**
   * Contact sheet: steps `seconds` of scene time at `fps` and composites every `every`-th frame (WebGL + HUD)
   * into a `cols` x `rows` grid of `cw` x `ch` cells with a time/tier label. Returns the PNG data URL.
   */
  sheet(o: {
    seconds: number;
    fps: number;
    every: number;
    cols: number;
    rows: number;
    cw: number;
    ch: number;
    title: string;
  }): string;
  /**
   * Hero silhouette probe (pixel test): composites the WebGL canvas and the HUD canvas, with the hero
   * sprite shown and hidden, at the CURRENT frame, and measures how distinguishable the hero still is.
   * `includeHud` false (default) measures the 3D pass only (aura, lights, rim flash, particles); true adds the
   * HUD canvas (labels, fragments). Call it with the FX on, then `setEnabled(false)` and call it again at the same frame to get the FX-off
   * baseline.
   */
  heroProbe(includeHud?: boolean): HeroProbe;
  consoleErrors: string[];
}

/** What `heroProbe` measures inside the hero's screen rect. */
export interface HeroProbe {
  /** Pixels of the hero that differ from the same frame without the hero by more than the threshold. */
  area: number;
  /** Sum of the Sobel edge magnitude (luminance, 0..255) over those pixels. */
  edge: number;
  /** Luminance contrast of the hero against its 64 px surround (>= 1). */
  contrast: number;
  rect: { x: number; y: number; w: number; h: number };
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
  const hitFlashes: { a: { setFlash(v: number): void }; t: number }[] = [];
  /** T2.3 stand-in for the death dissolve: enemy actors fading out over 0.7 s of world time. */
  const dissolves: { a: { setDissolve(v: number): void }; t: number }[] = [];
  let fx!: TypingFxHandle;
  let typing!: TypingHudFx;

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
    guard: q.get("guard") === "1",
    script: boss,
  });
  const counts: Record<string, number> = {};
  let lastEvents: readonly SimEvent[] = [];
  const feed = (ev: readonly SimEvent[]): void => {
    lastEvents = ev;
    for (const e of ev) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
      // the typing handle reacts at once and says whether the event is presented now (chip hits and
      // events gated behind them are held back and come out of `onPresent`)
      if (fx.onEvent(e)) hud.pushEvent(e);
    }
  };
  const tick = (): void => {
    feed(driver.step());
    // world time advances by the dilated dt (ATB-filled slow, hit-stop); the HUD stays in real time
    const wdt = fx.update(DT, DT, driver.view);
    backdrop?.advance(wdt);
    for (const d of dissolves) {
      d.t += wdt;
      d.a.setDissolve(Math.min(1, d.t / 0.7));
    }
    for (let i = hitFlashes.length - 1; i >= 0; i--) {
      const h = hitFlashes[i];
      if (!h) continue;
      h.t += DT;
      h.a.setFlash(Math.max(0, 0.75 * (1 - h.t / 0.14)));
      if (h.t >= 0.14) hitFlashes.splice(i, 1);
    }
    // a full HUD frame per substep: the plate layout (letter rects) is resolved while drawing
    hud.render(driver.view, 1, DT);
  };
  const present = (): void => {
    backdrop?.frame(0);
    hud.render(driver.view, 1, 0);
  };

  const api: TypingVfxApi = {
    ready: false,
    hud,
    get typing() {
      return typing;
    },
    get fx() {
      return fx;
    },
    driver: () => driver,
    step(ms) {
      const n = Math.max(0, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < n; i++) tick();
      present();
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
            (o.guard ? e.kind === "guard" : e.kind !== "guard"),
        );
        if (ok) {
          api.step(afterMs);
          return true;
        }
      }
      present();
      return false;
    },
    stepToWord(afterMs, o = {}) {
      for (let i = 0; i < 60 * 40; i++) {
        tick();
        const ok = lastEvents.some(
          (e) =>
            e.type === "WordCompleted" &&
            e.kind !== "guard" &&
            (o.perfect === undefined || e.perfect === o.perfect) &&
            e.text.length >= (o.minLen ?? 0),
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
      fx.setEnabled(on);
      present();
    },
    setSettings(s) {
      fx.setSettings(s);
      present();
    },
    redraw: () => present(),
    redrawHud: () => hud.render(driver.view, 1, 0),
    stats: () => typing.stats(),
    bench(keys) {
      typing.startBench();
      fx.worldFx.resetStats();
      fx.worldFx.bench = true;
      let frames = 0;
      let done = 0;
      let eventMs = 0;
      const t0 = performance.now();
      while (done < keys && frames < keys * 60) {
        const evs = driver.step();
        lastEvents = evs;
        const te = performance.now();
        for (const e of evs) {
          counts[e.type] = (counts[e.type] ?? 0) + 1;
          if (fx.onEvent(e)) hud.pushEvent(e);
        }
        eventMs += performance.now() - te;
        done += evs.filter((e) => e.type === "CharCorrect").length;
        // world fx update (queue flush, time dilation, aura, blade, pools + buffer upload); the GPU
        // render is not part of the per-key CPU budget
        const wdt = fx.update(DT, DT, driver.view);
        void wdt;
        hud.render(driver.view, 1, DT);
        frames++;
      }
      const ms = performance.now() - t0;
      typing.stopBench();
      fx.worldFx.bench = false;
      const st = typing.stats();
      const worldMs = fx.worldFx.stats.worldMs;
      // `eventMs` already contains the HUD handler time (`st.handlerMs`), so it is not added twice
      const per = st.keys > 0 ? (eventMs + st.updateMs + st.drawMs + worldMs) / st.keys : 0;
      return {
        ...st,
        frames,
        ms,
        perKeyMs: per,
        worldPerKeyMs: st.keys > 0 ? worldMs / st.keys : 0,
        eventPerKeyMs: st.keys > 0 ? eventMs / st.keys : 0,
      };
    },
    worldStats: () => ({
      ...fx.worldFx.diagnostics(),
      timeScale: fx.timeDilation.current,
      queued: fx.queue.count,
      presented: fx.queue.presented,
    }),
    eventCounts: () => ({ ...counts }),
    readability: () => checkSnapshot(hud.debugSnapshot()),
    time: () => driver.view.tick / 60,
    sheet(o) {
      const bd = backdrop;
      if (!bd) throw new Error("no backdrop");
      const pad = 6;
      const head = 34;
      const sheet = document.createElement("canvas");
      sheet.width = o.cols * (o.cw + pad) + pad;
      sheet.height = head + o.rows * (o.ch + pad) + pad;
      const c = sheet.getContext("2d");
      if (!c) throw new Error("no 2d context");
      c.fillStyle = "#0b0a10";
      c.fillRect(0, 0, sheet.width, sheet.height);
      c.fillStyle = "#f3e7c7";
      c.font = "bold 18px sans-serif";
      c.fillText(o.title, pad + 4, 23);
      const frames = Math.round(o.seconds * o.fps);
      const t0 = driver.view.tick / 60;
      let cell = 0;
      for (let f = 0; f < frames; f++) {
        api.step(1000 / o.fps);
        if (f % o.every !== 0 || cell >= o.cols * o.rows) continue;
        const cx = pad + (cell % o.cols) * (o.cw + pad);
        const cy = head + pad + Math.floor(cell / o.cols) * (o.ch + pad);
        c.drawImage(glCanvas, cx, cy, o.cw, o.ch);
        c.drawImage(hudCanvas, cx, cy, o.cw, o.ch);
        c.fillStyle = "rgba(0,0,0,0.6)";
        c.fillRect(cx, cy + o.ch - 18, 190, 18);
        c.fillStyle = "#fff";
        c.font = "12px monospace";
        const v = driver.view;
        c.fillText(
          `t=${(v.tick / 60 - t0).toFixed(2)}s  streak ${v.keyStreak}  T${v.keyStreakTier}`,
          cx + 4,
          cy + o.ch - 5,
        );
        cell++;
      }
      return sheet.toDataURL("image/png");
    },
    heroProbe(includeHud = false) {
      const bd = backdrop;
      if (!bd) throw new Error("no backdrop");
      const feet = bd.projector({ kind: "hero", part: "feet" });
      const head = bd.projector({ kind: "hero", part: "head" });
      if (!feet || !head) throw new Error("no hero anchor");
      const k = glCanvas.width / window.innerWidth;
      const hh = (feet.y - head.y) * k;
      const rect = {
        x: Math.max(0, Math.round(feet.x * k - hh * 0.36)),
        y: Math.max(0, Math.round(head.y * k - hh * 0.05)),
        w: Math.round(hh * 0.72),
        h: Math.round(hh * 1.1),
      };
      const off = document.createElement("canvas");
      off.width = glCanvas.width;
      off.height = glCanvas.height;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      // the crop carries a 64 px margin: it is the surround of the contrast metric
      const M = 64;
      const cx = Math.max(0, rect.x - M);
      const cy = Math.max(0, rect.y - M);
      const cw = Math.min(off.width - cx, rect.w + 2 * M);
      const ch = Math.min(off.height - cy, rect.h + 2 * M);
      const grab = (hide: boolean): ImageData => {
        bd.hero.actor.mesh.visible = !hide;
        bd.frame(0);
        hud.render(driver.view, 1, 0);
        ctx.clearRect(0, 0, off.width, off.height);
        // the GL back buffer is only readable in the same task as its render
        ctx.drawImage(glCanvas, 0, 0);
        if (includeHud) ctx.drawImage(hudCanvas, 0, 0, off.width, off.height);
        bd.hero.actor.mesh.visible = true;
        return ctx.getImageData(cx, cy, cw, ch);
      };
      const shown = grab(false);
      const hidden = grab(true);
      bd.frame(0);
      hud.render(driver.view, 1, 0);
      const m = analyseHero(shown.data, hidden.data, cw, ch, 24, M);
      return { area: m.area, edge: m.edge, contrast: m.contrast, rect };
    },
    consoleErrors,
  };
  window.__typingVfx = api;

  const boot = async (): Promise<void> => {
    if (q.get("fonts") !== "0") await loadHudFonts();
    const qb = new URLSearchParams(q);
    qb.set("pose", "battle");
    backdrop = await makeWorldBackdrop(glCanvas, scenario, qb);
    const bd = backdrop;
    // weapon anchor: the real archetype offset (the backdrop projector only knows the sword)
    hud.setProjector((a) => {
      if (a.kind === "hero" && a.part === "weapon") {
        const off = WEAPON_ANCHOR_OFFSET[driver.view.hero.archetype] ?? { x: 0.45, y: 0.95 };
        return bd.project(bd.hero.x + off.x, off.y, bd.hero.z);
      }
      return bd.projector(a);
    });
    const tmp = { x: 0, y: 0, z: 0 };
    fx = createTypingFx({
      hud,
      world: bd.world,
      seed,
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
        // T2.3 stand-ins: sprite flashes for the hero (ATB) and the enemy hit by the chip
        actorFlash(who, amount, rgb) {
          if (who === "hero") bd.hero.actor.setRimFlash(amount, rgb);
        },
        dissolve(id) {
          const en = driver.view.enemies.find((x) => x.id === id);
          const a = en ? bd.slotActor(en.slot) : null;
          if (a) dissolves.push({ a, t: 0 });
        },
        chipImpact(h) {
          const en = driver.view.enemies.find((x) => x.id === h.targetId);
          const a = en ? bd.slotActor(en.slot) : null;
          if (a) hitFlashes.push({ a, t: 0 });
        },
      },
      onPresent: (e) => hud.pushEvent(e),
    });
    typing = fx.hud;
    // apply the URL settings to the world half too
    fx.setSettings({
      effectsIntensity: q.has("intensity") ? Number(q.get("intensity")) : 1,
      reducedFlash: q.get("reducedFlash") === "1",
      reducedMotion: q.get("reducedMotion") === "1",
    });
    feed(driver.start());
    const n = Math.round(at * 60);
    for (let i = 0; i < n; i++) tick();
    present();
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
      while (acc >= DT) {
        tick();
        acc -= DT;
      }
      backdrop?.frame(0);
      hud.render(driver.view, 1, 0);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  void boot();
}

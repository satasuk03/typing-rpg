/**
 * DEV-ONLY audio test page (`?scene=audio-test`).
 *  - letters: keystroke clicks with a rising streak (tier stings at 10/25/50/100)
 *  - x: typo (resets the streak)      - Enter: word complete (Shift+Enter forces perfect)
 *  - 1-4: biome ambience + music (forest, ruins, cave, boss)
 * Test hook: `window.__audioTest` (engine, per-keydown latency stats, event log).
 */

import type { BiomeName, MusicState } from "../audio";
import {
  AudioEngine,
  BIOMES,
  createAudioSettingsPanel,
  MUSIC_STATES,
  SFX_IDS,
  streakTier,
} from "../audio";

export interface AudioTestHook {
  engine: AudioEngine;
  /** Streak currently driving the key pitch. */
  streak: number;
  /** Max/last ms spent inside the keydown handler (handler entry -> after play()). */
  lastHandlerMs: number;
  maxHandlerMs: number;
  /** ms from browser event timestamp to just after play() was called. */
  lastDispatchMs: number;
  errors: string[];
}

declare global {
  interface Window {
    __audioTest?: AudioTestHook;
  }
}

export function start(_glCanvas?: HTMLCanvasElement): void {
  const engine = new AudioEngine();
  engine.unlockOnGesture(window);
  const hook: AudioTestHook = {
    engine,
    streak: 0,
    lastHandlerMs: 0,
    maxHandlerMs: 0,
    lastDispatchMs: 0,
    errors: [],
  };
  window.__audioTest = hook;
  window.addEventListener("error", (e) => hook.errors.push(String(e.message)));
  window.addEventListener("unhandledrejection", (e) => hook.errors.push(String(e.reason)));

  const root = document.createElement("div");
  root.id = "audio-test";
  root.style.cssText =
    "position:fixed;inset:0;z-index:20;overflow:auto;background:#05060a;color:#f3e7c0;font:14px/1.5 system-ui,sans-serif;padding:16px;display:grid;gap:12px;align-content:start";
  root.innerHTML = `
    <h1 style="margin:0;font-size:20px">Audio test</h1>
    <p style="margin:0">Type letters for clicks (streak rises; tier stings at 10/25/50/100). <b>x</b> = typo, <b>Enter</b> = word complete (Shift+Enter = perfect), <b>1-4</b> = forest / ruins / cave / boss.</p>
    <div id="at-status" aria-live="polite">streak 0 | tier 0 | biome forest | music walk</div>
  `;
  const status = root.querySelector<HTMLElement>("#at-status") as HTMLElement;
  const render = (): void => {
    status.textContent = `streak ${hook.streak} | biome ${engine.getBiome()} | music ${engine.getMusicState()}`;
  };

  const group = (title: string): HTMLElement => {
    const d = document.createElement("div");
    d.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center";
    const h = document.createElement("strong");
    h.textContent = title;
    h.style.minWidth = "80px";
    d.append(h);
    root.append(d);
    return d;
  };
  const btn = (parent: HTMLElement, label: string, fn: () => void): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => {
      engine.ensureContext();
      fn();
      render();
    });
    parent.append(b);
  };

  // Emulates the sim: CharCorrect(keyStreak) plus KeyStreakTierChanged when a tier threshold is crossed.
  const keyWithTier = (): void => {
    const from = streakTier(hook.streak);
    engine.play("key", { streak: hook.streak++ });
    const to = streakTier(hook.streak);
    if (to > from) engine.play("tierUp", { tier: to });
  };

  const sfxRow = group("Effects");
  for (const id of SFX_IDS) {
    btn(sfxRow, id, () => {
      if (id === "key") keyWithTier();
      else engine.play(id, id === "tierUp" ? { tier: 1 + (hook.streak % 4) } : {});
    });
  }
  const tierRow = group("Tier stings");
  for (const tier of [1, 2, 3, 4])
    btn(tierRow, `tier ${tier}`, () => engine.play("tierUp", { tier }));
  const biomeRow = group("Biome");
  for (const b of BIOMES) btn(biomeRow, b, () => setBiome(b));
  const musicRow = group("Music");
  for (const m of MUSIC_STATES) btn(musicRow, m, () => engine.setMusicState(m as MusicState));

  const panel = createAudioSettingsPanel(engine);
  root.append(panel.el);
  document.body.append(root);

  const setBiome = (b: BiomeName): void => {
    engine.ensureContext();
    engine.setBiome(b);
    engine.setMusicState(b === "boss" ? "boss" : "walk");
    render();
  };

  let wordTypos = 0;
  window.addEventListener("keydown", (e) => {
    const t0 = performance.now();
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "BUTTON")) return;
    const k = e.key;
    if (k === "x" || k === "X") {
      engine.play("typo");
      hook.streak = 0;
      wordTypos++;
    } else if (/^[a-z]$/i.test(k)) {
      keyWithTier();
    } else if (k === "Enter") {
      const perfect = e.shiftKey || wordTypos === 0;
      engine.play(perfect ? "perfectWord" : "wordComplete");
      wordTypos = 0;
    } else if (k >= "1" && k <= "4") {
      setBiome(BIOMES[Number(k) - 1] as BiomeName);
    } else {
      return;
    }
    const t1 = performance.now();
    hook.lastHandlerMs = t1 - t0;
    hook.maxHandlerMs = Math.max(hook.maxHandlerMs, hook.lastHandlerMs);
    hook.lastDispatchMs = t1 - e.timeStamp;
    render();
  });
  render();
}

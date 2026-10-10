/**
 * DEV-ONLY audio test page (`?scene=audio-test`).
 *  - letters: keystroke clicks with a rising streak (tier stings at 10/25/50/100)
 *  - x: typo (resets the streak)      - Enter: word complete (Shift+Enter forces perfect)
 *  - 1-7: biome ambience + music (forest, ruins, cave, boss, hushwood, fen, grove)
 *  - Shift+letter: capital-key accent (Ch2 `CharCorrect.shifted`)
 *  - ] / [ : play the next / previous Chapter 2 sound, backslash: replay it (every Ch2 sound also has a button)
 *  - URL: &biome=fen&state=battle pre-selects the bed (applied on the first key/click)
 * Test hook: `window.__audioTest` (engine, per-keydown latency stats, event log).
 */

import type { BiomeName, MusicState, Sfx } from "../audio";
import {
  AudioEngine,
  BIOMES,
  createAudioSettingsPanel,
  MUSIC_STATES,
  SFX_IDS,
  streakTier,
} from "../audio";

/** Chapter 2 (T3.3) sounds, in checklist order. `whisperLoop` plays its one-shot preview here; the held loop has its own toggle. */
export const CH2_TEST_SFX: readonly Sfx[] = [
  "wispChime",
  "shadeHiss",
  "mothFlutter",
  "healChime",
  "toadCroak",
  "toadSplash",
  "wolfHowl",
  "wolfBite",
  "willowCreak",
  "whisperLoop",
  "leafStorm",
  "leafRustle",
  "leafPick",
  "riddleRight",
  "riddleWrong",
  "riddleTimeout",
  "capitalKey",
  "willowSigh",
  "chapterSting",
];

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
  /** Clicks every Ch2 button once (smoke test helper); returns how many were pressed. */
  pressAllCh2(): number;
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
    pressAllCh2: () => 0,
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
    <p style="margin:0">Type letters for clicks (streak rises; tier stings at 10/25/50/100). <b>x</b> = typo, <b>Enter</b> = word complete (Shift+Enter = perfect), <b>1-7</b> = forest / ruins / cave / boss / hushwood / fen / grove. Shift+letter = capital accent. <b>]</b> / <b>[</b> / <b>\\</b> = next / previous / replay Chapter 2 sound.</p>
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

  const ch2Set = new Set<Sfx>(CH2_TEST_SFX);
  const sfxRow = group("Effects");
  for (const id of SFX_IDS) {
    if (ch2Set.has(id)) continue;
    btn(sfxRow, id, () => {
      if (id === "key") keyWithTier();
      else engine.play(id, id === "tierUp" ? { tier: 1 + (hook.streak % 4) } : {});
    });
  }

  // ---- Chapter 2 (T3.3) ----
  let ch2Index = 0;
  const ch2Buttons: HTMLElement[] = [];
  const playCh2 = (id: Sfx): void => {
    ch2Index = CH2_TEST_SFX.indexOf(id);
    engine.play(
      id,
      id === "capitalKey" ? { streak: hook.streak } : id === "leafPick" ? { pan: 0 } : {},
    );
  };
  const ch2Row = group("Ch2 sounds");
  for (const id of CH2_TEST_SFX) {
    btn(ch2Row, id, () => playCh2(id));
    ch2Buttons.push(ch2Row.lastElementChild as HTMLElement);
  }
  const ch2Bed = group("Ch2 music");
  btn(ch2Bed, "hushwood loop", () => setBiome("hushwood"));
  btn(ch2Bed, "fen loop", () => setBiome("fen"));
  btn(ch2Bed, "grove / Willow walk", () => setBiome("grove"));
  for (const phase of [1, 2, 3] as const)
    btn(ch2Bed, `Willow boss phase ${phase}`, () => {
      setBiome("grove");
      engine.setMusicState("boss");
      engine.setBossPhase(phase);
    });
  btn(ch2Bed, "Willow freed (D major)", () => {
    setBiome("grove");
    engine.setBossFreed(true);
    engine.setMusicState("victory");
    engine.play("willowSigh");
  });
  btn(ch2Bed, "whisper loop ON", () => engine.setWhisper(true));
  btn(ch2Bed, "whisper loop OFF", () => engine.setWhisper(false));
  const ch2Typing = group("Ch2 typing");
  btn(ch2Typing, "capital key x3", () => {
    for (let i = 0; i < 3; i++) window.setTimeout(() => playCh2("capitalKey"), i * 160);
  });
  btn(ch2Typing, '"Hush now, Ember Knight" @90 WPM', () => {
    const text = "Hush now, Ember Knight";
    const gap = 60000 / (90 * 5);
    let streak = 0;
    [...text].forEach((ch, i) => {
      window.setTimeout(() => {
        const shifted = ch !== ch.toLowerCase();
        if (ch !== " ") engine.play(shifted ? "capitalKey" : "key", { streak: streak++ });
      }, i * gap);
    });
  });
  hook.pressAllCh2 = (): number => {
    let n = 0;
    for (const b of root.querySelectorAll<HTMLButtonElement>("button")) {
      if (ch2Buttons.includes(b) || ch2Bed.contains(b) || ch2Typing.contains(b)) {
        b.click();
        n++;
      }
    }
    return n;
  };

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
    engine.setBossFreed(false);
    render();
  };

  // URL preselect, applied on the first gesture (the context only exists after one).
  const q = new URLSearchParams(location.search);
  const qb = q.get("biome") as BiomeName | null;
  if (qb && (BIOMES as readonly string[]).includes(qb)) {
    const qs = q.get("state") as MusicState | null;
    const apply = (): void => {
      window.removeEventListener("pointerdown", apply, true);
      window.removeEventListener("keydown", apply, true);
      setBiome(qb);
      if (qs && (MUSIC_STATES as readonly string[]).includes(qs)) engine.setMusicState(qs);
      render();
    };
    window.addEventListener("pointerdown", apply, true);
    window.addEventListener("keydown", apply, true);
  }

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
      if (e.shiftKey && k !== k.toLowerCase())
        engine.play("capitalKey", { streak: hook.streak++ }); // Ch2 `CharCorrect.shifted`
      else keyWithTier();
    } else if (k === "Enter") {
      const perfect = e.shiftKey || wordTypos === 0;
      engine.play(perfect ? "perfectWord" : "wordComplete");
      wordTypos = 0;
    } else if (k >= "1" && k <= "7") {
      setBiome(BIOMES[Number(k) - 1] as BiomeName);
    } else if (k === "]" || k === "[" || k === "\\") {
      ch2Index =
        (ch2Index + (k === "]" ? 1 : k === "[" ? CH2_TEST_SFX.length - 1 : 0)) %
        CH2_TEST_SFX.length;
      playCh2(CH2_TEST_SFX[ch2Index] as Sfx);
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

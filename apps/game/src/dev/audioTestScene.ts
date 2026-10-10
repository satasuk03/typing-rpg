/**
 * DEV-ONLY audio test page (`?scene=audio-test`).
 *  - letters: keystroke clicks with a rising streak (tier stings at 10/25/50/100)
 *  - x: typo (resets the streak)      - Enter: word complete (Shift+Enter forces perfect)
 *  - 1-8: biome ambience + music (forest, ruins, cave, boss, hushwood, fen, grove, prologue)
 *  - Prologue (P3.4): "Prologue sounds" / "Prologue music" button rows (theft x6, drone, silence, spark motif, full arc)
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

/** Prologue (P3.4) sounds, in art-direction 5.3 order. `theftCrack` / `theftWhoosh` get one button per kit slot. */
export const PROLOGUE_TEST_SFX: readonly Sfx[] = [
  "inkPool",
  "skyTear",
  "skyTearClose",
  "hushBolt",
  "wardHum",
  "catchHiss",
  "quillScratch",
  "theftCrack",
  "theftWhoosh",
  "auraCollapse",
  "swordClang",
  "heartbeat",
  "emberChime",
  "lineBlip",
  "gateDark",
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
  /** Clicks every prologue button once (smoke test helper); returns how many were pressed. */
  pressAllPrologue(): number;
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
    pressAllPrologue: () => 0,
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
    <p style="margin:0">Type letters for clicks (streak rises; tier stings at 10/25/50/100). <b>x</b> = typo, <b>Enter</b> = word complete (Shift+Enter = perfect), <b>1-8</b> = forest / ruins / cave / boss / hushwood / fen / grove / prologue. Shift+letter = capital accent. <b>]</b> / <b>[</b> / <b>\\</b> = next / previous / replay Chapter 2 sound.</p>
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

  const ch2Set = new Set<Sfx>([...CH2_TEST_SFX, ...PROLOGUE_TEST_SFX]);
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

  // ---- Prologue (P3.4) ----
  const proRow = group("Prologue sounds");
  const proBed = group("Prologue music");
  const proButtons: HTMLElement[] = [];
  const addPro = (parent: HTMLElement, label: string, fn: () => void): void => {
    btn(parent, label, fn);
    proButtons.push(parent.lastElementChild as HTMLElement);
  };
  for (const id of PROLOGUE_TEST_SFX) {
    if (id === "theftCrack" || id === "theftWhoosh") {
      for (let i = 0; i < 6; i++)
        addPro(proRow, `${id} ${i + 1}`, () => engine.play(id, { count: i }));
    } else if (id === "lineBlip") {
      addPro(proRow, "lineBlip (Nul)", () => engine.play(id, { boss: true }));
      addPro(proRow, "lineBlip (Knight)", () => engine.play(id, {}));
    } else if (id === "wardHum") {
      addPro(proRow, "wardHum", () => engine.play(id));
      addPro(proRow, "wardHum hit", () => engine.play(id, { heavy: true }));
    } else if (id === "quillScratch") {
      addPro(proRow, "quillScratch x8", () => {
        for (let i = 0; i < 8; i++) window.setTimeout(() => engine.play(id, { count: i }), i * 110);
      });
    } else if (id === "gateDark") {
      addPro(proRow, "gateDark x10", () => {
        for (let i = 0; i < 10; i++) window.setTimeout(() => engine.play(id, { count: i }), i * 90);
      });
    } else addPro(proRow, id, () => engine.play(id));
  }
  addPro(proRow, "theft x6 (sequence)", () => {
    for (let i = 0; i < 6; i++) {
      window.setTimeout(() => engine.play("theftCrack", { count: i }), i * 1100);
      window.setTimeout(() => engine.play("theftWhoosh", { count: i }), i * 1100);
    }
  });
  addPro(proBed, "prologue theme (heroic, battle)", () => {
    engine.silence(0, 0.3);
    setBiome("prologue");
    engine.setMusicState("battle");
  });
  addPro(proBed, "drone (theft)", () => engine.musicDrone(38));
  addPro(proBed, "swell", () => engine.musicSwell());
  addPro(proBed, "silence(1) 1.2 s", () => {
    engine.musicDrone(null);
    engine.silence(1, 1.2);
  });
  addPro(proBed, "silence(0.75) 2 s", () => engine.silence(0.75, 2));
  addPro(proBed, "spark motif", () => engine.musicMotif("spark"));
  addPro(proBed, "spark motif (end)", () => engine.musicMotif("sparkEnd"));
  addPro(proBed, "silence(0) open", () => {
    engine.silence(0, 1.2);
    engine.setMusicState("walk");
  });
  addPro(proBed, "full arc (~65 s)", () => {
    const at = (ms: number, fn: () => void): void => void window.setTimeout(fn, ms);
    engine.silence(0, 0.2);
    setBiome("prologue");
    engine.setMusicState("battle");
    // Part C starts at +6 s: drone at C0, swell into the ink line (C 10.5), silence at C 20, ember at C 41, end at C 53.
    at(6000, () => engine.musicDrone(38));
    at(15600, () => engine.musicSwell());
    at(26000, () => {
      engine.musicDrone(null);
      engine.silence(1, 1.2);
    });
    at(47000, () => engine.silence(0.75, 2));
    at(47600, () => engine.musicMotif("spark"));
    at(59000, () => engine.musicMotif("sparkEnd"));
  });
  hook.pressAllPrologue = (): number => {
    let n = 0;
    for (const b of proButtons) {
      if (b.textContent?.startsWith("full arc")) continue;
      b.click();
      n++;
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
    } else if (k >= "1" && k <= "8") {
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

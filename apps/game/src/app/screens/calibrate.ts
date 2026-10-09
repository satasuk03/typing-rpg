/**
 * First-run typing calibration (T3.3): about 25 s of real words, measuring net WPM and accuracy. The result is stored as
 * `pace.calibrationWpm` (clamped to PACE_MIN..PACE_MAX by the meta layer) and is the pace of the first level, so enemies
 * start at the player's own speed. Esc skips (the default pace of 35 applies). Typing rules match the game: a wrong key
 * never advances, a finished word moves on by itself.
 */
import { TIER1 } from "@hd2d/content";
import type { App, Screen, ScreenArg } from "../app";
import { actions, el, esc } from "../dom";

export const CALIBRATION_SECONDS = 25;
/** The first level the first-run flow drops the player into. */
export const FIRST_LEVEL = "ch1-l01";

const IGNORED = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab", "Escape", "Enter"];

/** A fixed, shuffled list of short common words (the calibration is not part of the sim, but stays repeatable). */
export function calibrationWords(count = 120): string[] {
  const pool = TIER1.filter((w) => w.kind === "word" && /^[a-z]{3,6}$/.test(w.text)).map(
    (w) => w.text,
  );
  let x = 0x9e3779b9;
  const rnd = (): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
  const a = [...new Set(pool)];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as string, a[i] as string];
  }
  const out: string[] = [];
  while (out.length < count) out.push(...a);
  // no immediate repeats at the seam
  return out.slice(0, count);
}

export interface CalibrationStats {
  wpm: number;
  accuracyPct: number;
  words: number;
}

/** Standard net WPM: (correct characters + one space per finished word) / 5 per minute. */
export function calibrationStats(
  correct: number,
  wrong: number,
  words: number,
  seconds: number,
): CalibrationStats {
  const mins = Math.max(seconds, 1) / 60;
  const wpm = Math.round((correct + words) / 5 / mins);
  const total = correct + wrong;
  return { wpm, accuracyPct: total === 0 ? 100 : Math.round((correct / total) * 100), words };
}

export function calibrateScreen(app: App, _arg: ScreenArg): Screen {
  const root = el("app-screen calibrate");
  const card = el("hd-panel cal-card");
  root.append(card);
  const words = calibrationWords();
  let wi = 0;
  let ci = 0;
  let correct = 0;
  let wrong = 0;
  let done = 0;
  let startMs = 0;
  let state: "ready" | "run" | "done" = "ready";
  let timer = 0;
  let stats: CalibrationStats | null = null;
  root.dataset.state = state;

  const textHtml = (): string => {
    const cur = words[wi] ?? "";
    const typed = `<span class="ok">${esc(cur.slice(0, ci))}</span>`;
    const next = `<span class="cur">${esc(cur.slice(ci, ci + 1))}</span>${esc(cur.slice(ci + 1))}`;
    const rest = words
      .slice(wi + 1, wi + 9)
      .map((w) => esc(w))
      .join(" ");
    return `<div class="cal-word" id="cal-word">${typed}${next}</div><div class="cal-next">${rest}</div>`;
  };

  const drawRun = (): void => {
    const left =
      state === "run"
        ? Math.max(0, CALIBRATION_SECONDS - (performance.now() - startMs) / 1000)
        : CALIBRATION_SECONDS;
    card.innerHTML = `<div class="hd-eyebrow">Warm-up</div>
      <h1 class="hd-title sm">Type to set your speed</h1>
      <p class="cal-why">Type the words below for ${CALIBRATION_SECONDS} seconds. This sets enemy speed to you: the slower you type, the slower they strike. Typos are fine.</p>
      ${textHtml()}
      <div class="cal-bar" aria-hidden="true"><i style="width:${(left / CALIBRATION_SECONDS) * 100}%"></i></div>
      <div class="cal-foot"><span id="cal-time">${state === "ready" ? "Start typing to begin" : `${Math.ceil(left)} s`}</span><span><span class="hd-kbd">Esc</span> skip</span></div>`;
  };
  drawRun();

  const startPlay = (): void => {
    app.sfx("uiConfirm");
    void app.play(FIRST_LEVEL);
  };

  const finish = (): void => {
    window.clearInterval(timer);
    state = "done";
    root.dataset.state = "done";
    stats = calibrationStats(correct, wrong, done, CALIBRATION_SECONDS);
    root.dataset.wpm = String(stats.wpm);
    card.innerHTML = `<div class="hd-eyebrow">Warm-up complete</div>
      <h1 class="hd-title sm">Your speed</h1>
      <div class="cal-res"><div><b id="cal-wpm">${stats.wpm}</b><span>WPM</span></div><div><b id="cal-acc">${stats.accuracyPct}%</b><span>accuracy</span></div><div><b>${stats.words}</b><span>words</span></div></div>
      <p class="cal-why" style="text-align:center">Enemies will match your speed. As you play, it keeps adjusting.</p>
      <div class="btns" style="margin-top:14px"><button class="hd-btn primary" data-act="go" data-autofocus aria-disabled="true">Begin Chapter I (Enter)</button><button class="hd-btn" data-act="retry" aria-disabled="true">Retry (R)</button></div>`;
    // keys still flying from the last seconds of typing must not press a button
    window.setTimeout(() => {
      for (const b of card.querySelectorAll("button[aria-disabled]"))
        b.removeAttribute("aria-disabled");
      app.nav.focusFirst("[data-autofocus]");
    }, 1400);
  };

  const accept = (): void => {
    if (!stats) return;
    app.store.setCalibration(stats.wpm);
    startPlay();
  };

  const retry = (): void => {
    wi = ci = correct = wrong = done = 0;
    stats = null;
    state = "ready";
    root.dataset.state = "ready";
    delete root.dataset.wpm;
    drawRun();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (state === "done") {
      if ((e.key === "r" || e.key === "R") && !card.querySelector("[aria-disabled=true]")) {
        e.preventDefault();
        retry();
      }
      return;
    }
    if (IGNORED.includes(e.key) || e.key.length !== 1) return;
    e.preventDefault();
    if (e.key === " ") return;
    if (state === "ready") {
      state = "run";
      root.dataset.state = "run";
      startMs = performance.now();
      timer = window.setInterval(() => {
        const left = CALIBRATION_SECONDS - (performance.now() - startMs) / 1000;
        if (left <= 0) {
          finish();
          return;
        }
        const t = card.querySelector<HTMLElement>("#cal-time");
        if (t) t.textContent = `${Math.ceil(left)} s`;
        const b = card.querySelector<HTMLElement>(".cal-bar i");
        if (b) b.style.width = `${(left / CALIBRATION_SECONDS) * 100}%`;
      }, 100);
    }
    const cur = words[wi] ?? "";
    if (e.key.toLowerCase() === cur[ci]) {
      correct++;
      ci++;
      if (ci >= cur.length) {
        wi++;
        ci = 0;
        done++;
        app.sfx("uiClick");
      }
    } else {
      wrong++;
      const w = card.querySelector<HTMLElement>("#cal-word");
      if (w) {
        w.classList.remove("bad");
        void w.offsetWidth;
        w.classList.add("bad");
      }
    }
    const wordEl = card.querySelector<HTMLElement>(".cal-word");
    const nextEl = card.querySelector<HTMLElement>(".cal-next");
    if (wordEl && nextEl) {
      const keepBad = wordEl.classList.contains("bad");
      const tmp = document.createElement("div");
      tmp.innerHTML = textHtml();
      wordEl.innerHTML = tmp.querySelector(".cal-word")?.innerHTML ?? "";
      nextEl.innerHTML = tmp.querySelector(".cal-next")?.innerHTML ?? "";
      if (keepBad) wordEl.classList.add("bad");
    }
  };
  window.addEventListener("keydown", onKey, true);
  app.track(() => {
    window.removeEventListener("keydown", onKey, true);
    window.clearInterval(timer);
  });

  actions(card, { go: accept, retry });
  return {
    root,
    focus: () => undefined,
    back: () => {
      // Esc: skip the warm-up; with a measured result it still counts
      if (state === "done" && stats) accept();
      else startPlay();
      return true;
    },
  };
}

/**
 * Minimal DOM screens for the level runner (T3.2 polishes them): pause menu, Second Wind prompt, tutorial hints,
 * fail screen and results screen. Plain DOM above the canvases; the HUD canvas stays untouched.
 *
 * The overlays never sit on top of word plates while typing: the Second Wind prompt and hints are small strips at the
 * very top, and the menu/fail/results panels only exist while the sim is paused or terminal.
 */
import { contentBundle } from "@hd2d/content";
import type { LevelResult, LevelView, ResolvedLevel } from "@hd2d/sim";
import { evaluateStars } from "@hd2d/sim";
import { HOW_TO_PLAY_CSS, HOW_TO_PLAY_HTML } from "../hud/howToPlay";
import type { Rect } from "../hud/layout";
import { TUTORIAL_CSS, TutorialCards, type TutorialCueId } from "../hud/tutorial";
import { injectUiTheme } from "../hud/uiTheme";

// ---------------------------------------------------------------------------------------------- model (pure)

export interface ResultsModel {
  outcome: "cleared" | "failed";
  title: string;
  subtitle: string;
  stars: [boolean, boolean, boolean];
  gold: number;
  chests: string[];
  /** Words typed this level that are not in `knownWordKeys` (all of them when none are known). */
  newWords: string[];
  wordsTyped: number;
  timeText: string;
  wpm: number;
  accuracyPct: number;
  maxCombo: number;
  perfectWords: number;
  secondWindUsed: boolean;
  /** Short lines under the table (first clear / replay pay, unlocks, new gear). Added by the meta layer. */
  notes: string[];
}

/** What the meta layer (save writer) adds to a results screen. All optional: the dev route has none. */
export interface ResultExtras {
  stars?: [boolean, boolean, boolean];
  /** Total gold added to the wallet (level + chests + star bonus). */
  gold?: number;
  notes?: string[];
  knownWordKeys?: ReadonlySet<string>;
}

/** "Level 1 · Sunlit Glade" for the results subtitle (the raw `ch1-l01` id is not for players). */
export function levelTitle(def: ResolvedLevel): string {
  const l = contentBundle.levels.find((x) => x.id === def.levelId);
  return l ? `Level ${l.index} \u00b7 ${l.name}` : `Level ${def.index}`;
}

export const formatTime = (ticks: number): string => {
  const s = Math.floor(ticks / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Stars come from the sim `evaluateStars` (no accuracy history in the slice: median = null). */
export function starsFor(
  result: LevelResult,
  def: ResolvedLevel,
  pace: number,
): [boolean, boolean, boolean] {
  return evaluateStars({
    result,
    star3: def.star3,
    parRefTicks: def.parRefTicks,
    pace,
    median7dAccuracyBp: null,
  });
}

export function buildResultsModel(
  result: LevelResult,
  def: ResolvedLevel,
  pace: number,
  knownWordKeys: ReadonlySet<string> = new Set(),
  extras: ResultExtras = {},
): ResultsModel {
  const typed = result.words.filter((w) => w.kind === "word");
  const seen = new Set<string>();
  const newWords: string[] = [];
  for (const w of result.words) {
    if (w.kind !== "word" || seen.has(w.wordKey)) continue;
    seen.add(w.wordKey);
    if (!knownWordKeys.has(w.wordKey)) newWords.push(w.text);
  }
  const cleared = result.outcome === "cleared";
  return {
    outcome: result.outcome,
    title: cleared ? "LEVEL CLEAR" : "DEFEATED",
    subtitle: cleared
      ? levelTitle(def)
      : result.failReason === "abandoned"
        ? "You left the level"
        : result.failReason === "timeout"
          ? "Time ran out"
          : "Your strength gave out",
    stars: extras.stars ?? starsFor(result, def, pace),
    gold: extras.gold ?? result.gold,
    chests: result.chests.map((c) => c.tier),
    newWords,
    wordsTyped: typed.length,
    timeText: formatTime(result.durationTicks),
    wpm: Math.round(result.stats.netWpmX100 / 100),
    accuracyPct: Math.round(result.stats.accuracyBp / 100),
    maxCombo: result.stats.maxCombo,
    perfectWords: result.stats.perfectWords,
    secondWindUsed: result.stats.secondWindUsed,
    notes: extras.notes ?? [],
  };
}

// ---------------------------------------------------------------------------------------------- DOM

export interface ScreenActions {
  resume(): void;
  restart(): void;
  quit(): void;
  /** After a clear: go on (the slice has no world map yet: reload the level list). */
  next(): void;
  /** Back to the map (the app). Absent on the dev route. */
  exit?(): void;
}

const CSS = `
#play-ui{position:fixed;inset:0;z-index:30;pointer-events:none}
#play-ui .panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:440px;max-width:660px;text-align:center;pointer-events:auto}
#play-ui .stars{display:flex;justify-content:center;gap:10px;margin:6px 0 12px}
#play-ui .stars{filter:drop-shadow(0 2px 0 #000)}
#play-ui .stars span{display:block;width:44px;height:44px;background:#3a3550;clip-path:polygon(50% 0,62% 36%,100% 38%,70% 60%,81% 96%,50% 74%,19% 96%,30% 60%,0 38%,38% 36%)}
#play-ui .stars span.on{background:#ffd24a}
#play-ui .stars.lit{filter:drop-shadow(0 0 10px rgba(255,200,60,.7)) drop-shadow(0 2px 0 #5b3d12)}
#play-ui table{margin:0 auto 12px;border-collapse:collapse;text-align:left}
#play-ui td{padding:3px 16px}
#play-ui td:first-child{color:var(--muted)}
#play-ui td:last-child{color:var(--gold-hi)}
#play-ui .notes{margin:0 0 10px;color:#cfe8d0;font-size:12px;line-height:1.6}
#play-ui .notes b{color:var(--gold)}
#play-ui .words{margin:0 0 14px;color:#cfe8d0;font-size:12px;max-width:520px;margin-left:auto;margin-right:auto}
#play-ui .btns{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:8px;padding-left:16px}
#play-ui .strip{position:absolute;left:50%;top:10px;transform:translateX(-50%);max-width:520px;padding:6px 16px;background:rgba(10,9,18,.78);border:1px solid var(--gold);text-align:center;font-size:12px;letter-spacing:.06em;color:var(--ink)}
#play-ui .panel.help{max-width:700px;text-align:left}
#play-ui .sw{top:8px;border-color:#ff8a6a;color:#ffd9c9}
#play-ui .sw .bar{height:4px;margin-top:5px;background:#3a1d18}
#play-ui .sw .bar i{display:block;height:100%;background:#ff8a6a}
`;

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export class Screens {
  private readonly root: HTMLDivElement;
  private panel: HTMLDivElement | null = null;
  private readonly hintEl: HTMLDivElement;
  private readonly swEl: HTMLDivElement;
  private swBar: HTMLElement | null = null;
  private hintTimer = 0;
  /** L1 tutorial cards (cue-driven). `onTutorialRect` lets the app reserve the card's rect in the HUD layout. */
  readonly tutorial: TutorialCards;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly actions: ScreenActions) {
    injectUiTheme();
    const style = document.createElement("style");
    style.textContent = CSS + TUTORIAL_CSS + HOW_TO_PLAY_CSS;
    document.head.append(style);
    this.root = document.createElement("div");
    this.root.id = "play-ui";
    this.root.className = "hd-root";
    this.hintEl = document.createElement("div");
    this.hintEl.className = "strip";
    this.hintEl.style.display = "none";
    this.hintEl.style.top = "52px";
    this.swEl = document.createElement("div");
    this.swEl.className = "strip sw";
    this.swEl.style.display = "none";
    this.swEl.innerHTML = `SECOND WIND: type the sentence to rise again<div class="bar"><i></i></div>`;
    this.swBar = this.swEl.querySelector("i");
    this.root.append(this.hintEl, this.swEl);
    document.body.append(this.root);
    this.tutorial = new TutorialCards(this.root);
  }

  /** Called with the tutorial card's CSS rect while one is visible, null otherwise. */
  set onTutorialRect(fn: ((r: Rect | null) => void) | null) {
    this.tutorial.onRect = fn;
  }

  get open(): "pause" | "result" | null {
    return this.panel === null ? null : (this.panel.dataset.kind as "pause" | "result");
  }

  dispose(): void {
    this.closePanel();
    this.tutorial.dispose();
    this.root.remove();
  }

  // ---- strips

  hint(text: string, sec: number, cue?: TutorialCueId): void {
    if (cue) {
      this.tutorial.cue(cue);
      return;
    }
    this.hintEl.textContent = text;
    this.hintEl.style.display = "";
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hintEl.style.display = "none";
    }, sec * 1000);
  }

  secondWind(on: boolean): void {
    this.swEl.style.display = on ? "" : "none";
  }

  /** Per-frame: drives the Second Wind countdown bar from the view. */
  updateView(view: LevelView): void {
    const sw = view.secondWind;
    if (sw === null) {
      if (this.swEl.style.display !== "none") this.swEl.style.display = "none";
      return;
    }
    this.swEl.style.display = "";
    if (this.swBar)
      this.swBar.style.width = `${Math.max(0, (sw.ticksLeft / sw.totalTicks) * 100)}%`;
  }

  // ---- panels

  private mount(kind: "pause" | "result", html: string, keys: Record<string, () => void>): void {
    this.closePanel();
    this.tutorial.clear();
    const p = document.createElement("div");
    p.className = "panel hd-panel";
    p.dataset.kind = kind;
    p.innerHTML = html;
    this.root.append(p);
    this.panel = p;
    const buttons = [...p.querySelectorAll<HTMLButtonElement>("button[data-act]")];
    // The same keydown that opened this panel (Esc opens the pause menu in the capture phase) must not reach it in the
    // bubble phase: it would close the menu again at once.
    const born = performance.now();
    const h = (e: KeyboardEvent): void => {
      if (e.repeat || e.timeStamp <= born) return;
      // Arrow keys move focus between the buttons (keyboard-only navigation); Enter on a focused button clicks it.
      if (
        e.key === "ArrowLeft" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowDown"
      ) {
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        const next = buttons[(i + dir + buttons.length) % buttons.length];
        e.preventDefault();
        next?.focus();
        return;
      }
      if (
        e.key === "Enter" &&
        document.activeElement instanceof HTMLButtonElement &&
        p.contains(document.activeElement)
      ) {
        e.preventDefault();
        document.activeElement.click();
        return;
      }
      const fn = keys[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    this.keyHandler = h;
    window.addEventListener("keydown", h);
    for (const b of buttons) {
      b.addEventListener("click", () => keys[`act:${b.dataset.act}`]?.());
    }
    buttons[0]?.focus();
  }

  closePanel(): void {
    if (this.keyHandler) window.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
    this.panel?.remove();
    this.panel = null;
  }

  showPause(reason: string): void {
    const why =
      reason === "menu"
        ? "Game paused"
        : reason === "stall"
          ? "The game stalled and was paused"
          : "The window lost focus";
    this.mount(
      "pause",
      `<h1 class="hd-title">PAUSED</h1><p class="hd-sub" style="margin-bottom:16px">${esc(why)}</p>
       <div class="btns"><button class="hd-btn primary" data-act="resume">Resume (Esc)</button><button class="hd-btn" data-act="help">How to play (H)</button><button class="hd-btn" data-act="restart">Restart</button><button class="hd-btn danger" data-act="quit">Quit level</button></div>`,
      {
        Escape: () => this.actions.resume(),
        h: () => this.showHelp(reason),
        H: () => this.showHelp(reason),
        "act:help": () => this.showHelp(reason),
        "act:resume": () => this.actions.resume(),
        "act:restart": () => this.actions.restart(),
        "act:quit": () => this.actions.quit(),
      },
    );
  }

  /** The controls help, over the pause menu. Back (Backspace / H) returns to the menu; Esc resumes play as before. */
  showHelp(reason: string): void {
    this.mount(
      "pause",
      `${HOW_TO_PLAY_HTML}<div class="btns" style="margin-top:12px"><button class="hd-btn primary" data-act="back">Back (Backspace)</button><button class="hd-btn" data-act="resume">Resume (Esc)</button></div>`,
      {
        Escape: () => this.actions.resume(),
        Backspace: () => this.showPause(reason),
        h: () => this.showPause(reason),
        H: () => this.showPause(reason),
        "act:back": () => this.showPause(reason),
        "act:resume": () => this.actions.resume(),
      },
    );
    this.panel?.classList.add("help");
  }

  showResults(m: ResultsModel): void {
    const cleared = m.outcome === "cleared";
    const stars = m.stars.map((on) => `<span class="${on ? "on" : ""}"></span>`).join("");
    const words =
      m.newWords.length > 0
        ? `<div class="words">NEW WORDS (${m.newWords.length}): ${esc(m.newWords.slice(0, 12).join(", "))}${m.newWords.length > 12 ? ", ..." : ""}</div>`
        : "";
    const notes =
      m.notes.length > 0
        ? `<div class="notes" id="r-notes">${m.notes.map((n) => `<div>${n}</div>`).join("")}</div>`
        : "";
    const rows = cleared
      ? `<tr><td>Gold</td><td id="r-gold">${m.gold}</td></tr>
         <tr><td>Chests</td><td id="r-chests">${m.chests.length > 0 ? esc(m.chests.join(", ")) : "none"}</td></tr>`
      : `<tr><td>Gold kept</td><td id="r-gold">${m.gold}</td></tr>`;
    const exit = this.actions.exit
      ? `<button class="hd-btn" data-act="exit">Back to map (Esc)</button>`
      : "";
    this.mount(
      "result",
      `<h1 class="hd-title ${cleared ? "" : "fail"}" id="r-title">${m.title}</h1><p class="hd-sub" style="margin-bottom:8px">${esc(m.subtitle)}</p>
       ${cleared ? `<div class="stars" id="r-stars">${stars}</div>` : ""}
       <table>${rows}
         <tr><td>Time</td><td id="r-time">${m.timeText}</td></tr>
         <tr><td>Speed</td><td id="r-wpm">${m.wpm} WPM</td></tr>
         <tr><td>Accuracy</td><td id="r-acc">${m.accuracyPct}%</td></tr>
         <tr><td>Best combo</td><td>${m.maxCombo} (${m.perfectWords} perfect words)</td></tr>
       </table>${notes}${words}
       <div class="btns">${cleared ? `<button class="hd-btn primary" data-act="next">Continue (Enter)</button>` : ""}
       <button class="hd-btn ${cleared ? "" : "primary"}" data-act="restart">${cleared ? "Replay (R)" : "Try again (R)"}</button>${exit}</div>`,
      {
        Enter: () => (cleared ? this.actions.next() : this.actions.restart()),
        r: () => this.actions.restart(),
        R: () => this.actions.restart(),
        Escape: () => this.actions.exit?.(),
        "act:next": () => this.actions.next(),
        "act:restart": () => this.actions.restart(),
        "act:exit": () => this.actions.exit?.(),
      },
    );
  }
}

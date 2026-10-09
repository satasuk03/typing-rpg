/**
 * Minimal DOM screens for the level runner (T3.2 polishes them): pause menu, Second Wind prompt, tutorial hints,
 * fail screen and results screen. Plain DOM above the canvases; the HUD canvas stays untouched.
 *
 * The overlays never sit on top of word plates while typing: the Second Wind prompt and hints are small strips at the
 * very top, and the menu/fail/results panels only exist while the sim is paused or terminal.
 */
import type { LevelResult, LevelView, ResolvedLevel } from "@hd2d/sim";
import { evaluateStars } from "@hd2d/sim";

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
      ? def.levelId
      : result.failReason === "abandoned"
        ? "You left the level"
        : result.failReason === "timeout"
          ? "Time ran out"
          : "Your strength gave out",
    stars: starsFor(result, def, pace),
    gold: result.gold,
    chests: result.chests.map((c) => c.tier),
    newWords,
    wordsTyped: typed.length,
    timeText: formatTime(result.durationTicks),
    wpm: Math.round(result.stats.netWpmX100 / 100),
    accuracyPct: Math.round(result.stats.accuracyBp / 100),
    maxCombo: result.stats.maxCombo,
    perfectWords: result.stats.perfectWords,
    secondWindUsed: result.stats.secondWindUsed,
  };
}

// ---------------------------------------------------------------------------------------------- DOM

export interface ScreenActions {
  resume(): void;
  restart(): void;
  quit(): void;
  /** After a clear: go on (the slice has no world map yet: reload the level list). */
  next(): void;
}

const CSS = `
#play-ui{position:fixed;inset:0;z-index:30;pointer-events:none;font:14px/1.4 "Silkscreen","Press Start 2P",ui-monospace,monospace;color:#efe5cc}
#play-ui .panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:420px;max-width:640px;padding:28px 36px;background:rgba(10,9,18,.9);border:2px solid #e9c46a;box-shadow:0 0 0 4px rgba(0,0,0,.55),0 12px 48px rgba(0,0,0,.6);text-align:center;pointer-events:auto}
#play-ui h1{margin:0 0 4px;font:900 34px "Cinzel",Georgia,serif;letter-spacing:.08em;color:#fff0b8;text-shadow:0 2px 0 #5b3d12}
#play-ui h1.fail{color:#ff9a8a;text-shadow:0 2px 0 #5a1a12}
#play-ui .sub{margin:0 0 18px;color:#b9ad8c;letter-spacing:.1em}
#play-ui .stars{font-size:40px;letter-spacing:10px;margin:6px 0 14px;color:#e9c46a}
#play-ui .stars .off{color:#3a3550}
#play-ui table{margin:0 auto 14px;border-collapse:collapse;text-align:left}
#play-ui td{padding:3px 14px}
#play-ui td:first-child{color:#b9ad8c}
#play-ui .words{margin:0 0 16px;color:#cfe8d0;font-size:12px;max-width:520px}
#play-ui button{font:inherit;color:#1b1408;background:#e9c46a;border:0;padding:9px 18px;margin:4px 6px;cursor:pointer;letter-spacing:.08em}
#play-ui button.alt{background:#3a3550;color:#efe5cc}
#play-ui button:hover{filter:brightness(1.12)}
#play-ui .strip{position:absolute;left:50%;top:10px;transform:translateX(-50%);max-width:520px;padding:6px 16px;background:rgba(10,9,18,.78);border:1px solid #e9c46a;text-align:center;font-size:12px;letter-spacing:.06em}
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
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly actions: ScreenActions) {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);
    this.root = document.createElement("div");
    this.root.id = "play-ui";
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
  }

  get open(): "pause" | "result" | null {
    return this.panel === null ? null : (this.panel.dataset.kind as "pause" | "result");
  }

  dispose(): void {
    this.closePanel();
    this.root.remove();
  }

  // ---- strips

  hint(text: string, sec: number): void {
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
    const p = document.createElement("div");
    p.className = "panel";
    p.dataset.kind = kind;
    p.innerHTML = html;
    this.root.append(p);
    this.panel = p;
    const h = (e: KeyboardEvent): void => {
      const fn = keys[e.key];
      if (fn && !e.repeat) {
        e.preventDefault();
        fn();
      }
    };
    this.keyHandler = h;
    window.addEventListener("keydown", h);
    for (const b of p.querySelectorAll<HTMLButtonElement>("button[data-act]")) {
      b.addEventListener("click", () => keys[`act:${b.dataset.act}`]?.());
    }
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
      `<h1>PAUSED</h1><p class="sub">${esc(why)}</p>
       <button data-act="resume">RESUME (Esc)</button><button class="alt" data-act="restart">RESTART</button><button class="alt" data-act="quit">QUIT LEVEL</button>`,
      {
        Escape: () => this.actions.resume(),
        "act:resume": () => this.actions.resume(),
        "act:restart": () => this.actions.restart(),
        "act:quit": () => this.actions.quit(),
      },
    );
  }

  showResults(m: ResultsModel): void {
    const stars = m.stars.map((on) => `<span class="${on ? "on" : "off"}">&#9733;</span>`).join("");
    const words =
      m.newWords.length > 0
        ? `<div class="words">NEW WORDS (${m.newWords.length}): ${esc(m.newWords.slice(0, 12).join(", "))}${m.newWords.length > 12 ? ", ..." : ""}</div>`
        : "";
    const rows =
      m.outcome === "cleared"
        ? `<tr><td>Gold</td><td id="r-gold">${m.gold}</td></tr>
           <tr><td>Chests</td><td id="r-chests">${m.chests.length > 0 ? esc(m.chests.join(", ")) : "none"}</td></tr>`
        : `<tr><td>Gold kept</td><td id="r-gold">${m.gold}</td></tr>`;
    this.mount(
      "result",
      `<h1 class="${m.outcome === "cleared" ? "" : "fail"}" id="r-title">${m.title}</h1><p class="sub">${esc(m.subtitle)}</p>
       ${m.outcome === "cleared" ? `<div class="stars" id="r-stars">${stars}</div>` : ""}
       <table>${rows}
         <tr><td>Time</td><td id="r-time">${m.timeText}</td></tr>
         <tr><td>Speed</td><td id="r-wpm">${m.wpm} WPM</td></tr>
         <tr><td>Accuracy</td><td id="r-acc">${m.accuracyPct}%</td></tr>
         <tr><td>Best combo</td><td>${m.maxCombo} (${m.perfectWords} perfect words)</td></tr>
       </table>${words}
       ${m.outcome === "cleared" ? `<button data-act="next">CONTINUE (Enter)</button>` : ""}
       <button class="${m.outcome === "cleared" ? "alt" : ""}" data-act="restart">${m.outcome === "cleared" ? "REPLAY (R)" : "TRY AGAIN (R / Enter)"}</button>`,
      {
        Enter: () => (m.outcome === "cleared" ? this.actions.next() : this.actions.restart()),
        r: () => this.actions.restart(),
        R: () => this.actions.restart(),
        "act:next": () => this.actions.next(),
        "act:restart": () => this.actions.restart(),
      },
    );
  }
}

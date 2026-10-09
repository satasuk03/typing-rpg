/**
 * L1 tutorial cards (T3.3). The sim emits `TutorialCue` once per cue (target, atb, combo, skill, guard) on the
 * tutorial level. Each cue becomes one compact card at the bottom centre of the screen:
 *   - non-blocking: the sim keeps running, the card is `pointer-events:none`;
 *   - never over a word plate: the card's rect is handed to the HUD as a reserved `avoid` rect (`Hud.setReserved`), so
 *     the plate layout solver moves plates away from it (same logic as the banners and panels);
 *   - dismissed by typing: a typed character after `minMs` clears it (the player is never stuck), and a card also
 *     expires by itself after `maxMs`;
 *   - one at a time, in emission order. The guard card jumps the queue (it is urgent).
 * Pure model (`TutorialQueue`) plus a thin DOM view (`TutorialCards`).
 */
import type { Rect } from "./layout";

export type TutorialCueId = "target" | "atb" | "combo" | "skill" | "guard";

export interface CueCopy {
  head: string;
  body: string;
  /** Keyboard hint chips shown on the card. */
  keys: string[];
  /** Minimum time on screen before typing dismisses it (ms). */
  minMs: number;
  maxMs: number;
}

export const CUE_COPY: Record<TutorialCueId, CueCopy> = {
  target: {
    head: "LOCK ON",
    body: "Type the first letter of a word to lock on, then finish it.",
    keys: ["A-Z", "Esc drops the lock"],
    minMs: 2200,
    maxMs: 12000,
  },
  atb: {
    head: "ATTACK GAUGE",
    body: "Every correct letter fills your gauge. When it is full, your hero strikes.",
    keys: ["keep typing"],
    minMs: 2200,
    maxMs: 10000,
  },
  combo: {
    head: "COMBO",
    body: "Finish words with no typos to build a combo. A bigger combo hits harder.",
    keys: ["no typos"],
    minMs: 2200,
    maxMs: 10000,
  },
  skill: {
    head: "SKILLS",
    body: "Typing charges your skills. A charged skill fires on its own.",
    keys: ["keep typing"],
    minMs: 2200,
    maxMs: 10000,
  },
  guard: {
    head: "RED WORD = INCOMING ATTACK",
    body: "Type it before the enemy lands the hit to block it. You get extra time this once.",
    keys: ["type the red word"],
    minMs: 2600,
    maxMs: 14000,
  },
};

export interface ActiveCard {
  cue: TutorialCueId;
  shownAtMs: number;
}

/** Cue ordering and dismissal rules, no DOM. Times are ms from any monotonic clock. */
export class TutorialQueue {
  active: ActiveCard | null = null;
  private queue: TutorialCueId[] = [];
  private readonly shown = new Set<TutorialCueId>();
  /** Gap after a dismissal before the next card appears. */
  gapMs = 500;
  private nextAllowedMs = 0;

  push(cue: TutorialCueId, nowMs: number): void {
    if (this.shown.has(cue) || this.queue.includes(cue) || this.active?.cue === cue) return;
    if (cue === "guard") this.queue.unshift(cue);
    else this.queue.push(cue);
    this.tick(nowMs);
  }

  /** A typed key. Returns true when it dismissed the card. */
  key(nowMs: number): boolean {
    const a = this.active;
    if (!a) return false;
    if (nowMs - a.shownAtMs < CUE_COPY[a.cue].minMs) return false;
    this.dismiss(nowMs);
    return true;
  }

  dismiss(nowMs: number): void {
    this.active = null;
    this.nextAllowedMs = nowMs + this.gapMs;
  }

  /** Per frame / timer: expire the card, start the next one. Returns true when the visible card changed. */
  tick(nowMs: number): boolean {
    let changed = false;
    const a = this.active;
    if (a && nowMs - a.shownAtMs >= CUE_COPY[a.cue].maxMs) {
      this.dismiss(nowMs);
      changed = true;
    }
    if (!this.active && this.queue.length > 0 && nowMs >= this.nextAllowedMs) {
      const cue = this.queue.shift() as TutorialCueId;
      this.shown.add(cue);
      this.active = { cue, shownAtMs: nowMs };
      changed = true;
    }
    return changed;
  }

  clear(): void {
    this.active = null;
    this.queue = [];
    this.shown.clear();
    this.nextAllowedMs = 0;
  }

  get pending(): number {
    return this.queue.length;
  }
}

export const TUTORIAL_CSS = `
.tut-card{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:600px;padding:9px 18px 10px;pointer-events:none;
  background:linear-gradient(180deg,rgba(23,18,31,.95),rgba(8,6,11,.96));border:2px solid var(--edge);
  box-shadow:0 0 0 3px rgba(0,0,0,.65),inset 0 0 0 1px rgba(255,240,184,.14),0 8px 30px rgba(0,0,0,.6);animation:tutIn .25s ease-out}
.tut-card[hidden]{display:none}
.tut-card.guard{border-color:#ff6a5a;box-shadow:0 0 0 3px rgba(0,0,0,.65),0 0 24px rgba(255,80,60,.45),0 8px 30px rgba(0,0,0,.6)}
.tut-card .th{font:900 15px var(--f-disp);letter-spacing:.16em;color:var(--gold-hi)}
.tut-card.guard .th{color:#ff9a8a}
.tut-card .tb{margin-top:3px;font:13px/1.35 var(--f-ui);color:var(--ink)}
.tut-card .tk{margin-top:6px;display:flex;gap:8px;align-items:center;font:11px var(--f-pix);letter-spacing:.08em;color:var(--muted)}
.tut-card .tk .hd-kbd{margin:0}
.tut-card .tk .go{margin-left:auto;color:var(--dim)}
@keyframes tutIn{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.tut-card{animation:none}}
`;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** DOM view. `onRect` receives the card's CSS-pixel rect while it is visible (null when hidden). */
export class TutorialCards {
  readonly el: HTMLDivElement;
  readonly queue = new TutorialQueue();
  /** Cues in the order they were first shown (debug and tests). */
  readonly history: TutorialCueId[] = [];
  onRect: ((r: Rect | null) => void) | null = null;
  private timer = 0;
  private lastKey: TutorialCueId | null = null;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return; // typed characters only (Esc and arrows never dismiss)
    if (this.queue.key(performance.now())) this.render();
  };

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "tut-card";
    this.el.hidden = true;
    this.el.setAttribute("role", "status");
    parent.append(this.el);
    window.addEventListener("keydown", this.onKey);
    this.timer = window.setInterval(() => {
      if (this.queue.tick(performance.now())) this.render();
    }, 150);
  }

  cue(cue: TutorialCueId): void {
    this.queue.push(cue, performance.now());
    this.render();
  }

  /** Hide everything (a panel opened, the level restarted). */
  clear(): void {
    this.queue.clear();
    this.render();
  }

  render(): void {
    const a = this.queue.active;
    if (!a) {
      if (!this.el.hidden) {
        this.el.hidden = true;
        delete this.el.dataset.cue;
        this.lastKey = null;
        this.onRect?.(null);
      }
      return;
    }
    if (this.lastKey === a.cue && !this.el.hidden) return;
    this.lastKey = a.cue;
    const c = CUE_COPY[a.cue];
    this.el.className = `tut-card ${a.cue === "guard" ? "guard" : ""}`;
    this.el.dataset.cue = a.cue;
    this.el.innerHTML = `<div class="th">${esc(c.head)}</div><div class="tb">${esc(c.body)}</div>
      <div class="tk">${c.keys.map((k) => `<span class="hd-kbd">${esc(k)}</span>`).join("")}<span class="go">type to dismiss</span></div>`;
    this.el.hidden = false;
    this.history.push(a.cue);
    // the layout is fixed by CSS: measure once it is in the DOM
    const r = this.el.getBoundingClientRect();
    this.onRect?.({ x: r.x, y: r.y, w: r.width, h: r.height });
  }

  dispose(): void {
    window.clearInterval(this.timer);
    window.removeEventListener("keydown", this.onKey);
    this.el.remove();
    this.onRect?.(null);
  }
}

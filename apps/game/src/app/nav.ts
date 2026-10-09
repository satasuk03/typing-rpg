/**
 * Keyboard navigation for the DOM screens (plan T3.2 AC: every screen is operable with the keyboard alone).
 *
 *  - Arrow keys move focus to the nearest focusable control in that direction (geometry based).
 *  - Tab / Shift+Tab keep the browser's order but are trapped inside the open modal.
 *  - Enter / Space activate the focused button (native). Escape goes "back" (modal first, then the screen).
 *  - Range sliders keep Left/Right for their value; text fields keep Left/Right for the caret.
 *  - A widget that handles arrows itself sets `data-arrows="own"`.
 */

const FOCUSABLE =
  'button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function focusables(scope: Element): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest("[hidden],[inert]")) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  });
}

type Dir = "left" | "right" | "up" | "down";

const KEY_DIR: Record<string, Dir> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** The best neighbour of `from` in a direction: nearest along the axis, penalising lateral offset. */
export function neighbour(from: HTMLElement, all: HTMLElement[], dir: Dir): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    const dx = bc.x - ac.x;
    const dy = bc.y - ac.y;
    let main: number;
    let lat: number;
    // a candidate must lie (mostly) in the requested half-plane
    switch (dir) {
      case "right":
        main = b.left >= a.right - 4 ? b.left - a.right : dx > 4 ? dx : Number.NaN;
        lat = Math.abs(dy);
        break;
      case "left":
        main = b.right <= a.left + 4 ? a.left - b.right : dx < -4 ? -dx : Number.NaN;
        lat = Math.abs(dy);
        break;
      case "down":
        main = b.top >= a.bottom - 4 ? b.top - a.bottom : dy > 4 ? dy : Number.NaN;
        lat = Math.abs(dx);
        break;
      default:
        main = b.bottom <= a.top + 4 ? a.top - b.bottom : dy < -4 ? -dy : Number.NaN;
        lat = Math.abs(dx);
    }
    if (Number.isNaN(main)) continue;
    const score = Math.max(0, main) + lat * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export interface NavScope {
  /** The element whose descendants are navigable. */
  root: HTMLElement;
  /** Escape. Return true when handled. */
  onBack?(): boolean | undefined;
}

/** One global listener; the active scope is the top of a stack (a modal pushes a scope, closing pops it). */
export class KeyNav {
  private readonly stack: NavScope[] = [];
  private readonly h = (e: KeyboardEvent): void => this.onKey(e);

  attach(): void {
    window.addEventListener("keydown", this.h);
  }
  detach(): void {
    window.removeEventListener("keydown", this.h);
  }

  get depth(): number {
    return this.stack.length;
  }

  push(s: NavScope): void {
    this.stack.push(s);
  }
  pop(s?: NavScope): void {
    if (s) {
      const i = this.stack.indexOf(s);
      if (i >= 0) this.stack.splice(i, 1);
    } else this.stack.pop();
  }
  /** Replace the base scope (screen change). Modal scopes above it are kept only if `keepModals`. */
  setBase(s: NavScope | null): void {
    this.stack.length = 0;
    if (s) this.stack.push(s);
  }

  private get top(): NavScope | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** Focus the first focusable control of the active scope (or `selector` if it matches). */
  focusFirst(selector?: string): void {
    const t = this.top;
    if (!t) return;
    const els = focusables(t.root);
    const pick = (selector ? els.find((e) => e.matches(selector)) : undefined) ?? els[0];
    pick?.focus({ preventScroll: true });
  }

  private onKey(e: KeyboardEvent): void {
    const t = this.top;
    if (!t || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = document.activeElement as HTMLElement | null;

    if (e.key === "Escape") {
      if (target instanceof HTMLInputElement && target.type === "text") {
        // first Escape leaves the text field, the next one goes back
        e.preventDefault();
        target.blur();
        this.focusFirst();
        return;
      }
      if (t.onBack?.() !== false) e.preventDefault();
      return;
    }

    if (e.key === "Tab") {
      const els = focusables(t.root);
      if (els.length === 0) return;
      const i = target ? els.indexOf(target) : -1;
      if (this.stack.length > 1 || i < 0 || (e.shiftKey ? i === 0 : i === els.length - 1)) {
        e.preventDefault();
        const next = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length;
        els[next]?.focus();
      }
      return;
    }

    const dir = KEY_DIR[e.key];
    if (!dir) return;
    if (target?.dataset.arrows === "own") return;
    if (target instanceof HTMLInputElement) {
      if (target.type === "range" && (dir === "left" || dir === "right")) return;
      if (target.type === "text" && (dir === "left" || dir === "right")) return;
    }
    const els = focusables(t.root);
    if (els.length === 0) return;
    e.preventDefault();
    if (!target || !t.root.contains(target)) {
      els[0]?.focus();
      return;
    }
    const n = neighbour(target, els, dir);
    if (n) {
      n.focus();
      n.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
}

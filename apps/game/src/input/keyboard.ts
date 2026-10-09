/**
 * Raw keyboard capture for the level runner (docs/interfaces.md §2).
 *
 *  - `keydown` only (never `keypress`/`input`), capture phase so nothing upstream can swallow a typed key.
 *  - `normalizeKey` (sim) decides what counts: auto-repeat, IME composition and Ctrl/Meta shortcuts are dropped.
 *  - The timestamp is `event.timeStamp` (the OS event time, same clock as `performance.now()`), not "now".
 *  - Tab/typed characters get `preventDefault` so Firefox quick-find and page scrolling never fire mid-word.
 *  - Blur and `visibilitychange -> hidden` are reported so the runner can auto-pause.
 */
import { normalizeKey, type SimKey } from "@hd2d/sim";

export interface KeyboardHandlers {
  /** An accepted key. `timeStamp` is `KeyboardEvent.timeStamp` (ms, performance.now() timebase). */
  onKey(key: SimKey, timeStamp: number): void;
  /** Window blur or tab hidden: the runner should pause. */
  onAutoPause(reason: "blur" | "hidden"): void;
}

/** True when the event comes from an editable element (our DOM overlays have none, but keep the guard). */
function isEditable(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export class KeyboardCapture {
  private attached = false;
  /** While false, keys are swallowed (preventDefault) but not forwarded. */
  enabled = true;

  constructor(
    private readonly h: KeyboardHandlers,
    private readonly target: Window = window,
  ) {}

  private readonly keydown = (e: KeyboardEvent): void => {
    if (isEditable(e.target)) return;
    const key = normalizeKey({
      key: e.key,
      repeat: e.repeat,
      isComposing: e.isComposing,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
    });
    if (key === null) return;
    // Space scrolls, ' and / open quick-find in Firefox, Tab moves focus: none of that may happen mid-word.
    e.preventDefault();
    if (!this.enabled) return;
    this.h.onKey(key, e.timeStamp);
  };

  private readonly blur = (): void => this.h.onAutoPause("blur");
  private readonly visibility = (): void => {
    if (document.visibilityState === "hidden") this.h.onAutoPause("hidden");
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.target.addEventListener("keydown", this.keydown, { capture: true });
    this.target.addEventListener("blur", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener("keydown", this.keydown, { capture: true });
    this.target.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
  }
}

/** Dispatch a synthetic keydown through the real capture path (used by the browser bot and tests). */
export function pressKey(key: string, target: Window = window): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

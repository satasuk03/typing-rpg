/**
 * Prologue overlay (P3.5): the hold-Esc skip ring, the idle nudge and the fade to black. Plain DOM above both canvases,
 * self-contained (no imports from the app shell), pointer-events none. P3.3's `hud/prologue/**` owns the cinematic HUD;
 * this is only the flow chrome.
 */

const CSS = `
#pro-overlay{position:fixed;inset:0;z-index:80;pointer-events:none;font-family:Silkscreen,monospace,sans-serif;color:#e9e3d6}
#pro-overlay .pro-ring{position:absolute;right:28px;bottom:26px;display:flex;align-items:center;gap:12px;opacity:0;transition:opacity 180ms}
#pro-overlay .pro-ring.on{opacity:1}
#pro-overlay .pro-ring .dial{width:44px;height:44px;border-radius:50%;background:conic-gradient(#ffd24a calc(var(--p,0)*1turn),rgba(255,255,255,.14) 0);-webkit-mask:radial-gradient(circle,transparent 15px,#000 16px);mask:radial-gradient(circle,transparent 15px,#000 16px);filter:drop-shadow(0 0 6px rgba(255,200,60,.55))}
#pro-overlay .pro-ring .lbl{font-size:12px;letter-spacing:.08em;text-shadow:0 2px 0 #000,0 0 8px #000}
#pro-overlay .pro-ring .lbl b{color:#ffd24a}
#pro-overlay .pro-nudge{position:absolute;left:50%;bottom:23%;transform:translateX(-50%);padding:8px 18px;background:rgba(10,9,18,.82);border:1px solid #ffd24a;font-size:15px;letter-spacing:.08em;opacity:0;transition:opacity 220ms;text-shadow:0 2px 0 #000;white-space:nowrap}
#pro-overlay .pro-nudge.on{opacity:1}
#pro-overlay .pro-nudge b{color:#ffd24a}
#pro-overlay .pro-fade{position:absolute;inset:0;background:#000;opacity:0}
`;

export class PrologueOverlay {
  readonly root: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly dial: HTMLDivElement;
  private readonly nudgeEl: HTMLDivElement;
  private readonly fadeEl: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private ringHinted = false;

  constructor() {
    this.style = document.createElement("style");
    this.style.textContent = CSS;
    document.head.append(this.style);
    this.root = document.createElement("div");
    this.root.id = "pro-overlay";
    this.root.innerHTML = `<div class="pro-nudge" id="pro-nudge" role="status">Type any word to fight! <b>Letters on the red plates</b></div>
      <div class="pro-ring" id="pro-ring" role="status"><div class="dial"></div><div class="lbl"><b>Hold Esc</b> to skip</div></div>
      <div class="pro-fade" id="pro-fade"></div>`;
    document.body.append(this.root);
    this.ring = this.root.querySelector("#pro-ring") as HTMLDivElement;
    this.dial = this.ring.querySelector(".dial") as HTMLDivElement;
    this.nudgeEl = this.root.querySelector("#pro-nudge") as HTMLDivElement;
    this.fadeEl = this.root.querySelector("#pro-fade") as HTMLDivElement;
    this.nudgeEl.innerHTML = `Type any word to fight!`;
  }

  /** Hold progress 0..1 while Esc is held (the ring shows), null when released. A standing hint keeps the ring visible. */
  setProgress(p: number | null): void {
    if (p === null) {
      this.dial.style.setProperty("--p", "0");
      this.ring.classList.toggle("on", this.ringHinted);
      this.ring.dataset.held = "0";
      return;
    }
    this.dial.style.setProperty("--p", String(Math.min(1, Math.max(0, p))));
    this.ring.classList.add("on");
    this.ring.dataset.held = "1";
  }

  /** The standing "Hold Esc to skip" hint (Part A's first seconds, and after 20 s idle in Part B). */
  setRingHint(on: boolean): void {
    this.ringHinted = on;
    if (this.ring.dataset.held !== "1") this.ring.classList.toggle("on", on);
    this.ring.dataset.hint = on ? "1" : "0";
  }

  setNudge(on: boolean): void {
    this.nudgeEl.classList.toggle("on", on);
    this.nudgeEl.dataset.on = on ? "1" : "0";
  }

  get nudgeOn(): boolean {
    return this.nudgeEl.classList.contains("on");
  }

  get ringHintOn(): boolean {
    return this.ringHinted;
  }

  /** Fade the screen to black over `ms`. Resolves when done (immediately for ms <= 0). */
  fadeOut(ms: number): Promise<void> {
    if (ms <= 0) {
      this.fadeEl.style.opacity = "1";
      return Promise.resolve();
    }
    this.fadeEl.style.transition = `opacity ${ms}ms linear`;
    void this.fadeEl.offsetWidth;
    this.fadeEl.style.opacity = "1";
    return new Promise((r) => window.setTimeout(r, ms));
  }

  dispose(): void {
    this.root.remove();
    this.style.remove();
  }
}

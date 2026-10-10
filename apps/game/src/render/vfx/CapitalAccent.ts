/**
 * CapitalAccent (T3.2, brief 5.5): the Hush Spell capital-letter reward. `CharCorrect.shifted` (Ch2+ exact-case plates only)
 * draws, on the JUST-TYPED capital's cell only:
 *   - a crown spark: 3 gold pixels in a ^ shape 2 px above the cell (`#ffd24a`, then `#fff0b8`),
 *   - a 1-px gold top bar flash over the cell for 120 ms,
 *   - 4 gold sparks rising straight up (2 px, life 160 ms).
 *
 * It lives in the HUD "above" layer (`hud.fx`), which the HUD clips so that nothing can cover a plate letter, and everything
 * here sits above the typed cell inside its own x range, so the NEXT letter (the neighbour cell) is never touched (R1-R3).
 * No world allocation. One fixed pool, no allocation per key: the handler writes numbers into a slot. It runs inside the typing
 * handle, so `typingPerf.spec` covers the 0.45 ms/key budget (see `tests/vfx/capitalAccent.test.ts` for the per-key bound).
 */
import type { SimEvent } from "@hd2d/sim";
import type { Ctx, HudEffect } from "../../hud/fx";
import type { Hud } from "../../hud/hud";

const POOL = 6;
const LIFE = 0.16;
const BAR_LIFE = 0.12;
const GOLD = "#ffd24a";
const PALE = "#fff0b8";
const SPARKS = 4;

interface Slot {
  on: boolean;
  age: number;
  x: number;
  y: number;
  w: number;
  seed: number;
}

const R = { x: 0, y: 0, w: 0, h: 0 };

export class CapitalAccent {
  private readonly slots: Slot[] = [];
  private next = 0;
  private live = 0;
  private attached: HudEffect | null = null;
  /** Per-event cost bench (ms), for the unit test and the perf notes. */
  handled = 0;

  constructor(private readonly hud: Hud) {
    for (let i = 0; i < POOL; i++)
      this.slots.push({ on: false, age: 0, x: 0, y: 0, w: 0, seed: i });
  }

  attach(): () => void {
    if (this.attached) return () => {};
    const fx: HudEffect = {
      layer: "above",
      life: Number.POSITIVE_INFINITY,
      draw: (c, f) => this.draw(c, f.dt, f.scale),
    };
    this.attached = fx;
    this.hud.fx.add(fx);
    return () => {
      this.hud.fx.remove(fx);
      this.attached = null;
    };
  }

  clear(): void {
    for (const s of this.slots) s.on = false;
    this.live = 0;
  }

  /** @hot Feed every event; only `CharCorrect` with `shifted` does anything. No allocation. */
  onEvent(e: SimEvent): void {
    if (e.type !== "CharCorrect" || e.shifted !== true) return;
    const set = this.hud.getSettings();
    if (set.effectsIntensity <= 0) return;
    if (!this.hud.getLetterRectInto(e.plateId, e.index, R)) return;
    this.handled++;
    const s = this.slots[this.next] as Slot;
    this.next = (this.next + 1) % POOL;
    if (!s.on) this.live++;
    s.on = true;
    s.age = 0;
    s.x = R.x;
    s.y = R.y;
    s.w = R.w;
    s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  }

  /** @hot Draws inside the HUD above layer (CSS px). Early-out when nothing is live. */
  private draw(c: Ctx, dt: number, scale: number): void {
    if (this.live === 0) return;
    const set = this.hud.getSettings();
    const u = Math.max(1, Math.round(scale)); // one design pixel
    let alive = 0;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i] as Slot;
      if (!s.on) continue;
      s.age += dt;
      if (s.age >= LIFE) {
        s.on = false;
        continue;
      }
      alive++;
      const k = s.age / LIFE;
      const cx = Math.round(s.x + s.w / 2);
      // the crown: 3 pixels in a ^ shape 2 px above the cell, gold then pale
      const cy = Math.round(s.y) - 3 * u;
      c.globalAlpha = Math.min(1, 1.6 * (1 - k));
      c.fillStyle = k < 0.45 ? GOLD : PALE;
      c.fillRect(cx, cy, u, u);
      c.fillRect(cx - u, cy + u, u, u);
      c.fillRect(cx + u, cy + u, u, u);
      // the 1-px top bar over the cell (just above its rect: the HUD clips the letter rects out of this layer anyway)
      if (!set.reducedFlash && s.age < BAR_LIFE) {
        c.globalAlpha = 0.9 * (1 - s.age / BAR_LIFE);
        c.fillStyle = GOLD;
        c.fillRect(Math.round(s.x), Math.round(s.y) - u, Math.round(s.w), u);
      }
      // 4 sparks rising straight up inside the cell's x range (not the fan), 2 px
      c.fillStyle = GOLD;
      const rise = 16 * u * (1 - (1 - k) ** 2);
      for (let j = 0; j < SPARKS; j++) {
        // fully inside the typed cell's x range, so the neighbour (next) letter's column is never entered
        const f = 0.12 + 0.76 * ((j + ((s.seed >>> (j * 5)) & 7) / 16) / SPARKS);
        c.globalAlpha = 0.9 * (1 - k);
        c.fillRect(
          Math.round(s.x + (s.w - 2 * u) * f),
          Math.round(s.y) - 3 * u - rise - (j % 2) * 2 * u,
          2 * u,
          2 * u,
        );
      }
    }
    c.globalAlpha = 1;
    this.live = alive;
  }
}

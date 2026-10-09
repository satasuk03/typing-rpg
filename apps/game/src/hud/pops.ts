/** Damage pops and tags: lifetime + stacking logic (pure, no DOM). */

export type PopKind =
  | "dmg"
  | "crit"
  | "chip"
  | "hurt"
  | "heal"
  | "weak"
  | "break"
  | "perfect"
  | "block"
  | "parry"
  | "skill"
  | "gold"
  | "tag";

/** Where a pop is anchored: an enemy/hero (resolved by the projector) or a screen point (CSS px). */
export type PopAnchor =
  | { kind: "enemy"; id: number }
  | { kind: "hero" }
  | { kind: "screen"; x: number; y: number };

export interface Pop {
  uid: number;
  kind: PopKind;
  text: string;
  anchor: PopAnchor;
  /** Seconds since spawn. */
  age: number;
  /** Lifetime seconds. */
  dur: number;
  /** Vertical stack slot at spawn (0 = first). */
  slot: number;
  /** Upward offset in px so pops on one anchor never overlap (sum of the older pops' heights). */
  stackY: number;
  /** Horizontal drift in px/s (deterministic). */
  vx: number;
  /** Size multiplier (1 = default). */
  size: number;
}

export const POP_LIFETIME: Record<PopKind, number> = {
  dmg: 1.15,
  crit: 1.4,
  chip: 0.8,
  hurt: 1.2,
  heal: 1.2,
  weak: 1.0,
  break: 1.6,
  perfect: 1.3,
  block: 1.1,
  parry: 1.2,
  skill: 1.3,
  gold: 1.8,
  tag: 1.0,
};

/** Height in px that one stacked pop of this kind takes up. */
export const POP_STACK_STEP: Record<PopKind, number> = {
  dmg: 64,
  crit: 80,
  chip: 28,
  hurt: 56,
  heal: 40,
  weak: 34,
  break: 84,
  perfect: 36,
  block: 36,
  parry: 36,
  skill: 34,
  gold: 34,
  tag: 34,
};

/** Pops spawned on the same anchor within this window are stacked instead of overlapped. */
export const STACK_WINDOW = 0.45;
export const MAX_POPS = 28;

const anchorKey = (a: PopAnchor): string =>
  a.kind === "enemy"
    ? `e${a.id}`
    : a.kind === "hero"
      ? "h"
      : `s${Math.round(a.x / 40)},${Math.round(a.y / 40)}`;

export class PopSystem {
  readonly pops: Pop[] = [];
  private uid = 1;
  private seed = 0x9e3779b9;

  /** Deterministic jitter in [-1, 1) (HUD only; keeps screenshots reproducible). */
  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 2 ** 31 - 1;
  }

  spawn(kind: PopKind, text: string, anchor: PopAnchor, size = 1): Pop {
    const key = anchorKey(anchor);
    let slot = 0;
    let stackY = 0;
    for (const p of this.pops) {
      if (anchorKey(p.anchor) === key && p.age < STACK_WINDOW) {
        slot++;
        stackY += POP_STACK_STEP[p.kind];
      }
    }
    const pop: Pop = {
      uid: this.uid++,
      kind,
      text,
      anchor,
      age: 0,
      dur: POP_LIFETIME[kind],
      slot,
      stackY,
      vx: this.rnd() * 14,
      size,
    };
    this.pops.push(pop);
    while (this.pops.length > MAX_POPS) {
      // drop the least important oldest pop (chips first)
      let idx = this.pops.findIndex((p) => p.kind === "chip");
      if (idx < 0) idx = 0;
      this.pops.splice(idx, 1);
    }
    return pop;
  }

  update(dt: number): void {
    for (const p of this.pops) p.age += dt;
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (p && p.age >= p.dur) this.pops.splice(i, 1);
    }
  }

  clear(): void {
    this.pops.length = 0;
  }
}

/** Fade multiplier: 1 until 78% of the lifetime, then linear to 0 (POC). */
export function popAlpha(p: Pick<Pop, "age" | "dur">): number {
  const k = p.age / p.dur;
  return Math.min(1, Math.max(0, k > 0.78 ? (1 - k) / 0.22 : 1));
}

/** Punch-in scale: 2.1 -> 1 over the first 0.14 s (easeOutBack-like), 1 afterwards. */
export function popScale(age: number, reducedMotion = false): number {
  if (reducedMotion || age >= 0.14) return 1;
  const k = age / 0.14;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const e = 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
  return 2.1 + (1 - 2.1) * e;
}

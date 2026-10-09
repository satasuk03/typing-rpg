import type { SimEvent } from "@hd2d/sim";

/** Settings the typing VFX honour (spec §10.5). Same shape as the HUD settings. */
export interface TypingFxSettings {
  /** 0..1. At 0 only the information layer remains. */
  effectsIntensity: number;
  reducedFlash: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_TYPING_SETTINGS: TypingFxSettings = {
  effectsIntensity: 1,
  reducedFlash: false,
  reducedMotion: false,
};

/**
 * Where things are in the world. The level runner (or the dev scene) supplies it; the typing VFX
 * never place anything by themselves. World units; the action plane is z = 0.
 */
export interface WorldAnchors {
  /** Hero foot position (x, z). */
  hero(out: { x: number; z: number }): void;
  /** Centre of enemy `id`'s body. False when the enemy is unknown (the effect is skipped). */
  enemy(id: number, out: { x: number; y: number; z: number }): boolean;
}

/**
 * T2.3 hooks the typing VFX call. Every one defaults to a no-op, so T2.6 never blocks on T2.3; the level
 * runner assigns the real implementations.
 */
export interface TypingFxCallbacks {
  /** White-flash a sprite actor: `amount` 0..1 per frame while flashing (0 once at the end). */
  actorFlash(who: "hero" | number, amount: number, rgb: readonly [number, number, number]): void;
  /** Start the auto-attack dash `startInMs` from now, lasting `durationMs`, so contact lands on the impact tick. */
  dash(startInMs: number, durationMs: number, targetId: number): void;
  /** A slash arc (finisher flurry, Chunk C). Angle in radians, `size` in world units. */
  slashArc(
    angleRad: number,
    size: number,
    rgb: readonly [number, number, number],
    targetId: number,
  ): void;
  /** The deferred chip hit is being presented now: play the chip impact VFX. */
  chipImpact(hit: Extract<SimEvent, { type: "Hit" }>): void;
  /** `EnemyDeath` is being presented now (after any chip for that enemy): start the dissolve. */
  dissolve(enemyId: number, byKind: string): void;
}

export const NOOP_CALLBACKS: TypingFxCallbacks = {
  actorFlash: () => {},
  dash: () => {},
  slashArc: () => {},
  chipImpact: () => {},
  dissolve: () => {},
};

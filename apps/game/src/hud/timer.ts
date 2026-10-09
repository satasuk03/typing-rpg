/** Guard / doom / second-wind timer strip maths (pure). */

export const TICKS_PER_SEC = 60;

export interface TimerStrip {
  /** 1 = full time left, 0 = impact. */
  remaining: number;
  /** 0 until the last 30% of the time, then rises to 1. */
  urgency: number;
  critical: boolean;
  secondsLeft: number;
}

/**
 * `nowTick` may be fractional (view.tick + interpolation alpha).
 * Returns null when the plate has no timer.
 */
export function timerStrip(
  expiresAtTick: number | null,
  totalTicks: number | null,
  nowTick: number,
): TimerStrip | null {
  if (expiresAtTick === null || totalTicks === null || totalTicks <= 0) return null;
  const left = Math.max(0, expiresAtTick - nowTick);
  const remaining = Math.min(1, left / totalTicks);
  const urgency = remaining >= 0.3 ? 0 : Math.min(1, (0.3 - remaining) / 0.3);
  return { remaining, urgency, critical: urgency > 0.6, secondsLeft: left / TICKS_PER_SEC };
}

/** Pulse speed (rad/s) of the guard glow: faster as impact nears. */
export const guardPulseSpeed = (urgency: number): number =>
  8 + 10 * Math.min(1, Math.max(0, urgency));

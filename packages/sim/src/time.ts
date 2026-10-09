export const TICK_HZ = 60;
/** Integer >= 0. The ONLY time unit inside the sim. Tick 0 = createLevel/createTrial. */
export type Tick = number;
/** Shared by client and Worker so both derive identical ticks from logged milliseconds. ms is an integer >= 0. */
export const msToTick = (ms: number): Tick => Math.floor((ms * 3) / 50);
/** First integer ms that maps to tick t (msToTick(tickStartMs(t)) === t). */
export const tickStartMs = (t: Tick): number => Math.ceil((t * 50) / 3);
/** Client frame stepping trails the clock by this many ticks (§2). Keys still step immediately. */
export const CLIENT_LAG_TICKS = 3;
/** A frame that would need more catch-up than this is treated as a stall: auto-pause instead (§2). */
export const MAX_CATCHUP_TICKS = 600;

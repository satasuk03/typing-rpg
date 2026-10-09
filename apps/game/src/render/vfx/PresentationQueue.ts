/**
 * PresentationQueue (spec §5.4): holds back the sim events that must be presented later than they
 * arrived, so the word's shatter can fly to the weapon and the chip strike lands after it.
 *
 *  - `Hit{kind:"chip"}` is deferred by `chipDelayMs`.
 *  - Entity gate: while anything is pending for enemy E, a later event referencing E is deferred to
 *    just after the last pending one (+16 ms), so causal order is never inverted (a chip always
 *    presents before the same enemy's `EnemyDeath`, `Break`, ...).
 *  - `EncounterCleared`, `LevelCleared`, `LevelFailed` flush everything, in order, immediately.
 *
 * A fixed ring of 64 slots; nothing is allocated after construction. Events are stored by reference.
 * (Spec §11 puts this file under level/; it lives in render/vfx/ because level/ belongs to the level
 * runner task. The API is the spec's.)
 */
import type { SimEvent } from "@hd2d/sim";

export const CHIP_DELAY_MS = 380;
const GATE_GAP_MS = 16;
const CAP = 64;

/** The enemy an event is about, or -1. */
export function entityOf(e: SimEvent): number {
  switch (e.type) {
    case "Hit":
      return e.targetId;
    case "ShieldDamaged":
    case "Break":
    case "BreakEnded":
    case "WeaknessRevealed":
    case "EnemyDeath":
      return e.enemyId;
    case "StatusApplied":
    case "StatusEnded":
      return e.targetId;
    case "FocusChanged":
      return e.enemyId ?? -1;
    default:
      return -1;
  }
}

export class PresentationQueue {
  private readonly ev: (SimEvent | null)[] = new Array(CAP).fill(null);
  private readonly at = new Float64Array(CAP);
  private readonly seq = new Float64Array(CAP);
  private readonly ent = new Int32Array(CAP).fill(-1);
  private nextSeq = 0;
  count = 0;
  /** Events that were deferred and later presented (diagnostics). */
  presented = 0;

  /** Store `e` to be presented at `atMs` (queue clock). When full, the earliest arrival is replaced. */
  defer(e: SimEvent, atMs: number): void {
    let i = -1;
    for (let j = 0; j < CAP; j++)
      if (this.ev[j] === null) {
        i = j;
        break;
      }
    if (i < 0) {
      let m = 0;
      for (let j = 1; j < CAP; j++) if ((this.seq[j] as number) < (this.seq[m] as number)) m = j;
      i = m;
    } else this.count++;
    this.ev[i] = e;
    this.at[i] = atMs;
    this.seq[i] = this.nextSeq++;
    this.ent[i] = entityOf(e);
  }

  /** Latest pending time for entity `id`, or -1 when nothing is pending for it. */
  pendingUntil(id: number): number {
    let t = -1;
    for (let j = 0; j < CAP; j++)
      if (this.ev[j] !== null && this.ent[j] === id) t = Math.max(t, this.at[j] as number);
    return t;
  }

  /**
   * Decide what to do with an event that just arrived. Returns true when it was deferred (the caller
   * must NOT present it now; it comes out of `flush`). `chipDelayMs` 0 disables the chip deferral.
   */
  gate(e: SimEvent, nowMs: number, chipDelayMs: number = CHIP_DELAY_MS): boolean {
    const id = entityOf(e);
    const isChip = e.type === "Hit" && e.kind === "chip" && chipDelayMs > 0;
    const pend = id >= 0 ? this.pendingUntil(id) : -1;
    if (isChip) {
      this.defer(e, Math.max(nowMs + chipDelayMs, pend >= 0 ? pend + GATE_GAP_MS : 0));
      return true;
    }
    if (pend >= 0) {
      this.defer(e, Math.max(nowMs, pend + GATE_GAP_MS));
      return true;
    }
    return false;
  }

  /** Present every event that is due at `nowMs`, in (time, arrival) order. */
  flush(nowMs: number, sink: (e: SimEvent) => void): void {
    for (;;) {
      let best = -1;
      for (let j = 0; j < CAP; j++) {
        if (this.ev[j] === null || (this.at[j] as number) > nowMs) continue;
        if (
          best < 0 ||
          (this.at[j] as number) < (this.at[best] as number) ||
          ((this.at[j] as number) === (this.at[best] as number) &&
            (this.seq[j] as number) < (this.seq[best] as number))
        )
          best = j;
      }
      if (best < 0) return;
      const e = this.ev[best] as SimEvent;
      this.ev[best] = null;
      this.ent[best] = -1;
      this.count--;
      this.presented++;
      sink(e);
    }
  }

  /** Present everything now, in order (EncounterCleared / LevelCleared / LevelFailed). */
  flushAll(sink: (e: SimEvent) => void): void {
    this.flush(Number.POSITIVE_INFINITY, sink);
  }

  clear(): void {
    this.ev.fill(null);
    this.ent.fill(-1);
    this.count = 0;
  }
}

/** Events that flush the queue before they themselves are presented. */
export function flushesQueue(e: SimEvent): boolean {
  return e.type === "EncounterCleared" || e.type === "LevelCleared" || e.type === "LevelFailed";
}

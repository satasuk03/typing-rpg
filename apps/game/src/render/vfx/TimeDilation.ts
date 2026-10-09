/**
 * TimeDilation (spec §1.3, §7, §9.2): render-only time scaling. The sim is never affected; the level
 * runner passes `world.update(dt * td.scale(dt))`. The HUD and audio run in real time.
 *
 *   slow(f, holdMs, rampMs): world dt x f for holdMs, then eases back to 1 over rampMs (easeInQuad).
 *   hitStop(ms):             world dt x 0 for ms.
 */
export class TimeDilation {
  private slowF = 1;
  private slowHold = 0;
  private slowRamp = 0;
  private slowAge = 1e9;
  private stopLeft = 0;
  private cooldown = 0;
  /** Seconds between two time-slows (a second request inside it is skipped). */
  slowCooldownSec = 1.2;
  /** Current scale after the last `scale()` call. */
  current = 1;

  /** Returns false when skipped (cooldown or a no-op factor). */
  slow(factor: number, holdMs: number, rampMs: number): boolean {
    if (factor >= 0.999 || this.cooldown > 0) return false;
    this.slowF = factor;
    this.slowHold = holdMs / 1000;
    this.slowRamp = Math.max(1e-3, rampMs / 1000);
    this.slowAge = 0;
    this.cooldown = this.slowCooldownSec;
    return true;
  }

  hitStop(ms: number): void {
    this.stopLeft = Math.max(this.stopLeft, ms / 1000);
  }

  /** Advance by the real frame time and return the world time scale (0..1) for this frame. */
  scale(realDt: number): number {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - realDt);
    let s = 1;
    if (this.slowAge < this.slowHold + this.slowRamp) {
      const a = this.slowAge;
      if (a < this.slowHold) s = this.slowF;
      else {
        const u = (a - this.slowHold) / this.slowRamp;
        s = this.slowF + (1 - this.slowF) * u * u;
      }
      this.slowAge += realDt;
    }
    if (this.stopLeft > 0) {
      this.stopLeft = Math.max(0, this.stopLeft - realDt);
      s = 0;
    }
    this.current = s;
    return s;
  }

  get active(): boolean {
    return this.stopLeft > 0 || this.slowAge < this.slowHold + this.slowRamp;
  }

  reset(): void {
    this.slowAge = 1e9;
    this.stopLeft = 0;
    this.cooldown = 0;
    this.current = 1;
  }
}

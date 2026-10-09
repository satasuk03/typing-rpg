/**
 * Quality tiers and the auto-fallback controller.
 * Pure (no DOM, no three): the controller is fed frame times, so it is unit-testable.
 */

export type QualityTier = 0 | 1 | 2;

export interface QualitySettings {
  /** Internal render-target scale relative to the output size. */
  readonly scale: number;
  /** Depth-of-field gather samples. */
  readonly dofSamples: number;
  /** Number of bloom mip levels. */
  readonly bloomLevels: number;
  /** Separable blur iterations on the foreground layer. */
  readonly fgBlurPasses: number;
  /** Heat haze (screen-space distortion) enabled. */
  readonly heatHaze: boolean;
  /** Multiplier on ambient particle spawn rates. */
  readonly ambientDensity: number;
  /** Cast-shadow silhouette quads under actors. */
  readonly castShadows: boolean;
  /** Max pixel ratio the canvas uses. */
  readonly maxDpr: number;
}

/**
 * Tier 0 = full POC look. Tier 1 = 80% internal resolution, cheaper DOF/bloom.
 * Tier 2 = 64% internal resolution, 14-tap DOF, 4 bloom mips, one foreground blur pass,
 * no heat haze, no cast shadows and about a third of the ambient particles.
 */
export const QUALITY_TIERS: readonly [QualitySettings, QualitySettings, QualitySettings] = [
  {
    scale: 1,
    dofSamples: 28,
    bloomLevels: 6,
    fgBlurPasses: 2,
    heatHaze: true,
    ambientDensity: 1,
    castShadows: true,
    maxDpr: 2,
  },
  {
    scale: 0.8,
    dofSamples: 20,
    bloomLevels: 5,
    fgBlurPasses: 2,
    heatHaze: true,
    ambientDensity: 0.7,
    castShadows: true,
    maxDpr: 1.5,
  },
  {
    scale: 0.64,
    dofSamples: 14,
    bloomLevels: 4,
    fgBlurPasses: 1,
    heatHaze: false,
    ambientDensity: 0.35,
    castShadows: false,
    maxDpr: 1,
  },
];

export const MAX_TIER: QualityTier = 2;

export function tierSettings(tier: QualityTier): QualitySettings {
  return QUALITY_TIERS[tier];
}

export function isQualityTier(v: unknown): v is QualityTier {
  return v === 0 || v === 1 || v === 2;
}

export interface AutoQualityOptions {
  /** Frame-time budget in ms. p95 above this means the tier is too heavy. Default 20 (about 50 fps). */
  budgetMs: number;
  /** Rolling window length, in frames. */
  window: number;
  /** Minimum seconds between two tier changes. */
  cooldownSec: number;
  /** Upgrade only when p95 is below budgetMs * upgradeRatio (hysteresis band). */
  upgradeRatio: number;
  /** Seconds of sustained headroom needed before an upgrade is considered. */
  upgradeHoldSec: number;
  /** If we had to step down again within this many seconds of an upgrade, upgrades are disabled. */
  bounceLockSec: number;
  /** Frames longer than this are ignored (tab switch, debugger pause). */
  ignoreAboveMs: number;
}

export const DEFAULT_AUTO_QUALITY: AutoQualityOptions = {
  budgetMs: 20,
  window: 120,
  cooldownSec: 4,
  upgradeRatio: 0.55,
  upgradeHoldSec: 12,
  bounceLockSec: 30,
  ignoreAboveMs: 250,
};

/** p-th percentile (0..1) of a list of numbers, nearest-rank on a sorted copy. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

/**
 * Rolling frame-time monitor. Steps the tier DOWN (to a cheaper one) when the window p95 exceeds
 * the budget, and UP again only after sustained headroom (p95 under budget * upgradeRatio), with a
 * cooldown between changes and a bounce lock so it cannot oscillate between two tiers.
 */
export class AutoQuality {
  readonly opts: AutoQualityOptions;
  tier: QualityTier;
  enabled = true;
  private readonly frames: number[] = [];
  private clock = 0;
  private lastChange = Number.NEGATIVE_INFINITY;
  private lastUpgrade = Number.NEGATIVE_INFINITY;
  private headroomSince: number | null = null;
  private upgradesLocked = false;

  constructor(startTier: QualityTier = 0, opts: Partial<AutoQualityOptions> = {}) {
    this.opts = { ...DEFAULT_AUTO_QUALITY, ...opts };
    this.tier = startTier;
  }

  /** Current window p95 in ms (0 when the window is empty). */
  p95(): number {
    return percentile(this.frames, 0.95);
  }

  /** Force a tier (also clears the window so old samples do not trigger a change). */
  setTier(tier: QualityTier): void {
    this.tier = tier;
    this.frames.length = 0;
    this.headroomSince = null;
    this.lastChange = this.clock;
  }

  /**
   * Feed one frame time. Returns the new tier when it changed, otherwise null.
   * The controller keeps its own clock by summing the samples (no wall-clock access).
   */
  push(frameMs: number): QualityTier | null {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > this.opts.ignoreAboveMs) return null;
    this.clock += frameMs / 1000;
    this.frames.push(frameMs);
    if (this.frames.length > this.opts.window) this.frames.shift();
    if (!this.enabled || this.frames.length < this.opts.window) return null;
    if (this.clock - this.lastChange < this.opts.cooldownSec) return null;
    const p95 = this.p95();
    if (p95 > this.opts.budgetMs && this.tier < MAX_TIER) {
      if (this.clock - this.lastUpgrade < this.opts.bounceLockSec) this.upgradesLocked = true;
      return this.change((this.tier + 1) as QualityTier);
    }
    if (
      p95 < this.opts.budgetMs * this.opts.upgradeRatio &&
      this.tier > 0 &&
      !this.upgradesLocked
    ) {
      if (this.headroomSince === null) this.headroomSince = this.clock;
      if (this.clock - this.headroomSince >= this.opts.upgradeHoldSec) {
        this.lastUpgrade = this.clock;
        return this.change((this.tier - 1) as QualityTier);
      }
    } else {
      this.headroomSince = null;
    }
    return null;
  }

  private change(to: QualityTier): QualityTier {
    this.tier = to;
    this.lastChange = this.clock;
    this.frames.length = 0;
    this.headroomSince = null;
    return to;
  }
}

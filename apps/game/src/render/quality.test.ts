import { describe, expect, it } from "vitest";
import { AutoQuality, isQualityTier, percentile, QUALITY_TIERS, tierSettings } from "./quality";

function feed(q: AutoQuality, ms: number, frames: number): (0 | 1 | 2 | null)[] {
  const out: (0 | 1 | 2 | null)[] = [];
  for (let i = 0; i < frames; i++) out.push(q.push(ms));
  return out;
}

describe("quality tiers", () => {
  it("get strictly cheaper from tier 0 to 2", () => {
    const [a, b, c] = QUALITY_TIERS;
    expect(a.scale).toBeGreaterThan(b.scale);
    expect(b.scale).toBeGreaterThan(c.scale);
    expect(a.dofSamples).toBeGreaterThan(c.dofSamples);
    expect(a.bloomLevels).toBeGreaterThan(c.bloomLevels);
    expect(c.heatHaze).toBe(false);
    expect(tierSettings(0)).toBe(a);
  });
  it("validates tier values", () => {
    expect(isQualityTier(2)).toBe(true);
    expect(isQualityTier(3)).toBe(false);
    expect(isQualityTier("1")).toBe(false);
  });
});

describe("percentile", () => {
  it("handles empty, single and sorted lists", () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([7], 0.95)).toBe(7);
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 0.95)).toBe(95);
    expect(percentile(xs.reverse(), 0.5)).toBe(50);
  });
});

describe("AutoQuality", () => {
  it("does nothing before the window fills", () => {
    const q = new AutoQuality(0, { window: 60 });
    expect(feed(q, 40, 59).every((r) => r === null)).toBe(true);
    expect(q.tier).toBe(0);
  });

  it("steps down when p95 is over budget, one tier per cooldown", () => {
    const q = new AutoQuality(0, { window: 60, cooldownSec: 2 });
    const r = feed(q, 30, 60);
    expect(r.at(-1)).toBe(1);
    expect(q.tier).toBe(1);
    // Window was cleared and cooldown applies: needs a refill before it can step again.
    feed(q, 30, 59);
    expect(q.tier).toBe(1);
    feed(q, 30, 120);
    expect(q.tier).toBe(2);
    // Cannot go below the cheapest tier.
    feed(q, 60, 300);
    expect(q.tier).toBe(2);
  });

  it("ignores a few spikes: p95 stays under budget", () => {
    const q = new AutoQuality(0, { window: 100 });
    for (let i = 0; i < 200; i++) q.push(i % 25 === 0 ? 45 : 12);
    expect(q.tier).toBe(0);
  });

  it("ignores huge frames (tab switch) and invalid samples", () => {
    const q = new AutoQuality(0, { window: 30 });
    for (let i = 0; i < 100; i++) expect(q.push(5000)).toBeNull();
    expect(q.push(Number.NaN)).toBeNull();
    expect(q.push(-1)).toBeNull();
    expect(q.p95()).toBe(0);
  });

  it("does not upgrade in the hysteresis band (between 55% and 100% of budget)", () => {
    const q = new AutoQuality(1, { window: 60, cooldownSec: 1, upgradeHoldSec: 5 });
    feed(q, 16, 3000); // under budget (20) but above 55% of it (11)
    expect(q.tier).toBe(1);
  });

  it("upgrades only after sustained headroom", () => {
    const q = new AutoQuality(2, { window: 60, cooldownSec: 1, upgradeHoldSec: 5 });
    feed(q, 8, 200); // 1.6 s: not enough hold time yet
    expect(q.tier).toBe(2);
    feed(q, 8, 600); // plenty of time
    expect(q.tier).toBe(1);
  });

  it("bounce lock: a step down shortly after an upgrade disables further upgrades", () => {
    const q = new AutoQuality(1, {
      window: 60,
      cooldownSec: 1,
      upgradeHoldSec: 2,
      bounceLockSec: 60,
    });
    feed(q, 8, 400);
    expect(q.tier).toBe(0); // upgraded
    feed(q, 30, 20);
    expect(q.tier).toBe(1); // too heavy again, stepped down quickly
    feed(q, 8, 5000);
    expect(q.tier).toBe(1); // locked, no more upgrades
  });

  it("can be disabled and forced", () => {
    const q = new AutoQuality(0, { window: 30 });
    q.enabled = false;
    feed(q, 50, 300);
    expect(q.tier).toBe(0);
    q.setTier(2);
    expect(q.tier).toBe(2);
  });
});

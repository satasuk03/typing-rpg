import type { EnemyView } from "@hd2d/sim";
import { describe, expect, it, vi } from "vitest";
import { buildResultsModel, leakHintNote, sumLeakDamage } from "../../src/level/screens";

vi.mock("../../src/hud/skillIcons", async (orig) => {
  const m = await orig<typeof import("../../src/hud/skillIcons")>();
  return { ...m, getSkillIcon: () => ({ color: { tag: "icon" }, dim: { tag: "dim" } }) };
});

const { drawEnemyBars, drawBossPlate, leakBadgeLabel, enemyBarsRect } = await import(
  "../../src/hud/panels"
);
const { PopSystem, POP_LIFETIME, POP_STACK_STEP } = await import("../../src/hud/pops");

/** A recording 2D context: every method is a no-op returning a recorder; drawImage calls are counted. */
function recCtx(): { c: CanvasRenderingContext2D; images: () => number } {
  const state = { images: 0 };
  const noop = (): unknown =>
    new Proxy(() => noop(), { get: (_t, k) => (k === "addColorStop" ? () => {} : 0) });
  const c = new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k === "drawImage") return () => void state.images++;
      if (k === "measureText") return () => ({ width: 24 });
      if (k in t) return t[k];
      return noop();
    },
    set(t, k: string, v) {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { c, images: () => state.images };
}

const enemy = (over: Partial<EnemyView> = {}): EnemyView =>
  ({
    id: 1,
    defId: "g",
    slot: 0,
    isBoss: false,
    alive: true,
    hp: 10,
    maxHp: 10,
    hpFrac: 1,
    atbFrac: 0.5,
    plateId: null,
    isGuard: false,
    guardTicksLeft: 0,
    guardTotalTicks: 0,
    guardResult: null,
    shield: 0,
    shieldMax: 0,
    weaknesses: [],
    brokenTicksLeft: 0,
    statuses: [],
    isFocus: false,
    pose: "idle",
    poseSinceTick: 0,
    ...over,
  }) as EnemyView;

const pc = (c: CanvasRenderingContext2D) =>
  ({
    c,
    W: 1280,
    H: 720,
    time: 0,
    settings: { effectsIntensity: 1, reducedFlash: false, reducedMotion: false },
    heroHpTrail: 1,
    atbPulse: 0,
    atbIgnite: 0,
    comboPulse: 0,
    tierFlash: 0,
  }) as never;

const st = { hpFrac: 1, hpTrail: 1, atbFrac: 0.5 };

describe("cracked-shield leak badge", () => {
  it("label is null at leakBp 0 / undefined and a percent above 0", () => {
    expect(leakBadgeLabel({})).toBeNull();
    expect(leakBadgeLabel({ leakBp: 0 })).toBeNull();
    expect(leakBadgeLabel({ leakBp: 2000 })).toBe("20%");
    expect(leakBadgeLabel({ leakBp: 310 })).toBe("3%");
    expect(leakBadgeLabel({ leakBp: 5000 })).toBe("50%");
  });
  it("is drawn (one pixel icon) only when the enemy leaks", () => {
    const none = recCtx();
    drawEnemyBars(pc(none.c), enemy({ leakBp: 0 }), 400, 400, st);
    expect(none.images()).toBe(0);
    const some = recCtx();
    drawEnemyBars(pc(some.c), enemy({ leakBp: 2000 }), 400, 400, st);
    expect(some.images()).toBe(1);
  });
  it("is drawn on the boss plate only when the boss leaks", () => {
    const view = { boss: { name: "Ruin Golem", title: "t", phase: 1, gateHpFrac: null } } as never;
    const a = recCtx();
    drawBossPlate(pc(a.c), view, enemy({ isBoss: true, leakBp: 0 }), st);
    const b = recCtx();
    drawBossPlate(pc(b.c), view, enemy({ isBoss: true, leakBp: 2000 }), st);
    expect(b.images() - a.images()).toBe(1);
  });
  it("only a leaking enemy grows its plate keep-out rect", () => {
    expect(enemyBarsRect(100, 100)).toEqual(enemyBarsRect(100, 100, false));
    expect(enemyBarsRect(100, 100, true).y).toBeLessThan(enemyBarsRect(100, 100).y);
  });
});

describe("leak pop kind", () => {
  it("has a lifetime and stack step, and spawns", () => {
    expect(POP_LIFETIME.leak).toBeGreaterThan(0);
    expect(POP_STACK_STEP.leak).toBeGreaterThan(0);
    const ps = new PopSystem();
    expect(ps.spawn("leak", "-9", { kind: "hero" }).kind).toBe("leak");
  });
});

describe("results-screen leak hint", () => {
  it("sums leakDamage over guard events only", () => {
    expect(
      sumLeakDamage([
        { type: "GuardBlocked", leakDamage: 8 },
        { type: "GuardParried", leakDamage: 15 },
        { type: "GuardParried" },
        { type: "HeroDamaged", leakDamage: 99 },
        { type: "GuardBlocked", leakDamage: 0 },
      ]),
    ).toBe(23);
    expect(sumLeakDamage([])).toBe(0);
  });
  it("hint names the total; none when nothing leaked", () => {
    expect(leakHintNote(0)).toBeNull();
    expect(leakHintNote(23)).toContain("23");
    expect(leakHintNote(23)).toContain("Upgrade armor");
  });
  it("buildResultsModel appends the hint note only with leaked damage", () => {
    const result = {
      outcome: "failed",
      failReason: "defeated",
      words: [],
      chests: [],
      gold: 0,
      durationTicks: 600,
      stats: {
        netWpmX100: 4000,
        accuracyBp: 9500,
        maxCombo: 1,
        perfectWords: 0,
        secondWindUsed: false,
      },
    } as never;
    const def = { levelId: "ch1-l10", index: 10 } as never;
    expect(buildResultsModel(result, def, 40, new Set(), {}, 0).notes).toEqual([]);
    const n = buildResultsModel(result, def, 40, new Set(), { notes: ["x"] }, 23).notes;
    expect(n).toHaveLength(2);
    expect(n[1]).toContain("23");
  });
});

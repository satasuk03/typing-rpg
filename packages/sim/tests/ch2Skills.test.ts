// v2.0.3 (T1.4): Reveal (active) and Calm Mind (passive). Scholar is deferred (docs/interfaces.md ICP v2.0.3).
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { guardSpanTicks } from "../src/guard.ts";
import type { Gimmick, Loadout, ResolvedLevel } from "../src/index.ts";
import { Driver, mkLoadout, mkSimpleDef, POOL_CURRENT } from "./typingHarness.ts";

function gimmickDef(gimmicks: (Gimmick | null)[]): ResolvedLevel {
  const def = mkSimpleDef(
    gimmicks.map(() => "slime"),
    { current: POOL_CURRENT },
  );
  const seg = def.segments[0];
  if (seg?.kind !== "encounter") throw new Error("encounter expected");
  const wave = seg.waves[0] as { gimmick: Gimmick | null }[];
  gimmicks.forEach((g, i) => {
    (wave[i] as { gimmick: Gimmick | null }).gimmick = g;
  });
  return def;
}
const kit = (
  actives: Loadout["actives"],
  passives: Loadout["passives"] = [null, null, null],
  modes: Loadout["activeModes"] = ["smart", "smart"],
): Loadout => ({ ...mkLoadout("sword"), actives, passives, activeModes: modes });
const drive = (g: (Gimmick | null)[], l: Loadout, difficulty: "zen" | "standard" = "zen"): Driver =>
  new Driver(gimmickDef(g), 3, { difficulty }, l).toCombat();
const prime = (d: Driver): void => {
  d.state.run.skillChargeM[0] = K.SKILL_CHARGE_M.reveal;
  d.state.run.skillReady[0] = true;
};
const ASAP: Loadout["activeModes"] = ["asap", "smart"];

describe("Reveal", () => {
  test("rule: Reveal costs 8 words and lasts 8 s", () => {
    expect(K.SKILL_CHARGE_M.reveal).toBe(8000);
    expect(K.REVEAL_T).toBe(480);
  });

  test("rule: a faded plate gets its letters back at the impact tick, and the fade clock is cleared", () => {
    const d = drive(["fading"], kit(["reveal", null]));
    d.step(K.FADE_DELAY_T + 2);
    expect(d.plates()[0]?.faded).toBe(true);
    prime(d);
    d.step(K.SKILL_IMPACT_T + 2);
    expect(d.plates()[0]?.faded).toBe(false);
    expect(d.state.run.revealUntil).toBeDefined();
    expect(d.ofType("SkillCast")[0]).toMatchObject({ skillId: "reveal", targetIds: [] });
  });

  test("rule: a scrambled plate unscrambles (WordUnscrambled) when Reveal lands", () => {
    const d = drive(["scrambled"], kit(["reveal", null]));
    const p = d.plates()[0];
    expect(p?.display).not.toBe(p?.text);
    prime(d);
    const ev = d.step(K.SKILL_IMPACT_T + 2);
    expect(d.plates()[0]?.display).toBe(p?.text);
    expect(d.ofType("WordUnscrambled", ev)[0]).toMatchObject({ plateId: p?.id });
  });

  test("rule: while Reveal runs, new plates carry no gimmick; after it ends the gimmick returns", () => {
    const d = drive(["scrambled"], kit(["reveal", null]));
    prime(d);
    d.step(K.SKILL_IMPACT_T + 2);
    const first = d.plates()[0];
    d.type(first?.text ?? "");
    const next = d.plates()[0];
    expect(next?.id).not.toBe(first?.id);
    expect(next?.display).toBe(next?.text);
    expect(d.state.enc?.plates.find((p) => p.id === next?.id)?.gimmick).toBeNull();
    d.step(K.REVEAL_T + 2);
    d.type(d.plates()[0]?.text ?? "");
    const later = d.plates()[0];
    expect(d.state.enc?.plates.find((p) => p.id === later?.id)?.gimmick).toBe("scrambled");
  });

  test("rule: Reveal never casts when the fight has no gimmick (smart or ASAP)", () => {
    const plain = drive([null], kit(["reveal", null]));
    prime(plain);
    plain.step(120);
    expect(plain.ofType("SkillCast")).toHaveLength(0);
    const asap = drive([null], kit(["reveal", null], [null, null, null], ASAP));
    prime(asap);
    asap.step(120);
    expect(asap.ofType("SkillCast")).toHaveLength(0);
  });

  test("rule: smart Reveal waits until a plate is actually hiding its letters", () => {
    const d = drive(["fading"], kit(["reveal", null]));
    prime(d);
    d.step(10);
    expect(d.ofType("SkillCast")).toHaveLength(0);
    d.step(K.FADE_DELAY_T);
    expect(d.ofType("SkillCast")).toHaveLength(1);
  });

  test("rule: ASAP casts as soon as a gimmick enemy is alive; a running Reveal is not recast", () => {
    const d = drive(["fading"], kit(["reveal", null], [null, null, null], ASAP));
    prime(d);
    d.step(5);
    expect(d.ofType("SkillCast")).toHaveLength(1);
    prime(d); // charged again while Reveal still runs
    d.step(60);
    expect(d.ofType("SkillCast")).toHaveLength(1);
  });

  test("rule: Reveal deals no damage and adds nothing to the per-skill damage table", () => {
    const d = drive(["fading"], kit(["reveal", null], [null, null, null], ASAP));
    prime(d);
    d.step(K.SKILL_IMPACT_T + 2);
    expect(d.ofType("Hit")).toHaveLength(0);
    expect(Object.keys(d.state.run.stats.damageBySkillM)).not.toContain("reveal");
  });

  test("rule: Reveal charges from words like any active", () => {
    const d = drive(["fading"], kit(["reveal", null]));
    for (let i = 0; i < 8; i++) d.type(d.plates()[0]?.text ?? "");
    expect(d.ofType("SkillCharged").some((e) => e.skillId === "reveal")).toBe(true);
  });

  test("rule: a run that never casts Reveal has no revealUntil key (Ch1 state stays byte-identical)", () => {
    const d = drive(["fading"], kit(["fireball", null]));
    d.step(200);
    expect("revealUntil" in d.state.run).toBe(false);
  });
});

describe("Calm Mind", () => {
  test("rule: Calm Mind adds exactly CALM_MIND_GUARD_T (0.5 s = 30 ticks) to every guard span", () => {
    expect(K.CALM_MIND_GUARD_T).toBe(30);
    const without = drive([null], kit([null, null]), "standard");
    const withCm = drive([null], kit([null, null], ["calmMind", null, null]), "standard");
    expect(guardSpanTicks(withCm.state) - guardSpanTicks(without.state)).toBe(30);
  });

  test("rule: the guard word is shown 0.5 s earlier with Calm Mind (a longer telegraph)", () => {
    const span = (l: Loadout): number => {
      const d = drive([null], l, "standard");
      d.until("GuardWordShown", 5000);
      const w = d.ofType("EnemyAttackWindup")[0];
      return (w?.impactTick ?? -1) - (w?.tick ?? 0);
    };
    expect(span(kit([null, null], ["calmMind", null, null])) - span(kit([null, null]))).toBe(30);
  });
});

// T4.3 / T4.2: the real Chapter 2 content (enemies, the Whispering Willow, ch2-l01..l10).
import { describe, expect, test } from "vitest";
import { contentBundle, knobsFor, LEVELS_CH2, WILLOW_FINISHER_TEXT } from "../src/index.ts";

const enemy = (id: string) => contentBundle.enemies.find((e) => e.id === id);

describe("Ch2 roster", () => {
  test("ids carry the creature substrings the audio matches; sprites are the ch2 art keys", () => {
    for (const [sub, art] of [
      ["wisp", "wisp"],
      ["shade", "shade"],
      ["moth", "moth"],
      ["toad", "toad"],
      ["wolf", "wolf"],
      ["willow", "willow"],
    ] as const) {
      const e = contentBundle.enemies.find((x) => x.id.includes(sub));
      expect(e, sub).toBeDefined();
      expect(e?.spriteId).toBe(art);
    }
  });
  test("the Moth Mender is the only healer", () => {
    expect(contentBundle.enemies.filter((e) => e.heal).map((e) => e.id)).toEqual(["moth-mender"]);
  });
  test("elites are Gloom Wolf refs with the chapter's elite Attack Power; at most one healer per encounter", () => {
    const k = knobsFor(2);
    for (const l of LEVELS_CH2) {
      for (const s of l.segments) {
        if (s.kind !== "encounter") continue;
        let healers = 0;
        for (const r of s.encounter.waves.flat()) {
          if (r.enemy === "moth-mender") healers++;
          if (r.elite) {
            expect(r.enemy).toBe("gloom-wolf");
            expect(r.attackPower).toBe(k.eliteAttackPower);
          }
        }
        expect(healers).toBeLessThanOrEqual(1);
      }
    }
    expect(enemy("gloom-wolf")).toBeDefined();
  });
});

describe("the Whispering Willow", () => {
  const boss = contentBundle.bosses.find((b) => b.id === "whispering-willow");
  test("script: fading Shade + Mender adds, Hush Spells, 5 riddles then the finisher", () => {
    expect(boss).toBeDefined();
    expect(boss?.phase1.adds.map((a) => a.enemy)).toEqual(["hush-shade", "moth-mender"]);
    expect(boss?.phase1.adds[0]?.gimmick).toBe("fading");
    expect(boss?.attackPower).toBe(1.3);
    expect(boss?.phase1.addsAttackPower).toBe(1.25);
    const mg = boss?.phase3.minigame;
    expect(mg?.kind).toBe("riddle");
    if (mg?.kind === "riddle") expect(mg.count).toBe(5);
    expect(boss?.phase3.finisherText).toBe(WILLOW_FINISHER_TEXT);
  });
  test("L10 ends with the Willow", () => {
    const l10 = LEVELS_CH2[9];
    const last = l10?.segments[l10.segments.length - 1];
    expect(last).toEqual({ kind: "boss", bossId: "whispering-willow" });
  });
});

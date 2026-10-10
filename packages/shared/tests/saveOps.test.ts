import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  CHOICE_PLAYTIME_SEC,
  decodeSaveWire,
  encodeSaveWire,
  jsonEqual,
  mergeSaves,
  migrateSave,
  SaveBlob,
  SaveVersionError,
  summarize,
} from "../src/index.ts";
import { blankSave, play, rng } from "./saveGen.ts";

describe("fixtures", () => {
  // One fixture blob per schema version: each must migrate to the latest version and parse.
  for (const f of readdirSync(join(import.meta.dirname, "fixtures")).filter((x) =>
    x.startsWith("save-v"),
  )) {
    test(f, () => {
      const raw = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", f), "utf8"));
      expect(migrateSave(raw).schemaVersion).toBe(2);
    });
  }
});

describe("migrateSave / summarize", () => {
  test("parses a v1 blob, rejects junk, refuses a newer version", () => {
    const b = blankSave();
    expect(migrateSave(JSON.parse(JSON.stringify(b)))).toEqual(b);
    expect(() => migrateSave(null)).toThrow();
    expect(() => migrateSave({})).toThrow();
    expect(() => migrateSave({ ...b, schemaVersion: 0 })).toThrow();
    expect(() => migrateSave({ ...b, wallet: { gold: -1 } })).toThrow();
    try {
      migrateSave({ ...b, schemaVersion: 3 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SaveVersionError);
    }
  });

  test("summarize", () => {
    const b = blankSave();
    b.playtimeSec = 99;
    b.progress.levels["ch1-l03"] = {
      cleared: true,
      stars: [true, true, false],
      bestTicks: 5,
      attempts: 2,
    };
    b.progress.levels["ch2-l01"] = {
      cleared: true,
      stars: [true, false, false],
      bestTicks: null,
      attempts: 1,
    };
    b.progress.levels["ch2-l02"] = {
      cleared: false,
      stars: [true, false, false],
      bestTicks: null,
      attempts: 1,
    };
    expect(summarize(b)).toEqual({ schemaVersion: 2, levelMax: 201, stars: 4, playtimeSec: 99 });
    expect(summarize(blankSave()).levelMax).toBe(0);
  });
});

describe("schema v2: journal notes + resetEpoch", () => {
  test("a v1 blob (no notes, no epoch) migrates with empty notes and epoch 0", () => {
    const v2 = blankSave();
    const { resetEpoch: _e, ...rest } = v2;
    const v1 = { ...rest, schemaVersion: 1, journal: { firstSeen: { hello: 3 } } };
    const m = migrateSave(v1);
    expect(m.schemaVersion).toBe(2);
    expect(m.resetEpoch).toBe(0);
    expect(m.journal).toEqual({ firstSeen: { hello: 3 }, notes: {} });
  });

  test("notes round-trip through the wire codec", async () => {
    const b = blankSave();
    b.journal.notes = { hello: "hola", wörd: "palabra ✓" };
    const back = migrateSave(await decodeSaveWire(await encodeSaveWire(b)));
    expect(back.journal.notes).toEqual(b.journal.notes);
  });

  test("limits: note length, key length, count", () => {
    const b = blankSave();
    expect(() =>
      migrateSave({ ...b, journal: { ...b.journal, notes: { a: "x".repeat(121) } } }),
    ).toThrow();
    expect(() => migrateSave({ ...b, journal: { ...b.journal, notes: { a: "" } } })).toThrow();
    expect(() =>
      migrateSave({ ...b, journal: { ...b.journal, notes: { ["k".repeat(65)]: "x" } } }),
    ).toThrow();
    const many = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`k${i}`, "x"]));
    expect(() => migrateSave({ ...b, journal: { ...b.journal, notes: many } })).toThrow();
    const ok = Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [`k${i}`, "x".repeat(120)]),
    );
    expect(migrateSave({ ...b, journal: { ...b.journal, notes: ok } }).journal.notes).toEqual(ok);
  });

  test("notes merge three-way: a changed side wins, deletes propagate, no base = union", () => {
    const base = blankSave();
    base.journal.notes = { a: "1", b: "2", c: "3" };
    const l = structuredClone(base);
    const s = structuredClone(base);
    l.journal.notes.a = "L";
    delete l.journal.notes.b;
    s.journal.notes.c = "S";
    s.journal.notes.d = "new";
    expect(mergeSaves(base, l, s).merged.journal.notes).toEqual({ a: "L", c: "S", d: "new" });
    const lo = blankSave();
    lo.journal.notes = { a: "L" };
    const se = blankSave();
    se.journal.notes = { a: "S", z: "Z" };
    expect(mergeSaves(null, lo, se).merged.journal.notes).toEqual({ a: "L", z: "Z" });
  });

  test("a higher resetEpoch (New Game) beats an older-generation blob, whichever side it is on", () => {
    const old = blankSave();
    old.playtimeSec = 99_999;
    old.wallet.gold = 5000;
    old.progress.levels["ch1-l01"] = {
      cleared: true,
      stars: [true, true, true],
      bestTicks: 1,
      attempts: 9,
    };
    old.journal.firstSeen = { hello: 1 };
    old.journal.notes = { hello: "hola" };
    const fresh = blankSave();
    fresh.resetEpoch = 1;
    fresh.settings.effectsIntensity = 0.5;
    old.settings.effectsIntensity = 0.9;
    for (const [l, s] of [
      [fresh, old],
      [old, fresh],
    ] as const) {
      const m = mergeSaves(old, l, s);
      expect(m.needsUserChoice).toBe(false);
      expect(m.merged.resetEpoch).toBe(1);
      expect(m.merged.progress.levels).toEqual({});
      expect(m.merged.wallet.gold).toBe(0);
      expect(m.merged.journal).toEqual({ firstSeen: {}, notes: {} });
      expect(m.merged.settings.effectsIntensity).toBe(l.settings.effectsIntensity);
    }
  });
});

describe("mergeSaves: rules", () => {
  test("monotonic fields: levels, chests (set union), unlocks, journal, lifetime", () => {
    const base = blankSave();
    const l = blankSave();
    const s = blankSave();
    l.progress.levels["ch1-l01"] = {
      cleared: true,
      stars: [true, false, false],
      bestTicks: 900,
      attempts: 3,
    };
    s.progress.levels["ch1-l01"] = {
      cleared: false,
      stars: [false, true, false],
      bestTicks: 700,
      attempts: 5,
    };
    s.progress.levels["ch1-l02"] = {
      cleared: true,
      stars: [true, true, true],
      bestTicks: null,
      attempts: 1,
    };
    l.progress.starChestsClaimed = { "1": [10] };
    s.progress.starChestsClaimed = { "1": [20], "2": [10] };
    l.progress.frontierChapter = 2;
    l.unlocks.actives = ["fireball"];
    s.unlocks.actives = ["aegis", "fireball"];
    l.journal.firstSeen = { cat: 5 };
    s.journal.firstSeen = { cat: 3, dog: 9 };
    l.lifetime = { words: 10, chars: 50, typos: 9 };
    s.lifetime = { words: 20, chars: 40, typos: 1 };
    l.playtimeSec = 100;
    s.playtimeSec = 300;
    const { merged: m } = mergeSaves(base, l, s);
    expect(m.progress.levels["ch1-l01"]).toEqual({
      cleared: true,
      stars: [true, true, false],
      bestTicks: 700,
      attempts: 5,
    });
    expect(m.progress.levels["ch1-l02"]?.stars).toEqual([true, true, true]);
    expect(m.progress.starChestsClaimed).toEqual({ "1": [10, 20], "2": [10] });
    expect(m.progress.frontierChapter).toBe(2);
    expect(m.unlocks.actives).toEqual(["fireball", "aegis"]);
    expect(m.journal.firstSeen).toEqual({ cat: 3, dog: 9 });
    expect(m.lifetime).toEqual({ words: 20, chars: 50, typos: 9 });
    expect(m.playtimeSec).toBe(300);
    expect(SaveBlob.safeParse(m).success).toBe(true);
  });

  test("settings come from local; accuracyDaily unions by day keeping the higher value", () => {
    const l = blankSave();
    const s = blankSave();
    l.settings.effectsIntensity = 0.2;
    s.settings.effectsIntensity = 0.9;
    l.accuracyDaily = [{ day: "2026-01-01", accuracyBp: 9000 }];
    s.accuracyDaily = [
      { day: "2026-01-01", accuracyBp: 9500 },
      { day: "2026-01-02", accuracyBp: 8000 },
    ];
    const m = mergeSaves(null, l, s).merged;
    expect(m.settings.effectsIntensity).toBe(0.2);
    expect(m.accuracyDaily).toEqual([
      { day: "2026-01-01", accuracyBp: 9500 },
      { day: "2026-01-02", accuracyBp: 8000 },
    ]);
  });

  test("SRS: side with more levelsPlayed wins, other's extra entries added, mastered unioned and removed from entries", () => {
    const l = blankSave();
    const s = blankSave();
    l.srs = {
      levelsPlayed: 5,
      entries: { cat: { box: 2, due: 6, lapses: 0 }, dog: { box: 1, due: 5, lapses: 1 } },
      mastered: [],
    };
    s.srs = {
      levelsPlayed: 9,
      entries: { cat: { box: 4, due: 12, lapses: 0 }, sun: { box: 3, due: 10, lapses: 0 } },
      mastered: ["dog"],
    };
    const m = mergeSaves(null, l, s).merged.srs;
    expect(m.levelsPlayed).toBe(9);
    expect(m.entries.cat?.box).toBe(4); // from the side with more levelsPlayed
    expect(m.entries.sun).toBeDefined();
    expect(m.entries.dog).toBeUndefined(); // mastered on the server -> removed from entries
    expect(m.mastered).toEqual(["dog"]);
    const m2 = mergeSaves(null, s, l).merged.srs;
    expect(m2.entries.cat?.box).toBe(4);
    expect(m2.mastered).toEqual(["dog"]);
  });

  test("fungible group: only one side changed vs base -> that side (never summed)", () => {
    const base = blankSave();
    base.wallet.gold = 100;
    const l = JSON.parse(JSON.stringify(base)) as typeof base;
    const s = JSON.parse(JSON.stringify(base)) as typeof base;
    s.wallet.gold = 160; // the server side earned
    s.inventory.gear.push({ uid: 1, defId: "w-sword", rarity: "C", upgrade: 0 });
    s.inventory.nextGearUid = 2;
    l.progress.levels["ch1-l01"] = {
      cleared: true,
      stars: [false, false, false],
      bestTicks: 1,
      attempts: 1,
    };
    const r = mergeSaves(base, l, s);
    expect(r.merged.wallet.gold).toBe(160);
    expect(r.merged.inventory.gear).toHaveLength(1);
    expect(r.merged.progress.levels["ch1-l01"]).toBeDefined(); // monotonic data still merged
    const flipped = mergeSaves(base, s, l); // local is the one that changed
    expect(flipped.merged.wallet.gold).toBe(160);
    expect(flipped.merged.inventory.gear).toHaveLength(1);
  });

  test("fungible group: both changed (or no base) -> the side with more playtime, as ONE unit", () => {
    const base = blankSave();
    base.wallet.gold = 100;
    const l = JSON.parse(JSON.stringify(base)) as typeof base;
    const s = JSON.parse(JSON.stringify(base)) as typeof base;
    l.wallet.gold = 150;
    l.playtimeSec = 600;
    s.wallet.gold = 400;
    s.inventory.unopenedCaches = 3;
    s.playtimeSec = 900;
    const r = mergeSaves(base, l, s);
    expect(r.merged.wallet.gold).toBe(400);
    expect(r.merged.inventory.unopenedCaches).toBe(3);
    expect(r.needsUserChoice).toBe(false);
    // no base: same rule; tie -> local
    expect(mergeSaves(null, l, s).merged.wallet.gold).toBe(400);
    s.playtimeSec = 600;
    expect(mergeSaves(null, l, s).merged.wallet.gold).toBe(150);
  });

  test("needsUserChoice when both sides diverged and each gained > 30 min", () => {
    const base = blankSave();
    base.playtimeSec = 1000;
    const l = JSON.parse(JSON.stringify(base)) as typeof base;
    const s = JSON.parse(JSON.stringify(base)) as typeof base;
    l.wallet.gold = 10;
    s.wallet.gold = 20;
    l.playtimeSec = base.playtimeSec + CHOICE_PLAYTIME_SEC + 1;
    s.playtimeSec = base.playtimeSec + CHOICE_PLAYTIME_SEC + 5;
    expect(mergeSaves(base, l, s).needsUserChoice).toBe(true);
    s.playtimeSec = base.playtimeSec + 60;
    expect(mergeSaves(base, l, s).needsUserChoice).toBe(false);
    // identical fungible state: nothing to choose
    s.playtimeSec = base.playtimeSec + CHOICE_PLAYTIME_SEC + 5;
    s.wallet.gold = 10;
    expect(mergeSaves(base, l, s).needsUserChoice).toBe(false);
  });

  test("inputs are not mutated", () => {
    const l = play(blankSave(), rng(1));
    const s = play(blankSave(), rng(2));
    const lc = JSON.stringify(l);
    const sc = JSON.stringify(s);
    mergeSaves(null, l, s);
    expect(JSON.stringify(l)).toBe(lc);
    expect(JSON.stringify(s)).toBe(sc);
  });
});

describe("mergeSaves: properties (seeded, 400 cases)", () => {
  const FUNG = [
    "wallet",
    "inventory",
    "equipped",
    "loadout",
    "cachePity",
    "metaRng",
    "replays",
  ] as const;
  const fung = (x: SaveBlob) => Object.fromEntries(FUNG.map((k) => [k, x[k]]));

  for (let seed = 1; seed <= 400; seed++) {
    // a random history: a common base, then two divergent plays (some with no common base)
    const r = rng(seed * 7919);
    let base = blankSave();
    for (let i = 0; i < Math.floor(r() * 4); i++) base = play(base, r);
    let l = base;
    let s = base;
    for (let i = 0; i < Math.floor(r() * 4); i++) l = play(l, r);
    for (let i = 0; i < Math.floor(r() * 4); i++) s = play(s, r);
    const useBase = r() < 0.7 ? base : null;

    test(`case ${seed}`, () => {
      const { merged } = mergeSaves(useBase, l, s);
      // valid
      expect(SaveBlob.safeParse(merged).success).toBe(true);
      // idempotent: merging the result with the same other side again changes nothing
      const again = mergeSaves(useBase, merged, s).merged;
      expect(again).toEqual(merged);
      const again2 = mergeSaves(useBase, l, merged).merged;
      expect(again2).toEqual(mergeSaves(useBase, l, merged).merged); // deterministic
      // never loses a claimed chest, a cleared level, a star, an unlock, a mastered word
      for (const side of [l, s]) {
        for (const [ch, ms] of Object.entries(side.progress.starChestsClaimed)) {
          for (const m of ms) expect(merged.progress.starChestsClaimed[ch]).toContain(m);
        }
        for (const [id, lv] of Object.entries(side.progress.levels)) {
          const m = merged.progress.levels[id];
          expect(m).toBeDefined();
          if (lv.cleared) expect(m?.cleared).toBe(true);
          lv.stars.forEach((st, i) => {
            if (st) expect(m?.stars[i]).toBe(true);
          });
          expect(m?.attempts ?? 0).toBeGreaterThanOrEqual(lv.attempts);
        }
        for (const u of side.unlocks.actives) expect(merged.unlocks.actives).toContain(u);
        for (const w of side.srs.mastered) expect(merged.srs.mastered).toContain(w);
        expect(merged.playtimeSec).toBeGreaterThanOrEqual(side.playtimeSec);
        expect(merged.lifetime.words).toBeGreaterThanOrEqual(side.lifetime.words);
        expect(merged.progress.frontierChapter).toBeGreaterThanOrEqual(
          side.progress.frontierChapter,
        );
      }
      // mastered words are never also SRS entries
      for (const w of merged.srs.mastered) expect(merged.srs.entries[w]).toBeUndefined();
      // fungible gains are never duplicated or mixed: the group equals EXACTLY one side's group
      expect(jsonEqual(fung(merged), fung(l)) || jsonEqual(fung(merged), fung(s))).toBe(true);
      const uids = merged.inventory.gear.map((g) => g.uid);
      expect(new Set(uids).size).toBe(uids.length);
      // total gold is never the sum of both sides' gains
      if (!jsonEqual(fung(l), fung(s))) {
        expect(merged.wallet.gold === l.wallet.gold || merged.wallet.gold === s.wallet.gold).toBe(
          true,
        );
      }
    });
  }
});

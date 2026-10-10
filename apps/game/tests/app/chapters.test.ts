// T1.1 client plumbing: levelUnlocked by id, frontier chapter on load and after a result, caseAssist -> LevelOptions.
import { contentBundle } from "@hd2d/content";
import { describe, expect, it } from "vitest";
import { needsWillowHint, WILLOW_HINT } from "../../src/app/chapters";
import { levelUnlocked, newSave, type Save, withFrontier } from "../../src/meta/ops";
import { SaveStore } from "../../src/meta/save";
import { ApiClient, AuthManager, MemoryStore, SaveSync } from "../../src/net/index.ts";
import { FakeServer } from "../net/fakeServer";

const two = contentBundle;
const ch1Only = { ...contentBundle, levels: contentBundle.levels.filter((l) => l.chapter === 1) };
const ch1Ids = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);

function savedWithCleared(ids: string[], bundle = two): Save {
  const s = newSave(1000, 7, bundle);
  for (const id of ids)
    s.progress.levels[id] = {
      cleared: true,
      stars: [true, false, false],
      bestTicks: 100,
      attempts: 1,
    };
  return s;
}

function net(server: FakeServer, store = new MemoryStore()) {
  const api = new ApiClient({
    baseUrl: "http://api.test",
    fetch: server.fetch,
    sleep: async () => {},
    baseDelayMs: 1,
    maxAttempts: 2,
  });
  const auth = new AuthManager({ api, store, now: () => server.now });
  const sync = new SaveSync({ api, auth, store, setTimer: () => 0, clearTimer: () => {} });
  return { sync, store };
}

describe("levelUnlocked (by id)", () => {
  it("ch1-l01 open; Ch2 opens on ch1-l10, then chains", () => {
    expect(levelUnlocked(savedWithCleared([]), two, "ch1-l01")).toBe(true);
    expect(levelUnlocked(savedWithCleared([]), two, "ch2-l01")).toBe(false);
    expect(levelUnlocked(savedWithCleared(ch1Ids), two, "ch2-l01")).toBe(true);
    expect(levelUnlocked(savedWithCleared(ch1Ids), two, "ch2-l02")).toBe(false);
    expect(levelUnlocked(savedWithCleared([...ch1Ids, "ch2-l01"]), two, "ch2-l02")).toBe(true);
  });
  it("is independent of the bundle's array order", () => {
    const rev = { ...two, levels: [...two.levels].reverse() };
    expect(levelUnlocked(savedWithCleared(ch1Ids), rev, "ch2-l01")).toBe(true);
    expect(levelUnlocked(savedWithCleared([]), rev, "ch1-l01")).toBe(true);
  });
});

describe("withFrontier / SaveStore.open (old saves open Ch2 with no migration)", () => {
  it("derives frontier 2 from a Ch1-cleared save, and leaves others alone", () => {
    const old = savedWithCleared(ch1Ids);
    expect(old.progress.frontierChapter).toBe(1);
    expect(withFrontier(old, two).progress.frontierChapter).toBe(2);
    const fresh = savedWithCleared([]);
    expect(withFrontier(fresh, two)).toBe(fresh);
    // the shipped Ch1-only bundle has nothing to open yet
    expect(withFrontier(old, ch1Only)).toBe(old);
  });
  it("applies on load", async () => {
    const n = net(new FakeServer());
    await n.sync.setLocal(savedWithCleared(ch1Ids));
    const store = await SaveStore.open(n, {
      syncWaitMs: 0,
      now: () => 1000,
      seed: () => 7,
      bundle: two,
    });
    expect(store.save.progress.frontierChapter).toBe(2);
  });
});

describe("caseAssist wiring", () => {
  const open = async (assist: boolean) => {
    const n = net(new FakeServer());
    const s = savedWithCleared([]);
    s.settings.caseAssist = assist;
    await n.sync.setLocal(s);
    return SaveStore.open(n, { syncWaitMs: 0, now: () => 1000, seed: () => 7, bundle: two });
  };
  it("the key is absent unless the setting is on", async () => {
    const off = (await open(false)).runConfig("ch1-l01", { seed: 1 });
    expect("caseAssist" in off.options).toBe(false);
    const on = (await open(true)).runConfig("ch1-l01", { seed: 1 });
    expect(on.options.caseAssist).toBe(true);
  });
});

describe("Q2 Willow loadout hint", () => {
  const save = (unlocked: string[], equipped: (string | null)[]): Save => {
    const s = newSave(1000, 7, two);
    s.unlocks.actives = unlocked;
    s.loadout.actives = equipped as Save["loadout"]["actives"];
    return s;
  };
  it("shows only on ch2-l10 with Aegis unlocked and not equipped", () => {
    expect(needsWillowHint(save(["aegis"], [null, null]), "ch2-l10")).toBe(true);
    expect(needsWillowHint(save(["aegis"], ["fireball", null]), "ch2-l10")).toBe(true);
    expect(needsWillowHint(save(["aegis"], ["aegis", null]), "ch2-l10")).toBe(false);
    expect(needsWillowHint(save(["aegis"], [null, "aegis"]), "ch2-l10")).toBe(false);
    expect(needsWillowHint(save([], [null, null]), "ch2-l10")).toBe(false);
    expect(needsWillowHint(save(["aegis"], [null, null]), "ch2-l09")).toBe(false);
    expect(needsWillowHint(save(["aegis"], [null, null]), "ch1-l10")).toBe(false);
  });
  it("uses the PO wording", () => {
    expect(WILLOW_HINT).toBe(
      "The Willow's adds hit hard. A defensive skill such as Aegis helps here.",
    );
  });
});

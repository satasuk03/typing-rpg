// Typing-only level plumbing: generated tables, timeout, results, views. (Typing rules live in typing.test.ts.)
import { describe, expect, test } from "vitest";
import { K } from "../src/balance.ts";
import { getResult, MAX_LEVEL_TICKS, replay } from "../src/index.ts";
import { Driver, mkDef, mkLoadout, mkOptions, scriptedSession } from "./typingHarness.ts";

describe("level timeout and results", () => {
  test("the level timeout equals the replay runner's MAX_LEVEL_TICKS", () => {
    expect(K.LEVEL_TIMEOUT_T).toBe(MAX_LEVEL_TICKS);
  });

  test("a level that never ends fails with timeout at MAX_LEVEL_S", () => {
    const def = mkDef({ segments: [{ kind: "walk", ticks: MAX_LEVEL_TICKS * 2, heal: false }] });
    const res = replay(def, mkLoadout(), 1, mkOptions(), []);
    expect(res.result).toMatchObject({ outcome: "failed", failReason: "timeout" });
    expect(res.events.at(-1)).toMatchObject({ type: "LevelFailed", reason: "timeout" });
    expect(res.finalState.tick).toBe(MAX_LEVEL_TICKS);
  });

  test("replay ignores inputs after the level became terminal", () => {
    const def = mkDef({ segments: [{ kind: "walk", ticks: 10, heal: false }] });
    const res = replay(def, mkLoadout(), 1, mkOptions(), [
      { tick: 5, cmd: "abandon" },
      { tick: 50, key: "a" },
    ]);
    expect(res.result?.failReason).toBe("abandoned");
  });

  test("getResult is null until the level is terminal, then reports the typing stats", () => {
    const def = mkDef();
    const { driver } = scriptedSession(3, def);
    const r = getResult(driver.state);
    expect(r).not.toBeNull();
    expect(r?.outcome).toBe("cleared");
    expect(r?.stats.wordsCompleted).toBe(driver.ofType("WordCompleted").length);
    expect(r?.words).toHaveLength(driver.ofType("WordCompleted").length);
    expect(r?.stats.correctChars).toBe(driver.ofType("CharCorrect").length);
    expect(r?.stats.typos).toBe(driver.ofType("Typo").length);
    expect(getResult(new Driver(def, 3).state)).toBeNull();
  });

  test("getView reports phases, enemies and plates without mutating state", () => {
    const def = mkDef();
    const d = new Driver(def, 3, { difficulty: "zen" });
    d.step();
    expect(d.view().phase).toBe("walk");
    d.step(130);
    expect(d.view().phase).toBe("encounterIntro");
    d.toCombat();
    const v = d.view();
    expect(v.enemies.length).toBeGreaterThan(0);
    expect(v.plates.length).toBe(v.enemies.filter((e) => e.alive).length);
    expect(v.comboMode).toBe("gentle");
    const before = JSON.stringify(d.state);
    d.view();
    expect(JSON.stringify(d.state)).toBe(before);
  });

  test("events never go out of tick order across a whole scripted level", () => {
    const { driver } = scriptedSession(9, mkDef());
    let last = 0;
    for (const e of driver.all) {
      expect(e.tick).toBeGreaterThanOrEqual(last);
      last = e.tick;
    }
    expect(driver.all[0]?.type).toBe("LevelStarted");
    expect(driver.all.at(-1)?.type).toBe("LevelCleared");
  });
});

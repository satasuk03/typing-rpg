// T3.4: chapter tabs state, the Ch2 intro lines, the "intro seen" flag (existing save field), caseAssist; with the
// tools' Ch2 stub bundle so it keeps working the moment T4.3 ships real Ch2 levels.
import { contentBundle, withCh2Stubs } from "@hd2d/content";
import { mergeSaves } from "@hd2d/shared";
import { describe, expect, it } from "vitest";
import { chapterState, defaultChapter, introChapterOf, introLines } from "../../src/app/chapters";
import {
  introSeen,
  introSeenKey,
  isFlagKey,
  markIntroSeen,
  newSave,
  type Save,
} from "../../src/meta/ops";
import { SaveStore } from "../../src/meta/save";
import { ApiClient, AuthManager, MemoryStore, SaveSync } from "../../src/net/index.ts";
import { FakeServer } from "../net/fakeServer";

const two = withCh2Stubs(contentBundle);
const ch1Ids = Array.from({ length: 10 }, (_, i) => `ch1-l${String(i + 1).padStart(2, "0")}`);

function withCleared(ids: string[]): Save {
  const s = newSave(1000, 7, two);
  for (const id of ids)
    s.progress.levels[id] = {
      cleared: true,
      stars: [true, false, false],
      bestTicks: 9,
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
const open = (n: ReturnType<typeof net>) =>
  SaveStore.open(n, { syncWaitMs: 0, now: () => 1000, seed: () => 7, bundle: two });

describe("chapter tabs", () => {
  it("the shipped Ch1-only bundle shows Ch2 as coming soon", () => {
    const s = withCleared(ch1Ids);
    if (contentBundle.levels.some((l) => l.chapter === 2)) return; // T4.3 landed: covered by the stub cases below
    expect(chapterState(s, contentBundle, 1)).toBe("open");
    expect(chapterState(s, contentBundle, 2)).toBe("soon");
  });
  it("with the stub bundle Ch2 is locked until ch1-l10 is cleared, then open", () => {
    expect(chapterState(withCleared([]), two, 1)).toBe("open");
    expect(chapterState(withCleared([]), two, 2)).toBe("locked");
    expect(chapterState(withCleared(ch1Ids.slice(0, 9)), two, 2)).toBe("locked");
    expect(chapterState(withCleared(ch1Ids), two, 2)).toBe("open");
  });
  it("the map opens on the focused level's chapter, else the open frontier", () => {
    const done = withCleared(ch1Ids);
    done.progress.frontierChapter = 2;
    expect(defaultChapter(done, two)).toBe(2);
    expect(defaultChapter(done, two, "ch1-l10")).toBe(1);
    const fresh = withCleared([]);
    fresh.progress.frontierChapter = 2; // never opens a locked chapter by default
    expect(defaultChapter(fresh, two)).toBe(1);
  });
});

describe("Ch2 intro card data", () => {
  it("uses the three `intro` lines, exact case, the second teaches Shift", () => {
    const lines = introLines(two, 2).map((w) => w.text);
    expect(lines).toHaveLength(3);
    expect(lines).toContain("Hold Shift to type a Capital letter.");
    expect(lines.some((t) => /[A-Z]/.test(t))).toBe(true);
  });
  it("only the first level of a chapter above 1 has an intro", () => {
    expect(introChapterOf(two, "ch2-l01")).toBe(2);
    expect(introChapterOf(two, "ch2-l02")).toBeNull();
    expect(introChapterOf(two, "ch1-l01")).toBeNull();
  });
});

describe("intro-seen flag (journal.firstSeen, no schema change)", () => {
  it("is a reserved key that is not a word", () => {
    expect(isFlagKey(introSeenKey(2))).toBe(true);
    expect(contentBundle.words.some((w) => isFlagKey(w.key))).toBe(false);
  });
  it("marks once, idempotent", () => {
    const s = withCleared([]);
    expect(introSeen(s, 2)).toBe(false);
    const a = markIntroSeen(s, 2, 5);
    expect(introSeen(a, 2)).toBe(true);
    expect(markIntroSeen(a, 2, 9)).toBe(a);
  });
  it("survives a reload together with Ch2 progress, and the merge keeps it", async () => {
    const server = new FakeServer();
    const n = net(server);
    const a = await open(n);
    a.devMutate((s) => {
      for (const id of [...ch1Ids, "ch2-l01"])
        s.progress.levels[id] = {
          cleared: true,
          stars: [true, true, false],
          bestTicks: 9,
          attempts: 1,
        };
      s.settings.caseAssist = true;
    });
    a.markIntroSeen(2);
    await a.flush();
    const b = await open(net(server, n.store));
    expect(introSeen(b.save, 2)).toBe(true);
    expect(b.save.progress.levels["ch2-l01"]?.cleared).toBe(true);
    expect(b.save.progress.frontierChapter).toBe(2);
    expect(b.save.settings.caseAssist).toBe(true);
    // cloud sync merge: a device that never saw the card still ends up with the flag
    const other = withCleared([]);
    const { merged } = mergeSaves(null, other, b.save);
    expect(introSeen(merged, 2)).toBe(true);
    expect(merged.progress.levels["ch2-l01"]?.cleared).toBe(true);
    expect((await n.sync.sync()).status).toBe("synced");
  });
});

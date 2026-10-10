import { describe, expect, it } from "vitest";
import { SaveStore } from "../../src/meta/save";
import { ApiClient, AuthManager, MemoryStore, SaveSync } from "../../src/net/index.ts";
import { FakeServer } from "../net/fakeServer";

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
  SaveStore.open(n, { syncWaitMs: 0, now: () => 1000, seed: () => 7 });

describe("SaveStore journal notes", () => {
  it("round-trips through a reload, caps length, and deletes on empty", async () => {
    const server = new FakeServer();
    const n = net(server);
    const a = await open(n);
    expect(a.setTranslation("hello", "hola")).toBe(true);
    expect(a.setTranslation("hello", "hola")).toBe(false);
    a.setTranslation("long", "x".repeat(500));
    await a.flush();
    const b = await open(net(server, n.store));
    expect(b.translations().hello).toBe("hola");
    expect(b.translations().long?.length).toBe(120);
    b.setTranslation("hello", "  ");
    expect(b.translations().hello).toBeUndefined();
  });

  it("imports the v1-era device-local translations once", async () => {
    const n = net(new FakeServer());
    await n.store.set("journal.translations", { old: "viejo" });
    const a = await open(n);
    expect(a.translations()).toEqual({ old: "viejo" });
    expect(await n.store.get("journal.translations")).toBeUndefined();
  });
});

describe("SaveStore.reset (New Game)", () => {
  it("bumps resetEpoch, keeps settings; old cloud progress does not return after an offline reset", async () => {
    const server = new FakeServer();
    const n = net(server);
    const a = await open(n);
    a.devMutate((s) => {
      s.wallet.gold = 777;
      s.progress.levels["ch1-l01"] = {
        cleared: true,
        stars: [true, true, true],
        bestTicks: 5,
        attempts: 1,
      };
      s.settings.effectsIntensity = 0.4;
    });
    await a.flush();
    expect((await n.sync.sync()).status).toBe("synced");
    server.failNext = 99; // API unreachable
    a.reset();
    await a.flush();
    expect(a.save.resetEpoch).toBe(1);
    expect(a.save.wallet.gold).toBe(0);
    expect(a.save.settings.effectsIntensity).toBe(0.4);
    expect((await n.sync.sync()).status).toBe("offline");
    server.failNext = 0; // next launch, API back: the cloud copy (epoch 0, 777 gold) must lose
    const b = await SaveStore.open(net(server, n.store), { syncWaitMs: 1000, now: () => 2000 });
    expect(b.save.resetEpoch).toBe(1);
    expect(b.save.wallet.gold).toBe(0);
    expect(b.save.progress.levels).toEqual({});
  });
});

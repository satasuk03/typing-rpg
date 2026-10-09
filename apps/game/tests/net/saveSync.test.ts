import { decodeSaveWire, encodeSaveWire, migrateSave, type SaveBlob } from "@hd2d/shared";
import { describe, expect, test } from "vitest";
import { blankSave } from "../../../../packages/shared/tests/saveGen.ts";
import { ApiClient, AuthManager, MemoryStore, SaveSync } from "../../src/net/index.ts";
import { FakeServer } from "./fakeServer.ts";

interface Client {
  store: MemoryStore;
  auth: AuthManager;
  sync: SaveSync;
  timers: { fn: () => void; ms: number }[];
}

function client(
  server: FakeServer,
  store = new MemoryStore(),
  identity?: { deviceId: string; deviceSecret: string },
): Client {
  const api = new ApiClient({
    baseUrl: "http://api.test",
    fetch: server.fetch,
    sleep: async () => {},
    baseDelayMs: 1,
    maxAttempts: 2,
  });
  const auth = new AuthManager({ api, store, now: () => server.now });
  if (identity) void store.set("auth.identity", identity);
  const timers: Client["timers"] = [];
  const sync = new SaveSync({
    api,
    auth,
    store,
    debounceMs: 1500,
    setTimer: (fn, ms) => {
      const h = { fn, ms };
      timers.push(h);
      return h;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as never);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  return { store, auth, sync, timers };
}

const withGold = (g: number, over: (s: SaveBlob) => void = () => {}): SaveBlob => {
  const s = blankSave();
  s.wallet.gold = g;
  over(s);
  return s;
};
const serverBlob = async (server: FakeServer, user: string) =>
  migrateSave(await decodeSaveWire(server.saves.get(user)?.blob ?? ""));

describe("SaveSync", () => {
  test("local-first: setLocal persists immediately, debounces, then uploads with If-Match 0 (create)", async () => {
    const server = new FakeServer();
    const c = client(server);
    await c.sync.setLocal(withGold(5));
    expect(await c.sync.isDirty()).toBe(true);
    expect(c.sync.status).toBe("dirty");
    expect(c.timers).toHaveLength(1);
    expect(c.timers[0]?.ms).toBe(1500);
    expect(server.puts).toBe(0);
    // rapid further edits re-arm the single debounce timer (no extra uploads)
    await c.sync.setLocal(withGold(6));
    await c.sync.setLocal(withGold(7));
    expect(c.timers).toHaveLength(1);
    const r = await c.sync.sync();
    expect(r.status).toBe("synced");
    expect(r.revision).toBe(1);
    expect(server.puts).toBe(1);
    expect((await serverBlob(server, "user-1")).wallet.gold).toBe(7);
    expect(await c.sync.isDirty()).toBe(false);
    const put = server.calls.find((x) => x.method === "PUT");
    expect(put?.headers["if-match"]).toBe('"0"');
  });

  test("survives reload: a new SaveSync on the same store sees the local save and the pending upload", async () => {
    const server = new FakeServer();
    const a = client(server);
    server.failNext = 99; // offline the whole time
    await a.sync.setLocal(withGold(42));
    const r = await a.sync.sync();
    expect(r.status).toBe("offline");
    expect(await a.sync.isDirty()).toBe(true);
    // reload
    server.failNext = 0;
    const b = client(server, a.store);
    expect((await b.sync.getLocal())?.wallet.gold).toBe(42);
    expect(await b.sync.isDirty()).toBe(true);
    expect((await b.sync.sync()).status).toBe("synced");
    expect(server.puts).toBe(1);
  });

  test("offline queue: failures keep it dirty, retry is scheduled with backoff, 'online' flushes", async () => {
    const server = new FakeServer();
    const c = client(server);
    await c.sync.setLocal(withGold(1));
    server.failNext = 99;
    const r1 = await c.sync.sync();
    expect(r1.status).toBe("offline");
    const d1 = c.timers[c.timers.length - 1]?.ms ?? 0;
    const r2 = await c.sync.sync();
    expect(r2.status).toBe("offline");
    const d2 = c.timers[c.timers.length - 1]?.ms ?? 0;
    expect(d2).toBeGreaterThan(d1); // backoff grows
    expect(server.puts).toBe(0);
    server.failNext = 0;
    c.sync.onOnline();
    expect(c.timers[c.timers.length - 1]?.ms).toBe(0);
    expect((await c.sync.sync()).status).toBe("synced");
    expect(server.puts).toBe(1);
  });

  test("409: merge with mergeSaves (monotonic data from both sides survives) and retry with the server revision", async () => {
    const server = new FakeServer();
    const A = client(server);
    await A.sync.setLocal(withGold(10));
    await A.sync.sync(); // rev 1; A.base = gold 10
    const id = await A.auth.exportIdentity();
    const B = client(server, new MemoryStore(), id);
    expect((await B.sync.sync()).status).toBe("synced"); // pulls rev 1
    expect((await B.sync.getLocal())?.wallet.gold).toBe(10);

    // A claims chest 10 and earns gold; B (offline) claims chest 20 meanwhile
    await A.sync.setLocal(
      withGold(60, (s) => {
        s.progress.starChestsClaimed = { "1": [10] };
        s.playtimeSec = 100;
      }),
    );
    await A.sync.sync(); // rev 2
    await B.sync.setLocal(
      withGold(10, (s) => {
        s.progress.starChestsClaimed = { "1": [20] };
        s.progress.levels["ch1-l01"] = {
          cleared: true,
          stars: [true, false, false],
          bestTicks: 9,
          attempts: 1,
        };
      }),
    );
    const r = await B.sync.sync(); // If-Match 1 -> 409 -> merge -> rev 3
    expect(r.status).toBe("synced");
    expect(r.merged).toBe(true);
    expect(r.revision).toBe(3);
    const merged = await serverBlob(server, "user-1");
    expect(merged.progress.starChestsClaimed["1"]?.sort()).toEqual([10, 20]); // no claimed chest lost
    expect(merged.progress.levels["ch1-l01"]?.cleared).toBe(true);
    expect(merged.wallet.gold).toBe(60); // fungible: only A changed it vs base -> A's value, NOT summed/duplicated
    // A pulls the merged result
    await A.sync.sync();
    expect((await A.sync.getLocal())?.progress.starChestsClaimed["1"]?.sort()).toEqual([10, 20]);
    const puts = server.calls.filter((x) => x.method === "PUT").map((x) => x.headers["if-match"]);
    expect(puts).toEqual(['"0"', '"1"', '"2"']); // B pulled first, merged, and pushed on rev 2 (no wasted 409)
  });

  test("a REAL 409 (server changes between the pull and the PUT): merge the returned server copy and retry", async () => {
    const server = new FakeServer();
    const A = client(server);
    await A.sync.setLocal(
      withGold(5, (s) => {
        s.progress.starChestsClaimed = { "1": [10] };
      }),
    );
    await A.sync.sync(); // rev 1
    const B = client(server, new MemoryStore(), await A.auth.exportIdentity());
    await B.sync.sync();
    await B.sync.setLocal(
      withGold(5, (s) => {
        s.progress.starChestsClaimed = { "1": [20] };
      }),
    );
    // a concurrent write from another device lands right before B's first PUT
    const orig = server.fetch;
    let raced = false;
    server.fetch = (async (u: string, i?: RequestInit) => {
      if (!raced && i?.method === "PUT") {
        raced = true;
        const cur = server.saves.get("user-1");
        if (cur) {
          const blob = await encodeSaveWire(
            withGold(5, (s) => {
              s.progress.starChestsClaimed = { "1": [30] };
              s.playtimeSec = 50;
            }),
          );
          server.saves.set("user-1", { ...cur, revision: cur.revision + 1, blob });
        }
      }
      return orig(u, i);
    }) as never;
    const api = new ApiClient({
      baseUrl: "http://api.test",
      fetch: server.fetch,
      sleep: async () => {},
    });
    const auth = new AuthManager({ api, store: B.store, now: () => server.now });
    const sync = new SaveSync({
      api,
      auth,
      store: B.store,
      setTimer: () => 0,
      clearTimer: () => {},
    });
    const r = await sync.sync();
    expect(r.status).toBe("synced");
    expect(r.merged).toBe(true);
    const merged = await serverBlob(server, "user-1");
    expect(merged.progress.starChestsClaimed["1"]?.sort()).toEqual([10, 20, 30]);
    const puts = server.calls.filter((x) => x.method === "PUT").map((x) => x.headers["if-match"]);
    expect(puts.slice(-2)).toEqual(['"1"', '"2"']); // 409 on rev 1, then success on the server's rev 2
  });

  test("If-Match != 0 but the server has no save (404) -> re-PUT with If-Match 0", async () => {
    const server = new FakeServer();
    const c = client(server);
    await c.sync.setLocal(withGold(3));
    await c.sync.sync();
    server.saves.clear(); // the server lost the save
    await c.sync.setLocal(withGold(4));
    const r = await c.sync.sync();
    expect(r.status).toBe("synced");
    expect(r.revision).toBe(1);
    expect((await serverBlob(server, "user-1")).wallet.gold).toBe(4);
    const last = server.calls.filter((x) => x.method === "PUT").pop();
    expect(last?.headers["if-match"]).toBe('"0"');
  });

  test("second browser profile with the same identity pulls the cloud save", async () => {
    const server = new FakeServer();
    const A = client(server);
    await A.sync.setLocal(
      withGold(77, (s) => {
        s.progress.starChestsClaimed = { "1": [10, 20] };
      }),
    );
    await A.sync.sync();
    const B = client(server);
    await B.auth.importIdentity(await A.auth.exportIdentity());
    expect(await B.sync.getLocal()).toBeNull();
    const r = await B.sync.sync();
    expect(r.status).toBe("synced");
    const got = await B.sync.getLocal();
    expect(got?.wallet.gold).toBe(77);
    expect(got?.progress.starChestsClaimed).toEqual({ "1": [10, 20] });
    expect(server.puts).toBe(1); // pulling does not write
  });

  test("a newer-schema server save puts the client in read-only mode and it never PUTs", async () => {
    const server = new FakeServer();
    const c = client(server);
    await c.auth.accessToken();
    const future = { ...blankSave(), schemaVersion: 2 };
    server.saves.set("user-1", {
      revision: 5,
      blob: await encodeSaveWire(future),
      summary: { schemaVersion: 2, levelMax: 0, stars: 0, playtimeSec: 0 },
      updatedAt: 1,
    });
    await c.sync.setLocal(withGold(1));
    const r = await c.sync.sync();
    expect(r.status).toBe("read-only");
    expect(server.puts).toBe(0);
    await c.sync.setLocal(withGold(2));
    expect(c.sync.status).toBe("read-only");
    expect((await c.sync.sync()).status).toBe("read-only");
    expect(server.puts).toBe(0);
  });

  test("edits made while an upload is in flight keep the save dirty", async () => {
    const server = new FakeServer();
    const c = client(server);
    await c.sync.setLocal(withGold(1));
    const orig = server.fetch;
    let injected = false;
    server.fetch = (async (u: string, i?: RequestInit) => {
      if (!injected && i?.method === "PUT") {
        injected = true;
        await c.store.set("save.local", withGold(2)); // the player edited mid-upload
      }
      return orig(u, i);
    }) as never;
    const api = new ApiClient({
      baseUrl: "http://api.test",
      fetch: server.fetch,
      sleep: async () => {},
    });
    const auth = new AuthManager({ api, store: c.store, now: () => server.now });
    const sync = new SaveSync({
      api,
      auth,
      store: c.store,
      setTimer: () => 0,
      clearTimer: () => {},
    });
    const r = await sync.sync();
    expect(r.status).toBe("dirty");
    expect(await sync.isDirty()).toBe(true);
  });

  test("a different account (new identity) re-creates the cloud save from the local one", async () => {
    const server = new FakeServer();
    const c = client(server);
    await c.sync.setLocal(withGold(9));
    await c.sync.sync();
    // identity replaced (e.g. device secret rejected) -> new account with an empty cloud
    await c.auth.importIdentity({
      deviceId: "11111111-1111-4111-8111-111111111111",
      deviceSecret: "A".repeat(43),
    });
    const r = await c.sync.sync();
    expect(r.status).toBe("synced");
    expect((await serverBlob(server, "user-2")).wallet.gold).toBe(9);
  });
});

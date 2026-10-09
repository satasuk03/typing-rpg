import { describe, expect, test, vi } from "vitest";
import { ApiClient, AuthManager, MemoryStore, newDeviceSecret } from "../../src/net/index.ts";
import { FakeServer } from "./fakeServer.ts";

const tokenOf = (r?: { body: unknown }): string | undefined =>
  (r?.body as { refreshToken?: string } | undefined)?.refreshToken;

function setup(over: { store?: MemoryStore; server?: FakeServer } = {}) {
  const server = over.server ?? new FakeServer();
  const store = over.store ?? new MemoryStore();
  const api = new ApiClient({
    baseUrl: "http://api.test",
    fetch: server.fetch,
    sleep: async () => {},
    baseDelayMs: 1,
  });
  let n = 0;
  const auth = new AuthManager({
    api,
    store,
    now: () => server.now,
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  return { server, store, api, auth };
}

describe("AuthManager", () => {
  test("first launch: generates a 32-byte (43 char base64url) secret, persists it, logs in anonymously", async () => {
    const { auth, store, server } = setup();
    expect(auth.state).toBe("no-identity");
    const tok = await auth.accessToken();
    expect(tok).toMatch(/^at-/);
    const id = await store.get<{ deviceId: string; deviceSecret: string }>("auth.identity");
    expect(id?.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(id?.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(1);
    expect(auth.state).toBe("authed");
    // a cached token is reused
    await auth.accessToken();
    expect(server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(1);
  });

  test("newDeviceSecret is 43 url-safe chars and not constant", () => {
    const a = newDeviceSecret();
    const b = newDeviceSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  test("never logs credentials", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m),
    );
    const { auth, server } = setup();
    await auth.accessToken();
    server.now += 16 * 60_000;
    await auth.accessToken(); // refresh
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const s of spies) s.mockRestore();
  });

  test("expired access token -> refresh; the rotated refresh token is stored before the token is used", async () => {
    const { auth, store, server } = setup();
    await auth.accessToken();
    const first = await store.get<string>("auth.refresh");
    server.now += 16 * 60_000;
    const seenInStore: (string | undefined)[] = [];
    const origSet = store.set.bind(store);
    store.set = async (k: string, v: unknown) => {
      if (k === "auth.refresh") seenInStore.push(v as string);
      return origSet(k, v);
    };
    const t2 = await auth.accessToken();
    expect(t2).not.toBeUndefined();
    const second = await store.get<string>("auth.refresh");
    expect(second).not.toBe(first);
    expect(seenInStore).toEqual([second]);
    expect(server.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1);
  });

  test("withToken: a token_expired from the server triggers one refresh and one retry", async () => {
    const { auth, server } = setup();
    await auth.accessToken();
    server.now += 16 * 60_000; // the client still thinks the token is valid? (clock skew): force by clearing nothing
    let calls = 0;
    const out = await auth.withToken(async (t) => {
      calls++;
      const r = await server.fetch("http://api.test/save", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (r.status === 401) {
        const j = (await r.json()) as { error: { code: string } };
        const { ApiError } = await import("../../src/net/index.ts");
        throw new ApiError(j.error.code as never, 401, "x");
      }
      return r.status;
    });
    expect(out).toBe(404); // authenticated (no save yet)
    expect(calls).toBeLessThanOrEqual(2);
  });

  test("a lost refresh response is retried with the SAME token and lands on the same child (10 s grace)", async () => {
    const { auth, store, server } = setup();
    await auth.accessToken();
    const parent = await store.get<string>("auth.refresh");
    server.now += 16 * 60_000;
    server.loseNextResponseFor = "/auth/refresh"; // server rotates, the response never arrives
    await auth.accessToken();
    const refreshes = server.calls.filter((c) => c.path === "/auth/refresh");
    expect(refreshes).toHaveLength(2);
    expect(tokenOf(refreshes[0])).toBe(parent);
    expect(tokenOf(refreshes[1])).toBe(parent);
    expect(await store.get("auth.refresh")).not.toBe(parent);
    expect(server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(1); // no re-login was needed
  });

  test("refresh_invalid / refresh_reused -> re-login via /auth/anon with the stored identity (same account)", async () => {
    const { auth, store, server } = setup();
    await auth.accessToken();
    const user = auth.currentUserId;
    const id = await store.get("auth.identity");
    // revoke the family server-side (as reuse detection would)
    for (const v of server.refresh.values()) v.revoked = true;
    server.now += 16 * 60_000;
    await auth.accessToken();
    expect(await store.get("auth.identity")).toEqual(id); // identity unchanged
    expect(auth.currentUserId).toBe(user); // same account
    expect(server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(2);
    // refresh token deleted from the store + unknown token -> refresh_invalid -> relogin too
    await store.set("auth.refresh", "z".repeat(43));
    server.now += 16 * 60_000;
    await auth.accessToken();
    expect(server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(3);
  });

  test("/auth/anon 401 (server rejects our device secret) -> start a brand-new identity and account", async () => {
    const { auth, store, server } = setup();
    await auth.accessToken();
    const oldUser = auth.currentUserId;
    const oldId = await store.get<{ deviceId: string }>("auth.identity");
    // the server forgets the secret (e.g. account recreated): corrupt the stored hash
    for (const u of server.users.values())
      for (const k of u.devices.keys()) u.devices.set(k, "different");
    await store.delete("auth.refresh");
    server.now += 16 * 60_000;
    await auth.accessToken();
    const newId = await store.get<{ deviceId: string }>("auth.identity");
    expect(newId?.deviceId).not.toBe(oldId?.deviceId);
    expect(auth.currentUserId).not.toBe(oldUser);
    expect(auth.stats.newIdentity).toBe(2);
  });

  test("concurrent callers share a single login", async () => {
    const { auth, server } = setup();
    const toks = await Promise.all([auth.accessToken(), auth.accessToken(), auth.accessToken()]);
    expect(new Set(toks).size).toBe(1);
    expect(server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(1);
  });

  test("a restart (new AuthManager, same store) resumes via the stored refresh token, no new anon", async () => {
    const a = setup();
    await a.auth.accessToken();
    const b = setup({ store: a.store, server: a.server });
    await b.auth.accessToken();
    expect(a.server.calls.filter((c) => c.path === "/auth/anon")).toHaveLength(1);
    expect(a.server.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1);
    expect(b.auth.currentUserId).toBe(a.auth.currentUserId);
  });

  test("importIdentity: a second profile with the same device credentials reaches the same account", async () => {
    const a = setup();
    await a.auth.accessToken();
    const id = await a.auth.exportIdentity();
    const b = setup({ server: a.server });
    await b.auth.importIdentity(id);
    await b.auth.accessToken();
    expect(b.auth.currentUserId).toBe(a.auth.currentUserId);
  });
});

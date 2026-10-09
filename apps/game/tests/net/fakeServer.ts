// In-memory stand-in for the Worker API with the same observable semantics (auth rotation + 10 s grace, device
// secrets, save revisions/If-Match, run tickets). Used by the net-layer unit tests; the e2e suite uses the real Worker.
import { createHash } from "node:crypto";

export interface Req {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}
export type Handler = (
  r: Req,
) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

export const err = (status: number, code: string, message = code, extra: object = {}) => ({
  status,
  body: { error: { code, message }, ...extra },
});

export function fetchFrom(handler: Handler, log: Req[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>))
      headers[k.toLowerCase()] = v;
    const r: Req = {
      method: init?.method ?? "GET",
      path: u.pathname + u.search,
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    log.push(r);
    const out = await handler(r);
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const b64u = (s: string) => Buffer.from(s).toString("base64url");

export class FakeServer {
  now = 1_900_000_000_000;
  users = new Map<string, { id: string; devices: Map<string, string> }>();
  deviceOwner = new Map<string, string>();
  refresh = new Map<
    string,
    { user: string; family: string; rotatedAt?: number; child?: string; revoked?: boolean }
  >();
  accessTtl = 15 * 60_000;
  saves = new Map<
    string,
    { revision: number; blob: string; summary: unknown; updatedAt: number }
  >();
  /** counters */
  calls: Req[] = [];
  puts = 0;
  /** set to make the next N requests fail at the network level */
  failNext = 0;
  /** when set, the next refresh/anon response is "lost" (server processes it, client sees a network error) */
  loseNextResponseFor: string | null = null;
  private seq = 0;
  private tokens = new Map<string, { user: string; exp: number }>();

  fetch = fetchFrom((r) => this.handle(r), this.calls);

  private mkAccess(user: string) {
    const token = `at-${++this.seq}-${user}`;
    const exp = this.now + this.accessTtl;
    this.tokens.set(token, { user, exp });
    return { accessToken: token, accessExpiresAt: exp };
  }
  private deriveChild(parent: string) {
    return b64u(`child:${parent}`).padEnd(43, "x").slice(0, 43);
  }
  private newRefresh(user: string, family: string, token?: string) {
    const t =
      token ??
      b64u(`rt-${++this.seq}-${user}`)
        .padEnd(43, "x")
        .slice(0, 43);
    this.refresh.set(t, { user, family });
    return t;
  }
  private auth(r: Req): string | { status: number; body: unknown } {
    const h = r.headers.authorization;
    const t = h?.startsWith("Bearer ") ? this.tokens.get(h.slice(7)) : undefined;
    if (!t) return err(401, "unauthorized");
    if (t.exp <= this.now) return err(401, "token_expired");
    return t.user;
  }

  handle(r: Req): { status: number; body: unknown } {
    if (this.failNext > 0) {
      this.failNext--;
      throw new TypeError("network down");
    }
    const out = this.route(r);
    if (this.loseNextResponseFor && r.path === this.loseNextResponseFor) {
      this.loseNextResponseFor = null;
      throw new TypeError("response lost");
    }
    return out;
  }

  private route(r: Req): { status: number; body: unknown } {
    const b = (r.body ?? {}) as Record<string, string>;
    if (r.path === "/auth/anon") {
      const secretHash = sha(b.deviceSecret ?? "");
      const owner = this.deviceOwner.get(b.deviceId as string);
      let user: string;
      if (!owner) {
        user = `user-${this.users.size + 1}`;
        this.users.set(user, { id: user, devices: new Map([[b.deviceId as string, secretHash]]) });
        this.deviceOwner.set(b.deviceId as string, user);
      } else {
        const u = this.users.get(owner);
        if (u?.devices.get(b.deviceId as string) !== secretHash) return err(401, "unauthorized");
        user = owner;
      }
      const family = `fam-${++this.seq}`;
      const rt = this.newRefresh(user, family);
      return { status: 200, body: { ...this.mkAccess(user), refreshToken: rt, userId: user } };
    }
    if (r.path === "/auth/refresh") {
      const rec = this.refresh.get(b.refreshToken as string);
      if (!rec) return err(401, "refresh_invalid");
      if (rec.revoked) return err(401, "refresh_reused");
      if (rec.rotatedAt === undefined) {
        const child = this.deriveChild(b.refreshToken as string);
        rec.rotatedAt = this.now;
        rec.child = child;
        this.newRefresh(rec.user, rec.family, child);
        return { status: 200, body: { ...this.mkAccess(rec.user), refreshToken: child } };
      }
      const childRec = this.refresh.get(rec.child as string);
      if (this.now - rec.rotatedAt <= 10_000 && childRec && childRec.rotatedAt === undefined) {
        return { status: 200, body: { ...this.mkAccess(rec.user), refreshToken: rec.child } };
      }
      for (const v of this.refresh.values()) if (v.family === rec.family) v.revoked = true;
      return err(401, "refresh_reused");
    }
    const user = this.auth(r);
    if (typeof user !== "string") return user;
    if (r.path === "/save" && r.method === "GET") {
      const s = this.saves.get(user);
      return s ? { status: 200, body: s } : err(404, "not_found");
    }
    if (r.path === "/save" && r.method === "PUT") {
      const m = /^"?(\d+)"?$/.exec(r.headers["if-match"] ?? "");
      if (!m) return err(428, "precondition_required");
      const expected = Number(m[1]);
      const cur = this.saves.get(user);
      if (!cur && expected !== 0) return err(404, "not_found");
      if ((cur?.revision ?? 0) !== expected)
        return err(409, "save_conflict", "save_conflict", { server: cur });
      this.puts++;
      const next = {
        revision: expected + 1,
        blob: b.blob as string,
        summary: (r.body as { summary: unknown }).summary,
        updatedAt: this.now,
      };
      this.saves.set(user, next);
      return { status: 200, body: { revision: next.revision, updatedAt: next.updatedAt } };
    }
    return err(404, "not_found");
  }
}

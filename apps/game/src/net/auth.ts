// Auth state machine (docs/interfaces.md §9.2, T5.2 notes).
//
//   no identity --first launch--> identity {deviceId, deviceSecret} --/auth/anon--> session {refreshToken, access}
//   access expired (token_expired / 401)  --/auth/refresh--> new session   (new refresh token stored BEFORE use)
//   refresh lost (network)                --retry the SAME refresh token--> same child (server 10 s grace)
//   refresh_invalid | refresh_reused      --/auth/anon with the stored identity--> new session
//   /auth/anon 401 (secret not accepted)  --> brand-new identity + account (local save stays local)
//
// deviceId / deviceSecret / refresh tokens are never logged.
import type { ApiClient } from "./apiClient.ts";
import { ApiError } from "./errors.ts";
import type { KeyValueStore } from "./storage.ts";

export interface Identity {
  deviceId: string;
  /** 32 random bytes, base64url (43 chars). */
  deviceSecret: string;
}

export type AuthState = "no-identity" | "anonymous" | "authed";

const K_IDENTITY = "auth.identity";
const K_REFRESH = "auth.refresh";
const K_USER = "auth.userId";

export function newDeviceSecret(rand: (n: number) => Uint8Array = randomBytes): string {
  const b = rand(32);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export interface AuthOptions {
  api: ApiClient;
  store: KeyValueStore;
  /** Epoch ms; injectable for tests. */
  now?: () => number;
  uuid?: () => string;
  randomBytes?: (n: number) => Uint8Array;
}

export class AuthManager {
  private identity: Identity | null = null;
  private access: { token: string; expiresAt: number } | null = null;
  private userId: string | null = null;
  private inflight: Promise<string> | null = null;
  private readonly api: ApiClient;
  private readonly store: KeyValueStore;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly rand: (n: number) => Uint8Array;
  /** counters for tests / diagnostics (no secrets) */
  readonly stats = { anon: 0, refresh: 0, newIdentity: 0 };

  constructor(o: AuthOptions) {
    this.api = o.api;
    this.store = o.store;
    this.now = o.now ?? (() => Date.now());
    this.uuid = o.uuid ?? (() => crypto.randomUUID());
    this.rand = o.randomBytes ?? randomBytes;
  }

  get state(): AuthState {
    if (!this.identity) return "no-identity";
    return this.access && this.access.expiresAt > this.now() ? "authed" : "anonymous";
  }
  get currentUserId(): string | null {
    return this.userId;
  }

  /** Loads (or on first launch creates) the device identity. */
  async init(): Promise<Identity> {
    if (this.identity) return this.identity;
    let id = await this.store.get<Identity>(K_IDENTITY);
    if (!id) {
      id = { deviceId: this.uuid(), deviceSecret: newDeviceSecret(this.rand) };
      await this.store.set(K_IDENTITY, id);
      this.stats.newIdentity++;
    }
    this.identity = id;
    this.userId = (await this.store.get<string>(K_USER)) ?? null;
    return id;
  }

  /** For the dev scene / support tooling: the device credentials only (never a refresh token). */
  async exportIdentity(): Promise<Identity> {
    return { ...(await this.init()) };
  }
  /** Adopt another profile's identity ("same identity on a second browser"). Drops this profile's session. */
  async importIdentity(id: Identity): Promise<void> {
    await this.store.set(K_IDENTITY, id);
    await this.store.delete(K_REFRESH);
    await this.store.delete(K_USER);
    this.identity = id;
    this.access = null;
    this.userId = null;
  }

  /** A valid access token, logging in / refreshing as needed. Concurrent callers share one in-flight attempt. */
  async accessToken(): Promise<string> {
    await this.init();
    if (this.access && this.access.expiresAt - 30_000 > this.now()) return this.access.token;
    return this.establish();
  }

  /**
   * Runs `fn(token)`; on token_expired / unauthorized refreshes once and retries once.
   * Other errors (including a second auth failure) propagate.
   */
  async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken();
    try {
      return await fn(token);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "token_expired" || e.code === "unauthorized")) {
        this.access = null;
        return fn(await this.accessToken());
      }
      throw e;
    }
  }

  private establish(): Promise<string> {
    this.inflight ??= this.doEstablish().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async doEstablish(): Promise<string> {
    const refresh = await this.store.get<string>(K_REFRESH);
    if (refresh) {
      try {
        this.stats.refresh++;
        const r = await this.api.authRefresh(refresh);
        // Persist the rotated token BEFORE anything else uses it.
        await this.store.set(K_REFRESH, r.refreshToken);
        this.setAccess(r.accessToken, r.accessExpiresAt);
        return r.accessToken;
      } catch (e) {
        // NetworkError (after the client's own retries) propagates with the OLD token still stored: the next call
        // retries the same refresh token, which the server answers with the same child inside its 10 s grace.
        if (!(e instanceof ApiError) || (e.reaction !== "relogin" && e.code !== "unauthorized")) {
          throw e;
        }
        await this.store.delete(K_REFRESH);
      }
    }
    return this.login();
  }

  private async login(): Promise<string> {
    const id = await this.init();
    try {
      this.stats.anon++;
      return await this.loginWith(id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") {
        // The server does not accept our device secret (lost/rotated account): start over with a new identity.
        const fresh: Identity = { deviceId: this.uuid(), deviceSecret: newDeviceSecret(this.rand) };
        await this.store.set(K_IDENTITY, fresh);
        await this.store.delete(K_USER);
        this.identity = fresh;
        this.stats.newIdentity++;
        this.stats.anon++;
        return this.loginWith(fresh);
      }
      throw e;
    }
  }

  private async loginWith(id: Identity): Promise<string> {
    const r = await this.api.authAnon(id.deviceId, id.deviceSecret);
    await this.store.set(K_REFRESH, r.refreshToken);
    await this.store.set(K_USER, r.userId);
    this.userId = r.userId;
    this.setAccess(r.accessToken, r.accessExpiresAt);
    return r.accessToken;
  }

  private setAccess(token: string, expiresAt: number): void {
    this.access = { token, expiresAt };
  }
}

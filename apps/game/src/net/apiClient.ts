// Typed HTTP client for the Worker API (docs/interfaces.md §9.2). No auth logic here: callers pass tokens.
// Retries with exponential backoff on NETWORK errors only (fetch threw). HTTP error responses are never retried here:
// they become typed ApiError values and the caller applies the reaction table (see errors.ts).
import {
  AuthAnonResponse,
  AuthRefreshResponse,
  ErrorEnvelope,
  LbTrialResponse,
  RunSubmitResponse,
  RunTicket,
  SaveConflictResponse,
  SavePutResponse,
  SaveRecord,
} from "@hd2d/shared";
import type { z } from "zod";
import { ApiError, NetworkError, ProtocolError } from "./errors.ts";

export type AnonResponse = z.infer<typeof AuthAnonResponse>;
export type RefreshResponse = z.infer<typeof AuthRefreshResponse>;
export type SaveRecordT = z.infer<typeof SaveRecord>;
export type SavePutResponseT = z.infer<typeof SavePutResponse>;
export type RunTicketT = z.infer<typeof RunTicket>;
export type SubmitResponseT = z.infer<typeof RunSubmitResponse>;
export type LbTrialResponseT = z.infer<typeof LbTrialResponse>;

export interface RunSubmitBody {
  runId: string;
  sig: string;
  logFormat: "hdk1";
  log: string;
  eventCount: number;
  claimed: {
    correctChars: number;
    typos: number;
    wpmX100: number;
    accuracyBp: number;
    finalHash: string;
  };
  simVersion: number;
  contentVersion: string;
  clientVersion: string;
  timerResolutionMs: number;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Total attempts for a request whose fetch() throws (default 4: 3 retries). */
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface Req<T> {
  method: "GET" | "POST" | "PUT";
  path: string;
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
  schema: { parse(v: unknown): T };
}

export class ApiClient {
  private readonly f: typeof fetch;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  readonly baseUrl: string;

  constructor(o: ApiClientOptions) {
    this.baseUrl = o.baseUrl.replace(/\/$/, "");
    this.f = o.fetch ?? ((...a) => fetch(...a));
    this.maxAttempts = o.maxAttempts ?? 4;
    this.baseDelayMs = o.baseDelayMs ?? 300;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private async send(r: Req<unknown>): Promise<Response> {
    const headers: Record<string, string> = { ...(r.headers ?? {}) };
    if (r.token) headers.Authorization = `Bearer ${r.token}`;
    if (r.body !== undefined) headers["Content-Type"] = "application/json";
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      if (attempt > 0) await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      try {
        return await this.f(`${this.baseUrl}${r.path}`, {
          method: r.method,
          headers,
          body: r.body === undefined ? undefined : JSON.stringify(r.body),
        });
      } catch (e) {
        lastErr = e; // network failure only
      }
    }
    throw new NetworkError(`network request failed: ${r.method} ${r.path}`, lastErr);
  }

  private async request<T>(r: Req<T>): Promise<{ data: T; headers: Headers }> {
    const res = await this.send(r);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ProtocolError(`non-JSON response (${res.status})`, res.status);
    }
    if (!res.ok) {
      const env = ErrorEnvelope.safeParse(json);
      if (!env.success)
        throw new ProtocolError(`unexpected error body (${res.status})`, res.status);
      const e = env.data.error;
      const server = (json as { server?: unknown }).server;
      throw new ApiError(e.code, res.status, e.message, e.details, server);
    }
    try {
      return { data: r.schema.parse(json), headers: res.headers };
    } catch (e) {
      throw new ProtocolError(
        `response did not match the schema: ${String(e).slice(0, 200)}`,
        res.status,
      );
    }
  }

  // ---- auth
  async authAnon(deviceId: string, deviceSecret: string): Promise<AnonResponse> {
    return (
      await this.request({
        method: "POST",
        path: "/auth/anon",
        body: { deviceId, deviceSecret },
        schema: AuthAnonResponse,
      })
    ).data;
  }
  async authRefresh(refreshToken: string): Promise<RefreshResponse> {
    return (
      await this.request({
        method: "POST",
        path: "/auth/refresh",
        body: { refreshToken },
        schema: AuthRefreshResponse,
      })
    ).data;
  }

  // ---- save
  /** 404 not_found -> null (no save yet). */
  async getSave(token: string): Promise<SaveRecordT | null> {
    try {
      return (await this.request({ method: "GET", path: "/save", token, schema: SaveRecord })).data;
    } catch (e) {
      if (e instanceof ApiError && e.code === "not_found") return null;
      throw e;
    }
  }
  /** `ifMatch` = the revision this write is based on ("0" = create). A 409 throws ApiError with `.server`. */
  async putSave(
    token: string,
    ifMatch: number,
    body: { blob: string; summary: z.infer<typeof SaveRecord>["summary"] },
  ): Promise<SavePutResponseT> {
    try {
      return (
        await this.request({
          method: "PUT",
          path: "/save",
          token,
          body,
          headers: { "If-Match": `"${ifMatch}"` },
          schema: SavePutResponse,
        })
      ).data;
    } catch (e) {
      if (e instanceof ApiError && e.code === "save_conflict") {
        const parsed = SaveConflictResponse.shape.server.safeParse(e.server);
        if (parsed.success) throw new ApiError(e.code, e.status, e.message, e.details, parsed.data);
      }
      throw e;
    }
  }

  // ---- runs
  async runStart(token: string): Promise<RunTicketT> {
    return (
      await this.request({
        method: "POST",
        path: "/runs/start",
        token,
        body: { mode: "trial", boardId: "trial_wpm" },
        schema: RunTicket,
      })
    ).data;
  }
  /** Idempotent: the Idempotency-Key is the runId, so re-sending the same log is always safe. */
  async runSubmit(token: string, body: RunSubmitBody): Promise<SubmitResponseT> {
    return (
      await this.request({
        method: "POST",
        path: "/runs/submit",
        token,
        body,
        headers: { "Idempotency-Key": body.runId },
        schema: RunSubmitResponse,
      })
    ).data;
  }

  // ---- leaderboard
  async lbTrial(
    scope: "season" | "all",
    opts: { token?: string; aroundMe?: boolean } = {},
  ): Promise<LbTrialResponseT> {
    const q = `?scope=${scope}${opts.aroundMe ? "&around=me" : ""}`;
    return (
      await this.request({
        method: "GET",
        path: `/lb/trial${q}`,
        token: opts.token,
        schema: LbTrialResponse,
      })
    ).data;
  }
}

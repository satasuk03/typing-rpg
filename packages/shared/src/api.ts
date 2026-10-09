// packages/shared/src/api.ts
import { z } from "zod";
import { ErrorEnvelope } from "./errors.ts";
import { SaveSummary } from "./save.ts";

const B64 = z.base64();
const Hex8 = z.string().regex(/^[0-9a-f]{8}$/);

// POST /auth/anon            (rate 5/min/IP, Turnstile optional in slice)
// deviceSecret: random 256-bit value (base64url, 43 chars) generated once at first launch and kept in IndexedDB.
// The server stores only sha256(deviceSecret). Unknown deviceId -> account created. Known deviceId -> tokens only
// if the secret matches (constant-time), else 401 unauthorized. The deviceId alone is NOT a credential.
export const DeviceSecret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const AuthAnonRequest = z.object({
  deviceId: z.uuid(),
  deviceSecret: DeviceSecret,
  turnstileToken: z.string().optional(),
});
export const AuthTokens = z.object({
  accessToken: z.string(),
  accessExpiresAt: z.number().int(),
  refreshToken: z.string(),
});
export const AuthAnonResponse = AuthTokens.extend({ userId: z.string() });
// POST /auth/refresh          401 refresh_invalid | refresh_reused
export const AuthRefreshRequest = z.object({ refreshToken: z.string().min(32) });
export const AuthRefreshResponse = AuthTokens;

// GET /save  -> 200 SaveRecord + `ETag: "<revision>"` | 404 not_found
// PUT /save  -> header `If-Match: "<revision>"` ("0" when no save exists yet; missing -> 428 precondition_required)
//            -> 200 SavePutResponse | 409 SaveConflictResponse | 413 payload_too_large   (rate 2/min)
export const SaveRecord = z.object({
  revision: z.number().int().min(1),
  updatedAt: z.number().int(),
  blob: B64,
  summary: SaveSummary,
});
export const SavePutRequest = z.object({ blob: B64, summary: SaveSummary });
export const SavePutResponse = z.object({
  revision: z.number().int(),
  updatedAt: z.number().int(),
});
export const SaveConflictResponse = ErrorEnvelope.extend({ server: SaveRecord });

// POST /runs/start            (rate 10/min). ONE open trial ticket per user: starting a new run marks any
// previous 'open' trial run of that user 'abandoned' in the same batch.
export const RunStartRequest = z.object({
  mode: z.literal("trial"),
  boardId: z.literal("trial_wpm"),
});
export const RunTicket = z.object({
  runId: z.string(),
  mode: z.literal("trial"),
  boardId: z.literal("trial_wpm"),
  trialId: z.string(),
  seed: z.number().int().min(0).max(0xffffffff),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  simVersion: z.number().int(),
  contentVersion: Hex8,
  sig: z.string(), // base64url HMAC-SHA256(secret, "v1|runId|userId|mode|boardId|seed|trialId|issuedAt|expiresAt|simVersion|contentVersion")
});

// POST /runs/submit           (rate 10/min; Idempotency-Key: runId)
export const TRIAL_MAX_EVENTS = 3000;
export const ClaimedTrialResult = z.object({
  correctChars: z.number().int().min(0),
  typos: z.number().int().min(0),
  wpmX100: z.number().int().min(0),
  accuracyBp: z.number().int().min(0).max(10000),
  finalHash: Hex8,
});
export const RunSubmitRequest = z.object({
  runId: z.string(),
  sig: z.string(),
  logFormat: z.literal("hdk1"),
  log: B64.max(43_692), // deflate-raw(hdk1 bytes), <= 32 KiB
  eventCount: z.number().int().min(1).max(TRIAL_MAX_EVENTS),
  claimed: ClaimedTrialResult,
  simVersion: z.number().int(),
  contentVersion: Hex8,
  clientVersion: z.string(),
  timerResolutionMs: z.number().min(0).max(1000), // context only (stored with flags); never trusted (M6)
});
export const RunSubmitResponse = z.object({
  status: z.literal("accepted"), // shadow-flagged runs ALSO return "accepted" (D28)
  runId: z.string(),
  verified: z.object({
    wpmX100: z.number().int(),
    accuracyBp: z.number().int(),
    score: z.number().int(),
  }),
  pb: z.boolean(),
  rank: z.number().int().positive().nullable(),
});
// Rejections: ErrorEnvelope. See §10 for which codes are terminal for the run.

// GET /lb/trial?scope=season|all&around=me    (top-100 from KV, 60 s cron; `around` = live D1 query)
export const LbTrialQuery = z.object({
  scope: z.enum(["season", "all"]).default("season"),
  around: z.literal("me").optional(),
});
export const LbEntry = z.object({
  rank: z.number().int().positive(),
  userId: z.string(),
  displayName: z.string(),
  wpmX100: z.number().int(),
  accuracyBp: z.number().int(),
  achievedAt: z.number().int(),
  isMe: z.boolean(),
});
export const LbTrialResponse = z.object({
  scope: z.enum(["season", "all"]),
  periodKey: z.string(), // "S1" | "all"
  updatedAt: z.number().int(),
  top: z.array(LbEntry).max(100),
  me: LbEntry.nullable(), // the owner sees their own flagged entry here only
  around: z.array(LbEntry).max(21).optional(), // present iff around=me: me ±10
});

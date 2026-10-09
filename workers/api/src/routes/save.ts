import { SavePutRequest } from "@hd2d/shared";
import { Hono } from "hono";
import type { SaveRow } from "../db/index.ts";
import { getSave, putSave } from "../db/index.ts";
import { ApiError } from "../lib/errors.ts";
import { type AppEnv, authenticate, parseBody, rateLimit } from "../lib/http.ts";

/** Decoded blob limit (interfaces §9.1). */
export const MAX_SAVE_BYTES = 256 * 1024;
const MAX_BODY_CHARS = Math.ceil((MAX_SAVE_BYTES * 4) / 3) + 4096;

export const saveRoutes = new Hono<AppEnv>();

const record = (r: SaveRow) => ({
  revision: r.revision,
  updatedAt: r.updated_at,
  blob: r.blob_b64,
  summary: JSON.parse(r.summary) as unknown,
});

function decodedLength(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** `"3"`, `3` and `W/"3"` are accepted. */
function parseIfMatch(h: string | undefined): number {
  if (h === undefined) throw new ApiError("precondition_required", "If-Match header required");
  const m = /^(?:W\/)?"?(\d{1,9})"?$/.exec(h.trim());
  if (!m) throw new ApiError("bad_request", "If-Match must be a revision number");
  return Number(m[1]);
}

saveRoutes.get("/", async (c) => {
  const user = await authenticate(c, true);
  const row = user ? await getSave(c.env.DB, user.sub) : null;
  if (!row) throw new ApiError("not_found", "no save yet");
  return c.json(record(row), 200, { ETag: `"${row.revision}"` });
});

saveRoutes.put("/", async (c) => {
  const user = await authenticate(c, true);
  if (!user) throw new ApiError("unauthorized", "missing bearer token");
  await rateLimit(c, "save", user.sub);
  const expected = parseIfMatch(c.req.header("If-Match"));
  const body = await parseBody(c, SavePutRequest, MAX_BODY_CHARS);
  if (decodedLength(body.blob) > MAX_SAVE_BYTES) {
    throw new ApiError("payload_too_large", `save blob exceeds ${MAX_SAVE_BYTES} bytes`);
  }
  const r = await putSave(c.env.DB, {
    userId: user.sub,
    expectedRevision: expected,
    blobB64: body.blob,
    summaryJson: JSON.stringify(body.summary),
    now: c.get("deps").now(),
  });
  if (r.ok)
    return c.json({ revision: r.revision, updatedAt: r.updatedAt }, 200, {
      ETag: `"${r.revision}"`,
    });
  // If-Match != 0 but no save exists: nothing to merge against, so 404 (a schema-valid 409 needs `server`).
  if (!r.server) throw new ApiError("not_found", "no save exists; create it with If-Match: 0");
  // 409 carries the server copy so the client can three-way merge (interfaces §9.1).
  throw new ApiError("save_conflict", "save revision conflict", undefined, {
    server: record(r.server),
  });
});

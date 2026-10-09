import { AuthAnonRequest, AuthRefreshRequest } from "@hd2d/shared";
import { Hono } from "hono";
import type { UserRow } from "../db/index.ts";
import {
  getUserByDevice,
  getUserById,
  insertDeviceStmt,
  insertRefreshTokenStmt,
  insertUserStmt,
  rotateRefreshToken,
} from "../db/index.ts";
import { randomToken, sha256Hex, signJwt } from "../lib/crypto.ts";
import { ApiError } from "../lib/errors.ts";
import { type AppEnv, type Ctx, parseBody, rateLimit, secretOf } from "../lib/http.ts";

export const ACCESS_TTL_MS = 15 * 60_000;
export const REFRESH_TTL_MS = 90 * 24 * 3_600_000;
const FRIEND_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const authRoutes = new Hono<AppEnv>();

const clientIp = (c: Ctx): string => c.req.header("CF-Connecting-IP") ?? "local";

async function issueAccess(c: Ctx, user: UserRow) {
  const now = c.get("deps").now();
  const exp = now + ACCESS_TTL_MS;
  const accessToken = await signJwt(secretOf(c.env, "JWT_SECRET"), {
    sub: user.id,
    ageBand: user.age_band,
    region: user.region,
    iat: Math.floor(now / 1000),
    exp: Math.floor(exp / 1000),
  });
  return { accessToken, accessExpiresAt: exp };
}

function friendCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map((x) => FRIEND_ALPHABET[x % FRIEND_ALPHABET.length]).join("");
}

authRoutes.post("/anon", async (c) => {
  await rateLimit(c, "auth", clientIp(c));
  const body = await parseBody(c, AuthAnonRequest, 4096);
  // turnstileToken is optional in the slice and not verified here.
  const db = c.env.DB;
  const now = c.get("deps").now();
  let user = await getUserByDevice(db, body.deviceId);
  if (!user) {
    const id = crypto.randomUUID();
    const code = friendCode();
    try {
      await db.batch([
        insertUserStmt(db, {
          id,
          displayName: `Typist-${code.slice(0, 4)}`,
          friendCode: code,
          now,
        }),
        insertDeviceStmt(db, body.deviceId, id, now),
      ]);
    } catch (e) {
      // Lost a race on the same deviceId: fall through to the winner's account.
      user = await getUserByDevice(db, body.deviceId);
      if (!user) throw e;
    }
    user ??= await getUserById(db, id);
  }
  if (!user) throw new ApiError("internal", "user creation failed");
  const refreshToken = randomToken(32);
  await insertRefreshTokenStmt(db, {
    tokenHash: await sha256Hex(refreshToken),
    userId: user.id,
    deviceId: body.deviceId,
    familyId: crypto.randomUUID(),
    now,
    expiresAt: now + REFRESH_TTL_MS,
  }).run();
  return c.json({ ...(await issueAccess(c, user)), refreshToken, userId: user.id });
});

authRoutes.post("/refresh", async (c) => {
  await rateLimit(c, "auth", clientIp(c));
  const body = await parseBody(c, AuthRefreshRequest, 4096);
  const now = c.get("deps").now();
  const newToken = randomToken(32);
  const r = await rotateRefreshToken(c.env.DB, {
    oldHash: await sha256Hex(body.refreshToken),
    newHash: await sha256Hex(newToken),
    now,
    expiresAt: now + REFRESH_TTL_MS,
  });
  if (r.status === "invalid")
    throw new ApiError("refresh_invalid", "refresh token invalid or expired");
  if (r.status === "reused") {
    throw new ApiError("refresh_reused", "refresh token reuse detected; session revoked");
  }
  const user = await getUserById(c.env.DB, r.userId);
  if (!user) throw new ApiError("refresh_invalid", "account no longer exists");
  return c.json({ ...(await issueAccess(c, user)), refreshToken: newToken });
});

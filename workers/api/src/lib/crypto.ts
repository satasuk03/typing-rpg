// Web Crypto helpers: hashing, HMAC, base64url, HS256 JWT. No dependencies.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Returns null for anything that is not canonical-ish base64url. */
export function fromB64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const b = atob(s.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    typeof data === "string" ? enc.encode(data) : data,
  );
  return hex(buf);
}

export function randomToken(bytes = 32): string {
  return toB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomU32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}

const hmacKey = (secret: string, usage: ("sign" | "verify")[]): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );

export async function hmacB64Url(secret: string, msg: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), enc.encode(msg));
  return toB64Url(new Uint8Array(sig));
}

/** Constant-time (crypto.subtle.verify) check of a base64url HMAC. */
export async function hmacVerifyB64Url(
  secret: string,
  msg: string,
  sigB64Url: string,
): Promise<boolean> {
  const sig = fromB64Url(sigB64Url);
  if (!sig) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, ["verify"]), sig, enc.encode(msg));
}

// ---------------------------------------------------------------- HS256 JWT

export interface AccessClaims {
  sub: string;
  ageBand: string;
  region: string | null;
  iat: number; // seconds
  exp: number; // seconds
}

const HEADER = toB64Url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));

export async function signJwt(secret: string, claims: AccessClaims): Promise<string> {
  const body = `${HEADER}.${toB64Url(enc.encode(JSON.stringify(claims)))}`;
  return `${body}.${await hmacB64Url(secret, body)}`;
}

export type JwtResult =
  | { ok: true; claims: AccessClaims }
  | { ok: false; reason: "malformed" | "expired" };

export async function verifyJwt(secret: string, token: string, nowSec: number): Promise<JwtResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [h, p, s] = parts as [string, string, string];
  if (h !== HEADER) return { ok: false, reason: "malformed" }; // pins alg=HS256 (no alg confusion)
  if (!(await hmacVerifyB64Url(secret, `${h}.${p}`, s))) return { ok: false, reason: "malformed" };
  const raw = fromB64Url(p);
  if (!raw) return { ok: false, reason: "malformed" };
  let claims: AccessClaims;
  try {
    claims = JSON.parse(dec.decode(raw)) as AccessClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.sub !== "string" || typeof claims.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (claims.exp <= nowSec) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

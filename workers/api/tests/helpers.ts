import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../src/lib/env.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "migrations");

/** Split a migration file into statements; keeps CREATE TRIGGER ... BEGIN ... END; blocks whole. */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const raw of sql.split("\n")) {
    const line = raw.replace(/--.*$/, "").trimEnd();
    if (!line.trim()) continue;
    cur += `${line}\n`;
    const t = cur.trim();
    const inTrigger = /\bBEGIN\b/i.test(t);
    if (t.endsWith(";") && (!inTrigger || /\bEND;$/i.test(t))) {
      out.push(t);
      cur = "";
    }
  }
  if (cur.trim()) throw new Error(`unterminated statement: ${cur}`);
  return out;
}

export async function applyMigrations(db: D1Database): Promise<void> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    for (const stmt of splitSql(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))) {
      await db.prepare(stmt).run();
    }
  }
}

/**
 * A real workerd-backed local D1 via wrangler's getPlatformProxy (reads the repo's wrangler.toml binding,
 * in-memory persistence), migrated from the repo's SQL files.
 * (@cloudflare/vitest-pool-workers peers vitest ^4; this repo is on vitest 5, so it is not used.)
 */
export async function createTestDb(): Promise<{ db: D1Database; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(import.meta.dirname, "..", "wrangler.toml"),
    persist: false,
  });
  await applyMigrations(proxy.env.DB);
  return { db: proxy.env.DB, dispose: () => proxy.dispose() };
}

export const TEST_SECRETS = {
  JWT_SECRET: "test-jwt-secret-0123456789abcdef0123456789abcdef",
  TICKET_SECRET: "test-ticket-secret-0123456789abcdef0123456789abcdef",
};

/** Real local D1 + KV (workerd via getPlatformProxy) migrated from the repo SQL, plus test secrets. */
export async function createTestEnv(): Promise<{ env: Env; dispose: () => Promise<void> }> {
  const proxy = await getPlatformProxy<Record<string, unknown>>({
    configPath: join(import.meta.dirname, "..", "wrangler.toml"),
    persist: false,
  });
  await applyMigrations(proxy.env.DB as D1Database);
  // Rate-limit bindings are replaced by an injectable limiter in tests (see src/lib/ratelimit.ts).
  const { RL_AUTH: _a, RL_SAVE: _s, RL_RUN: _r, ...rest } = proxy.env;
  return { env: { ...rest, ...TEST_SECRETS } as unknown as Env, dispose: () => proxy.dispose() };
}

export async function seedUser(db: D1Database, id: string, name = id): Promise<void> {
  await db
    .prepare("INSERT INTO users (id, display_name, friend_code, created_at) VALUES (?1, ?2, ?3, 1)")
    .bind(id, name, `fc-${id}`)
    .run();
}

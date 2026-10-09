import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createRun,
  getRun,
  getSave,
  insertDeviceStmt,
  insertFlag,
  insertRefreshTokenStmt,
  insertUserStmt,
  leaderboardAround,
  leaderboardMe,
  leaderboardTop,
  listSaveRevisions,
  persistRunResult,
  putSave,
  revokeRefreshFamily,
  rotateRefreshToken,
  transitionRun,
} from "../src/db/index.ts";
import { createTestDb, seedUser } from "./helpers.ts";

let db: D1Database;
let dispose: () => Promise<void>;
let n = 0;
const uid = () => `u${++n}`;

beforeAll(async () => {
  ({ db, dispose } = await createTestDb());
});
afterAll(() => dispose());

const run = (id: string, userId: string, issuedAt = 1000) => ({
  id,
  userId,
  mode: "trial" as const,
  boardId: "trial_wpm",
  trialId: "t1",
  seed: 123,
  issuedAt,
  expiresAt: issuedAt + 600_000,
  simVersion: 1,
  contentVersion: "deadbeef",
  sig: "sig",
});

describe("schema", () => {
  test("STRICT tables and FKs are enforced", async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO devices (device_id, user_id, created_at, last_seen_at) VALUES ('d','nope',1,1)",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "INSERT INTO users (id, display_name, friend_code, age_band, created_at) VALUES ('x','x','x','bad',1)",
        )
        .run(),
    ).rejects.toThrow();
  });

  test("user/device helper statements", async () => {
    const id = uid();
    await db.batch([
      insertUserStmt(db, { id, displayName: "A", friendCode: `f-${id}`, now: 5 }),
      insertDeviceStmt(db, `dev-${id}`, id, 5),
    ]);
    const row = await db
      .prepare("SELECT user_id FROM devices WHERE device_id = ?1")
      .bind(`dev-${id}`)
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe(id);
  });
});

describe("saves", () => {
  test("If-Match revision conflict", async () => {
    const u = uid();
    await seedUser(db, u);
    expect(await getSave(db, u)).toBeNull();
    // missing save + stale revision -> conflict with server null
    expect(
      await putSave(db, {
        userId: u,
        expectedRevision: 3,
        blobB64: "x",
        summaryJson: "{}",
        now: 1,
      }),
    ).toEqual({
      ok: false,
      conflict: true,
      server: null,
    });
    expect(
      await putSave(db, {
        userId: u,
        expectedRevision: 0,
        blobB64: "a",
        summaryJson: "{}",
        now: 10,
      }),
    ).toEqual({
      ok: true,
      revision: 1,
      updatedAt: 10,
    });
    // creating again with "0" conflicts
    const dup = await putSave(db, {
      userId: u,
      expectedRevision: 0,
      blobB64: "b",
      summaryJson: "{}",
      now: 11,
    });
    expect(dup.ok).toBe(false);
    // stale revision conflicts and returns the server row; nothing written
    const stale = await putSave(db, {
      userId: u,
      expectedRevision: 5,
      blobB64: "c",
      summaryJson: "{}",
      now: 12,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.server?.revision).toBe(1);
    expect((await getSave(db, u))?.blob_b64).toBe("a");
    expect(
      await putSave(db, {
        userId: u,
        expectedRevision: 1,
        blobB64: "d",
        summaryJson: "{}",
        now: 13,
      }),
    ).toEqual({
      ok: true,
      revision: 2,
      updatedAt: 13,
    });
    expect((await listSaveRevisions(db, u)).results.map((r) => r.revision)).toEqual([1]);
  });

  test("keeps only the last 5 superseded revisions", async () => {
    const u = uid();
    await seedUser(db, u);
    await putSave(db, { userId: u, expectedRevision: 0, blobB64: "v1", summaryJson: "{}", now: 1 });
    for (let rev = 1; rev <= 9; rev++) {
      const r = await putSave(db, {
        userId: u,
        expectedRevision: rev,
        blobB64: `v${rev + 1}`,
        summaryJson: "{}",
        now: rev + 1,
      });
      expect(r.ok).toBe(true);
    }
    const cur = await getSave(db, u);
    expect(cur?.revision).toBe(10);
    expect(cur?.blob_b64).toBe("v10");
    const hist = await listSaveRevisions(db, u);
    expect(hist.results.map((r) => r.revision)).toEqual([9, 8, 7, 6, 5]);
    expect(hist.results[0]?.blob_b64).toBe("v9");
  });
});

describe("runs", () => {
  test("one open trial ticket per user (index + createRun abandons the old one)", async () => {
    const u = uid();
    await seedUser(db, u);
    await createRun(db, run(`${u}-a`, u));
    await createRun(db, run(`${u}-b`, u, 2000));
    expect((await getRun(db, `${u}-a`))?.status).toBe("abandoned");
    expect((await getRun(db, `${u}-b`))?.status).toBe("open");
    // the raw constraint: a second open row is rejected by the partial unique index
    await expect(
      db
        .prepare(
          `INSERT INTO runs (id,user_id,mode,board_id,trial_id,seed,issued_at,expires_at,sim_version,content_version,sig)
           VALUES ('raw',?1,'trial','trial_wpm','t',1,1,2,1,'deadbeef','s')`,
        )
        .bind(u)
        .run(),
    ).rejects.toThrow(/UNIQUE/i);
    // another user is unaffected
    const other = uid();
    await seedUser(db, other);
    await createRun(db, run(`${other}-a`, other));
  });

  test("conditional transition: second submit changes 0 rows", async () => {
    const u = uid();
    await seedUser(db, u);
    await createRun(db, run(`${u}-r`, u));
    const t = {
      runId: `${u}-r`,
      status: "accepted" as const,
      now: 5000,
      submitNonce: "n1",
      logSha256: "h",
      response: "{}",
    };
    expect(await transitionRun(db, t)).toBe(true);
    expect(await transitionRun(db, { ...t, submitNonce: "n2", status: "rejected" })).toBe(false);
    const row = await getRun(db, `${u}-r`);
    expect(row?.status).toBe("accepted");
    expect(row?.submit_nonce).toBe("n1");
    // once terminal, the user may open a new ticket
    await createRun(db, run(`${u}-r2`, u, 9000));
  });

  test("persistRunResult: loser of the race writes nothing else", async () => {
    const u = uid();
    await seedUser(db, u);
    await createRun(db, run(`${u}-r`, u));
    const mk = (nonce: string, wpm: number) => ({
      transition: {
        runId: `${u}-r`,
        status: "accepted" as const,
        now: 1,
        submitNonce: nonce,
        response: "{}",
      },
      leaderboard: [
        {
          boardId: "trial_wpm",
          periodKey: "all",
          userId: u,
          wpmX100: wpm,
          accuracyBp: 9000,
          achievedAt: 1,
          status: "ok" as const,
        },
      ],
      replay: { logB64: "log", expiresAt: 99 },
      flags: [
        {
          id: `f-${nonce}`,
          runId: `${u}-r`,
          userId: u,
          reasonCode: "x",
          severity: "info" as const,
          now: 1,
        },
      ],
    });
    expect(await persistRunResult(db, mk("win", 8000))).toBe(true);
    expect(await persistRunResult(db, mk("lose", 9900))).toBe(false);
    const me = await leaderboardMe(db, { boardId: "trial_wpm", periodKey: "all", userId: u });
    expect(me?.wpm_x100).toBe(8000);
    const flags = await db
      .prepare("SELECT id FROM flags WHERE user_id = ?1")
      .bind(u)
      .all<{ id: string }>();
    expect(flags.results.map((f) => f.id)).toEqual(["f-win"]);
    const rep = await db
      .prepare("SELECT COUNT(*) n FROM run_replays WHERE run_id = ?1")
      .bind(`${u}-r`)
      .first<{ n: number }>();
    expect(rep?.n).toBe(1);
  });
});

describe("leaderboard", () => {
  const B = "trial_wpm";
  const P = "S1";
  test("ordering, ties, around-me, flagged visibility", async () => {
    // 30 users, wpm 10000+i*100, plus one tied pair; one flagged entry above everyone
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const u = uid();
      ids.push(u);
      await seedUser(db, u, `name-${u}`);
      await createRun(db, run(`${u}-r`, u));
      await persistRunResult(db, {
        transition: { runId: `${u}-r`, status: "accepted", now: 1, submitNonce: "n" },
        leaderboard: [
          {
            boardId: B,
            periodKey: P,
            userId: u,
            wpmX100: 5000 + i * 100,
            accuracyBp: 9000,
            achievedAt: 100 + i,
            status: "ok",
          },
        ],
      });
    }
    // ids[29] is rank 1 ... ids[0] is rank 30
    const cheat = uid();
    await seedUser(db, cheat, "cheater");
    await createRun(db, run(`${cheat}-r`, cheat));
    await persistRunResult(db, {
      transition: { runId: `${cheat}-r`, status: "flagged", now: 1, submitNonce: "n" },
      leaderboard: [
        {
          boardId: B,
          periodKey: P,
          userId: cheat,
          wpmX100: 30000,
          accuracyBp: 10000,
          achievedAt: 1,
          status: "flagged",
        },
      ],
    });

    const top = await leaderboardTop(db, { boardId: B, periodKey: P, limit: 100 });
    expect(top).toHaveLength(30);
    expect(top[0]?.user_id).toBe(ids[29]);
    expect(top.map((t) => t.rank)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(top.some((t) => t.user_id === cheat)).toBe(false);
    expect(top[0]?.display_name).toBe(`name-${ids[29]}`);

    // around-me for rank 15 (ids[15]): ranks 5..25
    const mid = ids[15] as string;
    const around = await leaderboardAround(db, { boardId: B, periodKey: P, userId: mid });
    expect(around).toHaveLength(21);
    expect(around[0]?.rank).toBe(5);
    expect(around[20]?.rank).toBe(25);
    expect(around.find((r) => r.user_id === mid)?.rank).toBe(15);
    expect(around.some((r) => r.user_id === cheat)).toBe(false);
    // top edge clamps
    const first = await leaderboardAround(db, {
      boardId: B,
      periodKey: P,
      userId: ids[29] as string,
    });
    expect(first[0]?.rank).toBe(1);
    expect(first).toHaveLength(21);

    // owner sees the flagged entry at its shadow rank 1; others shift by nothing for ok users
    const mine = await leaderboardMe(db, { boardId: B, periodKey: P, userId: cheat });
    expect(mine?.status).toBe("flagged");
    expect(mine?.rank).toBe(1);
    const cheatAround = await leaderboardAround(db, { boardId: B, periodKey: P, userId: cheat });
    expect(cheatAround[0]?.user_id).toBe(cheat);
    expect(cheatAround[0]?.rank).toBe(1);
    expect(cheatAround).toHaveLength(21);
    // an honest user's own rank is not displaced by the shadow row
    expect(
      (await leaderboardMe(db, { boardId: B, periodKey: P, userId: ids[29] as string }))?.rank,
    ).toBe(1);
  });

  test("ties go to earlier achieved_at; PB only improves; flagged never displaces ok", async () => {
    const a = uid();
    const b = uid();
    for (const u of [a, b]) {
      await seedUser(db, u);
      await createRun(db, run(`${u}-r`, u));
    }
    const lb = (u: string, wpm: number, at: number, status: "ok" | "flagged") => ({
      boardId: B,
      periodKey: "tie",
      userId: u,
      wpmX100: wpm,
      accuracyBp: 9500,
      achievedAt: at,
      status,
    });
    await persistRunResult(db, {
      transition: { runId: `${a}-r`, status: "accepted", now: 1, submitNonce: "a" },
      leaderboard: [lb(a, 7000, 500, "ok")],
    });
    await persistRunResult(db, {
      transition: { runId: `${b}-r`, status: "accepted", now: 1, submitNonce: "b" },
      leaderboard: [lb(b, 7000, 400, "ok")],
    });
    const top = await leaderboardTop(db, { boardId: B, periodKey: "tie", limit: 10 });
    expect(top.map((t) => t.user_id)).toEqual([b, a]);

    // lower score does not replace; higher flagged run does not displace the ok row
    await createRun(db, run(`${a}-r2`, a, 5000));
    await persistRunResult(db, {
      transition: { runId: `${a}-r2`, status: "flagged", now: 2, submitNonce: "a2" },
      leaderboard: [lb(a, 9999, 600, "flagged")],
    });
    const me = await leaderboardMe(db, { boardId: B, periodKey: "tie", userId: a });
    expect(me?.status).toBe("ok");
    expect(me?.wpm_x100).toBe(7000);
  });
});

describe("flags", () => {
  test("insert flag", async () => {
    const u = uid();
    await seedUser(db, u);
    await createRun(db, run(`${u}-r`, u));
    await insertFlag(db, {
      id: `fl-${u}`,
      runId: `${u}-r`,
      userId: u,
      reasonCode: "iki_cv",
      severity: "shadow",
      detailsJson: '{"cv":0.05}',
      now: 7,
    });
    const f = await db
      .prepare("SELECT * FROM flags WHERE id = ?1")
      .bind(`fl-${u}`)
      .first<{ review_state: string; severity: string }>();
    expect(f?.review_state).toBe("open");
    expect(f?.severity).toBe("shadow");
  });
});

describe("gem ledger", () => {
  const ins = (u: string, key: string, id: string) =>
    db
      .prepare(
        `INSERT INTO gem_ledger (id,user_id,bucket,delta,kind,source_type,source_id,idempotency_key,created_at)
         VALUES (?1,?2,'free',10,'grant','reward','r1',?3,1)`,
      )
      .bind(id, u, key)
      .run();

  test("idempotency key is unique; ledger is append-only", async () => {
    const u = uid();
    await seedUser(db, u);
    await ins(u, `k-${u}`, `${u}-1`);
    await expect(ins(u, `k-${u}`, `${u}-2`)).rejects.toThrow(/UNIQUE/i);
    await expect(
      db.prepare("UPDATE gem_ledger SET delta = 99 WHERE id = ?1").bind(`${u}-1`).run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.prepare("DELETE FROM gem_ledger WHERE id = ?1").bind(`${u}-1`).run(),
    ).rejects.toThrow(/append-only/);
  });

  test("purchases.provider_ref is unique", async () => {
    const u = uid();
    await seedUser(db, u);
    const p = (id: string) =>
      db
        .prepare(
          `INSERT INTO purchases (id,user_id,sku,gems,amount_cents,currency,provider,provider_ref,status,created_at,updated_at)
           VALUES (?1,?2,'s',100,499,'USD','stripe','ref-1','pending',1,1)`,
        )
        .bind(id, u)
        .run();
    await p(`${u}-p1`);
    await expect(p(`${u}-p2`)).rejects.toThrow(/UNIQUE/i);
  });
});

describe("refresh tokens", () => {
  const issue = async (u: string, hash: string, fam: string) => {
    await insertRefreshTokenStmt(db, {
      tokenHash: hash,
      userId: u,
      deviceId: null,
      familyId: fam,
      now: 100,
      expiresAt: 10_000,
    }).run();
  };
  const state = async (hash: string) =>
    db
      .prepare(
        "SELECT revoked_at, rotated_at, parent_hash FROM refresh_tokens WHERE token_hash = ?1",
      )
      .bind(hash)
      .first<{
        revoked_at: number | null;
        rotated_at: number | null;
        parent_hash: string | null;
      }>();

  test("rotation chains the family; reuse of an old token revokes the whole family", async () => {
    const u = uid();
    await seedUser(db, u);
    await issue(u, `${u}-t1`, `${u}-fam`);
    const r1 = await rotateRefreshToken(db, {
      oldHash: `${u}-t1`,
      newHash: `${u}-t2`,
      now: 200,
      expiresAt: 10_000,
    });
    expect(r1).toEqual({ status: "ok", userId: u, deviceId: null, familyId: `${u}-fam` });
    expect((await state(`${u}-t2`))?.parent_hash).toBe(`${u}-t1`);
    const r2 = await rotateRefreshToken(db, {
      oldHash: `${u}-t2`,
      newHash: `${u}-t3`,
      now: 300,
      expiresAt: 10_000,
    });
    expect(r2.status).toBe("ok");

    // attacker replays t1 -> reuse detected, t3 (the live token) is revoked too
    const reuse = await rotateRefreshToken(db, {
      oldHash: `${u}-t1`,
      newHash: `${u}-evil`,
      now: 400,
      expiresAt: 10_000,
    });
    expect(reuse).toEqual({ status: "reused" });
    expect((await state(`${u}-t3`))?.revoked_at).toBe(400);
    expect(await state(`${u}-evil`)).toBeNull();
    // the legit holder of t3 is now locked out
    expect(
      await rotateRefreshToken(db, {
        oldHash: `${u}-t3`,
        newHash: `${u}-t4`,
        now: 500,
        expiresAt: 10_000,
      }),
    ).toEqual({ status: "reused" });
  });

  test("unknown and expired tokens are invalid; other families untouched", async () => {
    const u = uid();
    await seedUser(db, u);
    await issue(u, `${u}-a`, `${u}-fa`);
    await issue(u, `${u}-b`, `${u}-fb`);
    expect(
      await rotateRefreshToken(db, { oldHash: "nope", newHash: "n", now: 1, expiresAt: 2 }),
    ).toEqual({ status: "invalid" });
    expect(
      await rotateRefreshToken(db, {
        oldHash: `${u}-a`,
        newHash: `${u}-a2`,
        now: 20_000,
        expiresAt: 30_000,
      }),
    ).toEqual({ status: "invalid" });
    expect(await revokeRefreshFamily(db, `${u}-fa`, 5)).toBe(1);
    expect((await state(`${u}-b`))?.revoked_at).toBeNull();
  });
});

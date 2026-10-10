// Save helpers (docs/interfaces.md §9.1): migrateSave, summarize, mergeSaves. Pure; no I/O, no clock, no randomness.
import { SAVE_SCHEMA_VERSION, SaveBlob, type SaveSummary } from "./save.ts";

type Save = SaveBlob;

/** MIGRATIONS[n] upgrades a version-n blob to n+1. Old migrations are never edited or deleted. */
export const MIGRATIONS: Readonly<Record<number, (old: unknown) => unknown>> = {
  // v1 -> v2: empty journal notes, reset generation 0.
  1: (old) => {
    const o = old as { journal?: Record<string, unknown> };
    return { ...o, schemaVersion: 2, resetEpoch: 0, journal: { ...o.journal, notes: {} } };
  },
};

export class SaveVersionError extends Error {
  override name = "SaveVersionError";
  constructor(
    readonly found: number,
    readonly latest: number,
  ) {
    super(`save schemaVersion ${found} is newer than this client supports (${latest})`);
  }
}

/**
 * Runs MIGRATIONS[v] for v = raw.schemaVersion .. latest-1, then SaveBlob.parse.
 * A NEWER version throws SaveVersionError: the client must go read-only ("please refresh") and never PUT.
 */
export function migrateSave(raw: unknown): Save {
  if (typeof raw !== "object" || raw === null) throw new Error("save is not an object");
  let v = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
    throw new Error("save has no valid schemaVersion");
  }
  if (v > SAVE_SCHEMA_VERSION) throw new SaveVersionError(v, SAVE_SCHEMA_VERSION);
  let cur: unknown = raw;
  while (v < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no migration from save schemaVersion ${v}`);
    cur = step(cur);
    v++;
  }
  return SaveBlob.parse(cur);
}

/** `levelMax` = highest cleared level as chapter*100 + level (ids "chN-lM"); 0 if none. `stars` = earned stars. */
export function summarize(save: Save): SaveSummary {
  let levelMax = 0;
  let stars = 0;
  for (const [id, lv] of Object.entries(save.progress.levels)) {
    for (const s of lv.stars) if (s) stars++;
    if (!lv.cleared) continue;
    const m = /^ch(\d+)-l(\d+)$/.exec(id);
    if (m) levelMax = Math.max(levelMax, Number(m[1]) * 100 + Number(m[2]));
  }
  return {
    schemaVersion: save.schemaVersion,
    levelMax,
    stars: Math.min(900, stars),
    playtimeSec: save.playtimeSec,
  };
}

// ---------------------------------------------------------------- merge

/** More than this much playtime gained on BOTH sides since base, with diverging fungible state, asks the user. */
export const CHOICE_PLAYTIME_SEC = 30 * 60;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Deterministic deep equality for JSON-shaped data (key order independent). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  }
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) =>
    jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Union preserving first-seen order (a then b), so merge(merge(l,s),s) is a fixed point. */
const union = <T>(a: readonly T[], b: readonly T[]): T[] => {
  const seen = new Set<T>(a);
  const out = [...a];
  for (const x of b) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
};

const FUNGIBLE = [
  "wallet",
  "inventory",
  "equipped",
  "loadout",
  "cachePity",
  "metaRng",
  "replays",
] as const;
type FungibleKey = (typeof FUNGIBLE)[number];
const pickFungible = (s: Save): Record<FungibleKey, unknown> =>
  Object.fromEntries(FUNGIBLE.map((k) => [k, s[k]])) as Record<FungibleKey, unknown>;

function mergeLevels(a: Save["progress"]["levels"], b: Save["progress"]["levels"]) {
  const out: Save["progress"]["levels"] = {};
  const ids = union(Object.keys(a), Object.keys(b));
  for (const id of ids) {
    const x = a[id];
    const y = b[id];
    if (x && y) {
      const bt = [x.bestTicks, y.bestTicks].filter((t): t is number => t !== null);
      out[id] = {
        cleared: x.cleared || y.cleared,
        stars: [x.stars[0] || y.stars[0], x.stars[1] || y.stars[1], x.stars[2] || y.stars[2]],
        bestTicks: bt.length === 0 ? null : Math.min(...bt),
        attempts: Math.max(x.attempts, y.attempts),
      };
    } else {
      out[id] = clone((x ?? y) as NonNullable<typeof x>);
    }
  }
  return out;
}

function mergeChests(a: Record<string, number[]>, b: Record<string, number[]>) {
  const out: Record<string, number[]> = {};
  for (const ch of union(Object.keys(a), Object.keys(b))) {
    out[ch] = union(a[ch] ?? [], b[ch] ?? []);
  }
  return out;
}

function mergeSrs(a: Save["srs"], b: Save["srs"]): Save["srs"] {
  // Start from the side with more levelsPlayed (tie: a = local), add entries only the other side has,
  // union `mastered`, and drop mastered keys from `entries`.
  const primary = b.levelsPlayed > a.levelsPlayed ? b : a;
  const other = primary === a ? b : a;
  const mastered = union(primary.mastered, other.mastered);
  const m = new Set(mastered);
  const entries: Save["srs"]["entries"] = {};
  for (const [k, v] of Object.entries(primary.entries)) if (!m.has(k)) entries[k] = clone(v);
  for (const [k, v] of Object.entries(other.entries)) {
    if (!m.has(k) && !(k in primary.entries)) entries[k] = clone(v);
  }
  return { levelsPlayed: Math.max(a.levelsPlayed, b.levelsPlayed), entries, mastered };
}

function mergeAccuracy(a: Save["accuracyDaily"], b: Save["accuracyDaily"]): Save["accuracyDaily"] {
  const by = new Map<string, number>();
  for (const e of [...a, ...b]) by.set(e.day, Math.max(by.get(e.day) ?? -1, e.accuracyBp));
  return [...by.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .slice(-14)
    .map(([day, accuracyBp]) => ({ day, accuracyBp }));
}

/** Per-key three-way merge: a side that changed a key vs base wins (local on a double change); no base -> union, local wins. */
function mergeNotes(
  base: Record<string, string> | null,
  a: Record<string, string>,
  b: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k];
    const y = b[k];
    const v = x === y ? x : base === null ? (x ?? y) : x === base[k] ? y : x;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function minRecord(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of union(Object.keys(a), Object.keys(b))) {
    const x = a[k];
    const y = b[k];
    out[k] = x === undefined ? (y as number) : y === undefined ? x : Math.min(x, y);
  }
  return out;
}

/**
 * Three-way merge (interfaces §9.1, M9). `base` = the last blob this client synced with the server (null if never).
 * - Monotonic fields merge per field (levels, frontier, star chests as per-chapter set union, unlocks, journal,
 *   lifetime, playtime, accuracyDaily).
 * - SRS starts from the side with more `levelsPlayed`; other side's entries are added; `mastered` is a union.
 * - The fungible group (wallet, inventory, equipped, loadout, cachePity, metaRng, replays) is merged as ONE unit:
 *   only one side changed vs base -> that side; both changed or base null -> the side with more playtime
 *   (tie: local). Fungible gains are therefore never summed or duplicated.
 * - `needsUserChoice` when both sides diverged on the fungible group and each gained > 30 min of playtime vs base.
 * - Settings: local.
 */
export function mergeSaves(
  base: Save | null,
  local: Save,
  server: Save,
): { merged: Save; needsUserChoice: boolean } {
  const l = local;
  const s = server;
  // New Game generation: the side with the higher resetEpoch wins wholesale (settings stay local), so older-generation
  // progress can never come back. Works offline: the local blob carries the bumped epoch until the next sync.
  if (l.resetEpoch !== s.resetEpoch) {
    const win = l.resetEpoch > s.resetEpoch ? l : s;
    const merged = clone(win);
    merged.settings = clone(l.settings);
    merged.createdAtMs = win.createdAtMs;
    merged.updatedAtMs = Math.max(l.updatedAtMs, s.updatedAtMs);
    return { merged, needsUserChoice: false };
  }
  const baseG = base ? pickFungible(base) : null;
  const lG = pickFungible(l);
  const sG = pickFungible(s);
  let takeServerGroup: boolean;
  let needsUserChoice = false;
  if (jsonEqual(lG, sG)) {
    takeServerGroup = false;
  } else {
    const localChanged = baseG === null ? true : !jsonEqual(lG, baseG);
    const serverChanged = baseG === null ? true : !jsonEqual(sG, baseG);
    if (localChanged && !serverChanged) takeServerGroup = false;
    else if (serverChanged && !localChanged) takeServerGroup = true;
    else {
      takeServerGroup = s.playtimeSec > l.playtimeSec; // tie -> local
      if (
        base &&
        l.playtimeSec - base.playtimeSec > CHOICE_PLAYTIME_SEC &&
        s.playtimeSec - base.playtimeSec > CHOICE_PLAYTIME_SEC
      ) {
        needsUserChoice = true;
      }
    }
  }
  const g = clone(takeServerGroup ? sG : lG);
  const richer = s.playtimeSec > l.playtimeSec ? s : l; // pace follows the side with more play

  const merged: Save = {
    schemaVersion: 2,
    resetEpoch: l.resetEpoch,
    createdAtMs: Math.min(l.createdAtMs, s.createdAtMs),
    updatedAtMs: Math.max(l.updatedAtMs, s.updatedAtMs),
    playtimeSec: Math.max(l.playtimeSec, s.playtimeSec),
    settings: clone(l.settings),
    progress: {
      frontierChapter: Math.max(l.progress.frontierChapter, s.progress.frontierChapter),
      levels: mergeLevels(l.progress.levels, s.progress.levels),
      starChestsClaimed: mergeChests(l.progress.starChestsClaimed, s.progress.starChestsClaimed),
    },
    pace: clone(richer.pace),
    accuracyDaily: mergeAccuracy(l.accuracyDaily, s.accuracyDaily),
    ...(g as Pick<Save, FungibleKey>),
    unlocks: {
      actives: union(l.unlocks.actives, s.unlocks.actives),
      passives: union(l.unlocks.passives, s.unlocks.passives),
    },
    srs: mergeSrs(l.srs, s.srs),
    journal: {
      firstSeen: minRecord(l.journal.firstSeen, s.journal.firstSeen),
      notes: mergeNotes(base?.journal.notes ?? null, l.journal.notes, s.journal.notes),
    },
    lifetime: {
      words: Math.max(l.lifetime.words, s.lifetime.words),
      chars: Math.max(l.lifetime.chars, s.lifetime.chars),
      typos: Math.max(l.lifetime.typos, s.lifetime.typos),
    },
  };
  return { merged, needsUserChoice };
}

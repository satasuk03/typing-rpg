// Local-first save sync (docs/interfaces.md §9.1).
//   - The local save (IndexedDB) is always authoritative for play. Edits mark it dirty and schedule a debounced sync.
//   - `base` = the last server blob this client synced with (merge base); `rev` = that server revision.
//   - PUT with If-Match: rev. 409 -> mergeSaves(base, local, server) -> PUT again with the server revision.
//   - 404 with a non-zero If-Match (the server lost the save) -> re-PUT with If-Match "0".
//   - Offline: a NetworkError leaves the save dirty (persisted) and retries with backoff / on 'online'.
//   - A server blob with a NEWER schemaVersion puts the client in read-only mode: it never PUTs.
import {
  decodeSaveWire,
  encodeSaveWire,
  jsonEqual,
  mergeSaves,
  migrateSave,
  type SaveBlob,
  SaveVersionError,
  summarize,
} from "@hd2d/shared";
import type { ApiClient } from "./apiClient.ts";
import type { AuthManager } from "./auth.ts";
import { ApiError, NetworkError } from "./errors.ts";
import type { KeyValueStore } from "./storage.ts";

const K_LOCAL = "save.local";
const K_BASE = "save.base";
const K_REV = "save.rev";
const K_DIRTY = "save.dirty";
const K_OWNER = "save.owner";

export type SyncStatus =
  | "idle"
  | "synced"
  | "dirty" // local changes waiting to upload
  | "offline" // last attempt hit a network error; will retry
  | "read-only" // server save is from a newer client version
  | "error";

export interface SyncResult {
  status: SyncStatus;
  revision: number;
  /** true if a merge happened (409 or first pull with local data) */
  merged: boolean;
  needsUserChoice: boolean;
}

export interface SaveSyncOptions {
  api: ApiClient;
  auth: AuthManager;
  store: KeyValueStore;
  /** Debounce before a scheduled sync (ms). */
  debounceMs?: number;
  maxAttempts?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  onStatus?: (s: SyncStatus) => void;
}

export class SaveSync {
  private readonly api: ApiClient;
  private readonly auth: AuthManager;
  private readonly store: KeyValueStore;
  private readonly debounceMs: number;
  private readonly maxAttempts: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly onStatus?: (s: SyncStatus) => void;
  private timer: unknown = null;
  private chain: Promise<unknown> = Promise.resolve();
  private retryDelay = 2000;
  status: SyncStatus = "idle";
  /** set when the last merge diverged on both sides with >30 min each (UI may ask the player) */
  lastNeedsUserChoice = false;

  constructor(o: SaveSyncOptions) {
    this.api = o.api;
    this.auth = o.auth;
    this.store = o.store;
    this.debounceMs = o.debounceMs ?? 1500;
    this.maxAttempts = o.maxAttempts ?? 5;
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.onStatus = o.onStatus;
  }

  private setStatus(s: SyncStatus): void {
    this.status = s;
    this.onStatus?.(s);
  }

  async getLocal(): Promise<SaveBlob | null> {
    const raw = await this.store.get<unknown>(K_LOCAL);
    return raw === undefined ? null : migrateSave(raw);
  }

  async isDirty(): Promise<boolean> {
    return (await this.store.get<boolean>(K_DIRTY)) === true;
  }

  /** Persist an edited save locally (immediately) and schedule a debounced upload. */
  async setLocal(save: SaveBlob): Promise<void> {
    await this.store.set(K_LOCAL, save);
    await this.store.set(K_DIRTY, true);
    this.setStatus(this.status === "read-only" ? "read-only" : "dirty");
    this.schedule(this.debounceMs);
  }

  /** (Re)arm the debounce timer. */
  schedule(ms: number): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.sync().catch(() => undefined);
    }, ms);
  }

  /** Call from window 'online'. */
  onOnline(): void {
    this.retryDelay = 2000;
    this.schedule(0);
  }

  /** Serialised: concurrent calls run one after another. */
  sync(): Promise<SyncResult> {
    const run = this.chain.then(() => this.syncOnce());
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async syncOnce(): Promise<SyncResult> {
    let merged = false;
    let needsUserChoice = false;
    let rev = (await this.store.get<number>(K_REV)) ?? 0;
    try {
      await this.auth.accessToken(); // establishes identity/session; sets currentUserId
      const owner = this.auth.currentUserId;
      if ((await this.store.get<string>(K_OWNER)) !== owner && owner) {
        // a different account than the one this local save last synced with: treat the cloud as unknown
        rev = 0;
        await this.store.set(K_REV, 0);
        await this.store.delete(K_BASE);
        await this.store.set(K_OWNER, owner);
        if ((await this.store.get(K_LOCAL)) !== undefined) await this.store.set(K_DIRTY, true);
      }

      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        const dirty = await this.isDirty();
        let local = await this.getLocal();
        let base = await this.readBase();

        // ---- pull
        const server = await this.auth.withToken((t) => this.api.getSave(t));
        if (server === null) {
          if (!local) {
            await this.store.set(K_REV, 0);
            this.setStatus("synced");
            return { status: "synced", revision: 0, merged, needsUserChoice };
          }
          rev = 0; // the server has no save: create with If-Match "0"
        } else {
          let serverBlob: SaveBlob;
          try {
            serverBlob = migrateSave(await decodeSaveWire(server.blob));
          } catch (e) {
            if (e instanceof SaveVersionError) {
              this.setStatus("read-only");
              return { status: "read-only", revision: rev, merged, needsUserChoice };
            }
            throw e;
          }
          if (!dirty || !local) {
            // nothing to upload: adopt the server copy
            if (server.revision !== rev || !local) {
              await this.store.set(K_LOCAL, serverBlob);
              await this.store.set(K_BASE, serverBlob);
              await this.store.set(K_REV, server.revision);
              await this.store.set(K_DIRTY, false);
            }
            this.setStatus("synced");
            return { status: "synced", revision: server.revision, merged, needsUserChoice };
          }
          // local has unsynced changes and the server has a save: merge first
          const m = mergeSaves(base, local, serverBlob);
          merged = true;
          needsUserChoice ||= m.needsUserChoice;
          local = m.merged;
          base = serverBlob;
          rev = server.revision;
          await this.store.set(K_LOCAL, local);
          await this.store.set(K_BASE, base);
          await this.store.set(K_REV, rev);
        }

        // ---- push
        if (!local) continue;
        const sent = local;
        try {
          const put = await this.auth.withToken(async (t) =>
            this.api.putSave(t, rev, {
              blob: await encodeSaveWire(local),
              summary: summarize(local as SaveBlob),
            }),
          );
          await this.store.set(K_BASE, local);
          await this.store.set(K_REV, put.revision);
          // If the player edited again while we were uploading, stay dirty.
          const nowLocal = await this.store.get<unknown>(K_LOCAL);
          await this.store.set(K_DIRTY, !jsonEqual(nowLocal, sent));
          const still = await this.isDirty();
          this.setStatus(still ? "dirty" : "synced");
          if (still) this.schedule(this.debounceMs);
          this.lastNeedsUserChoice = needsUserChoice;
          return {
            status: still ? "dirty" : "synced",
            revision: put.revision,
            merged,
            needsUserChoice,
          };
        } catch (e) {
          if (e instanceof ApiError && e.code === "save_conflict") continue; // re-pull + merge, then retry
          if (e instanceof ApiError && e.code === "not_found") {
            await this.store.set(K_REV, 0); // server lost the save: re-create
            rev = 0;
            await this.store.delete(K_BASE);
            continue;
          }
          throw e;
        }
      }
      this.setStatus("error");
      return { status: "error", revision: rev, merged, needsUserChoice };
    } catch (e) {
      if (e instanceof NetworkError) {
        this.setStatus("offline");
        this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
        this.schedule(this.retryDelay);
        return { status: "offline", revision: rev, merged, needsUserChoice };
      }
      if (e instanceof ApiError && e.reaction === "backoff") {
        this.setStatus("offline");
        this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
        this.schedule(this.retryDelay);
        return { status: "offline", revision: rev, merged, needsUserChoice };
      }
      this.setStatus("error");
      throw e;
    }
  }

  private async readBase(): Promise<SaveBlob | null> {
    const raw = await this.store.get<unknown>(K_BASE);
    return raw === undefined ? null : migrateSave(raw);
  }

  dispose(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }
}

// Client net layer (T5.3): typed API client, auth, local-first save sync, Typing Trial runs.
import { ApiClient } from "./apiClient.ts";
import { AuthManager } from "./auth.ts";
import { SaveSync, type SaveSyncOptions } from "./saveSync.ts";
import { IndexedDbStore, type KeyValueStore } from "./storage.ts";
import { TrialService } from "./trialService.ts";

export * from "./apiClient.ts";
export * from "./auth.ts";
export * from "./errors.ts";
export * from "./saveSync.ts";
export * from "./storage.ts";
export * from "./trialRecorder.ts";
export * from "./trialService.ts";

export interface Net {
  api: ApiClient;
  auth: AuthManager;
  sync: SaveSync;
  trials: TrialService;
  store: KeyValueStore;
}

export function createNet(o: {
  baseUrl: string;
  store?: KeyValueStore;
  fetch?: typeof fetch;
  clientVersion?: string;
  sync?: Partial<SaveSyncOptions>;
}): Net {
  const store = o.store ?? new IndexedDbStore();
  const api = new ApiClient({ baseUrl: o.baseUrl, fetch: o.fetch });
  const auth = new AuthManager({ api, store });
  const sync = new SaveSync({ api, auth, store, ...o.sync });
  const trials = new TrialService(api, auth, o.clientVersion ?? "dev");
  return { api, auth, sync, trials, store };
}

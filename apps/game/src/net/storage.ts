// Injectable persistent key-value storage. Production: IndexedDB. Tests: MemoryStore.
// Values are structured-clone-able JSON. Credentials live here and are NEVER logged.

export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.m.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.m.set(key, JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    this.m.delete(key);
  }
}

const STORE = "kv";

export class IndexedDbStore implements KeyValueStore {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private readonly name = "hd2d-net") {}

  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbp;
  }

  private async tx<T>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.tx("readonly", (s) => s.get(key))) as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    await this.tx("readwrite", (s) => s.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.tx("readwrite", (s) => s.delete(key));
  }
}

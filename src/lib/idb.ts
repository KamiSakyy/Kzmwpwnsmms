/**
 * Tiny promise-based IndexedDB key-value layer.
 * Stores: http (API disk cache), files (offline media blobs), meta (offline metadata).
 */
const DB_NAME = "anibeat";
const DB_VERSION = 2;

export const STORES = { http: "http", files: "files", meta: "meta", anime: "anime" } as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = op(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      }),
  );
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return await run<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
  } catch {
    return undefined;
  }
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<boolean> {
  try {
    await run(store, "readwrite", (s) => s.put(value, key));
    return true;
  } catch {
    return false;
  }
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.delete(key));
  } catch {
    /* ignore */
  }
}

export async function idbClear(store: StoreName): Promise<void> {
  try {
    await run(store, "readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    return await run<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
  } catch {
    return [];
  }
}

export async function idbCount(store: StoreName): Promise<number> {
  try {
    return await run<number>(store, "readonly", (s) => s.count());
  } catch {
    return 0;
  }
}

/** Iterate with a cursor and delete entries matching the predicate. */
export async function idbPrune(store: StoreName, shouldDelete: (value: unknown, key: string) => boolean): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const req = tx.objectStore(store).openCursor();
      let removed = 0;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(removed);
          return;
        }
        if (shouldDelete(cursor.value, String(cursor.key))) {
          cursor.delete();
          removed++;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

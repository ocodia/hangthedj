/**
 * Low-level IndexedDB wrapper.
 * Provides typed get/set/delete/getAll operations on named object stores.
 * All other storage modules use this; nothing else touches IDBDatabase directly.
 */

const DB_NAME = "hangthedj";
const DB_VERSION = 1;

/** Object store names used across the app */
export const STORES = {
  /** Reserved for future migration of settings from localStorage to IndexedDB. */
  SETTINGS: "settings",
  PERSONAS: "personas",
  REQUESTS: "requests",
  SESSIONS: "sessions",
  SESSION_MEMORY: "sessionMemory",
  BANTER_HISTORY: "banterHistory",
  CLIP_METADATA: "clipMetadata",
  TRACK_HISTORY: "trackHistory",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbInstance: IDBDatabase | null = null;

/** Open (or reuse) the database, creating stores on first run. */
export async function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      createStores(db);
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB open failed: ${(event.target as IDBOpenDBRequest).error?.message}`));
    };
  });
}

function createStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
    db.createObjectStore(STORES.SETTINGS, { keyPath: "key" });
  }

  if (!db.objectStoreNames.contains(STORES.PERSONAS)) {
    const store = db.createObjectStore(STORES.PERSONAS, { keyPath: "id" });
    store.createIndex("isPreset", "isPreset", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.REQUESTS)) {
    const store = db.createObjectStore(STORES.REQUESTS, { keyPath: "id" });
    store.createIndex("sessionId", "sessionId", { unique: false });
    store.createIndex("status", "status", { unique: false });
    store.createIndex("submittedAt", "submittedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
    const store = db.createObjectStore(STORES.SESSIONS, { keyPath: "id" });
    store.createIndex("startedAt", "startedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.SESSION_MEMORY)) {
    db.createObjectStore(STORES.SESSION_MEMORY, { keyPath: "sessionId" });
  }

  if (!db.objectStoreNames.contains(STORES.BANTER_HISTORY)) {
    const store = db.createObjectStore(STORES.BANTER_HISTORY, { keyPath: "id" });
    store.createIndex("sessionId", "sessionId", { unique: false });
    store.createIndex("generatedAt", "generatedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.CLIP_METADATA)) {
    db.createObjectStore(STORES.CLIP_METADATA, { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains(STORES.TRACK_HISTORY)) {
    const store = db.createObjectStore(STORES.TRACK_HISTORY, {
      keyPath: ["id", "sessionId"],
    });
    store.createIndex("sessionId", "sessionId", { unique: false });
    store.createIndex("playedAt", "playedAt", { unique: false });
  }
}

/** Read a single record by primary key. Returns undefined if not found. */
export async function dbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Write (put) a record. Overwrites if the key already exists. */
export async function dbPut<T>(store: StoreName, record: T): Promise<void> {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Delete a record by primary key. */
export async function dbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Retrieve all records from a store. */
export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Retrieve all records matching an index value. */
export async function dbGetAllByIndex<T>(
  store: StoreName,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const db = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const index = tx.objectStore(store).index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/** Close the database connection (mainly for testing cleanup). */
export function closeDatabase(): void {
  dbInstance?.close();
  dbInstance = null;
}

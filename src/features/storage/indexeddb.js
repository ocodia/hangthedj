/**
 * Low-level IndexedDB wrapper.
 * Provides get/set/delete/getAll operations on named object stores.
 */

const DB_NAME = 'hangthedj';
const DB_VERSION = 1;

export const STORES = {
  SETTINGS: 'settings',
  PERSONAS: 'personas',
  REQUESTS: 'requests',
  SESSIONS: 'sessions',
  SESSION_MEMORY: 'sessionMemory',
  BANTER_HISTORY: 'banterHistory',
  CLIP_METADATA: 'clipMetadata',
  TRACK_HISTORY: 'trackHistory',
};

let dbInstance = null;

export async function openDatabase() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      createStores(db);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`IndexedDB open failed: ${event.target.error?.message}`));
    };
  });
}

function createStores(db) {
  if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
  }

  if (!db.objectStoreNames.contains(STORES.PERSONAS)) {
    const store = db.createObjectStore(STORES.PERSONAS, { keyPath: 'id' });
    store.createIndex('isPreset', 'isPreset', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.REQUESTS)) {
    const store = db.createObjectStore(STORES.REQUESTS, { keyPath: 'id' });
    store.createIndex('sessionId', 'sessionId', { unique: false });
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('submittedAt', 'submittedAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
    const store = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
    store.createIndex('startedAt', 'startedAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.SESSION_MEMORY)) {
    db.createObjectStore(STORES.SESSION_MEMORY, { keyPath: 'sessionId' });
  }

  if (!db.objectStoreNames.contains(STORES.BANTER_HISTORY)) {
    const store = db.createObjectStore(STORES.BANTER_HISTORY, { keyPath: 'id' });
    store.createIndex('sessionId', 'sessionId', { unique: false });
    store.createIndex('generatedAt', 'generatedAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORES.CLIP_METADATA)) {
    db.createObjectStore(STORES.CLIP_METADATA, { keyPath: 'id' });
  }

  if (!db.objectStoreNames.contains(STORES.TRACK_HISTORY)) {
    const store = db.createObjectStore(STORES.TRACK_HISTORY, {
      keyPath: ['id', 'sessionId'],
    });
    store.createIndex('sessionId', 'sessionId', { unique: false });
    store.createIndex('playedAt', 'playedAt', { unique: false });
  }
}

export async function dbGet(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(store, record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(store, key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(store) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAllByIndex(store, indexName, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    const req = index.getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function closeDatabase() {
  dbInstance?.close();
  dbInstance = null;
}

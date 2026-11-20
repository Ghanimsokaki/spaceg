// ─────────────────────────────────────────────────────────────────────────────
//  Save storage: IndexedDB first, localStorage as a fallback (private windows,
//  blocked storage). Older localStorage saves are migrated on first read.
// ─────────────────────────────────────────────────────────────────────────────
const DB_NAME = 'stellar-drive-works';
const STORE = 'saves';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('indexedDB blocked'));
    } catch (e) { reject(e); }
  });
  dbPromise.catch(() => {});
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

export const storage = {
  backend: 'pending',
  async get(key) {
    try {
      const v = await tx('readonly', s => s.get(key));
      this.backend = 'IndexedDB';
      if (v != null) return JSON.parse(v);
      const legacy = lsGet(key);                 // migrate an older localStorage save
      if (legacy) { await this.set(key, JSON.parse(legacy)); return JSON.parse(legacy); }
      return null;
    } catch (e) {
      this.backend = 'localStorage';
      const v = lsGet(key);
      try { return v ? JSON.parse(v) : null; } catch (_) { return null; }
    }
  },
  async set(key, value) {
    const json = JSON.stringify(value);
    try {
      await tx('readwrite', s => s.put(json, key));
      this.backend = 'IndexedDB';
      return true;
    } catch (e) {
      this.backend = 'localStorage';
      return lsSet(key, json);
    }
  },
  async del(key) {
    lsDel(key);
    try { await tx('readwrite', s => s.delete(key)); } catch (e) { /* ignore */ }
  },
};

/**
 * The data folder chosen last time, kept by the browser (IndexedDB can hold a folder handle;
 * localStorage cannot), so the next visit can offer to reconnect. The browser still asks for
 * access again; that needs a click, so this only remembers, it never opens.
 */

const DB = 'pivot';
const STORE = 'folders';
const KEY = 'data';

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {'readonly' | 'readwrite'} mode @param {(s: IDBObjectStore) => IDBRequest} use */
async function withStore(mode, use) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = use(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** @param {FileSystemDirectoryHandle} handle */
export async function rememberFolder(handle) {
  await withStore('readwrite', (s) => s.put(handle, KEY));
}

/** The folder chosen last time, or null (none kept, or storage refused). */
export async function recallFolder() {
  try {
    return (await withStore('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

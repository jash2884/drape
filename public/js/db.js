// The closet lives on the device (IndexedDB): images, tags and embeddings.
// Each item keeps what the AI predicted next to what the user saved, so
// corrections can later train a better tagger.
const DB = "drape", VERSION = 1;
let dbp = null;

function open() {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" }).createIndex("created", "created");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("items", mode), store = t.objectStore("items");
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("Storage was blocked. Is the device out of space?"));
  });
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export const newId = () => `i_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const allItems = () => tx("readonly", (s) => req(s.index("created").getAll())).then((items) => items.reverse());
export const getItem = (id) => tx("readonly", (s) => req(s.get(id)));
export const putItem = (item) => tx("readwrite", (s) => req(s.put(item)));
export const deleteItem = (id) => tx("readwrite", (s) => req(s.delete(id)));

// Ask the browser not to evict the closet when space is tight.
export const persist = () => navigator.storage?.persist?.().catch(() => false);

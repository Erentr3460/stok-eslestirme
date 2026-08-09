/**
 * Tarayıcı içi kalıcı depo (IndexedDB).
 * Uygulama statik olarak yayınlandığı için sunucu/veritabanı yok: yüklenen
 * Excel dosyaları, onaylanan eşleştirmeler ve kurallar bu tarayıcıda saklanır.
 */

const DB_NAME = "slipring-stok";
const DB_VERSION = 1;

export const STORES = {
  batches: "batches",
  aliases: "aliases",
  ignored: "ignored",
  prefixes: "prefixes",
  meta: "meta",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.batches)) {
        db.createObjectStore(STORES.batches, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.aliases)) {
        db.createObjectStore(STORES.aliases, { keyPath: "codeNorm" });
      }
      if (!db.objectStoreNames.contains(STORES.ignored)) {
        db.createObjectStore(STORES.ignored, { keyPath: "codeNorm" });
      }
      if (!db.objectStoreNames.contains(STORES.prefixes)) {
        db.createObjectStore(STORES.prefixes, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB açılamadı"));
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB isteği başarısız"));
  });
}

export async function all<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  const tx = db.transaction(store, "readonly");
  return wrap(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  const tx = db.transaction(store, "readonly");
  return wrap(tx.objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function put<T>(store: StoreName, value: T): Promise<number> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  const key = await wrap(tx.objectStore(store).put(value as unknown as IDBValidKey extends never ? never : object));
  return Number(key);
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  await wrap(tx.objectStore(store).delete(key));
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await open();
  const tx = db.transaction(store, "readwrite");
  const os = tx.objectStore(store);
  for (const v of values) os.put(v as unknown as object);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB yazımı başarısız"));
  });
}

// A small IndexedDB store for the scanner's offline mode: a snapshot of the organization's
// products (for identifying codes without a connection) and the queue of operations waiting
// to be sent. Data is kept per browser and cleared on logout.

const DB_NAME = "storiva-offline";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "idempotencyKey" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB error"));
  });
}

export const kvGet = <T>(key: string) => run<T | undefined>("kv", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown) => run("kv", "readwrite", (s) => s.put(value, key));
export const queueAll = <T>() => run<T[]>("queue", "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const queuePut = (value: unknown) => run("queue", "readwrite", (s) => s.put(value));
export const queueDelete = (key: string) => run("queue", "readwrite", (s) => s.delete(key));

export async function clearOfflineData() {
  try {
    await run("kv", "readwrite", (s) => s.clear());
    await run("queue", "readwrite", (s) => s.clear());
  } catch {
    // Storage may be unavailable (private browsing); nothing to clear then.
  }
}

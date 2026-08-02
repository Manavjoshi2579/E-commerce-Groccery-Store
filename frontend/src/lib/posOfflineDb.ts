"use client";

const dbName = "eagle-mart-pos";
const dbVersion = 1;
const draftStore = "draft";
const queueStore = "queuedSales";
const metaStore = "meta";

export type PosQueuedSale = {
  localReference: string;
  idempotencyKey: string;
  deviceId: string;
  status: "QUEUED" | "SYNCING" | "SYNCED" | "STOCK_CONFLICT" | "PRICE_CHANGED" | "PRODUCT_DISABLED" | "PRODUCT_NOT_FOUND" | "LOCATION_INVALID" | "DUPLICATE" | "PAYMENT_REVIEW" | "PARTIAL" | "FAILED" | "MANUAL_REVIEW";
  createdAt: string;
  updatedAt: string;
  payload: any;
  result?: any;
};

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(draftStore)) db.createObjectStore(draftStore);
      if (!db.objectStoreNames.contains(queueStore)) {
        const store = db.createObjectStore(queueStore, { keyPath: "localReference" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(metaStore)) db.createObjectStore(metaStore);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB unavailable."));
  });
}

async function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void) {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = run(store);
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
  }).finally(() => db.close());
}

export async function getPosDeviceId() {
  if (typeof indexedDB === "undefined") return "browser-pos";
  const existing = await tx<string>(metaStore, "readonly", (store) => store.get("deviceId"));
  if (existing) return existing;
  const created = `pos-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  await tx(metaStore, "readwrite", (store) => store.put(created, "deviceId"));
  return created;
}

export async function savePosDraft(draft: any) {
  if (typeof indexedDB === "undefined") return;
  await tx(draftStore, "readwrite", (store) => store.put({ ...draft, updatedAt: new Date().toISOString() }, "current"));
}

export async function loadPosDraft<T>() {
  if (typeof indexedDB === "undefined") return null;
  return (await tx<T>(draftStore, "readonly", (store) => store.get("current"))) || null;
}

export async function clearPosDraft() {
  if (typeof indexedDB === "undefined") return;
  await tx(draftStore, "readwrite", (store) => store.delete("current"));
}

export async function queueOfflineSale(sale: PosQueuedSale) {
  await tx(queueStore, "readwrite", (store) => store.put(sale));
}

export async function listQueuedSales() {
  if (typeof indexedDB === "undefined") return [] as PosQueuedSale[];
  return (await tx<PosQueuedSale[]>(queueStore, "readonly", (store) => store.getAll())) || [];
}

export async function updateQueuedSale(localReference: string, changes: Partial<PosQueuedSale>) {
  const current = (await tx<PosQueuedSale>(queueStore, "readonly", (store) => store.get(localReference))) || null;
  if (!current) return;
  await tx(queueStore, "readwrite", (store) => store.put({ ...current, ...changes, updatedAt: new Date().toISOString() }));
}

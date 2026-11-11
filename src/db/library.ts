export type PhotoRecord = {
  id: string;
  name: string;
  relativePath: string;
  mime: string;
  size: number;
  modifiedAt: number;
  addedAt: number;
  width: number;
  height: number;
  capturedAt: number | null;
  favorite: boolean;
};

export type StoredPhoto = { record: PhotoRecord; blob: Blob };

const DB_NAME = 'halation-local';
const DB_VERSION = 1;
let opening: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not support local photo storage.'));
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('photos')) {
          const store = db.createObjectStore('photos', { keyPath: 'record.id' });
          store.createIndex('addedAt', 'record.addedAt');
          store.createIndex('capturedAt', 'record.capturedAt');
          store.createIndex('name', 'record.name');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the local library.'));
      request.onblocked = () => reject(new Error('Close other Halation tabs to finish the database upgrade.'));
    }).catch((error) => {
      opening = null;
      throw error;
    });
  }
  return opening!;
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('The local library transaction failed.'));
  });
}

export async function listPhotos(): Promise<PhotoRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').getAll();
    request.onsuccess = () => resolve((request.result as StoredPhoto[]).map((item) => item.record));
    request.onerror = () => reject(request.error);
  });
}

export async function listStoredPhotos(): Promise<StoredPhoto[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').getAll();
    request.onsuccess = () => resolve(request.result as StoredPhoto[]);
    request.onerror = () => reject(request.error);
  });
}

export async function savePhoto(record: PhotoRecord, blob: Blob): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('photos', 'readwrite');
  tx.objectStore('photos').put({ record, blob } satisfies StoredPhoto);
  await transactionDone(tx);
}

export async function savePhotos(items: StoredPhoto[]): Promise<void> {
  if (!items.length) return;
  const db = await openDatabase();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');
  for (const item of items) store.put(item);
  await transactionDone(tx);
}

export async function getPhotoBlob(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').get(id);
    request.onsuccess = () => resolve((request.result as StoredPhoto | undefined)?.blob ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function updateFavorite(id: string, favorite: boolean): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('photos', 'readwrite');
  const store = tx.objectStore('photos');
  const request = store.get(id);
  request.onsuccess = () => {
    const row = request.result as StoredPhoto | undefined;
    if (row) store.put({ ...row, record: { ...row.record, favorite } });
  };
  await transactionDone(tx);
}

export async function removePhoto(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction('photos', 'readwrite');
  tx.objectStore('photos').delete(id);
  await transactionDone(tx);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

export function makePhotoId(file: File, relativePath: string): string {
  return `${relativePath}\u0000${file.size}\u0000${file.lastModified}`;
}

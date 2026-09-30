// Asset file contents. Metadata lives on the document (data.docs[].assets),
// the blobs in IndexedDB – localStorage is too small for files. With saving
// disabled they are only kept in memory for the session.
import { settings, id, type Doc, type Asset } from '$lib/store.svelte';
import { download } from '$lib/download';

const DB = 'edotex-assets';
const STORE = 'blobs';
const cache = new Map<string, Blob>();

let db: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const store = (await open()).transaction(STORE, mode).objectStore(STORE);
    return await new Promise((resolve, reject) => {
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined; // e.g. private window without IndexedDB: memory only
  }
}

export async function getBlob(assetId: string): Promise<Blob | undefined> {
  if (cache.has(assetId)) return cache.get(assetId);
  const b = await tx<Blob>('readonly', (s) => s.get(assetId));
  if (b) cache.set(assetId, b);
  return b;
}

/** Add files to a document; the same name replaces the existing file. */
export async function addAssets(doc: Doc, files: Iterable<File>) {
  for (const f of files) {
    doc.assets ??= [];
    const old = doc.assets.find((a) => a.name === f.name);
    const a: Asset = { id: old?.id ?? id(), name: f.name, type: f.type, size: f.size, added: new Date().toISOString() };
    cache.set(a.id, f);
    if (settings.persist) await tx('readwrite', (s) => s.put(f, a.id));
    if (old) Object.assign(old, a);
    else doc.assets.push(a);
  }
  doc.updated = new Date().toISOString();
}

export async function removeAsset(doc: Doc, a: Asset) {
  doc.assets = doc.assets?.filter((x) => x.id !== a.id);
  cache.delete(a.id);
  await tx('readwrite', (s) => s.delete(a.id));
}

export async function removeDocAssets(doc: Doc) {
  for (const a of doc.assets ?? []) {
    cache.delete(a.id);
    await tx('readwrite', (s) => s.delete(a.id));
  }
}

/** When "save" is toggled: write blobs to IndexedDB or delete them there. */
export async function persistAssets(on: boolean, docs: Doc[]) {
  const ids = docs.flatMap((d) => d.assets ?? []).map((a) => a.id);
  if (on) {
    for (const i of ids) if (cache.has(i)) await tx('readwrite', (s) => s.put(cache.get(i)!, i));
  } else {
    for (const i of ids) await getBlob(i); // keep in memory for the session
    await tx('readwrite', (s) => s.clear());
  }
}

export function downloadAsset(a: Asset) {
  getBlob(a.id).then((b) => {
    if (!b) return alert(`"${a.name}" is not available in this browser.`);
    download(b, a.name);
  });
}

/** Whether the asset can be shown as an image in the browser. */
export function isImage(a: Asset): boolean {
  return a.type.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp)$/i.test(a.name);
}

export function sizeLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

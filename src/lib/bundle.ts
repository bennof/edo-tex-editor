// A document as a ZIP: the TeX source plus all assets next to it, so that
// references such as \includegraphics{image.png} keep working. edox.json holds
// the document's own name and the path of the TeX file. Importing restores a new document.
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { data, newDoc, docTitle, type Doc } from '$lib/store.svelte';
import { addAssets, getBlob } from '$lib/assets.svelte';
import { download, fileName } from '$lib/download';

const MANIFEST = 'edox.json';

// ZIP entries carry no media type; guess common ones from the extension
const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', pdf: 'application/pdf', css: 'text/css', csv: 'text/csv', txt: 'text/plain',
  json: 'application/json', tex: 'application/x-tex', cls: 'application/x-tex', sty: 'application/x-tex',
  bib: 'application/x-bibtex'
};
const typeOf = (path: string) => TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? '';

interface Manifest {
  edox: 1;
  name?: string;
  source: string; // path of the TeX file inside the ZIP
}

export async function exportDoc(doc: Doc) {
  const title = docTitle(doc);
  const source = doc.file ?? fileName(title, 'tex');
  const files: Record<string, Uint8Array> = {};
  const missing: string[] = [];
  for (const a of doc.assets ?? []) {
    const b = await getBlob(a.id);
    if (b) files[a.name] = new Uint8Array(await b.arrayBuffer());
    else missing.push(a.name);
  }
  files[source] = strToU8(doc.source);
  const manifest: Manifest = { edox: 1, name: doc.name || undefined, source };
  files[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));
  download(new Blob([zipSync(files)], { type: 'application/zip' }), fileName(title, 'zip'));
  if (missing.length) alert(`Not available in this browser, so not included:\n${missing.join('\n')}`);
}

const isZip = (f: File) => f.type === 'application/zip' || /\.zip$/i.test(f.name);
const isTex = (path: string) => /\.tex$/i.test(path);

/** Whether a dropped file can become a document (ZIP bundle or a .tex file). */
export const importable = (f: File) => isZip(f) || isTex(f.name);

/** Create a new document from a ZIP bundle or a .tex file; returns it. */
export async function importDoc(file: File): Promise<Doc> {
  if (isTex(file.name)) return newDoc({ source: await file.text(), file: file.name });

  let entries = Object.entries(unzipSync(new Uint8Array(await file.arrayBuffer()))).filter(
    ([path]) => !path.endsWith('/') && !path.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(path)
  );
  // Re-zipped folders often put everything under one top-level directory
  const top = entries[0]?.[0].split('/')[0];
  if (top && entries.every(([p]) => p.startsWith(`${top}/`)))
    entries = entries.map(([p, d]) => [p.slice(top.length + 1), d]);

  const files = new Map(entries);
  let manifest: Partial<Manifest> = {};
  try {
    if (files.has(MANIFEST)) manifest = JSON.parse(strFromU8(files.get(MANIFEST)!));
  } catch {}
  files.delete(MANIFEST);

  // Source: as named in edox.json, otherwise main.tex, otherwise the first .tex file
  const sourcePath =
    manifest.source && files.has(manifest.source)
      ? manifest.source
      : files.has('main.tex')
        ? 'main.tex'
        : [...files.keys()].sort().find(isTex);
  if (!sourcePath) throw new Error(`"${file.name}" contains no .tex file.`);
  const source = strFromU8(files.get(sourcePath)!);
  files.delete(sourcePath);

  const doc = newDoc({ source, name: manifest.name, file: sourcePath });
  const d = data.docs.find((x) => x.id === doc.id)!; // the reactive proxy
  await addAssets(
    d,
    [...files].map(([path, bytes]) => new File([bytes as BlobPart], path, { type: typeOf(path) }))
  );
  return d;
}

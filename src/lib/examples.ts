// The test fixtures double as examples in the app, so what `npm run test:server`
// sends can be tried in the browser. Layout: fixtures/<name>/<name>.tex plus
// the assets next to it.
import { data, newDoc, type Doc } from '$lib/store.svelte';
import { addAssets } from '$lib/assets.svelte';

const sources = import.meta.glob<string>('/fixtures/*/*.tex', { query: '?raw', import: 'default', eager: true });
const files = import.meta.glob<string>(['/fixtures/*/*', '!/fixtures/*/*.tex'], { query: '?url', import: 'default', eager: true });

export interface Example {
  name: string;
  file: string;
  source: string;
  assets: { name: string; url: string }[];
}

export const examples: Example[] = Object.entries(sources).map(([path, source]) => {
  const dir = path.slice(0, path.lastIndexOf('/') + 1); // "/fixtures/<name>/"
  return {
    name: dir.split('/').at(-2)!,
    file: path.slice(dir.length),
    source,
    assets: Object.entries(files)
      .filter(([p]) => p.startsWith(dir))
      .map(([p, url]) => ({ name: p.slice(dir.length), url }))
  };
});

/** New document from an example, with its assets; returns it. */
export async function newFromExample(e: Example): Promise<Doc> {
  const doc = newDoc({ source: e.source, file: e.file });
  const d = data.docs.find((x) => x.id === doc.id)!; // the reactive proxy
  const assets = await Promise.all(
    e.assets.map(async (a) => {
      const blob = await (await fetch(a.url)).blob();
      return new File([blob], a.name, { type: blob.type });
    })
  );
  await addAssets(d, assets);
  return d;
}

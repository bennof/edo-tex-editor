// App state: documents – optionally kept in localStorage
const DATA_KEY = 'edotex-data';
const PERSIST_KEY = 'edotex-persist'; // "false" = saving disabled

// A document's file; its content lives in IndexedDB, see $lib/assets.svelte
export interface Asset {
  id: string;
  name: string; // unique per document, the same name replaces the file
  type: string;
  size: number;
  added: string;
}

export interface Doc {
  id: string;
  name?: string; // set by the user; empty = derived from the source
  file?: string; // name of the imported .tex file, used as title fallback and in the ZIP
  source: string;
  assets?: Asset[];
  updated: string; // ISO timestamp
}

export interface Data {
  docs: Doc[];
}

const empty = (): Data => ({ docs: [] });

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
  } catch {}
}

export const settings = $state({ persist: read(PERSIST_KEY) !== 'false' });

function load(): Data {
  if (!settings.persist) return empty();
  try {
    const { docs } = JSON.parse(read(DATA_KEY) ?? 'null') ?? {};
    return { docs: Array.isArray(docs) ? docs : [] };
  } catch {
    return empty();
  }
}

export const data: Data = $state(load());

// Save every change while saving is enabled
$effect.root(() => {
  $effect(() => {
    const json = JSON.stringify(data);
    if (settings.persist) write(DATA_KEY, json);
  });
});

export function setPersist(on: boolean) {
  settings.persist = on;
  if (on) {
    write(PERSIST_KEY, null);
    write(DATA_KEY, JSON.stringify(data));
  } else {
    write(DATA_KEY, null); // delete saved data
    write(PERSIST_KEY, 'false'); // only the setting remains
  }
}

export function replaceData(d: Partial<Data>) {
  data.docs = d.docs ?? [];
}

// ---------- Helpers ----------
export const id = () => crypto.randomUUID().slice(0, 8);

// New documents: a complete LaTeX document that also shows how assets are referenced
const SAMPLE = String.raw`\documentclass{article}
\usepackage{graphicx}

\title{New document}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}
Plain \LaTeX{}, compiled to PDF by the edotex server.

% Assets are referenced by file name. Add image.png to this document in the
% sidebar; as long as the server accepts no assets, the box stands in for it.
\IfFileExists{image.png}
  {\includegraphics[width=0.5\linewidth]{image.png}}
  {\fbox{image.png}}

\end{document}
`;

export function newDoc(fields: Partial<Pick<Doc, 'name' | 'file' | 'source'>> = {}): Doc {
  const d: Doc = { id: id(), source: SAMPLE, ...fields, updated: new Date().toISOString() };
  data.docs.unshift(d);
  return d;
}

export function removeDoc(d: Doc) {
  data.docs = data.docs.filter((x) => x.id !== d.id);
}

/** Display name: own name, else \title{…}, else the imported file name, else "Untitled". */
export function docTitle(d: Doc): string {
  if (d.name?.trim()) return d.name.trim();
  const source = d.source.replace(/(?<!\\)%.*$/gm, ''); // without comments
  // \title[short]{Long {nested} title}: one level of nested braces is enough here
  const title = /\\title\s*(?:\[[^\]]*\])?\s*\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(source)?.[1] ?? '';
  const text = title
    .replace(/\\\\|~/g, ' ') // line breaks, ties
    .replace(/\\[a-zA-Z]+\*?/g, '') // commands such as \textbf, \LaTeX
    .replace(/[{}\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || d.file?.replace(/\.tex$/i, '') || 'Untitled';
}

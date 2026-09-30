# edo-tex-editor

A small browser app that sends TeX documents to the
edotex TeX server (`edotexserver`) and shows the resulting PDF. It is a **test tool
and reference client**: if you want to talk to the server from your own code,
read [src/lib/texserver.ts](src/lib/texserver.ts). That file is the example
implementation; the rest of the app is the UI around it.

Built with Svelte 5 + TypeScript, and SvelteKit as a pure SPA (`adapter-static`).
Documents and assets stay in the browser; only the TeX source goes to the server.

## Start

Start the TeX server, then the app:

```sh
edotexserver serve --host 127.0.0.1 --port 8080   # in the edotex repo
npm install
npm run dev                                       # http://localhost:5174
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | development server on port 5174 |
| `npm run build` | static SPA into `build/` |
| `npm run preview` | view the built app locally |
| `npm run check` | svelte-check / TypeScript |
| `npm run test:server` | send the fixtures to a running server, see [Tests](#tests) |
| `npm run commit-version` | release: commit everything, tag `vX.Y.Z` from `package.json`, push |

Requires Node.js 22.18 or newer, because the tests import `texserver.ts` directly.

## Usage

- **Documents:** "＋ New document" creates a LaTeX document; "＋ New from example"
  creates one from the test fixtures. The title comes from `\title{…}`, otherwise
  from the imported file name. Click the title in the header to rename.
- **Compile:** "Compile" in the header or ⌘/Ctrl+Enter. With `auto_compile`, the
  app also compiles after a pause in typing. A new compilation aborts a running
  one. The header shows the state (compiling, ✓, ✕) and the duration.
- **Preview:** The "PDF" tab shows the last successful PDF, and ↓ saves it. The
  "Log" tab shows the server URL, HTTP status, duration, request size and the full
  TeX log. Errors with a line number are listed under the source.
- **Assets:** Expand a document in the sidebar and drop files onto it, or use ＋.
  They are kept with the document and in its ZIP, but not sent to the server as
  long as it accepts none (`tex_support_assets: false`); the app lists them under
  the source as "not sent".
- **Download and import:** ↓ next to a document downloads a ZIP with the `.tex`
  file, its assets and `edox.json` (name, path of the TeX file). Dropping such a
  ZIP or a single `.tex` file onto the documents area creates a new document;
  dropping onto a document adds the files there as assets.
- **Layout:** In landscape, source and PDF sit side by side and the divider can
  be dragged. In portrait, the PDF is a sheet that can be pulled up over the source.
- **Settings:** Save in the browser on/off, plus JSON export and import (without
  asset contents). Data is stored under `edotex-data` / `edotex-persist`
  (localStorage) and `edotex-assets` (IndexedDB), so it does not mix with edox-editor.
  Under "About": copyright, license, a link to [falkner.xyz](https://falkner.xyz)
  and a contact button (mail to contact@falkner.xyz).

## Configuration

`static/config.json` is loaded live on every app start (no cache). The same build
can therefore run against a local, staging or production server: change
`build/config.json` after building. A missing or invalid file falls back to the
defaults; unknown keys are ignored.

```json
{
  "tex_compiler_url": "localhost:8080/api/tex",
  "tex_support_assets": false,
  "tex_data_mode": "multipart",
  "auto_compile": true,
  "debounce_ms": 1500,
  "timeout_ms": 60000
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `tex_compiler_url` | `"/api/tex"` | server endpoint: `http(s)://host:port/path`, `host:port/path` (http is assumed) or relative to the page, e.g. `/api/tex` |
| `tex_support_assets` | `false` | whether the server accepts assets next to the TeX file; the client does not send any yet |
| `tex_data_mode` | `"multipart"` | response format of the server; only `multipart` is implemented |
| `auto_compile` | `true` | compile automatically after a pause in typing |
| `debounce_ms` | `1500` | length of that pause |
| `timeout_ms` | `60000` | give up on a compilation after this time, `0` = never |

If the app and the server run on different origins (e.g. `localhost:5174` and
`localhost:8080`), the server must send CORS headers that allow the app's origin.
Otherwise the browser blocks the response, and the app reports the server as not
reachable. The request is sent as `text/plain`, so no OPTIONS preflight is needed.

## How texserver.ts talks to the server

The server compiles one TeX document per request:

- **Request:** `POST <tex_compiler_url>`, body = the complete TeX source as UTF-8
  (at most 8 MiB).
- **Response:** HTTP 200 with `Content-Type: multipart/mixed; boundary=…` and
  these parts:
  1. `application/json`: `{"type":"progress","status":"processing"}`
  2. `application/x-ndjson`: one `{"type":"log","message":"…"}` per compiler line
  3. on success `application/pdf` (with `Content-Length`), on failure
     `application/json`: `{"type":"error","status":"failed","message":"…"}`
- A failed compilation is **also HTTP 200**. Only the parts tell success from
  failure. Before compiling, the server answers 400 (empty body), 405 (not POST)
  or 413 (too large).
- TeX errors are in the log as `error: texput.tex:<line>: <message>`. The server
  compiles the body as `texput.tex`, so `<line>` is a line of the sent source.

`compile()` does all of that and returns one result object. It never throws:
invalid URL, network error, CORS, timeout, abort, HTTP errors, TeX errors and
unreadable responses all come back as `ok: false` with `errors` and `log`.

```ts
import { compile } from '$lib/texserver'; // or '../src/lib/texserver.ts' in Node

const controller = new AbortController(); // optional: abort when a newer run starts
const r = await compile('\\documentclass{article}\\begin{document}Hi\\end{document}', {
  url: 'http://localhost:8080/api/tex',
  timeoutMs: 60_000,
  signal: controller.signal
});

if (r.ok) {
  showPdf(r.pdf!); // Blob, application/pdf
} else if (!r.aborted) {
  for (const e of r.errors) console.error(e.line ? `line ${e.line}: ${e.message}` : e.message);
}
console.log(r.status, `${r.ms} ms`, `${r.requestBytes} bytes sent`);
console.log(r.log); // full TeX log
```

| `CompileResult` | |
| --- | --- |
| `ok` | `true` exactly when `pdf` is set |
| `pdf` | the PDF as a `Blob` |
| `log` | full TeX log, or the response text / a description for HTTP and network problems |
| `errors` | `{ line?, message }[]`: TeX errors from the log, or one entry saying why there is no PDF |
| `status` | HTTP status; `0` = no response (invalid URL, network, timeout, abort) |
| `ms`, `requestBytes` | duration until the complete response, size of the sent body |
| `aborted` | stopped via `signal` (not by the timeout); such results are usually ignored |

The file also exports `readServerInfo()` (reads the `tex_*` keys of `config.json`),
`resolveUrl()` and `texErrors()`. For simplicity the client reads the whole
response before parsing it, although the server streams it.

## Tests

`fixtures/<name>/<name>.tex` (plus assets next to it) are sent to a running
server by `npm run test:server` ([tests/server.test.mjs](tests/server.test.mjs),
`node:test`, no browser):

| Fixture | Content |
| --- | --- |
| `latex` | plain `article` with `amsmath` |
| `tikz` | `standalone` with a `pgfplots` plot |
| `edoworksheet` | worksheet with `edoxarticle` from the server's TeX tree, solutions via `\usesolution` |

A valid fixture must give a PDF (starting with `%PDF`); an error fixture must
report its error with the right line number.

The server comes from `SERVER_URL` or `tex_compiler_url` in `static/config.json`
(a relative URL is resolved against `http://127.0.0.1:8080`):

```sh
npm run test:server
SERVER_URL=https://staging.example.org/api/tex npm run test:server
```

The app offers the same fixtures under "＋ New from example".

## Structure

```
src/lib/
  texserver.ts      the server client (no Svelte; browser and Node)
  config.svelte.ts  live settings from static/config.json
  store.svelte.ts   documents (localStorage), title from \title{…}
  assets.svelte.ts  asset contents (IndexedDB)
  bundle.ts         document as ZIP (.tex + assets + edox.json): export and import
  examples.ts       fixtures as examples in the app
  Workspace.svelte  side by side or bottom sheet depending on aspect ratio
  Preview.svelte    PDF as a blob URL in an iframe
  DocItem.svelte    document in the sidebar with assets and drag and drop
  download.ts       file downloads
src/routes/doc/[id]/+page.svelte   editor, compile, PDF/Log tabs
fixtures/           test documents, also used as examples
tests/              server tests
scripts/
  commit-version.mjs
```

## Release

1. Bump the version in `package.json`.
2. Run `npm run commit-version`. It commits everything with the message `vX.Y.Z` and
   creates an annotated tag. An editor opens for the tag text, which also becomes
   the release description. The script then pushes the commit and the tag to `origin`.

If the tag already exists, the script aborts.

## License

[MIT License](LICENSE), copyright (c) 2026 Benjamin Benno Falkner ·
[falkner.xyz](https://falkner.xyz) · contact@falkner.xyz

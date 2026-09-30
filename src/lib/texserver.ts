// Client for the edotex TeX server (`edotex serve`, endpoint POST /api/tex).
//
// This file is the reference implementation: it has no Svelte or app imports and
// runs unchanged in the browser and in Node 22+ (see tests/server.test.mjs).
//
// Protocol (edotex 0.1.0):
//
//   Request   POST <tex_compiler_url>
//             body: the complete TeX document as UTF-8, or with assets (images, own
//             classes) multipart/form-data: first part the TeX document, then one
//             part per asset, stored under its filename next to the document.
//             The server limits the body size (edotex serve: 20 MiB).
//
//   Response  HTTP 200, Content-Type: multipart/mixed; boundary=…   (tex_data_mode "multipart")
//             1. application/json      {"type":"progress","status":"processing"}
//             2. application/x-ndjson  one {"type":"log","message":"…"} per compiler line
//             3. application/pdf       the PDF, on success
//                application/json      {"type":"error","status":"failed","message":"…"}, on failure
//             A failed compilation is HTTP 200 as well: the parts decide, not the status.
//
//   Before compiling the server answers 400 (empty body), 405 (not POST) or
//   413 (body too large). Browsers on another origin need CORS headers from the server.

/** What static/config.json says about the server. */
export interface ServerInfo {
  /** Endpoint, absolute ("http://host:8080/api/tex"), without scheme ("localhost:8080/api/tex") or relative ("/api/tex"). */
  url: string;
  /** Whether the server accepts assets next to the TeX file. */
  supportsAssets: boolean;
  /** Response format; only "multipart" exists so far. */
  dataMode: string;
}

/** Read the `tex_*` keys of a parsed config.json; missing or invalid values get defaults. */
export function readServerInfo(raw: Record<string, unknown>): ServerInfo {
  return {
    url: typeof raw.tex_compiler_url === 'string' ? raw.tex_compiler_url : '/api/tex',
    supportsAssets: raw.tex_support_assets === true,
    dataMode: typeof raw.tex_data_mode === 'string' ? raw.tex_data_mode : 'multipart'
  };
}

/**
 * Turn a configured URL into an absolute one. `base` is needed for relative URLs
 * (the page's address in the browser); throws on a relative URL without base.
 */
export function resolveUrl(url: string, base?: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(url)) return url; // http://…, https://…
  if (/^[./]/.test(url)) return new URL(url, base).href; // /api/tex, ./api/tex
  return `http://${url}`; // localhost:8080/api/tex
}

export interface CompileError {
  /** Line in the TeX source, when the log names one. */
  line?: number;
  message: string;
}

export interface CompileResult {
  /** true exactly when `pdf` is set. */
  ok: boolean;
  pdf?: Blob;
  /** Complete TeX log; for HTTP or network problems the response text or a description. */
  log: string;
  /** TeX errors from the log, or one entry describing why there is no PDF. */
  errors: CompileError[];
  /** HTTP status; 0 = no response (invalid URL, network error, timeout, abort). */
  status: number;
  /** Milliseconds from sending the request to the complete response. */
  ms: number;
  requestBytes: number;
  /** Stopped via `options.signal` (not by the timeout). Callers usually ignore such results. */
  aborted: boolean;
}

export interface CompileOptions {
  /** Server endpoint, see `ServerInfo.url`. */
  url: string;
  /** Base for a relative `url`; default: the page's address in the browser. */
  base?: string;
  /** Response format the server uses; default "multipart", the only one implemented. */
  dataMode?: string;
  /** Abort the request, e.g. when a newer compilation starts. */
  signal?: AbortSignal;
  /** Give up after this many milliseconds; default 60000, 0 = wait forever. */
  timeoutMs?: number;
  /** Called with each compiler log line as soon as it arrives, before the result. */
  onLog?: (line: string) => void;
  /** Files the document references, e.g. images; sent as multipart/form-data. */
  assets?: { name: string; data: Blob }[];
}

/**
 * Send a TeX document to the server and wait for the PDF.
 *
 * Never throws and never rejects: every failure (invalid URL, network error,
 * CORS, timeout, abort, HTTP error, TeX error, unreadable response) comes back
 * as `ok: false` with a description in `errors` and `log`.
 */
export async function compile(source: string, options: CompileOptions): Promise<CompileResult> {
  const tex = new TextEncoder().encode(source);
  const assets = options.assets ?? [];
  let body: BodyInit = tex;
  let requestBytes = tex.length;
  if (assets.length) {
    // The server takes the first part as the document, whatever its name
    const form = new FormData();
    form.append('tex', new Blob([tex], { type: 'text/plain' }), 'main.tex');
    for (const a of assets) {
      form.append('file', a.data, a.name);
      requestBytes += a.data.size;
    }
    body = form;
  }
  const started = performance.now();
  const done = (r: Partial<CompileResult>): CompileResult => ({
    ok: false,
    log: '',
    errors: [],
    status: 0,
    aborted: false,
    ...r,
    ms: Math.round(performance.now() - started),
    requestBytes
  });
  const fail = (message: string, r: Partial<CompileResult> = {}) => done({ errors: [{ message }], log: message, ...r });

  const dataMode = options.dataMode ?? 'multipart';
  if (dataMode !== 'multipart') return fail(`tex_data_mode "${dataMode}" is not supported, only "multipart".`);

  let url: string;
  try {
    url = resolveUrl(options.url, options.base ?? globalThis.location?.href);
  } catch {
    return fail(`Invalid server URL "${options.url}".`);
  }

  // One signal for both ways to stop: the caller's abort and the timeout
  const timeoutMs = options.timeoutMs ?? 60_000;
  const signals = [options.signal, timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined];
  const signal = AbortSignal.any(signals.filter((s) => s !== undefined));

  let res: Response | undefined;
  let bytes: Uint8Array<ArrayBuffer>;
  const live = options.onLog ? new LiveLog(options.onLog) : undefined;
  try {
    res = await fetch(url, {
      method: 'POST',
      // text/plain and multipart/form-data keep this a "simple" CORS request that the
      // browser sends without an OPTIONS preflight. For a form it sets the type itself.
      headers: assets.length ? undefined : { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
      signal
    });
    // Read the stream as it arrives, so log lines reach onLog during the TeX run
    const buffer = new ByteBuffer();
    const boundary = /boundary="?([^";]+)"?/i.exec(res.headers.get('Content-Type') ?? '')?.[1];
    const reader = res.body?.getReader();
    if (!reader) buffer.push(new Uint8Array(await res.arrayBuffer()));
    else
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        buffer.push(chunk.value);
        if (res.ok && boundary) live?.scan(buffer.bytes(), boundary);
      }
    bytes = buffer.bytes();
  } catch (e) {
    const status = res?.status ?? 0;
    if (options.signal?.aborted) return fail('Aborted.', { status, aborted: true });
    if (signal.aborted) return fail(`No complete response within ${timeoutMs / 1000} s.`, { status });
    // fetch gives no details here on purpose: a server that is down and a response
    // blocked by missing CORS headers look the same to the page
    return fail(`Server not reachable at ${url} (${(e as Error).message}). Is it running, and does it send CORS headers?`, { status });
  }

  const text = () => new TextDecoder().decode(bytes);
  if (!res.ok) {
    const reasons: Record<number, string> = {
      400: 'empty or unreadable request body, or an invalid asset name',
      405: 'method not allowed, the server expects POST',
      413: 'document and assets larger than the server accepts'
    };
    const message = `HTTP ${res.status}: ${reasons[res.status] ?? res.statusText}`;
    return fail(message, { status: res.status, log: text() || message });
  }

  const type = res.headers.get('Content-Type') ?? '';
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (!type.startsWith('multipart/') || !boundary)
    return fail(`Unexpected response type "${type}", expected multipart/mixed.`, { status: res.status, log: text() });

  let pdf: Blob | undefined;
  let failure = '';
  const lines: string[] = [];
  try {
    for (const part of splitMultipart(bytes, boundary)) {
      if (part.type === 'application/pdf') pdf = new Blob([part.body], { type: 'application/pdf' });
      else if (part.type === 'application/x-ndjson') lines.push(...ndjsonMessages(part.body));
      else if (part.type === 'application/json') {
        const msg = JSON.parse(new TextDecoder().decode(part.body));
        if (msg.type === 'error') failure = String(msg.message ?? 'Compilation failed.');
      }
    }
  } catch (e) {
    return fail(`Unreadable response: ${(e as Error).message}`, { status: res.status, log: text() });
  }
  // A connection that breaks off mid-stream leaves neither a PDF nor an error part
  if (!pdf && !failure) failure = 'The response ended without a PDF or an error message.';

  const ok = !!pdf && !failure;
  const errors = ok ? [] : texErrors(lines);
  if (!ok && !errors.length) errors.push({ message: failure });
  const log = lines.join('\n') + (failure ? `\n\n${failure}` : '');
  return done({ ok, pdf: ok ? pdf : undefined, log, errors, status: res.status });
}

/**
 * TeX errors from the log lines. Tectonic reports them as
 * "error: texput.tex:5: Undefined control sequence" – the server compiles the
 * request body as texput.tex, so the line is a line of the sent source.
 * Errors outside the document ("error: …" without file and line) have no line.
 */
export function texErrors(lines: string[]): CompileError[] {
  const errors: CompileError[] = [];
  for (const l of lines) {
    const m = /^error: (?:[^:\s]+:(\d+): )?(.*)$/.exec(l);
    if (!m) continue;
    const e: CompileError = m[1] ? { line: Number(m[1]), message: m[2] } : { message: m[2] };
    if (!errors.some((x) => x.line === e.line && x.message === e.message)) errors.push(e);
  }
  return errors;
}

interface Part {
  type: string; // Content-Type without parameters, lower case
  body: Uint8Array<ArrayBuffer>;
}

/**
 * Split a complete multipart body (RFC 2046). Each part starts with a line
 * "--boundary", then headers, an empty line and the body; "--boundary--" ends
 * the message. The PDF part carries Content-Length, which is used when present,
 * because binary data could contain the boundary by chance.
 */
function splitMultipart(bytes: Uint8Array<ArrayBuffer>, boundary: string): Part[] {
  const enc = new TextEncoder();
  const delimiter = enc.encode(`--${boundary}`);
  const blank = enc.encode('\r\n\r\n');
  const parts: Part[] = [];

  let at = indexOf(bytes, delimiter, 0);
  while (at >= 0) {
    const afterDelimiter = at + delimiter.length;
    if (bytes[afterDelimiter] === 0x2d && bytes[afterDelimiter + 1] === 0x2d) break; // "--": the end
    const headerEnd = indexOf(bytes, blank, afterDelimiter);
    if (headerEnd < 0) break; // cut off

    const headers = new TextDecoder().decode(bytes.subarray(afterDelimiter, headerEnd));
    const type = /^content-type:\s*([^;\r\n]+)/im.exec(headers)?.[1].trim().toLowerCase() ?? '';
    const length = /^content-length:\s*(\d+)/im.exec(headers)?.[1];
    const start = headerEnd + blank.length;

    let end: number;
    if (length !== undefined) {
      end = start + Number(length);
      if (end > bytes.length) break; // cut off
      at = indexOf(bytes, delimiter, end);
    } else {
      at = indexOf(bytes, delimiter, start);
      end = at < 0 ? bytes.length : at - 2; // the CRLF before the delimiter belongs to it
    }
    parts.push({ type, body: bytes.subarray(start, Math.max(start, end)) });
  }
  return parts;
}

/** Messages of an NDJSON log part: one JSON object per line, {"type":"log","message":"…"}. */
function ndjsonMessages(body: Uint8Array): string[] {
  return new TextDecoder()
    .decode(body)
    .split('\n')
    .filter((l) => l.trim())
    .map(ndjsonMessage);
}

function ndjsonMessage(line: string): string {
  try {
    const record = JSON.parse(line);
    return typeof record.message === 'string' ? record.message : line;
  } catch {
    return line; // keep lines that are not JSON rather than losing them
  }
}

/**
 * Passes the lines of the NDJSON part to a callback while the response is still
 * arriving. Only complete lines are passed; the part ends at the next delimiter.
 */
class LiveLog {
  private start = -1; // offset of the NDJSON body, once its headers arrived
  private next = 0; // offset of the first line not yet passed on
  private done = false;
  private readonly onLog: (line: string) => void;

  constructor(onLog: (line: string) => void) {
    this.onLog = onLog;
  }

  scan(bytes: Uint8Array, boundary: string) {
    if (this.done) return;
    const enc = new TextEncoder();
    if (this.start < 0) {
      const type = indexOf(bytes, enc.encode('application/x-ndjson'), 0);
      const blank = type < 0 ? -1 : indexOf(bytes, enc.encode('\r\n\r\n'), type);
      if (blank < 0) return;
      this.start = this.next = blank + 4;
    }
    for (let end = bytes.indexOf(0x0a, this.next); end >= 0; end = bytes.indexOf(0x0a, this.next)) {
      const line = new TextDecoder().decode(bytes.subarray(this.next, end)).trim();
      this.next = end + 1;
      if (line.startsWith(`--${boundary}`)) {
        this.done = true;
        return;
      }
      if (line) this.onLog(ndjsonMessage(line));
    }
  }
}

/** Growing byte buffer; doubling the capacity keeps appending large PDFs cheap. */
class ByteBuffer {
  private data = new Uint8Array(1 << 16);
  private length = 0;

  push(chunk: Uint8Array) {
    if (this.length + chunk.length > this.data.length) {
      const grown = new Uint8Array(Math.max(this.data.length * 2, this.length + chunk.length));
      grown.set(this.data.subarray(0, this.length));
      this.data = grown;
    }
    this.data.set(chunk, this.length);
    this.length += chunk.length;
  }

  bytes(): Uint8Array<ArrayBuffer> {
    return this.data.subarray(0, this.length);
  }
}

/** Position of `needle` in `haystack` from `from` on, or -1. */
function indexOf(haystack: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

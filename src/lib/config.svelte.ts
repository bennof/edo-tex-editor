// Live configuration from static/config.json, loaded on every app start (no cache),
// so parts of the behavior can change without rebuilding. A missing, empty or
// invalid file falls back to the defaults; unknown keys are ignored.
import { asset } from '$app/paths';
import { readServerInfo, type ServerInfo } from '$lib/texserver';

export interface Config {
  /** The TeX server, from tex_compiler_url, tex_support_assets and tex_data_mode. */
  server: ServerInfo;
  /** Compile automatically after a pause in typing (auto_compile). */
  autoCompile: boolean;
  /** Length of that pause in milliseconds (debounce_ms). */
  debounceMs: number;
  /** Give up on a compilation after this many milliseconds, 0 = never (timeout_ms). */
  timeoutMs: number;
}

const defaults = (): Config => ({
  server: readServerInfo({}),
  autoCompile: true,
  debounceMs: 1500,
  timeoutMs: 60_000
});

const ms = (v: unknown, fallback: number) => (typeof v === 'number' && v >= 0 ? v : fallback);

export const config: Config = $state(defaults());

const url = (path: string) => asset(`/${path.replace(/^\/+/, '')}` as Parameters<typeof asset>[0]);

export async function loadConfig(fetch: typeof globalThis.fetch) {
  let raw: Record<string, unknown> = {};
  try {
    const res = await fetch(url('config.json'), { cache: 'no-cache' });
    const text = res.ok ? (await res.text()).trim() : '';
    if (text) raw = JSON.parse(text);
  } catch (e) {
    console.warn('config.json ignored:', e);
  }

  const c = defaults();
  c.server = readServerInfo(raw);
  if (typeof raw.auto_compile === 'boolean') c.autoCompile = raw.auto_compile;
  c.debounceMs = ms(raw.debounce_ms, c.debounceMs);
  c.timeoutMs = ms(raw.timeout_ms, c.timeoutMs);
  Object.assign(config, c);
}

import { loadConfig } from '$lib/config.svelte';

// Pure SPA: no server rendering, no prerendering
export const ssr = false;
export const prerender = false;

// Load static/config.json before the first render
export async function load({ fetch }) {
  await loadConfig(fetch);
}

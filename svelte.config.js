import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    // SPA: a single index.html that all paths fall back to
    adapter: adapter({ fallback: 'index.html' })
  }
};

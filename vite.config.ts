import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // 5174, so this app and edox-editor (5173) can run side by side
  server: { port: 5174, fs: { allow: ['fixtures'] } },
  preview: { port: 4174 }
});

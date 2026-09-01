import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// separate config (not a mode of vite.config.ts) because the extension popup
// is a whole different bundle root/entry/output than the web app — see
// tech-design.md's "Why the manifest has to live in public/"
export default defineConfig({
  root: 'extension',
  publicDir: 'public',
  // Vite's envDir defaults to `root`; with root: 'extension' that would look
  // for .env in extension/ and silently miss the repo-root .env the web app
  // (and this same VITE_POSTHOG_* config) already uses
  envDir: resolve(__dirname),
  plugins: [react()],
  build: {
    outDir: '../dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      // Vite's default entry is <root>/index.html, which doesn't exist here
      input: resolve(__dirname, 'extension/popup.html'),
    },
  },
});

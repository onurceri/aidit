import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const rootPkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
) as {
  version: string;
};

export default defineConfig({
  plugins: [react()],
  define: {
    __AIDIT_VERSION__: JSON.stringify(rootPkg.version),
  },
  build: {
    // Monaco is bundled locally (no CDN) and is large by nature.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('monaco-editor') ? 'monaco' : undefined),
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
});

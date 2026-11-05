import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 4173,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@ascii-web/client', '@ascii-web/wasm'],
  },
});

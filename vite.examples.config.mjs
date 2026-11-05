import { defineConfig } from 'vite';

const page = (path) => new URL(`./examples/${path}`, import.meta.url).pathname;

// builds examples/ as a standalone site (for GitHub Pages) into dist-examples/
export default defineConfig({
  root: 'examples',
  // relative asset paths, so the site works both at a domain's root and under
  // GitHub Pages' default sub-path (farmeroy.github.io/ascii-web/)
  base: './',
  optimizeDeps: {
    exclude: ['@ascii-web/client', '@ascii-web/wasm'],
  },
  build: {
    outDir: '../dist-examples',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: page('index.html'),
        playground: page('playground/index.html'),
        scroll: page('scroll/index.html'),
      },
    },
  },
});

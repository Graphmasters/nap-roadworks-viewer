import { defineConfig } from 'vite'

// The demo app is served from GitHub Pages at https://graphmasters.github.io/nap-roadworks-viewer/.
export default defineConfig({
  root: 'app',
  base: '/nap-roadworks-viewer/',
  publicDir: false,
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['xmllint-wasm'] },
  build: {
    outDir: '../_site',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { maplibre: ['maplibre-gl'] } },
    },
  },
})

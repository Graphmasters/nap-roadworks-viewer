import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const osmLanes = fileURLToPath(new URL('./vendor/osm-lanes/src/index.ts', import.meta.url))

// The demo app is served from GitHub Pages at https://graphmasters.github.io/nap-roadworks-viewer/.
export default defineConfig({
  root: 'app',
  base: '/nap-roadworks-viewer/',
  publicDir: false,
  resolve: { alias: { '@graphmasters/osm-lanes': osmLanes } },
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

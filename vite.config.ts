import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const BASE = '/nap-roadworks-viewer/'

/**
 * `npm run dev:feed -- <file>` sets NAP_FEED_FILE. The development server then serves that one file at
 * <base>command-line-feed, and the app opens it when the page is loaded with ?command-line-feed. Without the
 * variable nothing is served, and the file never reaches the build.
 */
function commandLineFeed(): Plugin {
  return {
    name: 'command-line-feed',
    apply: 'serve',
    configureServer(server) {
      const file = process.env.NAP_FEED_FILE
      if (!file) return
      server.middlewares.use(`${BASE}command-line-feed`, (_req, res) => {
        res.setHeader('Content-Type', file.endsWith('.gz') ? 'application/gzip' : 'application/xml')
        res.setHeader('X-Feed-Name', encodeURIComponent(basename(file)))
        res.setHeader('Cache-Control', 'no-store')
        res.end(readFileSync(file))
      })
    },
  }
}

// The demo app is served from GitHub Pages at https://graphmasters.github.io/nap-roadworks-viewer/.
export default defineConfig({
  root: 'app',
  base: BASE,
  publicDir: false,
  plugins: [commandLineFeed()],
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

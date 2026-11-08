import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const osmLanes = fileURLToPath(new URL('./vendor/osm-lanes/src/index.ts', import.meta.url))

export default defineConfig({
  resolve: { alias: { '@graphmasters/osm-lanes': osmLanes } },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
})

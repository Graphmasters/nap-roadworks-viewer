import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  // osm-lanes is not on npm yet. It is a pinned git submodule (vendor/osm-lanes), resolved through
  // the tsconfig path alias and bundled into dist/.
  noExternal: ['@graphmasters/osm-lanes'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' }
  },
})

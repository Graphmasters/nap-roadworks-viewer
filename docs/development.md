# Library and development

## Library

The analysis runs without the UI, in the browser or in Node.js ≥ 20, so the same checks can run in a
pipeline.

```sh
npm install @graphmasters/nap-roadworks-viewer   # not yet published; build from source meanwhile
```

```ts
import { openAsBlob } from 'node:fs'
import { analyseDatex } from '@graphmasters/nap-roadworks-viewer'

const blob = await openAsBlob('feed.xml.gz')
const result = await analyseDatex({ size: blob.size, stream: () => blob.stream() })

result.wellFormed                 // { ok: true } or the first error with line/column
result.meta                       // version, publication type, namespaces, extensions, axis order
result.events                     // normalised records (GeoJSON geometry with geometrySource and
                                  // geometryConfidence, lanes, validity, …)
result.findings                   // findings with rule id, severity, layer, xmlPath
result.recordPassability          // per record: classification, routing action, reasons
result.passability                // DQ-RW-001 / DQ-RW-002 findings with evidence and assumptions
```

Other exports: `runChecks` (re-run with another profile), `extractText` (original XML of a record by
character offsets), `summariseLaneCode`, `compareLanes`, `osmLaneAttributes` and `matchEvent`.

## Development

```sh
git clone https://github.com/Graphmasters/nap-roadworks-viewer.git
cd nap-roadworks-viewer
npm ci
npm run dev          # http://localhost:5173/nap-roadworks-viewer/
npm test             # Vitest, synthetic DATEX II fixtures in test/fixtures.ts
npm run typecheck
npm run build        # library → dist/
npm run build:app    # GitHub Pages site → _site/
```

Lane interpretation, tile feature ids and the OSM API client come from the
[osm-lanes](https://www.npmjs.com/package/osm-lanes) npm package; the lane diagrams from
[lane-status-viewer](https://www.npmjs.com/package/lane-status-viewer).

The repository contains no real feed data. Tests use small, hand-written XML documents. To run the
checks against your own downloads, point the opt-in test at a folder of feeds:

```sh
DATEX_SAMPLES_DIR="/path/to/feeds" npx vitest run test/samples.test.ts
```

## This documentation

The documentation is written in Markdown in `docs/` and built with [MkDocs](https://www.mkdocs.org)
and its built-in `readthedocs` theme. Code is highlighted at build time with
[Pygments](https://pygments.org), styled by `docs/css/pygments.css`. The [XML examples](examples.md) in
`docs/examples/` are tested by `test/docs-examples.test.ts`: each must give the main results the pages
describe, and every excerpt a page quotes must match whole lines of its file.

```sh
python3.12 -m venv .venv && . .venv/bin/activate   # Python 3.11.5 or newer
pip install -r requirements-docs.txt
mkdocs serve           # http://127.0.0.1:8000/nap-roadworks-viewer/docs/
mkdocs build --strict  # → _site/docs/
```

The GitHub Pages workflow builds the app into `_site/` and the documentation into `_site/docs/`, and
deploys both together: the app at
[graphmasters.github.io/nap-roadworks-viewer](https://graphmasters.github.io/nap-roadworks-viewer/),
the documentation at
[graphmasters.github.io/nap-roadworks-viewer/docs](https://graphmasters.github.io/nap-roadworks-viewer/docs/).
Run `npm run build:app` before `mkdocs build`: Vite empties `_site/`.

## Contributing

Which checks do you need for your feed? Issues and pull requests are welcome on
[GitHub](https://github.com/Graphmasters/nap-roadworks-viewer).

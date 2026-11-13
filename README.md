# NAP Roadworks Viewer

[![Licence: Apache-2.0](https://img.shields.io/github/license/Graphmasters/nap-roadworks-viewer)](LICENSE)
[![CI](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/ci.yml)
[![Deploy Pages](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/pages.yml/badge.svg)](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/pages.yml)

A browser tool that checks [DATEX II](https://datex2.eu/) roadworks and road-closure feeds from
National Access Points (NAPs), shows their records on a map and compares them with
[OpenStreetMap](https://www.openstreetmap.org/).

> [!TIP]
> - **[Open the viewer →](https://graphmasters.github.io/nap-roadworks-viewer/)** No installation, no
>   account. Your file is analysed in your browser and is never uploaded.
> - **[Read the documentation →](https://graphmasters.github.io/nap-roadworks-viewer/docs/)** How
>   to get a feed, use the viewer and read its checks, with tested XML examples.

[![NAP Roadworks Viewer: the record list on the left, a roadworks record on the map, and the Lanes tab comparing the record's DATEX II lane status with the OpenStreetMap lane layout of the matched road](docs/screenshot.webp)](https://graphmasters.github.io/nap-roadworks-viewer/)

<sub>The Lanes tab of a roadworks record: its DATEX II lane status next to the OpenStreetMap lane
layout of the matched road. Data: [Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein
(LBV.SH)](https://mobilithek.info/offers/110000000003237002) via Mobilithek, licence-free.</sub>

## What it does

A DATEX II feed is an XML file, often a large one, that is hard to judge by eye. The viewer reads
one downloaded file and shows whether it is valid, where its records are, what their lane status
means and how a router could treat them:

- **Check.** Streaming XML check, DATEX II version (v2 or v3) and publication type, schema
  validation with [libxml2](https://github.com/GNOME/libxml2) compiled to
  [WebAssembly](https://webassembly.org/) against XSD files you select, heuristic profile checks,
  and checks for contradictions between linked records, for example a full closure whose cause
  describes only a stopping or parking ban.
- **Locate and match.** Draws each record that carries a line (`gmlLineString`,
  `LinearElementByPoints` or structured [OpenLR](https://www.openlr.org/)) on the map and scores the
  OpenStreetMap roads along it to find the road the record describes.
- **Decode lane status.** Shows `laneStatusCoded` and `extendedLaneStatusCoded` as lane diagrams
  next to the OpenStreetMap lane layout of the matched road.
- **Routing hint.** Classifies each record as passable, restricted, closed, conditional,
  conflicting or unknown, and derives a routing action: block, do not block, or manual review.
- **RTTI 5-Star upper bounds.** For each criterion of the
  [TISA RTTI 5-Star Rating Specification](https://tisa.org/rtti-5-star-rating-specification/), the
  highest star level the file allows. This is an upper bound, not a rating.

Findings in the report and the RTTI panel link to the records they concern. The inspector shows a
record's details, QA findings, original XML, lanes, matching result and OpenStreetMap tags.

The viewer has been tried on seven feeds from six countries (Germany, the Netherlands, Norway,
Denmark, Slovenia and Croatia; see [Tested feeds](#tested-feeds)), in DATEX II v2 and v3. A
209 MB feed with 61,000 records works.

## Quick start

1. Download a DATEX II roadworks or closure publication (v2 or v3) from a National Access Point.
   Plain XML and gzip both work, also when a gzip file is saved as `.xml`.
2. Open **<https://graphmasters.github.io/nap-roadworks-viewer/>** and drop the file onto the
   page, or choose **Open DATEX II file…**.
3. Read the **Report** and **RTTI 5-Star** sections, then pick a record from the list or on the
   map. The inspector shows its details.
4. Optional: to validate against the schema, choose **Validate against XSD files…** in the report
   and select the XSD of your DATEX II version or profile, plus any files it imports. The viewer
   does not download schema files; until you select them, the report says "not performed".

## Privacy

- **Your file stays on your device.** The browser reads and analyses it in a Web Worker. It is not
  uploaded or stored.
- **No backend.** The app is a set of static files served from GitHub Pages. It uses no
  Graphmasters servers, sets no cookies, stores nothing in your browser and has no analytics.
- **External services.** To show the map and look up roads, your browser contacts the services
  below directly. Like every web server, they see your IP address. No other data from your file is
  sent.

| Service | Host | Used for | What the requests reveal |
|---|---|---|---|
| GitHub Pages | `graphmasters.github.io` | The app and its map style | Nothing from your file |
| [OpenFreeMap](https://openfreemap.org/) | `tiles.openfreemap.org` | Map tiles; matching reads tiles along a record | Tile coordinates, so roughly where your records are |
| [basemap.de](https://basemap.de/) (BKG) | `sgx.geodatenzentrum.de` | Fonts and map icons of the map style | Nothing from your file |
| [OpenStreetMap API](https://wiki.openstreetmap.org/wiki/API_v0.6) | `api.openstreetmap.org` | Tags of a selected road; ways in a small box during matching | An OSM way id, or a small bounding box around part of a record during matching |
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) by [FOSSGIS e. V.](https://www.fossgis.de/) | `overpass-api.de` | Splitting merged map features into OSM ways during matching | A road class and the bounding box of part of a record |
| Overpass API by [Private.coffee](https://private.coffee/) | `overpass.private.coffee` | Fallback for `overpass-api.de` | The same |

Requests to the OSM API and Overpass are made only when you select a road, use a matching
candidate or select a record with a line (matching then starts by itself). The **Privacy** dialog,
linked from the map credits in the app, lists the same services, and so does the
[Privacy](https://graphmasters.github.io/nap-roadworks-viewer/docs/privacy/) page of the
documentation.

## Limitations

The main ones are below; the
[Limitations](https://graphmasters.github.io/nap-roadworks-viewer/docs/limitations/) page of the
documentation has the full list.

- **Location referencing.** Lines are drawn from `gmlLineString` (v2 `linearExtension`, v3
  `LinearLocation`) in WGS 84 degrees and from a `LinearElementByPoints` in a linear location; in a
  `pointAlongLinearElement` its points are shown as points. OpenLR is not map-matched: a record
  whose only line is OpenLR is drawn as an *approximate* straight line through its points. That
  line is chosen before the checks run, so it is drawn even when its points fail `OLR-003` or
  `OLR-004`. Binary OpenLR is detected, not decoded. ALERT-C, TPEG and coded linear-element
  references are listed, not decoded.
- **Axis order.** `posList` is read as "lat lon", as EPSG:4326 defines it. "lon lat" files are
  detected from explicit latitude/longitude points of the same records, or can be set by hand.
- **Profile checks are heuristic.** They come from the profile documentation and observed feeds and
  are no conformance test. Use XSD validation for schema conformance.
- **RTTI 5-Star from a single file.** Criteria that need repeated downloads or the access URL
  (update cycle, timeliness, secure API, ID stability) are not shown, and there is no overall star
  value. TISA's evaluation methodology is not published yet.
- **Matching ranks candidates.** The score orders OpenStreetMap candidates; it is not a calibrated
  probability. Matching runs on the line the map draws. A straight OpenLR line cuts corners, so
  scores drop and the right road can be missed, and the Matching tab does not warn about it; the
  same-section test of `DQ-RW-001` is less reliable for such lines too.
- **Lanes.** OSM lane tags describe the usual layout and DATEX II a temporary one, so a difference
  is a hint, not an error. Direction mapping between DATEX II and OSM is not verified.
- **Memory.** Files are streamed, but the 209 MB feed (16 MB gzipped) with 61,000 records needs
  several hundred MB of memory. XSD validation loads the whole document (at most 400 MB).

## How the checks work

The documentation describes each step in detail, with tested XML examples:

- **[Checks](https://graphmasters.github.io/nap-roadworks-viewer/docs/checks/):** the XML, DATEX II, XSD and profile layers, and the rules on records
  (`SEM`, `LOC`, `LANE`, `REF`) and on OpenLR (`OLR-001`…`OLR-006`).
- **[Using the viewer](https://graphmasters.github.io/nap-roadworks-viewer/docs/usage/):** the report, the record list and its filters, the order in which
  a record's location is drawn on the map, and the inspector tabs.
- **[Matching and lanes](https://graphmasters.github.io/nap-roadworks-viewer/docs/matching-lanes/):** how OpenStreetMap candidates are scored, how merged
  tile features are split into OSM ways, and how `laneStatusCoded` and `extendedLaneStatusCoded` are
  read.
- **[Passability and contradictions](https://graphmasters.github.io/nap-roadworks-viewer/docs/passability/):** the classes and routing actions, and the
  contradiction checks `DQ-RW-001` (a closure whose cause only bans stopping or parking) and
  `DQ-RW-002` (a closure that keeps lanes open in both directions).
- **[RTTI 5-Star ceilings](https://graphmasters.github.io/nap-roadworks-viewer/docs/rtti/):** which criteria are checked in the file, what counts as a
  polyline and an unambiguous direction, and the assumptions behind the ceilings.

## Use it in Node.js

The analysis is a separate library in `src/`, without the map UI. It runs in the browser and in
Node.js 20 or later. It is not published on npm yet, so build a package from source (building
needs a newer Node.js, see [Development](#development)):

```sh
git clone https://github.com/Graphmasters/nap-roadworks-viewer.git
cd nap-roadworks-viewer
npm ci
npm run build    # library → dist/
npm pack         # → graphmasters-nap-roadworks-viewer-<version>.tgz
```

Install the archive in your project with
`npm install /path/to/graphmasters-nap-roadworks-viewer-<version>.tgz`, using the file name that
`npm pack` prints. Then:

```ts
import { openAsBlob } from 'node:fs'
import { analyseDatex } from '@graphmasters/nap-roadworks-viewer'

const blob = await openAsBlob('feed.xml.gz')   // plain or gzip
const result = await analyseDatex({ size: blob.size, stream: () => blob.stream() })

result.wellFormed          // { ok: true } or the first error with line/column
result.meta                // DATEX II version, publication type, namespaces, extensions, …
result.events              // normalised records (GeoJSON geometry, lanes, validity, …)
result.findings            // findings with rule id, severity, layer, xmlPath
result.recordPassability   // per record: classification, routing action, reasons
result.passability         // DQ-RW-001 / DQ-RW-002 findings with evidence and assumptions
result.rtti                // RTTI 5-Star ceilings per use case and criterion
```

Other exports include `runChecks` (re-run with another profile), `extractText` (original XML of a
record by character offsets), `summariseLaneCode`, `compareLanes`, `osmLaneAttributes`,
`decodeOpenlr`, `assessRtti` and `matchEvent`. See [`src/index.ts`](src/index.ts) for the full
list.

## Development

Requires Node.js 22.18 or later in the 22 line, 24.11 or later in the 24 line, or 26 or later, as
the build tool tsup does. `devEngines` in [`package.json`](package.json) states this range, so
`npm ci` stops on other versions. CI uses Node.js 24.

```sh
git clone https://github.com/Graphmasters/nap-roadworks-viewer.git
cd nap-roadworks-viewer
npm ci
npm run dev          # app at http://localhost:5173/nap-roadworks-viewer/
npm test             # Vitest with hand-written DATEX II fixtures (test/fixtures.ts)
npm run typecheck    # tsc --noEmit
npm run build        # library → dist/
npm run build:app    # GitHub Pages site → _site/
npm run preview      # serve the built site locally
```

| Folder | Contents |
|---|---|
| [`src/`](src) | The analysis library: streaming XML parser, DATEX II detection, record normalisation, checks, OpenLR, lanes, passability, matching, RTTI 5-Star |
| [`app/`](app) | The web app: MapLibre map, Web Worker, XSD validation, report, record list, inspector |
| [`test/`](test) | Vitest suites and hand-written fixtures |
| [`docs/`](docs) | The documentation site (MkDocs) and its tested XML examples |

Every pull request and every push to `main` runs the [CI workflow](.github/workflows/ci.yml)
(typecheck, tests, both builds and `mkdocs build --strict`). Pushes to `main` also deploy the app
and the documentation to GitHub Pages ([Deploy Pages](.github/workflows/pages.yml)). How to build
the documentation locally (Python 3.11.5 or later, `requirements-docs.txt`) is described under
[This documentation](https://graphmasters.github.io/nap-roadworks-viewer/docs/development/#this-documentation).

Lane interpretation, tile feature ids and the OSM API client come from the
[osm-lanes](https://github.com/Graphmasters/osm-lanes) package, lane-status decoding and icons
from [lane-status-viewer](https://github.com/Graphmasters/lane-status-viewer).

### Tested feeds

The repository contains no feed data; the tests use small, hand-written XML documents. An opt-in
suite runs the checks against two of the feeds below once you have downloaded them: it reads the
newest `npt-hak-roadworks*.xml` in `hr/` and `svn-ncup-roadworks*.xml` in `si/` under
`DATEX_SAMPLES_DIR`. The other feeds were checked by hand in the viewer.

```sh
DATEX_SAMPLES_DIR="/path/to/feeds" npx vitest run test/samples.test.ts
```

<details>
<summary>National Access Points the checks were tried on</summary>

| Folder | Country | Publisher | DATEX II | NAP portal | Data |
|---|---|---|---|---|---|
| `bw` | Germany | Straßenbauverwaltung Baden-Württemberg (MDM roadworks profile) | v2 | [Mobilithek](https://mobilithek.info) | [Offer -5342395678156131804](https://mobilithek.info/offers/-5342395678156131804) (Baustelleninformationen, BEMaS) |
| `sh` | Germany | Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH) | v2 | [Mobilithek](https://mobilithek.info) | [Offer 110000000003237002](https://mobilithek.info/offers/110000000003237002) |
| `ndw` | Netherlands | NDW: temporary traffic measures and closures; roadworks and events planning feed | v3 | [NTM – Nationaal toegangspunt mobiliteitsdata](https://www.toegangspuntmobiliteit.nl) | [NDW open data](https://opendata.ndw.nu) |
| `no` | Norway | Statens vegvesen (NPRA): road traffic information | v3 | [transportportal.no](https://transportportal.no) | [Road traffic information](https://dataut.vegvesen.no/en/dataset/trafikkmeldinger) (user account required) |
| `dk-copenhagen` | Denmark | Københavns Kommune (identifier `0101`) | v3 | [Dataudveksleren](https://nap.vd.dk) (Vejdirektoratet) | [KBH Kort profiles](https://kbhkort.kk.dk/profiles/) |
| `si` | Slovenia | DARS / NCUP: roadworks, traffic events, safety-related traffic information | v3 | [NAP Slovenia](https://www.nap.si) (NCUP) | [Data sets](https://www.nap.si/en/datasets) |
| `hr` | Croatia | Hrvatski autoklub (HAK), Hrvatske ceste (HC), Autocesta Zagreb–Macelj (AZM) | v2 | [NPT – Croatian National Access Point](https://www.promet-info.hr) (Hrvatske ceste) | – |

</details>

## Contributing

Issues and pull requests are welcome.

- **Bugs and feed problems:** [open an issue](https://github.com/Graphmasters/nap-roadworks-viewer/issues).
  Name the DATEX II version, the NAP or publisher and the record id, and describe what you
  expected. If you include an excerpt of a feed, check that its licence allows that.
- **Pull requests:** run `npm run typecheck` and `npm test` before you open one; CI runs these plus
  both builds and the documentation build. Cover new behaviour with small, hand-written XML in
  [`test/fixtures.ts`](test/fixtures.ts) rather than real feed data.

## Licence

[Apache License 2.0](LICENSE), see also [NOTICE](NOTICE). Third-party components and their
licences are listed in [ATTRIBUTION.md](ATTRIBUTION.md).

Map: © OpenStreetMap contributors ([ODbL](https://opendatacommons.org/licenses/odbl/1-0/)),
OpenMapTiles, OpenFreeMap; map style basemap.world © BKG
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), modified by Graphmasters
([basemap-world-openfreemap](https://github.com/Graphmasters/basemap-world-openfreemap)).

When you publish screenshots or results from a DATEX II feed, credit its publisher as their
licence requires.

## Credits

The viewer relies on open data, open standards and public services that others build and run:

- the [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, whose road and lane
  data the records are compared with;
- [OpenFreeMap](https://openfreemap.org/) for the map tiles, built on the
  [OpenMapTiles](https://openmaptiles.org/) schema;
- the Federal Agency for Cartography and Geodesy (BKG) for the basemap.world map style and the
  fonts and icons served by [basemap.de](https://basemap.de/);
- the [OpenStreetMap Foundation](https://osmfoundation.org/) for the OSM API,
  [FOSSGIS e. V.](https://www.fossgis.de/) for the Overpass instance at
  [overpass-api.de](https://overpass-api.de/), and [Private.coffee](https://private.coffee/) for
  [overpass.private.coffee](https://overpass.private.coffee/);
- the authors of [DATEX II](https://datex2.eu/), [OpenLR](https://www.openlr.org/) and the
  [TISA RTTI 5-Star Rating Specification](https://tisa.org/rtti-5-star-rating-specification/);
- the open-source projects [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js),
  [libxml2](https://github.com/GNOME/libxml2) (via [xmllint-wasm](https://github.com/noppa/xmllint-wasm)),
  [saxes](https://github.com/lddubeau/saxes), [osm-lanes](https://github.com/Graphmasters/osm-lanes)
  and [lane-status-viewer](https://github.com/Graphmasters/lane-status-viewer).

The code in this repository was generated with [Claude](https://www.anthropic.com/claude)
(Anthropic) under human guidance and review.

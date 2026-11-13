# NAP Roadworks Viewer

[![Licence: Apache-2.0](https://img.shields.io/github/license/Graphmasters/nap-roadworks-viewer)](LICENSE)
[![CI](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/ci.yml)
[![Deploy Pages](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/pages.yml/badge.svg)](https://github.com/Graphmasters/nap-roadworks-viewer/actions/workflows/pages.yml)

A browser tool that checks [DATEX II](https://datex2.eu/) roadworks and road-closure feeds from
National Access Points (NAPs), shows their records on a map and compares them with
[OpenStreetMap](https://www.openstreetmap.org/).

**[Open the viewer →](https://graphmasters.github.io/nap-roadworks-viewer/)** No installation, no
account. Your file is analysed in your browser and is never uploaded.

[![NAP Roadworks Viewer: the record list on the left, a roadworks record on the map, and the Lanes tab comparing the record's DATEX II lane status with the OpenStreetMap lane layout of the matched road](docs/screenshot.webp)](https://graphmasters.github.io/nap-roadworks-viewer/)

<sub>The Lanes tab of a roadworks record: its DATEX II lane status next to the OpenStreetMap lane
layout of the matched road. Data: [Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein
(LBV.SH)](https://mobilithek.info/offers/110000000003237002) via Mobilithek, licence-free.</sub>

**Contents:** [What it does](#what-it-does) · [Quick start](#quick-start) · [Privacy](#privacy) ·
[Limitations](#limitations) · [How the checks work](#how-the-checks-work) ·
[Use it in Node.js](#use-it-in-nodejs) · [Development](#development) ·
[Contributing](#contributing) · [Licence](#licence) · [Credits](#credits)

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

The viewer has been tried on feeds from seven publishers in six countries (Germany, the
Netherlands, Norway, Denmark, Slovenia and Croatia; see [Tested feeds](#tested-feeds)), in
DATEX II v2 and v3. A 209 MB feed with 61,000 records works.

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
| [OpenStreetMap API](https://wiki.openstreetmap.org/wiki/API_v0.6) | `api.openstreetmap.org` | Tags of a selected road; ways in a small box during matching | An OSM way id or a small bounding box |
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) by [FOSSGIS e. V.](https://www.fossgis.de/) | `overpass-api.de` | Splitting merged map features into OSM ways during matching | A road class and the bounding box of part of a record |
| Overpass API by [Private.coffee](https://private.coffee/) | `overpass.private.coffee` | Fallback for `overpass-api.de` | The same |

Requests to the OSM API and Overpass are made only when you select a road, use a matching
candidate or select a record with a line (matching then starts by itself). The **Privacy** dialog,
linked from the map credits in the app, lists the same services.

## Limitations

- **Location referencing.** Lines are drawn from `gmlLineString` (v2 `linearExtension`, v3
  `LinearLocation`) in WGS 84 degrees and from `LinearElementByPoints`. Structured OpenLR is
  decoded but not map-matched, so a record whose only line is OpenLR is drawn as a straight line
  through its location reference points and marked *approximate*. Binary OpenLR is detected, not
  decoded. ALERT-C, TPEG and coded linear-element references are listed, not decoded.
- **Axis order.** `posList` is read as "lat lon", as EPSG:4326 defines it. "lon lat" files are
  detected from explicit latitude/longitude points of the same records, or can be set by hand.
- **Profile checks are heuristic.** They come from the profile documentation and observed feeds and
  are no conformance test. Use XSD validation for schema conformance.
- **RTTI 5-Star from a single file.** Criteria that need repeated downloads or the access URL
  (update cycle, timeliness, secure API, ID stability) are not shown, and there is no overall star
  value. TISA's evaluation methodology is not published yet.
- **Matching ranks candidates.** The score orders OpenStreetMap candidates; it is not a calibrated
  probability. OSM lane tags describe the usual layout and DATEX II a temporary one, so a
  difference is a hint, not an error. Direction mapping between DATEX II and OSM is not verified.
- **Memory.** Files are streamed, but the 209 MB feed (16 MB gzipped) with 61,000 records needs
  several hundred MB of memory. XSD validation loads the whole document (at most 400 MB).

## How the checks work

The sections below document each step in detail. They are collapsed to keep this page short.

<details>
<summary><strong>Feature reference</strong></summary>

| Step | What you get |
|---|---|
| **XML** | Streaming well-formedness check (line and column of the first error). DTDs and external entities are never resolved. |
| **DATEX II detection** | Version (v2 / v3), `modelBaseVersion`, publication type, publication time and creator, SOAP envelope. |
| **XSD validation** | Real schema validation with libxml2 (WebAssembly) against XSD files you select. The UI says "not performed" until you do. |
| **Profile checks** | Profile detection (MDM roadworks profile 04-00-00, NDW situation feeds, generic v2/v3) with heuristic rules, labelled as heuristics. |
| **Extensions** | Official extension mechanisms (v2 `…Extension`, v3 `_…Extension`) apart from other namespaces, with element counts. |
| **Records** | Every `situationRecord` normalised to one model: type, validity, management type, cause links, lane status, location methods. Feeds with lane status codes get a lane-configuration filter (reversible lane, hard shoulder open/closed, narrowed or closed lane, parking lane and restrictions, cycleway and pedestrian path open/closed) with lane-status-viewer icons, which also mark records in the Situation section of the Record tab. |
| **Record list** | Filters by record type (with counts), passability, location (on the map, not drawable, OpenLR present) and "active now", plus a free-text search over id, situation id, road number and name, description, record type and management types. Only visible rows are rendered, so feeds with 60,000+ records stay fast. ↑/↓ moves through the list, Esc clears the selection. |
| **Inspector** | Tabs Record, QA, XML (original XML of the record or its situation), Lanes, Matching and OSM (tags linked to the OSM wiki). Findings in the report and the RTTI panel jump to the record and open the right tab. |
| **Interface** | Map clicks select a record or an OSM road. The map position is kept in the URL (`#map=…`); nothing about the file is. Dark mode follows the system setting, motion is reduced on request, and below 900 px the layout switches between Feed, Map and Inspector. A progress bar shows bytes, situations and records while a file loads. The map credits link to the Impressum and to a Privacy dialog that lists every service the browser contacts. |
| **Map** | Lines, in order of preference: `gmlLineString`; the points of a `LinearElementByPoints`, cut to its `fromPoint`/`toPoint`; a straight line through structured OpenLR location reference points (*approximate*). Point-only records as points marked *approximate*; other location methods listed with a reason. The inspector reports OpenLR road classes (FRC, LFRCNP) as published, next to the OSM road class hierarchy for comparison. |
| **OSM lookup** | Click a road (zoom ≥ 14): the vector-tile feature id gives the OSM way, and its tags come from the OSM API. |
| **Matching** | Scores OSM road candidates against a record line: score = coverage × quality (distance, direction, road number, class), so candidates that explain more of the record win. Shows the components and, once loaded, each way's OSM lanes as a tiny graphic; reports *ambiguous* or *no match*. Single OSM ways are preferred over merged tile features unless those are clearly better; a merged feature that still wins is split into its OSM ways and scored again. |
| **Lanes** | `laneStatusCoded` / `extendedLaneStatusCoded` diagrams (lane-status-viewer) next to the OSM lane layout (osm-lanes), with quality indicators. A compass rose and arrows on the map show the way direction the OSM layout is drawn in; destination signs appear when the way has `destination:lanes`. |
| **Passability** | Per record: passable, restricted, closed, conditional, conflicting or unknown, plus the routing action (block, do not block, manual review). |
| **OpenLR** | Whether the feed carries OpenLR, per record and in total. Structured OpenLR (DATEX II v3 `openlrLinear`, `openlrPointLocationReference`; v2 `openlrExtendedLinear` / `openlrExtendedPoint`) is decoded: location reference points with coordinates, FRC, form of way, bearing, LFRCNP, DNP, offsets. Its coordinates are checked as WGS 84 decimal degrees (`OLR-001`…`OLR-006`). The inspector lists the points; the map marks them for the selected record. Binary OpenLR is detected, not decoded. |
| **RTTI 5-Star** | Star-level ceilings per criterion of the [TISA RTTI 5-Star Rating Specification](https://tisa.org/rtti-5-star-rating-specification/) for planned and unplanned roadworks and road closures (see below). |

</details>

<details>
<summary><strong>Location referencing and OpenLR</strong></summary>

A `LinearElementByPoints` is cut to its `fromPoint`/`toPoint`, with distances measured along its
points.

Structured OpenLR (DATEX II v3 `openlrLinear`, `openlrPointLocationReference`; v2
`openlrExtendedLinear` / `openlrExtendedPoint`) is decoded and its points are marked for the
selected record. OpenLR carries no road shape between its points (a decoder finds the shortest path
in its own map, OpenLR white paper v1.5 §5.1), and this viewer does not map-match it, so a record
whose only line is OpenLR is drawn as a straight line through its points, trimmed by its offsets.
FRCs are not mapped to OSM road classes, because publishers define them against different map data.

For the RTTI indicators, only `gmlLineString` and structured OpenLR count as polylines.

The axis order of a file can be set by hand in the report when the automatic detection is wrong.

</details>

<details>
<summary><strong>Matching against OpenStreetMap</strong></summary>

**OSM ids from tiles.** OpenFreeMap tiles are built with planetiler, which encodes
`osmId × 10 + type`. Features merged from several ways (suffix 0) are common even at zoom 14, and
their id names only the first way. For those the viewer looks up the clicked way by location with a
~25 m bounding-box query to the OSM API.

**Scoring.** Matching samples the record line and scores candidates read straight from the z14
vector tiles along the record (up to 150 tiles; the visible map does not move). z14 is the highest
zoom of OpenFreeMap, so these are the geometries the map shows. Score = coverage × quality: the
quality of the covered part (distance 0.3, direction 0.45, road number 0.15, class 0.1) multiplied
by the share of the record within 25 m. Ways join the explaining sequence on quality (≥ 0.6), so
several ways can share a long record. A merged tile feature ranks 0.1 lower than its score, so a
single OSM way within that margin wins; a runner-up on the same road (within 3 m) does not make the
match ambiguous. The score ranks candidates; it is not a calibrated probability.

**Splitting merged features.** When the best candidate is a merged tile feature, the viewer asks
for the ways with the same `highway` value (from the tile's road class) inside the part of the
record that feature covers, and scores them in its place (up to 3 rounds). Boxes up to
500 × 500 m are asked from the OSM API first, then from Overpass. Larger boxes go to
`overpass-api.de` first, then, up to 0.0005 square degrees, to the OSM API, then to
`overpass.private.coffee`. If all fail, the merged feature is kept and marked as such.

</details>

<details>
<summary><strong>Closures that contradict their cause (DQ-RW-001)</strong></summary>

A record that claims a full closure (`roadClosed`, `carriagewayClosures`) whose linked cause record
describes only a stopping/parking prohibition (MDM lane codes `H` / `P`, no closed lane) is flagged
as **DQ-RW-001 – possible incorrect road closure**. The checks are:

1. Resolve `managedCause` links inside the situation. Missing (`REF-001`) and cyclic (`REF-002`)
   references are reported separately.
2. Read the lane evidence of the closure, or of its cause when the closure has none. When
   `laneStatusCoded` and `extendedLaneStatusCoded` disagree, the more restrictive reading wins.
   Unknown codes never count as open lanes.
3. Skip the finding when the validity periods do not overlap.
4. If other records in the situation report a closure for the *same section* (lines overlap within
   30 m) at an overlapping time, say so: the case needs review rather than correction.

The finding never claims the road is passable. It recommends manual review and not blocking the
road in routing on this record alone. `DQ-RW-002` covers a closure whose lane status keeps lanes in
both directions open.

</details>

<details>
<summary><strong>RTTI 5-Star indicators</strong></summary>

The [TISA RTTI 5-Star Rating Specification v1.0](https://tisa.org/rtti-5-star-rating-specification/)
(21 October 2025) rates roadworks and road-closure data per criterion from 1★ to 5★ (Tables 15–18).
The viewer sorts each situation into one of the four use cases and shows, per criterion, the
**highest level this file allows**: a ceiling, not a rating. The feed cannot score higher on that
criterion, but it may score lower once the criteria a file cannot show are measured; those are not
shown for an uploaded file. TISA's Evaluation Methodology is not published yet. The viewer shows no
overall star value.

| Criterion | Checked in the file | Ceiling |
|---|---|---|
| Data format used | DATEX II version; reference-profile conformance (heuristic, plus your XSD run) | v2 3★, v3 4★, v3 conformant 5★ |
| Use of specification | Record types and value lists of the [DATEX II RTTI reference profile](https://docs.datex2.eu/recommended-profiles/rrp/rtti/); one encoding per category (`RTTI-SPEC-01/02`) | deviation 2★ |
| Terminology & definition | Roadworks keep a lane open, closures close all lanes in a direction (`RTTI-TERM-01`, `DQ-RW-001/002`) | conflict 2★ |
| Location referencing | Best method per record: OpenLR with valid WGS 84 points, ALERT-C, coordinates (`RTTI-LOC-01`) | 5★ / 4★ / 3★ (2★ for unplanned closures) / 0 |
| Linear referencing | A polyline on every record: a `gmlLineString` with at least two distinct positions (a zero-length line is a point), or a structured OpenLR line whose points are valid WGS 84 positions at most 15 km apart (`RTTI-LIN-01/02/03`) | missing 0 |
| ↳ Direction | Only on records with a polyline: is the traffic direction along it unambiguous? Counts: both directions affected; an OpenLR line (its direction section), or OpenLR whose end points match the `gmlLineString` ends within the OpenLR offsets; `aligned`/`opposite` on a linear element given by coordinates; a compass direction matching the polyline bearing. Vertex order alone, ALERT-C direction (relative to the location table) or `aligned` on a coded road are ambiguous (`RTTI-DIR-01`); OpenLR that does not fit the polyline is a contradiction (`RTTI-DIR-02`); references that disagree make it ambiguous (`RTTI-DIR-03`) | not unambiguous 2★ |
| Accuracy | Upper bound from coordinate resolution (significant decimals) (`RTTI-ACC-01`); points far from their own polyline (`RTTI-ACC-02`) | per distance thresholds |
| Correctness | Share of records without internal contradictions | per % thresholds |
| Completeness | Attribute completeness (start, end, polyline, direction, effect or cause), as the spec defines it for events | per % thresholds |
| RTTI event message ID | id, version and version time on every record; no reused ids; probable duplicates (`RTTI-ID-01/02`) | problem 2★ |
| Outdated messages | Age of ended records at `publicationTime` | 24 h 5★ … 4 weeks 1★ |
| Validity, road type, lane level, vehicle classes, cause type | Start/end and schedules (`RTTI-VAL-01`), lane detail per situation, vehicle characteristics, closure causes (`RTTI-CAUSE-01`) | per table |
| Pre-announcement, short-term events | Lead time from creation to start; unplanned works present | shown, no level |
| Update cycle, timeliness, secure API, ID stability | Not shown for an uploaded file: they need repeated downloads or the access URL. Missing creation or version times are still reported (`RTTI-TIME-01`) | — |

Assumptions:

- **Planned vs unplanned.** `urgentRoadworks`, else the lead time from `situationRecordCreationTime`
  to `overallStartTime`: 24 h or more is planned. This boundary is the viewer's choice, not the spec's.
- **FRC is unknown.** Direction is required on every record, although the spec asks for it on FRC 3–6
  only. Accuracy, correctness and completeness use the looser of the FRC1–4 and FRC5–6 thresholds.
- **Out of scope** (listed, not rated): moving or mobile maintenance, lane restrictions without a
  roadworks cause, other record types. Static speed limits (Table 13) come via TN-ITS, not in a
  SituationPublication.
- **Capability checks.** Schedules and vehicle classes count once the feed uses them anywhere.
- **Polylines in other coordinate systems.** A `gmlLineString` in another CRS (e.g. `srsName="25833"`)
  counts as a polyline, but its direction and accuracy are not checked (`RTTI-LIN-03`).

**Per record:** the inspector's **QA** tab shows which criteria the selected record holds down and
why, including the rule and message behind each internal contradiction, followed by every finding
about the record. Record links in the RTTI panel open this tab.

</details>

## Use it in Node.js

The analysis is a separate library in `src/`, without the map UI. It runs in the browser and in
Node.js 20 or later. It is not published on npm yet, so build a package from source (building
needs a newer Node.js, see [Development](#development)):

```sh
git clone https://github.com/Graphmasters/nap-roadworks-viewer.git
cd nap-roadworks-viewer
npm ci
npm run build    # library → dist/
npm pack         # → graphmasters-nap-roadworks-viewer-0.1.0.tgz
```

Install the archive in your project with
`npm install /path/to/graphmasters-nap-roadworks-viewer-0.1.0.tgz`, then:

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

Requires Node.js 22.18 or later, as the build and test tools (tsup, Vitest) do; CI uses
Node.js 24.

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

Every pull request and every push to `main` runs the [CI workflow](.github/workflows/ci.yml)
(typecheck, tests and both builds). Pushes to `main` also deploy the app to GitHub Pages
([Deploy Pages](.github/workflows/pages.yml)).

Lane interpretation, tile feature ids and the OSM API client come from the
[osm-lanes](https://github.com/Graphmasters/osm-lanes) package, lane-status decoding and icons
from [lane-status-viewer](https://github.com/Graphmasters/lane-status-viewer).

### Tested feeds

The repository contains no feed data; the tests use small, hand-written XML documents. An opt-in
suite runs the checks against feeds you have downloaded yourself:

```sh
DATEX_SAMPLES_DIR="/path/to/feeds" npx vitest run test/samples.test.ts
```

<details>
<summary>National Access Points the checks were tried on, and the folder names the suite expects</summary>

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
  both builds. Cover new behaviour with small, hand-written XML in
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

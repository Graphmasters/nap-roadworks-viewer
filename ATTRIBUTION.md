# Third-party material and attribution

The source code of nap-roadworks-viewer is licensed under the Apache License 2.0 (see
[LICENSE](LICENSE)). The following components and services are used under their own terms.

## Software bundled in the library (`dist/`)

| Component | Licence | Use |
|---|---|---|
| [osm-lanes](https://github.com/Graphmasters/osm-lanes) (git submodule, pinned commit) | Apache-2.0 | OSM lane interpretation and SVG, tile feature id decoding, OSM API client. Includes Pinhead icons (CC0 1.0) and German road-sign images (public domain, § 5 UrhG); see its [ATTRIBUTION.md](https://github.com/Graphmasters/osm-lanes/blob/main/ATTRIBUTION.md). |
| [lane-status-viewer](https://github.com/Graphmasters/lane-status-viewer) | MIT | Decoding and drawing MDM `laneStatusCoded` / `extendedLaneStatusCoded`. |
| [saxes](https://github.com/lddubeau/saxes) | ISC | Streaming XML parser. |

## Software bundled in the demo application only

| Component | Licence | Use |
|---|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause | Map rendering. |
| [xmllint-wasm](https://github.com/noppa/xmllint-wasm) (libxml2) | MIT | XSD validation in the browser. |

## Map

| Part | Credit |
|---|---|
| Map data | © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| Vector tile schema | [OpenMapTiles](https://openmaptiles.org/) |
| Tile hosting | [OpenFreeMap](https://openfreemap.org/) |
| Map style | basemap.world Web Vektor by [BKG](https://basemap.de/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), adapted to OpenFreeMap tiles by Graphmasters in [basemap-world-openfreemap](https://github.com/Graphmasters/basemap-world-openfreemap) ([full credits](https://graphmasters.github.io/basemap-world-openfreemap/attribution.html)). Not an official BKG product. |

Way tags shown in the inspector are fetched live from the [OSM API](https://wiki.openstreetmap.org/wiki/API_v0.6)
(© OpenStreetMap contributors, ODbL). Matching splits merged tile features into OSM ways with the
[Overpass API](https://overpass-api.de/) instance operated by FOSSGIS e.V., with
[overpass.private.coffee](https://overpass.private.coffee/) (Private.coffee) and the OSM API as fallbacks.

## DATEX II data

The repository contains no DATEX II data from any publisher. Test fixtures are hand-written. Feeds
you open in the viewer stay in your browser; credit their publishers as their licences require.

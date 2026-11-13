# References

## Standards and specifications

- **DATEX II specifications**: the parts of the standard (CEN 16157), with links to the
  documentation — <https://datex2.eu/specifications/>
- **DATEX II schemas** (XSD) of every version, v2.0 to v3.7 — <https://docs.datex2.eu/downloads/>
- **TISA RTTI 5-Star Rating Specification v1.0** (21 October 2025) —
  <https://tisa.org/rtti-5-star-rating-specification/>
- **TISA External RTTI 5★ Gap Analysis** — <https://tisa.org/5-stars-external-gap-analysis/>

## Recommended reference profiles (EU)

The EU delegated regulations on traffic information are supported by DATEX II recommended reference
profiles (RRPs): the minimum set of data elements for each data category.

- **Recommended reference profiles**, overview — <https://docs.datex2.eu/recommended-profiles/rrp/>
- **RTTI recommended reference profile**: record types and value lists for real-time traffic
  information — <https://docs.datex2.eu/recommended-profiles/rrp/rtti/>
- **RTTI profiles per data category** of Delegated Regulation (EU) 2022/670, including
  [road closures](https://docs.datex2.eu/recommended-profiles/rrp/rtti/rtti-670/4-sn-a-road-closures/),
  [lane closures](https://docs.datex2.eu/recommended-profiles/rrp/rtti/rtti-670/4-sn-b-lane-closures/) and
  [roadworks](https://docs.datex2.eu/recommended-profiles/rrp/rtti/rtti-670/4-sn-c-roadworks/) —
  <https://docs.datex2.eu/recommended-profiles/rrp/rtti/rtti-670/>
- **DATEX II webtool schema wizard**: generates the XSD for a chosen profile and location referencing
  method; the RRPs come without ready-made XSDs — <https://webtool.datex2.eu/wizard>
- **Delegated Regulation (EU) 2022/670** (real-time traffic information services) —
  <https://eur-lex.europa.eu/eli/reg_del/2022/670/oj>

## Mobilithek profiles (Germany)

- **German roadworks profile** (*Baustellenprofil*, MDM roadworks profile 04-00-00): data model,
  documentation and XSD — download from <https://mobilithek.info/help/download> (choose
  **Datenprofile**, then *Datenmodell für Baustellen Version 04-00-00*)
- **extendedLaneStatusCoded**, used by several German federal states next to the profile's
  `laneStatusCoded`, has no public documentation; the symbols the viewer knows are listed on the
  [lane-status-viewer encoding page](https://graphmasters.github.io/lane-status-viewer/docs.html)

## National Access Points

- **NAPCORE list of National Access Points** in Europe, with the RTTI portal of each country —
  <https://napcore.eu/description-naps/national-access-point/>
- **Mobilithek**, the German NAP (account required for many offers) — <https://mobilithek.info>
- **NDW open data**, the Netherlands (open, no account) — <https://opendata.ndw.nu>

See [Getting a DATEX II file](get-data.md) for how to download a feed.

## Map and road data

- **OpenStreetMap** — © OpenStreetMap contributors, ODbL, <https://www.openstreetmap.org/copyright>
- **OpenFreeMap** map tiles (OpenMapTiles schema) — <https://openfreemap.org>
- **basemap.world** map style © BKG (CC BY 4.0), modified by Graphmasters —
  [basemap-world-openfreemap](https://github.com/Graphmasters/basemap-world-openfreemap)
- **Overpass API** instances run by [FOSSGIS e.V.](https://fossgis.de) and
  [private.coffee](https://private.coffee)

## Software

- **NAP Roadworks Viewer** source code — <https://github.com/Graphmasters/nap-roadworks-viewer>
- [osm-lanes](https://www.npmjs.com/package/osm-lanes): OSM lane interpretation, tile feature ids, OSM API
  client
- [lane-status-viewer](https://www.npmjs.com/package/lane-status-viewer): DATEX II lane-status diagrams
- [MapLibre GL JS](https://maplibre.org), [xmllint-wasm](https://www.npmjs.com/package/xmllint-wasm)
  (libxml2), [saxes](https://www.npmjs.com/package/saxes)

## Licence and attribution

NAP Roadworks Viewer is licensed under the Apache License 2.0, see
[LICENSE](https://github.com/Graphmasters/nap-roadworks-viewer/blob/main/LICENSE) and
[NOTICE](https://github.com/Graphmasters/nap-roadworks-viewer/blob/main/NOTICE). Third-party components
and data credits are listed in
[ATTRIBUTION.md](https://github.com/Graphmasters/nap-roadworks-viewer/blob/main/ATTRIBUTION.md).

When you publish screenshots or results from a DATEX II feed, credit its publisher as their licence
requires.

The code of the viewer was generated with [Claude](https://www.anthropic.com/claude) (Anthropic) under
human direction and review.

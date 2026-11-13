# Checks

The viewer works through a file in layers. Each layer reports on its own, so you can tell an XML error
from a schema error, a profile deviation or a contradiction in the content.

## XML

The file is read as a stream in a Web Worker, so even large feeds open quickly; a feed with 61,000
records and 209 MB of XML (16 MB gzipped) works in the browser. If the XML is not well-formed, the
viewer reports the first error with line and column (`XML-001`) and shows the situations it read before
that point. DTDs and external entities are never resolved; a `DOCTYPE` is reported (`XML-002`).

## DATEX II detection

- Version (v2 or v3) and `modelBaseVersion`.
- Publication type, publication time and creator.
- Whether the payload is wrapped in a SOAP envelope.
- `DTX-001`: no DATEX II namespace; `DTX-002`: a publication type the viewer does not extract records
  from; `DTX-003`: a publication without situations.

## XSD validation

Real schema validation with libxml2 (WebAssembly) against XSD files you select; see
[XSD validation](usage.md#xsd-validation). Until you run it, the report says "not performed" instead of
pretending the file is valid.

## Profile checks

Profile detection with heuristic rules for:

- the German roadworks profile (MDM roadworks profile 04-00-00, *Baustellenprofil*), for example
  records without `laneStatusCoded` (`MDM-H01`) or traffic-management records without a
  `managedCause` link (`MDM-H02`);
- Dutch situation feeds (DATEX II v3);
- generic DATEX II v2 and v3.

They come from the profile documentation and observed feeds and are labelled as heuristics. They are
no conformance test; use XSD validation for schema conformance.

## Extensions

The official DATEX II extension mechanisms (v2 `…Extension`, v3 `_…Extension`) are listed apart from
other namespaces, with element counts.

## Records

Every `situationRecord` is normalised to one model: type, validity, management type, cause links,
lane status and location methods. Checks on this level include:

| Rule | Checks |
|---|---|
| `SEM-001`, `SEM-005` | Record id used twice in a situation, or in several situations |
| `SEM-002`, `SEM-003`, `SEM-004` | End before start, record ended before the publication time, missing start time |
| `LOC-001` … `LOC-003` | No drawable location; an approximate location (point coordinates or a display point, a zero-length `gmlLineString`, or a straight line through OpenLR points); location warnings, e.g. a `LinearElementByPoints` without a valid start or end point or with `fromPoint`/`toPoint` outside the element |
| `LOC-004` | `gmlLineString` positions read as "lon lat": one finding for the whole file, because the axis order is decided once per file (also raised when you set "lon lat" by hand) |
| `LANE-001` … `LANE-003` | Unknown lane-status symbols, basic and extended lane status disagree, more lanes restricted than exist |
| `REF-001` … `REF-003` | `managedCause` link not in the file, cyclic cause links, cause in another situation |
| `DQ-RW-001`, `DQ-RW-002` | Closures that contradict their lane evidence ([details](passability.md#contradictions)) |

## OpenLR

The viewer reports whether the feed carries OpenLR, per record and in total. Structured OpenLR is
decoded: DATEX II v3 `openlrLinear` and `openlrPointLocationReference`, v2 `openlrExtendedLinear` and
`openlrExtendedPoint`. The inspector lists the location reference points with coordinates, FRC, form of
way, bearing, lowest FRC to next point, distance to next point and offsets; the map marks them for the
selected record. When a record has no `gmlLineString` or `LinearElementByPoints` line, the map draws
one structured OpenLR line as straight segments between its points (see [Map](usage.md#map)). That line
is marked approximate (`LOC-002`) and is also used for road matching. OpenLR point locations are only
marked.

The road classes (FRC, LFRCNP) are shown as published. What each FRC covers depends on the map data the
publisher encoded against, so the viewer does not map them to OSM road classes; the inspector lists the
OSM road class hierarchy next to them for comparison.

Structured OpenLR references are checked; `OLR-001` and `OLR-002` check the coordinates as WGS 84
decimal degrees:

| Rule | Checks |
|---|---|
| `OLR-001`, `OLR-002` | Latitude or longitude missing, not a number, 0/0 or not a WGS 84 position in decimal degrees (e.g. projected metres) |
| `OLR-003` | Points that fit the record's other geometry (`gmlLineString`, `LinearElementByPoints` line or point coordinates) only with latitude and longitude swapped |
| `OLR-004` | A point farther from the record's other geometry than the OpenLR path length (at least 15 km) plus 1 km |
| `OLR-005` | Straight distance between points longer than the stated distance to the next point |
| `OLR-006` | Incomplete or inconsistent reference |

Binary OpenLR is detected, not decoded.

## RTTI 5-Star

Per criterion, the highest level of the TISA RTTI 5-Star Rating Specification the file allows. See
[RTTI 5-Star ceilings](rtti.md).

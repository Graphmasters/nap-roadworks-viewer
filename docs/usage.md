# Using the viewer

Open [the viewer](https://graphmasters.github.io/nap-roadworks-viewer/) and drop a DATEX II file into
the window, or click **Open DATEX II file…**. Don't have a file yet? See
[Getting a DATEX II file](get-data.md).

## Layout

The window has three panes:

1. **Feed** (left): the report, the RTTI 5-Star panel and the record list with its filters.
2. **Map** (centre): record geometries, OpenStreetMap roads, lane arrows and OpenLR points.
3. **Inspector** (right): details of the selected record or OSM road, in tabs.

Below 900 px width, the layout shows one pane at a time; the **Feed**, **Map** and **Inspector**
buttons in the top bar switch between them.

## Report

The report keeps the layers of the analysis apart, so a problem in one does not hide in another:

1. **XML**: well-formed or the first error with line and column.
2. **DATEX II**: version, `modelBaseVersion`, publication type, publication time and creator, SOAP
   envelope, namespaces, and the axis order of `gmlLineString` positions (you can override it).
3. **XSD validation**: "not performed" until you select schema files (see [below](#xsd-validation)).
4. **Profile (heuristic)**: the detected profile, with a selector to re-run the checks with another.
5. **Extensions**, then the **findings**, grouped by layer (semantics, location, lanes, passability, …).

Each finding names its rule (for example `LOC-002` or `DQ-RW-001`) and links to the affected records.
Click it to select the record and open the right inspector tab. [Checks](checks.md) explains the rules.

## Record list and filters

Every `situationRecord` appears in the list. Only visible rows are rendered, so feeds with 60,000+
records stay fast. Filters:

- **Record type** chips with counts, coloured as on the map.
- **Passability**: passable, restricted, closed, conditional, conflicting, unknown (see
  [Passability and contradictions](passability.md)).
- **Location**: on the map, not drawable, OpenLR present.
- **active now**: records whose validity includes the current time.
- **Lane configuration** (only for feeds with lane status codes): reversible lane, hard shoulder open or
  closed, narrowed or closed lane, parking lane and restrictions, cycleway and pedestrian path open or
  closed. The same icons mark records in the Situation section of the Record tab.
- **Search** over id, situation id, road number and name, description, record type and management
  types.

Keyboard: ↑ / ↓ move through the list, Esc clears the selection.

## Map

- Records with a line geometry (`gmlLineString`) are drawn as lines. Point-only records are drawn as
  points marked *approximate*. Records with other location methods are listed with the reason they
  are not drawn.
- **Select record** mode (default): click a record on the map to select it.
- **Select OSM road** mode: click a road (zoom ≥ 14) to look it up in OpenStreetMap; its tags appear in
  the inspector.
- For the selected record, a compass rose and arrows show the direction of the matched OSM way, and
  OpenLR location reference points are marked when the record has structured OpenLR.

The map position is kept in the URL (`#map=…`), so you can share a view. Nothing about your file is put
in the URL.

## Inspector tabs

| Tab | Shows |
|---|---|
| **Record** | Type, validity, management types, cause links, situation with its other records, location methods, OpenLR points. |
| **QA** | Which [RTTI criteria](rtti.md) this record holds down and why, then every finding about the record. |
| **XML** | The original XML of the record or of its whole situation, cut from the file. |
| **Lanes** | DATEX II lane status next to the OSM lane layout of the matched way ([details](matching-lanes.md#lanes)). |
| **Matching** | OSM road candidates with their score components ([details](matching-lanes.md#matching)). |
| **OSM** | Tags of the selected or matched OSM way, each linked to the OSM wiki. |

## XSD validation

Real schema validation runs in your browser with libxml2 compiled to WebAssembly. The viewer downloads
no schema by itself.

1. Get the XSD files of the DATEX II version or profile your feed uses (see
   [Schemas and profiles](get-data.md#schemas-and-profiles)) and unpack them.
2. In the report, section **3 · XSD validation**, click **Validate against XSD files…**.
3. Select the main schema **together with all files it imports or includes** (multi-select). The viewer
   takes the file that no other file references as the main schema.
4. The result shows *valid* or the number of errors with line numbers (the first 100 are listed), and
   which schema was used.

XSD validation loads the whole document into memory; files up to 400 MB are accepted.

## Dark mode, motion and privacy

Dark mode follows your system setting, and motion is reduced when your system asks for it. The map
credits link to the Impressum and to a **Privacy** dialog that lists every service your browser
contacts; see [Privacy](privacy.md).

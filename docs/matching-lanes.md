# Matching and lanes

A record line on a map is not yet a road. Matching ties each record to the OpenStreetMap ways it runs
along, and the lane comparison shows what the record does to those ways.

## Matching

When you select a record with a line, the viewer starts matching by itself:

1. It samples the record line and reads candidate roads from the z14 vector tiles along it (up to 150
   tiles; the visible map does not move). z14 is the highest zoom of OpenFreeMap, so these are the
   geometries the map shows.
2. Each candidate gets a **score = coverage × quality**:
    - *quality* of the covered part: distance 0.3, direction 0.45, road number 0.15, road class 0.1;
    - *coverage*: the share of the record within 25 m of the candidate.
3. Ways with quality ≥ 0.6 join the explaining sequence, so a long record can be explained by several
   consecutive ways.
4. The result is a match, *ambiguous* (the best candidates are too close) or *no match*.

Matching works on whatever line the map draws for the record (see [Map](usage.md#map)). For a record
whose only line is a straight line through OpenLR points, that line cuts corners where the road bends,
and parts more than 25 m from a road add nothing to coverage. Scores drop, and the right road can be
missed. The Matching tab does not warn about this; the Geometry row of the Record tab says the line
comes from OpenLR.

The Matching tab shows each candidate's components and, once loaded, its OSM lanes as a small graphic.
The score ranks candidates; it is not a calibrated probability.

### Merged tile features

Map tiles often merge several OSM ways into one feature, and its id names only the first way. The viewer
prefers single OSM ways: a merged feature ranks 0.1 lower than its score, and a runner-up on the same
road (within 3 m) does not make the match ambiguous. If a merged feature still wins, the viewer asks for
the individual ways with the same `highway` value inside the part of the record the feature covers, and
scores them in its place (up to 3 rounds):

- boxes up to 500 × 500 m go to the OSM API first, then to Overpass;
- larger boxes go to `overpass-api.de` first, then (up to 0.0005 square degrees) to the OSM API, then to
  `overpass.private.coffee`.

If all fail, the merged feature is kept and marked as such.

### OSM road lookup

In **Select OSM road** mode, click a road at zoom ≥ 14. The tile feature id gives the OSM way, and its
tags come from the OSM API. For merged features, the viewer looks up the clicked way by location with a
~25 m bounding-box query.

## Lanes

DATEX II can describe the lanes of a roadworks site precisely. The German roadworks profile (MDM
roadworks profile 04-00-00) encodes the cross-section as a short string in `laneStatusCoded`, read
across the road: lanes of the opposite direction first, then the separation, then the lanes of the
direction of the record. Lowercase letters stand for lanes and hard shoulders, digits for the
separation:

| Symbol | Meaning |
|---|---|
| `u` / `o` | Open lane, opposite direction / direction of the record (`i` / `e`: narrowed) |
| `x` | Closed lane |
| `w` | Reversible lane, used in both directions |
| `s` | Hard shoulder (a closed one is coded `x`, one open to traffic as a lane) |
| `l` / `r` | Hard-shoulder separation, opposite direction / direction of the record |
| `1` / `2` | Separation of a single carriageway / central reservation of a dual carriageway |

A lane closure on a dual carriageway with hard shoulders, from
[lane-closure-v2.xml](examples/lane-closure-v2.xml): two lanes open in the opposite direction, one of
two lanes closed in the direction of the record.

<!-- example: lane-closure-v2.xml -->
```xml
<impact>
  <numberOfLanesRestricted>1</numberOfLanesRestricted>
  <originalNumberOfLanes>2</originalNumberOfLanes>
  <impactExtension>
    <impactExtended>
      <laneStatusCoded>sluu2xors</laneStatusCoded>
    </impactExtended>
  </impactExtension>
</impact>
```

Several German federal states publish an `extendedLaneStatusCoded` next to it. It uses the same
alphabet plus uppercase symbols, for example `F` and `G` for a closed cycle path and foot path, and `H`
and `P` for no-stopping zones. The element is not part of the published profile and has no public
documentation; the [lane-status-viewer encoding page](https://graphmasters.github.io/lane-status-viewer/docs.html)
lists the symbols the viewer knows.

The **Lanes** tab turns these codes into lane diagrams and places them next to the lane layout of the
matched OSM way, read from its lane tags. A compass rose next to the lane graphic and arrows along the
way on the map show the direction the OSM layout is drawn in; destination signs appear when the way has
`destination:lanes`.

!!! info "A difference is a hint, not an error"
    OpenStreetMap describes the usual layout, DATEX II the temporary one. The direction mapping between
    DATEX II and OSM is not verified.

When `laneStatusCoded` and `extendedLaneStatusCoded` disagree, the more restrictive reading counts.
Unknown symbols are never read as open lanes.

### Example: restricted is not closed

Cycle-path works on a single-carriageway road, from
[extended-lane-status-v2.xml](examples/extended-lane-status-v2.xml). `laneStatusCoded` shows one open
lane in each direction; the extended code adds that the cycle path is closed:

<!-- example: extended-lane-status-v2.xml -->
```xml
<laneStatusCoded>u1o</laneStatusCoded>
<extendedLaneStatusCoded>Fu1o</extendedLaneStatusCoded>
```

Both driving lanes stay open, so the viewer classifies the record as **passable, do not block** for
cars.

If the feed only said "roadworks", a router could not tell such a site from a lane closure. Feeds that
encode lane status give routers exactly the information they need.

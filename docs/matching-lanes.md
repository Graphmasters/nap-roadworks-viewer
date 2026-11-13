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

DATEX II can describe the lanes of a roadworks site precisely. The German roadworks profile, for
example, encodes them as short strings in `laneStatusCoded` and `extendedLaneStatusCoded`: which lanes
are open, narrowed, closed or reversible, whether the hard shoulder is in use, where stopping or
parking is prohibited, and whether foot and cycle paths are closed.

The **Lanes** tab turns these codes into lane diagrams and places them next to the lane layout of the
matched OSM way, read from its lane tags. A compass rose and arrows on the map show the direction the
OSM layout is drawn in; destination signs appear when the way has `destination:lanes`.

!!! info "A difference is a hint, not an error"
    OpenStreetMap describes the usual layout, DATEX II the temporary one. The direction mapping between
    DATEX II and OSM is not verified.

When `laneStatusCoded` and `extendedLaneStatusCoded` disagree, the more restrictive reading counts.
Unknown symbols are never read as open lanes.

### Example: restricted is not closed

Cycle-path works on a district road. The lane code `Fu2o` says: cycle path closed, one driving lane
open in each direction, matching the two lanes in OpenStreetMap. The viewer classifies the record as
**passable, do not block** for cars.

If the feed only said "roadworks", a router could not tell such a site from a lane closure. Feeds that
encode lane status give routers exactly the information they need.

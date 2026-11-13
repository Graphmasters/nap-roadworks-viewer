# XML examples

Small, synthetic DATEX II files: the ids, places and values are invented. Download one and open it
in [the viewer](https://graphmasters.github.io/nap-roadworks-viewer/) to see the checks at work
without a real feed. The excerpts on this site are taken from these files. A test checks that each
excerpt still matches its file and that each file still gives the main results described here:
classification, routing action, how each line is drawn and the findings named.

| File | DATEX II | Shows | Schema |
|---|---|---|---|
| [lane-closure-v2.xml](examples/lane-closure-v2.xml) | v2 | A lane closure in the German roadworks profile | valid against the MDM roadworks profile 04-00-00 |
| [extended-lane-status-v2.xml](examples/extended-lane-status-v2.xml) | v2 | Cycle-path works and a closure that contradicts its cause, with `extendedLaneStatusCoded` | valid without its `extendedLaneStatusCoded` elements, which the profile does not define |
| [locations-v3.xml](examples/locations-v3.xml) | v3 | Three ways to locate a record: `gmlLineString`, `LinearElementByPoints`, OpenLR | valid against the DATEX II v3.5 schemas |

The coordinates are invented, so the lines do not follow real roads, and road matching against
OpenStreetMap may find nothing or an unrelated road. The round coordinates also give a coarse
resolution (about 56 m) in the RTTI panel. Everything else (report, record list, inspector,
passability) works as with a real feed.

## Anatomy of a v2 file

A DATEX II v2 roadworks feed is a `d2LogicalModel` with one `SituationPublication`. It holds
*situations*, and each situation holds one or more *situation records*: the roadworks, closures and
other measures. The viewer reads the version, publication time and creator from the head:

<!-- example: lane-closure-v2.xml -->
```xml
<payloadPublication xsi:type="SituationPublication" lang="de">
  <publicationTime>2026-06-01T10:00:00+02:00</publicationTime>
  <publicationCreator>
    <country>de</country>
    <nationalIdentifier>EXAMPLE</nationalIdentifier>
  </publicationCreator>
  <situation id="EX-1" version="1">
    <headerInformation>
      <confidentiality>noRestriction</confidentiality>
      <informationStatus>real</informationStatus>
    </headerInformation>
    <situationRecord id="EX-1-W" version="1" xsi:type="MaintenanceWorks">
```

The record then gives its validity, its impact (here the lane status, see
[Lanes](matching-lanes.md#lanes)) and its location. The German roadworks profile carries the line in
a `linearExtension`:

<!-- example: lane-closure-v2.xml -->
```xml
<groupOfLocations xsi:type="Linear">
  <linearExtension>
    <linearExtended>
      <gmlLineString>
        <posList>52.00000 9.50000 52.00100 9.50200 52.00200 9.50400</posList>
      </gmlLineString>
    </linearExtended>
  </linearExtension>
</groupOfLocations>
```

`posList` holds latitude–longitude pairs ("lat lon"). The profile asks for ETRS89 coordinates and
accepts WGS 84 (EPSG:4326); the two differ by about a metre, and the viewer reads both as WGS 84. In
the viewer, the record is
*restricted* with the routing action *do not block*: one of two lanes is closed in one direction.

## Locations in v3

In DATEX II v3, the namespaces are split (`sit:` for situations, `loc:` for location referencing,
`com:` for common types), and a record's location is a `sit:locationReference`. The three records of
[locations-v3.xml](examples/locations-v3.xml) show the first three location methods the viewer
[draws](usage.md#map), in its order of preference. Each record carries only one of them.

A **`gmlLineString`**, drawn as given:

<!-- example: locations-v3.xml -->
```xml
<sit:locationReference xsi:type="loc:LinearLocation">
  <loc:gmlLineString srsName="EPSG:4326">
    <loc:posList>52.03000 9.56000 52.03100 9.56200 52.03200 9.56400</loc:posList>
  </loc:gmlLineString>
</sit:locationReference>
```

A **`LinearElementByPoints`**: a start point, optional intermediate points and an end point. Here each
point has coordinates (`pointCoordinates`), which the viewer needs to draw it.
The record covers the part from `fromPoint` to `toPoint`, here 50 m to 350 m along the points of a
410 m element. The viewer draws exactly that part:

<!-- example: locations-v3.xml -->
```xml
  </loc:linearElement>
  <loc:fromPoint xsi:type="loc:DistanceFromLinearElementStart">
    <loc:distanceAlong>50</loc:distanceAlong>
  </loc:fromPoint>
  <loc:toPoint xsi:type="loc:DistanceFromLinearElementStart">
    <loc:distanceAlong>350</loc:distanceAlong>
  </loc:toPoint>
</loc:linearWithinLinearElement>
```

For the [RTTI indicators](rtti.md), this line is not a polyline: the record gets `RTTI-LIN-01`.

An **OpenLR line**: location reference points with coordinates, road class (FRC), form of way,
bearing and the distance to the next point, plus offsets at both ends:

<!-- example: locations-v3.xml -->
```xml
<loc:openlrLinear>
  <loc:firstDirection>
    <loc:openlrLocationReferencePoint>
      <loc:openlrCoordinates>
        <loc:latitude>52.05000</loc:latitude>
        <loc:longitude>9.60000</loc:longitude>
      </loc:openlrCoordinates>
      <loc:openlrLineAttributes>
        <loc:openlrFunctionalRoadClass>frc3</loc:openlrFunctionalRoadClass>
        <loc:openlrFormOfWay>singleCarriageway</loc:openlrFormOfWay>
        <loc:openlrBearing>90</loc:openlrBearing>
      </loc:openlrLineAttributes>
      <loc:openlrPathAttributes>
        <loc:openlrLowestFrcToNextLRPoint>frc3</loc:openlrLowestFrcToNextLRPoint>
        <loc:openlrDistanceToNextLRPoint>720</loc:openlrDistanceToNextLRPoint>
      </loc:openlrPathAttributes>
    </loc:openlrLocationReferencePoint>
```

The record has no other line, so the viewer draws a straight line between the two points, trimmed by
the 60 m offsets at each end, and marks it *approximate* (`LOC-002`). See [OpenLR](checks.md#openlr).

## More examples

- Lane status codes, including the extended code for cycle and foot paths:
  [Lanes](matching-lanes.md#lanes).
- A closure whose cause only prohibits stopping (`DQ-RW-001`):
  [Passability and contradictions](passability.md#dq-rw-001-closure-that-contradicts-its-cause).

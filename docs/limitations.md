# Limitations

What the viewer does not do should be as clear as what it does.

!!! warning "In short"
    - **One file, no history.** No statement on update cycle, timeliness or availability.
    - **Ceilings, not ratings.** RTTI star levels are upper bounds from selected criteria, not an
      official TISA rating.
    - **Scores rank.** Matching scores rank candidates; they are not probabilities.
    - **Review, not verdict.** A flagged contradiction calls for review; it proves no error.

## Location referencing

Only `gmlLineString` (v2 `linearExtension`, v3 `LinearLocation`) in WGS 84 degrees is drawn as a line.
ALERT-C, TPEG and linear-element references are listed, not decoded. Structured OpenLR is decoded and
its points are marked for the selected record, but OpenLR is not map-matched into a line; binary
OpenLR is not decoded.

The `posList` axis order is "lat lon" per EPSG:4326. "lon lat" files are detected from explicit
latitude/longitude points of the same records, or can be set by hand in the report.

## Profile checks are heuristic

They come from the profile documentation and observed feeds. They are no conformance test. Use
[XSD validation](usage.md#xsd-validation) for schema conformance.

## OSM ids from tiles

OpenFreeMap tiles are built with planetiler, which encodes `osmId × 10 + type`. Features merged from
several ways are common even at zoom 14, and their id names only the first way. For those, the viewer
looks up the clicked way by location, and matching splits them into their ways
([details](matching-lanes.md#merged-tile-features)).

## Matching

Matching uses the z14 tile geometries along the record, up to 150 tiles. The score ranks candidates;
it is not a calibrated probability. If all lookups for the individual ways of a merged feature fail, the
merged feature is kept and marked as such.

## Lanes

OSM lane tags describe the usual layout and DATEX II a temporary one. A difference is a hint, not an
error. The direction mapping between DATEX II and OSM is not verified.

## Size

Files are streamed in a Web Worker. A 209 MB (16 MB gzipped) feed with 61,000 records works but needs
several hundred MB of memory. XSD validation loads the whole document (max 400 MB).

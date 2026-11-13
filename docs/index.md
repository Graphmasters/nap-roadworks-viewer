# Is this road really closed?

**NAP Roadworks Viewer** checks DATEX II roadworks and road-closure feeds from National Access Points
(NAPs) and links them to the road network, lane by lane. It runs entirely in your browser: open a
feed to validate it, see its records on a map and compare them with OpenStreetMap.

[Open the viewer](https://graphmasters.github.io/nap-roadworks-viewer/){ .btn .btn-primary }
[Source code on GitHub](https://github.com/Graphmasters/nap-roadworks-viewer){ .btn .btn-outline-primary }

![NAP Roadworks Viewer: the record list on the left, a roadworks record drawn as a line on the map, and the Lanes tab comparing the DATEX II lane status (lane closed, foot and cycle paths closed, reversible lane) with the OpenStreetMap lane layout of the matched road](screenshot.webp)

*A roadworks record from a German roadworks feed. The Lanes tab shows the DATEX II lane status next
to the usual OpenStreetMap layout of the matched road, with a compass for its direction.
Data: [Landesbetrieb Straßenbau und Verkehr Schleswig-Holstein (LBV.SH)](https://mobilithek.info/offers/110000000003237002)
via Mobilithek, licence-free. Map: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
(ODbL), OpenMapTiles, OpenFreeMap; map style basemap.world © BKG (CC BY 4.0), modified by Graphmasters.*

## A coordinate is not a closure

Road authorities across Europe publish their roadworks and closures as DATEX II on National Access
Points. For navigation, a coordinate is not enough. Every record raises the same questions:

- Which road does it mean, and in which direction?
- Which lanes are affected, and which road users: cars, cyclists, pedestrians?
- Is the road really impassable, or only restricted?

A route that avoids a road that is in fact open costs time. A route through a road that is in fact
closed costs more. The feeds rarely answer these questions at a glance: a typical file is a few
megabytes to a few hundred megabytes of XML, with thousands of records, each with its own validity,
location reference, lane codes and links to other records. The viewer makes this visible, for those
who publish the data and for those who route on it.

## From feed to road in four steps

| Step | Question | Where to read more |
|---|---|---|
| **1. Check** | Is the XML well-formed, which DATEX II version and profile does it use, does it pass schema validation? | [Checks](checks.md) |
| **2. Locate** | Where is each record on the map, and which OpenStreetMap road does it belong to? | [Matching and lanes](matching-lanes.md) |
| **3. Interpret** | What do the lane codes say, compared with the usual lane layout of that road? | [Matching and lanes](matching-lanes.md#lanes) |
| **4. Routing hint** | Is the record passable, restricted, closed or contradictory: block, do not block, or review? | [Passability and contradictions](passability.md) |

On top of that, the viewer shows per criterion the highest star level of the
[TISA RTTI 5-Star Rating Specification](https://tisa.org/rtti-5-star-rating-specification/) that the
file allows: see [RTTI 5-Star ceilings](rtti.md).

## Why use it

- **Lanes, not pins.** Which lanes, directions and road users are affected: DATEX II lane status next
  to the OpenStreetMap lane layout of the matched road.
- **Visible quality.** XML, XSD and profile checks, contradiction checks and selected TISA RTTI 5-Star
  criteria, file by file, each linked to the affected records.
- **From feed to road.** Each record matched to OpenStreetMap ways, with the score components shown,
  not hidden.
- **Free, open, private.** Apache License 2.0. Runs in your browser; the file is never uploaded. No
  Graphmasters server is involved.

## Try it with your feed

1. [Download a DATEX II roadworks file](get-data.md) from your National Access Point.
2. Open [graphmasters.github.io/nap-roadworks-viewer](https://graphmasters.github.io/nap-roadworks-viewer/).
3. Drop the file into the window, or use **Open DATEX II file…** (plain XML or gzip).

Then follow [Using the viewer](usage.md). No file at hand? The [XML examples](examples.md) are small
synthetic files you can open right away. Which checks do you need for your feed? Issues and pull
requests are welcome on [GitHub](https://github.com/Graphmasters/nap-roadworks-viewer/issues).

!!! note "Credit the publisher"
    When you publish screenshots or results from a DATEX II feed, credit its publisher as their
    licence requires.

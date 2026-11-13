# Privacy

The viewer is a self-contained web app. It has no backend and uses no Graphmasters servers: it is
served as static files from GitHub Pages.

## Your file stays on your device

The DATEX II file you open is read and analysed in your browser, in a Web Worker. It is neither uploaded
nor stored. The viewer sets no cookies, stores nothing in your browser and uses no analytics. That
matters for feeds that need an account or are not public yet.

## What the browser loads from the internet

To show the map and look up roads, your browser contacts these services directly. Like every web
server, they see your IP address.

| Service | Host | What and when |
|---|---|---|
| GitHub Pages | `graphmasters.github.io` | The app and the map style ([basemap-world-openfreemap](https://github.com/Graphmasters/basemap-world-openfreemap)). |
| OpenFreeMap | `tiles.openfreemap.org` | Map tiles. The map moves to your records and matching reads z14 tiles along a record, so these requests show roughly where your records are. |
| BKG basemap.de | `sgx.geodatenzentrum.de` | Fonts and map icons of the basemap.world style. |
| OpenStreetMap API | `api.openstreetmap.org` | When you select a road, use a matching candidate or run matching (which starts by itself when you select a record with a line): a way id or a small bounding box; during matching that box comes from the record. |
| Overpass | `overpass-api.de` (FOSSGIS e.V.), `overpass.private.coffee` | During matching, for larger areas: a road class and the bounding box of the matched part of the record. |

No other data from your file is sent. The same list is in the viewer's **Privacy** dialog, linked from
the map credits.

Thanks to the operators of these services, which make tools like this possible for everyone, and to
the OpenStreetMap contributors whose data the matching relies on.

## This documentation site

These pages are static files on GitHub Pages as well. Their stylesheets, fonts and scripts are served
with them, code is highlighted when the site is built, and the search runs in your browser. They
load nothing from other servers.

The viewer is published by Graphmasters GmbH, see the
[Impressum](https://www.graphmasters.net/imprint).

# Getting a DATEX II file

The viewer contains no feed data. You download a DATEX II file from a National Access Point (NAP)
yourself, then open it in the viewer. This page explains where to find such files and how to get
them.

## What a National Access Point is

Under the EU rules for real-time traffic information (RTTI, Delegated Regulation (EU) 2022/670),
every member state runs a National Access Point: a portal that lists the traffic data of its road
authorities and other providers. Roadworks and road closures are among the data they publish, almost
always as **DATEX II**, the European standard for traffic data, in version 2 or 3.

NAPCORE keeps a [list of the National Access Points in Europe](https://napcore.eu/description-naps/national-access-point/).
Find your country's row and follow the link in the **RTTI** column. That is the portal where real-time
traffic information, including roadworks, is published.

## What to look for

On the NAP, search for data offers on **roadworks**, **road closures**, **planned events** or
**traffic situations**. Feeds go by many names; look for these signs:

- The format is **DATEX II** (v2 or v3), usually a situation publication (`SituationPublication`).
- The description mentions roadworks (*Baustellen*, *wegwerkzaamheden*, …), closures (*Sperrungen*,
  *afsluitingen*, …) or traffic measures.
- The file is XML, often compressed with gzip (`.xml.gz`). Both can be opened directly.
- Many offers name the DATEX II **profile** they follow, for example a national roadworks profile.
  Keep that in mind for [schema validation](#schemas-and-profiles).

Some feeds are offered only as a live interface (push or pull over HTTP). For the viewer, you need one
snapshot of it saved as a file: download it once with your browser or with a tool such as `curl`.

## NAPs with an account

Some NAPs give access only to registered users. An example is **[Mobilithek](https://mobilithek.info)**,
the German NAP:

1. Register a user account on Mobilithek and log in.
2. Search the data offers (*Datenangebote*) for roadworks or road closures in DATEX II, and read the
   offer's licence and terms of use.
3. Subscribe to the offer. Some data providers approve each subscription first, so access may not be
   immediate.
4. Once the subscription is active, open the offer page, go to the tab **Data Access**
   (German: *Dateien oder Inhalte*) and click **Download Current Data Package**
   (*Aktuelles Datenpaket herunterladen*).

The downloaded file is the current snapshot of the feed. Other NAPs with accounts work in a similar way:
register, request access to the offer, then download from the offer page.

## Open NAPs

Other NAPs publish their files openly, without an account. An example is the Netherlands: the
[NDW open data directory](https://opendata.ndw.nu), listed on the Dutch NAP, is a plain list of files
that you can download in the browser, most of them gzipped DATEX II XML. Check the terms of use the
NAP links to before you publish anything derived from the data.

## Open the file in the viewer

1. Open [the viewer](https://graphmasters.github.io/nap-roadworks-viewer/).
2. Drop the file into the window, or click **Open DATEX II file…**. Plain XML and gzip (`.gz`) both
   work; there is no need to unpack the file first.
3. A progress bar shows bytes, situations and records while the file loads. Then continue with
   [Using the viewer](usage.md).

The file is read in your browser and never uploaded (see [Privacy](privacy.md)). That matters for
feeds that need an account or are not public yet.

## Schemas and profiles

For real schema validation, the viewer needs the XSD files of the DATEX II version or profile the feed
uses. It downloads nothing by itself; you select the files ([how](usage.md#xsd-validation)).

- **DATEX II schemas** for the versions and the standard parts are available from the
  [DATEX II specifications](https://datex2.eu/specifications/) page; the full v3.x schemas are on the
  download pages of [docs.datex2.eu](https://docs.datex2.eu/downloads/). For a v3 situation
  publication, select `DATEXII_3_D2Payload.xsd` together with the files it imports.
- **National profiles** are published by their owners. For Germany, the roadworks profile
  (*Baustellenprofil*, MDM roadworks profile 04-00-00) can be downloaded from the
  [Mobilithek download page](https://mobilithek.info/help/download). Feeds that add an
  `extendedLaneStatusCoded` ([Lanes](matching-lanes.md#lanes)) do not validate against it.
- For real-time traffic information, the [DATEX II RTTI recommended reference profile](https://docs.datex2.eu/recommended-profiles/rrp/rtti/)
  describes which record types and value lists to use. The [RTTI 5-Star ceilings](rtti.md) refer to it.
  It comes without a ready-made XSD: you generate one in the
  [DATEX II webtool schema wizard](https://webtool.datex2.eu/wizard), where you choose the profile and
  your location referencing method.

The [XML examples](examples.md) were validated this way: `lane-closure-v2.xml` against the German
roadworks profile, `locations-v3.xml` against the DATEX II v3.5 schemas.

Independently of XSD validation, the viewer runs heuristic [profile checks](checks.md#profile-checks)
for the German roadworks profile, Dutch situation feeds and generic DATEX II v2 and v3.

## Licences and attribution

Each feed comes with its own licence. Some are licence-free, others require attribution or restrict
redistribution. When you publish screenshots or results from a feed, credit its publisher as their
licence requires.

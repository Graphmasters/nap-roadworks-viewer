# RTTI 5-Star ceilings

In October 2025, TISA published the
[RTTI 5-Star Rating Specification v1.0](https://tisa.org/rtti-5-star-rating-specification/). It rates
roadworks and road-closure data per criterion from 1★ to 5★ (Tables 15–18): data format, location
referencing, a polyline with an unambiguous direction, stable message IDs, correctness, completeness,
outdated messages and more.

## A ceiling, not a rating

A single file cannot settle all of that: update cycle, timeliness or availability only show over many
downloads. The viewer therefore sorts each situation into one of four use cases (planned or unplanned
roadworks, planned or unplanned full road closure) and shows, per criterion, the **highest level this
file allows**. A feed cannot score higher on that criterion, but it may score lower once the criteria a
file cannot show are measured. The viewer shows no overall star value, and TISA's Evaluation
Methodology is not published yet.

## Typical problems and their fixes

The ceilings are useful because they point to concrete fixes. Typical findings, with the ceiling before
and after the fix:

| Criterion | Weight | Problem | Fix | Ceiling |
|---|---|---|---|---|
| Polyline | critical | point only | add a line | 0★ → 5★ |
| Direction | critical | not tied to the line | state it on the line | 2★ → 5★ |
| Message ID | critical | ID reused | stable unique IDs | 2★ → 5★ |
| Correctness | critical | closure contradicts its cause | resolve the conflicts | by % → 5★ |
| Completeness | critical | end time missing | add the end time | by % → 5★ |
| Data format | high | DATEX II v2 | v3 and a reference profile | 3★ → 5★ |
| Location referencing | high | coordinates only | add OpenLR | 3★ → 5★ |

Each finding links to the affected records. The **QA** tab of a record shows which criteria it holds
down and why, including the rule and message behind each internal contradiction.

## Criteria checked in the file

| Criterion | Checked in the file | Ceiling |
|---|---|---|
| Data format used | DATEX II version; reference-profile conformance (heuristic, plus your XSD run) | v2 3★, v3 4★, v3 conformant 5★ |
| Use of specification | Record types and value lists of the [DATEX II RTTI reference profile](https://docs.datex2.eu/recommended-profiles/rrp/rtti/); one encoding per category (`RTTI-SPEC-01/02`) | deviation 2★ |
| Terminology & definition | Roadworks keep a lane open, closures close all lanes in a direction (`RTTI-TERM-01`, `DQ-RW-001/002`) | conflict 2★ |
| Location referencing | Best method per record: OpenLR with valid WGS 84 points, ALERT-C, coordinates (`RTTI-LOC-01`) | 5★ / 4★ / 3★ (2★ for unplanned closures) / 0 |
| Linear referencing | A polyline on every record: a `gmlLineString` with at least two distinct positions, or a structured OpenLR line whose points are valid WGS 84 positions at most 15 km apart (`RTTI-LIN-01/02/03`) | missing 0 |
| ↳ Direction | Only on records with a polyline: is the traffic direction along it unambiguous? (`RTTI-DIR-01/02/03`, see below) | not unambiguous 2★ |
| Accuracy | Upper bound from coordinate resolution (`RTTI-ACC-01`); points far from their own polyline (`RTTI-ACC-02`) | per distance thresholds |
| Correctness | Share of records without internal contradictions | per % thresholds |
| Completeness | Attribute completeness (start, end, polyline, direction, effect or cause), as the spec defines it for events | per % thresholds |
| RTTI event message ID | id, version and version time on every record; no reused ids; probable duplicates (`RTTI-ID-01/02`) | problem 2★ |
| Outdated messages | Age of ended records at `publicationTime` | 24 h 5★ … 4 weeks 1★ |
| Validity, road type, lane level, vehicle classes, cause type | Start/end and schedules (`RTTI-VAL-01`), lane detail per situation, vehicle characteristics, closure causes (`RTTI-CAUSE-01`) | per table |
| Pre-announcement, short-term events | Lead time from creation to start; unplanned works present | shown, no level |
| Update cycle, timeliness, secure API, ID stability | Not shown for an uploaded file: they need repeated downloads or the access URL. Missing creation or version times are still reported (`RTTI-TIME-01`) | — |

**Direction.** These count as unambiguous: both directions affected; an OpenLR line (its direction
section), or OpenLR whose end points match the `gmlLineString` ends within the OpenLR offsets;
`aligned`/`opposite` on a linear element given by coordinates; a compass direction matching the
polyline bearing. Vertex order alone, an ALERT-C direction (relative to the location table) or
`aligned` on a coded road are ambiguous (`RTTI-DIR-01`). OpenLR that does not fit the polyline is a
contradiction (`RTTI-DIR-02`); references that disagree make it ambiguous (`RTTI-DIR-03`).

## Assumptions

- **Planned vs unplanned.** `urgentRoadworks`, else the lead time from `situationRecordCreationTime`
  to `overallStartTime`: 24 h or more is planned. This boundary is the viewer's choice, not the spec's.
- **FRC is unknown.** Direction is required on every record, although the spec asks for it on FRC 3–6
  only. Accuracy, correctness and completeness use the looser of the FRC 1–4 and FRC 5–6 thresholds.
- **Out of scope** (listed, not rated): moving or mobile maintenance, lane restrictions without a
  roadworks cause, other record types. Static speed limits (Table 13) come via TN-ITS, not in a
  situation publication.
- **Capability checks.** Schedules and vehicle classes count once the feed uses them anywhere.
- **Polylines in other coordinate systems.** A `gmlLineString` in another CRS (e.g. `srsName="25833"`)
  counts as a polyline, but its direction and accuracy are not checked (`RTTI-LIN-03`).

## Official assessment

As a data provider, you can request an
[External RTTI 5★ Gap Analysis](https://tisa.org/5-stars-external-gap-analysis/) from TISA. The viewer
does not replace it: it is a quick look at the technical properties and possible problems of your XML
file, run in your browser, with code you can review.

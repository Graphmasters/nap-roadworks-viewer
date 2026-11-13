// Generic checks on feed structure, records, locations and lanes. An unsupported location
// reference is reported as such and never as an invalid record (concept §8.1).

import { summariseLaneCode } from '../lanes/codes'
import { distanceM, distanceToLineM } from '../location/geometry'
import { validWgs84 } from '../location/openlr'
import type { FeedMeta, Finding, OpenlrReference, RoadEvent, Situation } from '../model'
import { linesOf } from '../matching/score'

export function feedChecks(meta: FeedMeta, situations: Situation[]): Finding[] {
  const out: Finding[] = []
  if (meta.hasDoctype)
    out.push({
      ruleId: 'XML-002',
      severity: 'warning',
      layer: 'xml',
      message: 'The document has a DOCTYPE declaration.',
      explanation: 'DTDs are not used by DATEX II. The viewer ignores them and never resolves external entities.',
    })
  if (meta.datexVersion === 'unknown')
    out.push({
      ruleId: 'DTX-001',
      severity: 'error',
      layer: 'datex',
      message: 'No DATEX II namespace found.',
      explanation: `The root element is ${meta.rootElement ?? '(none)'} in namespace ${meta.rootNamespace || '(none)'}. DATEX II elements live in http://datex2.eu/schema/….`,
    })
  else if (meta.publicationType && meta.publicationType !== 'SituationPublication')
    out.push({
      ruleId: 'DTX-002',
      severity: 'warning',
      layer: 'datex',
      message: `Publication type ${meta.publicationType} is not supported for record extraction.`,
      explanation: 'The viewer reads roadworks and closures from SituationPublication only.',
    })
  if (meta.datexVersion !== 'unknown' && situations.length === 0)
    out.push({ ruleId: 'DTX-003', severity: 'info', layer: 'datex', message: 'The publication contains no situations.' })
  if (meta.axisOrder.order === 'lonlat')
    out.push({
      ruleId: 'LOC-004',
      severity: 'warning',
      layer: 'location',
      message: 'gmlLineString positions are in "lon lat" order.',
      explanation: `DATEX II uses WGS 84 (EPSG:4326), whose axis order is latitude then longitude. ${meta.axisOrder.votesLonLat} line(s) fit "lon lat" better than "lat lon" (${meta.axisOrder.votesLatLon}). The viewer reads the file as "lon lat".`,
      remedy: 'Publish posList values as "lat lon".',
    })
  return out
}

/** LOC-002 message per geometry source of an approximate location. */
const APPROXIMATE_MESSAGE: Record<string, string> = {
  points: 'Approximate location: point coordinates only.',
  openlr: 'Approximate location: straight line through OpenLR points.',
  gmlLineString: 'Approximate location: zero-length gmlLineString drawn as a point.',
}

export function recordChecks(events: RoadEvent[], meta: FeedMeta, duplicateIds: Array<{ situationId: string; id: string }>): Finding[] {
  const out: Finding[] = []
  for (const d of duplicateIds)
    out.push({
      ruleId: 'SEM-001',
      severity: 'error',
      layer: 'semantic',
      message: `Situation record id ${d.id} occurs more than once in situation ${d.situationId}.`,
      situationId: d.situationId,
      recordIds: [d.id],
    })
  const seen = new Map<string, string>()
  const pubTime = meta.publicationTime ? Date.parse(meta.publicationTime) : NaN
  for (const e of events) {
    const other = seen.get(e.id)
    if (other !== undefined && other !== e.situationId)
      out.push({
        ruleId: 'SEM-005',
        severity: 'warning',
        layer: 'semantic',
        message: `Situation record id ${e.id} appears in situations ${other} and ${e.situationId}.`,
        recordIds: [e.id],
        situationId: e.situationId,
        xmlPath: e.xmlPath,
      })
    else seen.set(e.id, e.situationId)

    const from = e.validFrom ? Date.parse(e.validFrom) : NaN
    const to = e.validTo ? Date.parse(e.validTo) : NaN
    if (!e.validFrom && e.validityStatus === 'definedByValidityTimeSpec')
      out.push({
        ruleId: 'SEM-004',
        severity: 'warning',
        layer: 'semantic',
        message: 'Validity is defined by time specification but overallStartTime is missing.',
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
      })
    if (!Number.isNaN(from) && !Number.isNaN(to) && to < from)
      out.push({
        ruleId: 'SEM-002',
        severity: 'error',
        layer: 'semantic',
        message: 'overallEndTime is before overallStartTime.',
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
        rawValue: `${e.validFrom} – ${e.validTo}`,
      })
    else if (!Number.isNaN(to) && !Number.isNaN(pubTime) && to < pubTime)
      out.push({
        ruleId: 'SEM-003',
        severity: 'info',
        layer: 'semantic',
        message: 'The record ended before the publication time.',
        explanation: 'Validity end lies before publicationTime. The record may be historic or kept for reference.',
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
        rawValue: e.validTo,
      })

    if (e.geometryConfidence === 'none')
      out.push({
        ruleId: 'LOC-001',
        severity: 'info',
        layer: 'location',
        message: 'No location that the viewer can draw.',
        // The note says whether this is a limitation of the viewer or invalid data in the feed.
        explanation: e.geometryNote,
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
      })
    else if (e.geometryConfidence === 'approximate')
      out.push({
        ruleId: 'LOC-002',
        severity: 'info',
        layer: 'location',
        message: APPROXIMATE_MESSAGE[e.geometrySource ?? ''] ?? 'Approximate location.',
        explanation: e.geometryNote,
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
      })
    for (const w of e.warnings)
      out.push({ ruleId: 'LOC-003', severity: 'warning', layer: 'location', message: w, situationId: e.situationId, recordIds: [e.id], xmlPath: e.xmlPath })

    const sums = e.laneCodes.map((c) => ({ c, s: summariseLaneCode(c.value) }))
    for (const { c, s } of sums)
      if (s.unknownSymbols.length)
        out.push({
          ruleId: 'LANE-001',
          severity: 'warning',
          layer: 'lanes',
          message: `${c.field} contains unknown symbols: ${[...new Set(s.unknownSymbols)].join(' ')}.`,
          explanation: 'Unknown codes are not interpreted as open lanes.',
          situationId: e.situationId,
          recordIds: [e.id],
          xmlPath: c.xmlPath,
          rawValue: c.value,
        })
    const basic = sums.find((x) => x.c.field === 'laneStatusCoded')
    const ext = sums.find((x) => x.c.field === 'extendedLaneStatusCoded')
    if (basic && ext && basic.s.closedLanes !== ext.s.closedLanes)
      out.push({
        ruleId: 'LANE-002',
        severity: 'info',
        layer: 'lanes',
        message: `laneStatusCoded (${basic.c.value}) and extendedLaneStatusCoded (${ext.c.value}) differ in the number of closed lanes.`,
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: ext.c.xmlPath,
      })
    const li = e.laneImpact
    if (li.numberOfLanesRestricted !== undefined && li.originalNumberOfLanes !== undefined && li.numberOfLanesRestricted > li.originalNumberOfLanes)
      out.push({
        ruleId: 'LANE-003',
        severity: 'warning',
        layer: 'lanes',
        message: `numberOfLanesRestricted (${li.numberOfLanesRestricted}) exceeds originalNumberOfLanes (${li.originalNumberOfLanes}).`,
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
      })
  }
  return out
}

/** Largest distance between consecutive LRPs that the OpenLR standard allows (DNP limit). */
export const OPENLR_MAX_DNP_M = 15_000

const FRC_RE = /^FRC[0-7]$/

/**
 * Distance from (lat, lon) to the record's own non-OpenLR geometry (gmlLineString or
 * LinearElementByPoints line, point coordinates); Infinity when it has none. A line drawn through
 * the OpenLR points themselves is skipped: it would always be at distance 0.
 */
function distanceToOwnGeometry(e: RoadEvent, lat: number, lon: number): number {
  let best = Infinity
  const ownLine = e.geometrySource === 'gmlLineString' || e.geometrySource === 'linearElementByPoints'
  for (const line of ownLine ? linesOf(e.geometry) : []) best = Math.min(best, distanceToLineM(lat, lon, line))
  for (const [plat, plon] of e.referencePoints) best = Math.min(best, distanceM(lat, lon, plat, plon))
  return best
}

function refLabel(r: OpenlrReference): string {
  return `OpenLR ${r.kind}${r.role ? ` (${r.role})` : ''}`
}

/**
 * Checks decoded structured OpenLR references: coordinates must be WGS 84 decimal degrees
 * (DATEX II PointCoordinates), consistent with the record's other geometry and with the
 * distances between location reference points.
 */
export function openlrChecks(events: RoadEvent[]): Finding[] {
  const out: Finding[] = []
  for (const e of events) {
    for (const r of e.openlr) {
      if (r.encoding !== 'structured') continue
      const base = { situationId: e.situationId, recordIds: [e.id], xmlPath: r.xmlPath }
      r.lrps.forEach((p, i) => {
        if (p.lat === undefined || p.lon === undefined)
          out.push({
            ruleId: 'OLR-001',
            severity: 'error',
            layer: 'location',
            message: `${refLabel(r)}, LRP ${i + 1}: latitude or longitude is missing or not a number.`,
            ...base,
            xmlPath: p.xmlPath,
            rawValue: `${p.rawLat ?? '(none)'} ${p.rawLon ?? '(none)'}`,
          })
        else if (!validWgs84(p))
          out.push({
            ruleId: 'OLR-002',
            severity: 'error',
            layer: 'location',
            message:
              p.lat === 0 && p.lon === 0
                ? `${refLabel(r)}, LRP ${i + 1}: coordinates are 0/0.`
                : `${refLabel(r)}, LRP ${i + 1}: ${p.lat}, ${p.lon} is not a WGS 84 position in decimal degrees.`,
            explanation:
              'OpenLR coordinates in DATEX II are PointCoordinates: latitude and longitude in decimal degrees (WGS 84 / ETRS89). Values outside ±90 / ±180 usually mean projected coordinates (metres) or a unit error; 0/0 is a placeholder.',
            ...base,
            xmlPath: p.xmlPath,
            rawValue: `${p.rawLat} ${p.rawLon}`,
          })
      })

      // Swapped axes or a far-away reference, judged against the record's own geometry.
      let swapped = 0
      let farthest = 0
      for (const p of r.lrps) {
        if (p.lat === undefined || p.lon === undefined) continue
        const asIs = validWgs84(p) ? distanceToOwnGeometry(e, p.lat, p.lon) : Infinity
        const flipped = Math.abs(p.lon) <= 90 ? distanceToOwnGeometry(e, p.lon, p.lat) : Infinity
        if (flipped < 50_000 && asIs > 2_000 && flipped < asIs * 0.2) swapped++
        else if (Number.isFinite(asIs)) farthest = Math.max(farthest, asIs)
      }
      if (swapped)
        out.push({
          ruleId: 'OLR-003',
          severity: 'warning',
          layer: 'location',
          message: `${refLabel(r)}: ${swapped} LRP(s) fit the record's other geometry only with latitude and longitude swapped.`,
          explanation: 'Latitude and longitude seem to be written the wrong way round. The reference is not used for the RTTI location-referencing and direction checks.',
          ...base,
        })
      // Every LRP lies on the referenced path, so its straight distance to any point of the
      // location is at most the path length (sum of DNPs; 15 km when DNPs are missing) plus 1 km.
      const pathM = Math.max(OPENLR_MAX_DNP_M, r.lrps.reduce((sum, p) => sum + (p.dnp ?? 0), 0))
      if (!swapped && farthest > pathM + 1_000)
        out.push({
          ruleId: 'OLR-004',
          severity: 'warning',
          layer: 'location',
          message: `${refLabel(r)}: an LRP lies ${(farthest / 1000).toFixed(1)} km from the record's other geometry.`,
          explanation: `The OpenLR path is at most ${(pathM / 1000).toFixed(1)} km long (sum of the distances to the next point), so a larger distance to the polyline or point of the same record means the location references disagree.`,
          ...base,
        })

      // A road between two LRPs cannot be shorter than the straight line between them.
      const bad: string[] = []
      for (let i = 0; !swapped && i + 1 < r.lrps.length; i++) {
        const a = r.lrps[i]!
        const b = r.lrps[i + 1]!
        if (!validWgs84(a) || !validWgs84(b) || a.dnp === undefined) continue
        const straight = distanceM(a.lat, a.lon, b.lat, b.lon)
        if (straight > a.dnp * 1.1 + 50) bad.push(`LRP ${i + 1}→${i + 2}: ${Math.round(straight)} m straight vs DNP ${a.dnp} m`)
      }
      if (bad.length)
        out.push({
          ruleId: 'OLR-005',
          severity: 'warning',
          layer: 'location',
          message: `${refLabel(r)}: straight distance between LRPs exceeds the distance to the next point (DNP).`,
          explanation: `${bad.join('; ')}. A coordinate or a DNP value is wrong.`,
          ...base,
        })

      const issues: string[] = []
      const isLine = r.kind === 'line' || /alongline/i.test(r.pointType ?? '')
      if (isLine) {
        if (r.lrps.length < 2) issues.push(`${r.lrps.length} LRP(s), at least 2 needed`)
        if (r.lrps.length && !r.lrps[r.lrps.length - 1]!.last) issues.push('no openlrLastLocationReferencePoint at the end')
        r.lrps.slice(0, -1).forEach((p, i) => {
          if (p.dnp === undefined) issues.push(`LRP ${i + 1} has no distance to the next point`)
        })
        const first = r.lrps[0]
        const beforeLast = r.lrps[r.lrps.length - 2]
        if (r.positiveOffset !== undefined && first?.dnp !== undefined && r.positiveOffset >= first.dnp)
          issues.push(`positive offset ${r.positiveOffset} m is not shorter than the first segment (${first.dnp} m)`)
        if (r.kind === 'line' && r.negativeOffset !== undefined && beforeLast?.dnp !== undefined && r.negativeOffset >= beforeLast.dnp)
          issues.push(`negative offset ${r.negativeOffset} m is not shorter than the last segment (${beforeLast.dnp} m)`)
      }
      r.lrps.forEach((p, i) => {
        if (p.bearing !== undefined && (p.bearing < 0 || p.bearing > 360)) issues.push(`LRP ${i + 1} bearing ${p.bearing} outside 0–360`)
        if (p.frc !== undefined && !FRC_RE.test(p.frc)) issues.push(`LRP ${i + 1} FRC "${p.frc}" is not FRC0–FRC7`)
        if (p.dnp !== undefined && p.dnp > OPENLR_MAX_DNP_M) issues.push(`LRP ${i + 1} distance to the next point ${p.dnp} m exceeds the OpenLR maximum of ${OPENLR_MAX_DNP_M} m`)
      })
      if (issues.length)
        out.push({
          ruleId: 'OLR-006',
          severity: 'warning',
          layer: 'location',
          message: `${refLabel(r)} is incomplete or inconsistent: ${issues.slice(0, 3).join('; ')}${issues.length > 3 ? '; …' : ''}.`,
          explanation: issues.join('; '),
          ...base,
        })
    }
  }
  return out
}

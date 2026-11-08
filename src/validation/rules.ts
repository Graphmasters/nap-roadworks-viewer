// Generic checks on feed structure, records, locations and lanes. An unsupported location
// reference is reported as such and never as an invalid record (concept §8.1).

import { summariseLaneCode } from '../lanes/codes'
import type { FeedMeta, Finding, RoadEvent, Situation } from '../model'

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
        explanation: `${e.geometryNote ?? ''} This is a limitation of the viewer, not an error in the feed.`,
        situationId: e.situationId,
        recordIds: [e.id],
        xmlPath: e.xmlPath,
      })
    else if (e.geometryConfidence === 'approximate')
      out.push({
        ruleId: 'LOC-002',
        severity: 'info',
        layer: 'location',
        message: 'Located by point coordinates only.',
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

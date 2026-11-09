// Compares the DATEX II lane description of a record with the OSM lane tagging of a road
// (concept §4.6, §5.5). DATEX II describes a temporary state; OSM describes the usual layout, so
// a difference is a hint to look closer, not an error.

import { interpretLanes } from 'osm-lanes'
import type { RoadEvent, Severity } from '../model'
import { laneEvidenceOf, type LaneCodeSummary } from './codes'

export interface OsmLaneAttributes {
  osmType: 'way' | 'relation' | 'node'
  osmId: string
  lanesTotal?: number
  lanesForward?: number
  lanesBackward?: number
  oneWay?: boolean
  /** Lane counts as interpreted by osm-lanes (including defaults when tags are missing). */
  interpretedForward: number
  interpretedBackward: number
  /** True when OSM has only lane counts and no per-lane tags. */
  aggregatedOnly: boolean
  rawTags: Record<string, string>
}

export interface LaneIndicator {
  id: string
  severity: Severity
  message: string
}

export interface LaneComparison {
  datex?: LaneCodeSummary & { field: string }
  osm: OsmLaneAttributes
  indicators: LaneIndicator[]
  assessment: string
}

const int = (v: string | undefined) => {
  if (v === undefined) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

export function osmLaneAttributes(osmType: OsmLaneAttributes['osmType'], osmId: string, tags: Record<string, string>): OsmLaneAttributes {
  const road = interpretLanes(tags)
  const oneway = road.oneway !== 'no'
  return {
    osmType,
    osmId,
    lanesTotal: int(tags['lanes']),
    lanesForward: int(tags['lanes:forward']),
    lanesBackward: int(tags['lanes:backward']),
    oneWay: oneway,
    interpretedForward: road.forward.length,
    interpretedBackward: road.backward.length,
    aggregatedOnly: !Object.keys(tags).some((k) => /:lanes(:|$)/.test(k)),
    rawTags: { ...tags },
  }
}

export function compareLanes(event: RoadEvent, osm: OsmLaneAttributes, matchConfidence?: number): LaneComparison {
  const ind: LaneIndicator[] = []
  const picked = laneEvidenceOf(event.laneCodes)
  const field = event.laneCodes.find((c) => c.value === picked.code)?.field ?? ''
  const datex = picked.summary ? { ...picked.summary, field } : undefined
  const interpreted = osm.interpretedForward + osm.interpretedBackward
  const osmTotal = osm.lanesTotal ?? (interpreted || undefined)

  if (!datex) ind.push({ id: 'no-datex-lanes', severity: 'info', message: 'The record has no lane status. Only the OSM layout can be shown.' })
  if (osm.lanesTotal === undefined)
    ind.push({
      id: 'osm-no-lanes',
      severity: 'info',
      message: osmTotal === undefined ? 'OSM has no lanes tag, so the usual lane count is unknown.' : `OSM has no lanes tag; ${osmTotal} lane(s) derived from other lane tags.`,
    })
  if (osm.aggregatedOnly)
    ind.push({ id: 'osm-aggregated', severity: 'info', message: 'OSM describes lane counts only, not individual lanes. Lanes cannot be compared one by one.' })

  let assessment = 'Not enough lane information to compare.'
  if (datex && datex.drivingLanes > 0 && osmTotal === undefined) assessment = 'OSM has no lane count to compare with'
  else if (datex && datex.drivingLanes > 0 && osmTotal !== undefined) {
    const bothSides = datex.oncomingLanes > 0 && datex.directionLanes > 0
    if (bothSides || osm.oneWay) {
      const ok = datex.drivingLanes === osmTotal
      ind.push({
        id: ok ? 'count-consistent' : 'count-differs',
        severity: ok ? 'info' : 'warning',
        message: ok
          ? `Lane count consistent: ${datex.drivingLanes} in DATEX II, ${osmTotal} in OSM.`
          : `Lane count differs: ${datex.drivingLanes} in DATEX II, ${osmTotal} in OSM. Temporary layouts can differ from the built road.`,
      })
      assessment = ok ? 'Lane count consistent' : 'Lane count differs'
    } else {
      const side = Math.max(datex.directionLanes, datex.oncomingLanes, datex.drivingLanes)
      const ok = side === osm.interpretedForward || side === osm.interpretedBackward
      ind.push({
        id: 'direction-uncertain',
        severity: 'info',
        message: `DATEX II describes one direction (${side} lane(s)). OSM has ${osm.interpretedForward} forward and ${osm.interpretedBackward} backward. Which OSM direction it is has not been verified.`,
      })
      assessment = ok ? 'Lane count consistent with one OSM direction (direction mapping not verified)' : 'Lane count matches neither OSM direction'
    }
    if (datex.closedLanes > 0) {
      ind.push({
        id: 'temporary-closure',
        severity: 'info',
        message: `${datex.closedLanes} lane(s) closed in DATEX II. This is temporary and is not expected in OSM.`,
      })
      assessment += `; temporary closure of ${datex.closedLanes} lane(s) only in DATEX II`
    }
    if (datex.noStoppingStrips > 0)
      ind.push({ id: 'no-stopping', severity: 'info', message: 'DATEX II marks no-stopping strips. These are not lane closures.' })
  }
  if (matchConfidence !== undefined && matchConfidence < 0.6)
    ind.push({
      id: 'weak-match',
      severity: 'warning',
      message: `The record matches this OSM way only weakly (score ${matchConfidence.toFixed(2)}). The comparison may concern a different road.`,
    })
  return { datex, osm, indicators: ind, assessment }
}

// RTTI 5-Star indicators for one DATEX II file, per use case and criterion of the TISA RTTI
// 5-Star Rating Specification v1.0 (https://tisa.org/rtti-5-star-rating-specification/).
//
// Every level computed here is a ceiling: the file shows the feed cannot score above it. A file
// cannot show update cycle, timeliness, ID stability, secure access or accuracy against the real
// road; those criteria are reported with what would be needed. This is not a TISA rating: the
// TISA Evaluation Methodology is not published yet.

import { oneSideFullyClosed, summariseLaneCode } from '../lanes/codes'
import { angleDiff, bearingDeg, distanceM, distanceToLineM } from '../location/geometry'
import { usableOpenlr } from '../location/openlr'
import { linesOf } from '../matching/score'
import { OPENLR_MAX_DNP_M } from '../validation/rules'
import type {
  AnalysisResult,
  Finding,
  OpenlrSummary,
  RoadEvent,
  RttiAssessment,
  RttiCriterionResult,
  RttiRecordNote,
  RttiUseCase,
  RttiUseCaseResult,
  Severity,
} from '../model'
import { classifySituations } from './classify'
import {
  COMPASS,
  COMPASS_TOLERANCE_DEG,
  CRITERION_NAME,
  LANE_MANAGEMENT_TYPES,
  M_PER_DEG,
  OPENLR_END_TOLERANCE_M,
  POINT_TO_LINE_WARN_M,
  RRP,
  RTTI_SPEC_URL,
  RTTI_SPEC_VERSION,
  USE_CASES,
  USE_CASE_ORDER,
  WEIGHTS,
  WORKS_RECORD_TYPES,
  levelAbove,
  levelBelow,
  levelTexts,
  looserThresholds,
  type CriterionId,
} from './spec'

const MAX_IDS = 200
const SPEC_REF = `TISA RTTI 5-Star Rating Specification: ${RTTI_SPEC_URL}`
const H = 3_600_000

export interface RttiOutput {
  assessment: RttiAssessment
  findings: Finding[]
}

type LonLat = [number, number]

type DirectionStatus = 'unambiguous' | 'ambiguous' | 'contradiction' | 'no-polyline' | 'not-checked'

interface Facts {
  e: RoadEvent
  line?: LonLat[]
  /** Where the polyline comes from: a gmlLineString, or the LRPs of a structured OpenLR line. */
  lineSource?: 'gml' | 'openlr'
  /** A gmlLineString whose positions all coincide (zero length): a point written as a line. */
  zeroLength?: LonLat
  /** Why the record has no polyline, when it has none. */
  lineNote?: string
  /** A gmlLineString exists but not in WGS 84 degrees (e.g. a projected CRS): a polyline the viewer cannot read. */
  projected: boolean
  locLevel: number
  locMethod: string
  dir: DirectionStatus
  dirHow: string
  resolutionM?: number
}

const ms = (s: string | undefined) => (s ? Date.parse(s) : NaN)

function star(level: number): string {
  return level === 0 ? 'below 1★' : `${level}★`
}

function capIds(ids: Iterable<string>): { recordIds: string[]; recordCount: number } {
  const all = [...new Set(ids)]
  return { recordIds: all.slice(0, MAX_IDS), recordCount: all.length }
}

/**
 * Longest line of the record with at least two distinct vertices (duplicates removed). A line
 * whose positions all coincide has no length and no direction and is returned as `zeroLength`.
 */
function polylineOf(e: RoadEvent): { line?: LonLat[]; defects: string[]; zeroLength?: LonLat } {
  const defects: string[] = []
  let best: LonLat[] | undefined
  let zeroLength: LonLat | undefined
  for (const raw of linesOf(e.geometry)) {
    const line: LonLat[] = []
    let dup = 0
    for (const p of raw as LonLat[]) {
      const last = line[line.length - 1]
      if (last && last[0] === p[0] && last[1] === p[1]) dup++
      else line.push(p)
    }
    if (dup) defects.push(`${dup} consecutive duplicate vertex${dup === 1 ? '' : 'es'}`)
    if (line.length < 2) {
      defects.push('fewer than two distinct vertices')
      zeroLength ??= line[0]
      continue
    }
    let spikes = 0
    for (let i = 1; i + 1 < line.length; i++) {
      const [ax, ay] = line[i - 1]!
      const [bx, by] = line[i]!
      const [cx, cy] = line[i + 1]!
      if (angleDiff(bearingDeg(ay, ax, by, bx), bearingDeg(by, bx, cy, cx)) > 170) spikes++
    }
    if (spikes) defects.push(`${spikes} turn-back spike${spikes === 1 ? '' : 's'} (>170°)`)
    if (!best || line.length > best.length) best = line
  }
  return { line: best, defects, zeroLength: best ? undefined : zeroLength }
}

/**
 * A structured OpenLR line counts as a polyline (its LRPs in order), provided every LRP is a valid
 * WGS 84 position and no two consecutive LRPs are farther apart than the OpenLR maximum (15 km).
 */
function openlrPolyline(e: RoadEvent, badOpenlr: boolean): { line?: LonLat[]; excluded?: string } {
  const refs = e.openlr.filter((r) => r.encoding === 'structured' && r.kind === 'line')
  if (!refs.length) return {}
  if (badOpenlr) return { excluded: 'its OpenLR coordinates are invalid or swapped' }
  const ordered = [...refs].sort((a, b) => Number(b.role === 'firstDirection') - Number(a.role === 'firstDirection'))
  let excluded: string | undefined
  for (const r of ordered) {
    if (r.lrps.length < 2 || !usableOpenlr(r)) {
      excluded ??= 'its OpenLR line has fewer than two valid WGS 84 points'
      continue
    }
    const far = r.lrps.find((p) => p.dnp !== undefined && p.dnp > OPENLR_MAX_DNP_M)
    if (far) {
      excluded ??= `its OpenLR line has points ${far.dnp} m apart, more than the OpenLR maximum of ${OPENLR_MAX_DNP_M} m`
      continue
    }
    return { line: r.lrps.map((p) => [p.lon!, p.lat!] as LonLat) }
  }
  return { excluded }
}

interface DirectionResult {
  status: DirectionStatus
  how: string
  disagree?: string
  contradiction?: string
}

/**
 * Is it unambiguous which way traffic runs along the polyline? See the plan / README: both
 * directions, OpenLR offset consistency, a linear element defined by coordinates, or a compass
 * direction matching the polyline bearing.
 */
function directionOf(e: RoadEvent, line: LonLat[] | undefined, badOpenlr: boolean): DirectionResult {
  if (!line) return { status: 'no-polyline', how: 'no polyline, so a direction cannot be tied to the geometry' }
  const [slon, slat] = line[0]!
  const [tlon, tlat] = line[line.length - 1]!
  const says: Array<{ value: 'both' | 'forward' | 'backward'; source: string }> = []
  const ambiguous: string[] = []
  let contradiction: string | undefined

  // (a) both directions affected: the vertex order does not matter.
  if (e.directionRelative === 'both') says.push({ value: 'both', source: 'directionRelativeOnLinearSection = both' })
  if (e.alertCAffectedDirection === 'both') says.push({ value: 'both', source: 'alertCAffectedDirection = both' })

  // (b) OpenLR: the polyline ends must lie within the offsets of the first / last LRP.
  const lineRefs = badOpenlr ? [] : e.openlr.filter((r) => r.kind === 'line' && usableOpenlr(r) && r.lrps.length >= 2)
  const oriented: Array<{ role: string; value: 'forward' | 'backward' }> = []
  for (const r of lineRefs) {
    const f0 = r.lrps[0] as { lat: number; lon: number }
    const fl = r.lrps[r.lrps.length - 1] as { lat: number; lon: number }
    const po = r.positiveOffset ?? 0
    const no = r.negativeOffset ?? 0
    const tol = OPENLR_END_TOLERANCE_M
    const dsf = distanceM(slat, slon, f0.lat, f0.lon)
    const dtl = distanceM(tlat, tlon, fl.lat, fl.lon)
    const dsl = distanceM(slat, slon, fl.lat, fl.lon)
    const dtf = distanceM(tlat, tlon, f0.lat, f0.lon)
    let fwd = dsf <= po + tol && dtl <= no + tol
    let bwd = dsl <= no + tol && dtf <= po + tol
    if (fwd && bwd) {
      const d = angleDiff(bearingDeg(slat, slon, tlat, tlon), bearingDeg(f0.lat, f0.lon, fl.lat, fl.lon))
      fwd = d <= 90
      bwd = !fwd
    }
    if (fwd || bwd) oriented.push({ role: r.role ?? 'firstDirection', value: fwd ? 'forward' : 'backward' })
    else
      contradiction = `OpenLR ${r.role ?? 'line'}: polyline start is ${Math.round(Math.min(dsf, dsl))} m and end ${Math.round(Math.min(dtl, dtf))} m from the nearest end LRP, more than the offsets (${po} m / ${no} m) + ${tol} m allow`
  }
  const first = oriented.find((o) => o.role === 'firstDirection')
  const opposite = oriented.find((o) => o.role === 'oppositeDirection')
  if (first && opposite && first.value !== opposite.value)
    // Both direction sections, running opposite ways along the polyline: both directions affected.
    says.push({ value: 'both', source: 'OpenLR firstDirection and oppositeDirection' })
  else
    for (const o of oriented) says.push({ value: o.value, source: `OpenLR ${o.role} (polyline ${o.value === 'forward' ? 'in' : 'against'} LRP order)` })

  // (c) aligned / opposite only count when the linear element is the same geometry.
  if (e.directionRelative === 'aligned' || e.directionRelative === 'opposite') {
    if (/ByLineString|ByPoints/i.test(e.linearElementKind ?? ''))
      says.push({ value: e.directionRelative === 'aligned' ? 'forward' : 'backward', source: `directionRelativeOnLinearSection = ${e.directionRelative} on ${e.linearElementKind}` })
    else ambiguous.push(`directionRelativeOnLinearSection = ${e.directionRelative} refers to ${e.linearElementKind ?? 'a linear element'}, not to the polyline`)
  }

  // (d) compass direction vs. polyline bearing.
  if (e.directionBound) {
    const c = COMPASS[e.directionBound]
    if (c !== undefined) {
      const b = bearingDeg(slat, slon, tlat, tlon)
      if (angleDiff(b, c) <= COMPASS_TOLERANCE_DEG) says.push({ value: 'forward', source: `directionBoundOnLinearSection = ${e.directionBound}` })
      else if (angleDiff((b + 180) % 360, c) <= COMPASS_TOLERANCE_DEG) says.push({ value: 'backward', source: `directionBoundOnLinearSection = ${e.directionBound}` })
      else ambiguous.push(`${e.directionBound} does not match the polyline bearing (${Math.round(b)}°)`)
    } else ambiguous.push(`directionBoundOnLinearSection = ${e.directionBound} is not a compass direction`)
  }

  if (contradiction) return { status: 'contradiction', how: contradiction, contradiction }
  const values = new Set(says.map((s) => s.value))
  if (values.size > 1) {
    const disagree = says.map((s) => `${s.source} → ${s.value === 'both' ? 'both directions' : 'one direction'}`).join('; ')
    return { status: 'ambiguous', how: `location references disagree: ${disagree}`, disagree }
  }
  if (values.size === 1) return { status: 'unambiguous', how: [...new Set(says.map((s) => s.source))].join('; ') }

  if (e.locationMethods.some((m) => m.startsWith('alertC'))) ambiguous.push('ALERT-C direction is relative to the location table, not to the polyline')
  if (e.directionRelative === 'unknown' || e.alertCAffectedDirection === 'unknown') ambiguous.push('direction given as unknown')
  if (!ambiguous.length) ambiguous.push('only the vertex order of the polyline')
  return { status: 'ambiguous', how: ambiguous.join('; ') }
}

/** Level of location referencing for one record (OpenLR 5, TMC 4, coordinates 3 or 2, none 0). */
function locationLevel(e: RoadEvent, uc: RttiUseCase, badOpenlr: boolean): { level: number; method: string } {
  if (!badOpenlr && e.openlr.some(usableOpenlr)) return { level: 5, method: 'OpenLR (structured)' }
  if (e.openlr.some((r) => r.encoding === 'binary')) return { level: 5, method: 'OpenLR (binary, not verified)' }
  if (e.locationMethods.some((m) => m.startsWith('alertC'))) return { level: 4, method: 'ALERT-C (TMC)' }
  if (e.locationMethods.includes('gmlLineString') || e.locationMethods.includes('pointCoordinates'))
    return { level: uc === 'unplannedClosure' ? 2 : 3, method: 'coordinates only' }
  return { level: 0, method: 'no usable location reference' }
}

function distribution(values: Iterable<string>): Array<{ label: string; count: number }> {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

function starDistribution(levels: number[]): Array<{ label: string; count: number }> {
  return distribution(levels.map(star)).sort((a, b) => b.label.localeCompare(a.label))
}

function summariseOpenlr(events: RoadEvent[]): OpenlrSummary {
  const s: OpenlrSummary = { records: events.length, recordsWithOpenlr: 0, structured: 0, binary: 0, lines: 0, points: 0, areas: 0, lrps: 0, validLrps: 0 }
  for (const e of events) {
    if (!e.openlr.length) continue
    s.recordsWithOpenlr++
    if (e.openlr.some((r) => r.encoding === 'structured')) s.structured++
    if (e.openlr.some((r) => r.encoding === 'binary')) s.binary++
    if (e.openlr.some((r) => r.kind === 'line')) s.lines++
    if (e.openlr.some((r) => r.kind === 'point')) s.points++
    if (e.openlr.some((r) => r.kind === 'area')) s.areas++
    for (const r of e.openlr)
      for (const p of r.lrps) {
        s.lrps++
        if (p.lat !== undefined && p.lon !== undefined && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0)) s.validLrps++
      }
  }
  return s
}

export { summariseOpenlr }

export function assessRtti(result: Pick<AnalysisResult, 'meta' | 'situations' | 'events'>, baseFindings: Finding[]): RttiOutput {
  const { meta, situations, events } = result
  const findings: Finding[] = []
  const add = (ruleId: string, severity: Severity, message: string, e?: RoadEvent, extra: Partial<Finding> = {}) =>
    findings.push({
      ruleId,
      severity,
      layer: 'rtti',
      message,
      explanation: extra.explanation ? `${extra.explanation} (${SPEC_REF})` : `See the ${SPEC_REF}`,
      ...(e ? { situationId: e.situationId, recordIds: [e.id], xmlPath: e.xmlPath } : {}),
      ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'explanation')),
    })

  const byRule = new Map<string, Set<string>>()
  for (const f of baseFindings) {
    let set = byRule.get(f.ruleId)
    if (!set) byRule.set(f.ruleId, (set = new Set()))
    for (const id of f.recordIds ?? []) set.add(id)
  }
  const flagged = (...rules: string[]) => {
    const out = new Set<string>()
    for (const r of rules) for (const id of byRule.get(r) ?? []) out.add(id)
    return out
  }
  const badOpenlr = flagged('OLR-001', 'OLR-002', 'OLR-003')
  const pubTime = ms(meta.publicationTime)

  // Classification
  const classes = classifySituations(situations, events)
  const eventsBySituation = new Map<string, RoadEvent[]>()
  for (const e of events) {
    let list = eventsBySituation.get(e.situationId)
    if (!list) eventsBySituation.set(e.situationId, (list = []))
    list.push(e)
  }

  // Probable duplicates under different ids (RTTI-ID-02), feed-wide.
  const dupKey = new Map<string, RoadEvent[]>()
  for (const e of events) {
    const line = linesOf(e.geometry)[0]
    if (!line || !e.validFrom) continue
    const r = (p: number[]) => `${p[0]!.toFixed(4)},${p[1]!.toFixed(4)}`
    const key = [e.recordType, e.managementTypes.join('+'), r(line[0]!), r(line[line.length - 1]!), e.validFrom, e.validTo].join('|')
    let list = dupKey.get(key)
    if (!list) dupKey.set(key, (list = []))
    list.push(e)
  }
  const duplicateOf = new Map<string, string>()
  for (const list of dupKey.values()) {
    if (new Set(list.map((e) => e.situationId)).size < 2) continue
    for (const e of list.slice(1)) duplicateOf.set(e.id, list[0]!.id)
  }

  const useCases: RttiUseCaseResult[] = []
  const recordNotes: Record<string, RttiRecordNote[]> = {}
  const recordUseCase: Record<string, RttiUseCase> = {}
  const label0: Record<DirectionStatus, string> = {
    unambiguous: 'Unambiguous',
    ambiguous: 'Ambiguous',
    contradiction: 'Contradiction',
    'no-polyline': 'No polyline',
    'not-checked': 'Not checked',
  }
  for (const uc of USE_CASE_ORDER) {
    const sits = classes.filter((c) => c.useCase === uc)
    if (!sits.length) continue
    const recs = sits.flatMap((c) => eventsBySituation.get(c.situationId) ?? [])
    const basis: Record<string, number> = {}
    for (const c of sits) basis[c.basis!] = (basis[c.basis!] ?? 0) + 1
    const isClosure = uc === 'plannedClosure' || uc === 'unplannedClosure'
    const unplanned = uc === 'unplannedRoadworks' || uc === 'unplannedClosure'
    const thresholds = looserThresholds(uc)

    // Per-record facts
    const facts: Facts[] = recs.map((e) => {
      const poly = polylineOf(e)
      const bad = badOpenlr.has(e.id)
      const olr = poly.line ? {} : openlrPolyline(e, bad)
      const line = poly.line ?? olr.line
      const lineSource = poly.line ? 'gml' : olr.line ? 'openlr' : undefined
      const projected = !line && e.locationMethods.includes('gmlLineString') && e.warnings.some((w) => w.includes('outside the WGS 84 range'))
      const loc = locationLevel(e, uc, bad)
      const dir: DirectionResult = projected
        ? { status: 'not-checked', how: 'the polyline is not in WGS 84 degrees, so its direction cannot be checked here' }
        : directionOf(e, line, bad)
      if (projected)
        add('RTTI-LIN-03', 'info', 'The polyline is not in WGS 84 degrees; direction and accuracy are not checked.', e, {
          explanation:
            'The gmlLineString uses another coordinate reference system (srsName), e.g. projected metres. It counts as a polyline, but this viewer does not reproject it, so it is not drawn and the direction and accuracy indicators skip it.',
        })
      if (poly.line && poly.defects.length)
        add('RTTI-LIN-02', 'warning', `Polyline defects: ${poly.defects.join(', ')}.`, e)
      // Zero-length lines are drawn as points (applyGeometry); the record keeps the position.
      const zero = !line && !projected ? (poly.zeroLength ?? (e.zeroLengthLine ? ([e.zeroLengthLine[1], e.zeroLengthLine[0]] as LonLat) : undefined)) : undefined
      if (zero)
        add('RTTI-LIN-01', 'warning', 'The gmlLineString has zero length: all its positions are the same point.', e, {
          explanation: `Every position in the posList is ${zero[1]} ${zero[0]} (lat lon), so the line has no length and no direction: it is a point written as a line. Linear referencing needs at least two distinct positions along the affected section.${
            olr.excluded ? ` The OpenLR line does not count either, because ${olr.excluded}.` : ''
          }`,
          rawValue: `${zero[1]} ${zero[0]}`,
        })
      else if (!line && !projected)
        add('RTTI-LIN-01', 'warning', 'No polyline: linear referencing (polylines) is required at every star level.', e, {
          explanation: `Location methods: ${e.locationMethods.join(', ') || 'none'}. ${
            olr.excluded ? `The OpenLR line does not count because ${olr.excluded}.` : 'A gmlLineString or a structured OpenLR line counts; ALERT-C, points and binary OpenLR do not.'
          }`,
        })
      if (loc.level === 0)
        add('RTTI-LOC-01', 'warning', 'No location reference that counts for the rating (OpenLR, ALERT-C or coordinates).', e, {
          explanation: `Location methods: ${e.locationMethods.join(', ') || 'none'}. Display points, road names and coded linear elements without coordinates do not count.`,
        })
      if (dir.status === 'ambiguous') {
        if (dir.disagree) add('RTTI-DIR-03', 'warning', 'Location references disagree on the affected direction.', e, { explanation: dir.disagree })
        else add('RTTI-DIR-01', 'info', 'The direction of traffic along the polyline is ambiguous.', e, { explanation: dir.how })
      }
      if (dir.status === 'contradiction') add('RTTI-DIR-02', 'warning', 'OpenLR and the polyline contradict each other.', e, { explanation: dir.contradiction })
      // Only against a real polyline: straight lines between OpenLR points cut corners.
      if (poly.line)
        for (const [plat, plon] of e.referencePoints) {
          const d = distanceToLineM(plat, plon, poly.line)
          if (d > POINT_TO_LINE_WARN_M) {
            add('RTTI-ACC-02', 'warning', `A point of the record lies ${Math.round(d)} m from its own polyline.`, e, {
              explanation: 'The record contains a point (pointCoordinates or display point) that does not lie on its polyline, so at least one of them is inaccurate.',
            })
            break
          }
        }
      const resolutionM = e.coordinateDecimals !== undefined ? 0.5 * 10 ** -e.coordinateDecimals * M_PER_DEG : undefined
      const lineNote = line || projected
        ? undefined
        : zero
          ? `The gmlLineString has zero length (all positions are ${zero[1]} ${zero[0]}).`
          : olr.excluded
            ? `No gmlLineString, and the OpenLR line does not count because ${olr.excluded}.`
            : `No gmlLineString or OpenLR line (location methods: ${e.locationMethods.join(', ') || 'none'}).`
      return { e, line, lineSource, zeroLength: zero, lineNote, projected, locLevel: loc.level, locMethod: loc.method, dir: dir.status, dirHow: dir.how, resolutionM }
    })

    const criteria: RttiCriterionResult[] = []
    const weights = WEIGHTS[uc]
    const crit = (id: CriterionId, r: Omit<RttiCriterionResult, 'id' | 'name' | 'weight' | 'levels'>) => {
      if (!weights[id]) return
      criteria.push({ id, name: CRITERION_NAME[id], weight: weights[id]!, levels: levelTexts(uc, id), ...r })
    }
    /** Records why `recordId` holds down criterion `id` (only for criteria of this use case). */
    const note = (recordId: string, id: CriterionId, level: number | undefined, text: string, ruleIds?: string[]) => {
      if (!weights[id]) return
      let list = recordNotes[recordId]
      if (!list) recordNotes[recordId] = list = []
      list.push({ criterion: id, name: CRITERION_NAME[id], weight: weights[id], level, text, ruleIds })
    }
    for (const e of recs) recordUseCase[e.id] = uc

    // Terminology & definition
    {
      const conflicts = new Set<string>(flagged('DQ-RW-001', 'DQ-RW-002'))
      for (const id of [...conflicts]) if (!recs.some((e) => e.id === id)) conflicts.delete(id)
      if (!isClosure)
        for (const e of recs) {
          const li = e.laneImpact
          const allLanes =
            (li.numberOfLanesRestricted !== undefined && li.originalNumberOfLanes !== undefined && li.originalNumberOfLanes > 0 && li.numberOfLanesRestricted >= li.originalNumberOfLanes) ||
            li.numberOfOperationalLanes === 0 ||
            e.laneCodes.some((c) => oneSideFullyClosed(summariseLaneCode(c.value)))
          if (allLanes) {
            conflicts.add(e.id)
            note(e.id, 'terminology', 2, 'Every lane in a direction is restricted, but the situation is not published as a road closure.', ['RTTI-TERM-01'])
            add('RTTI-TERM-01', 'warning', 'Every lane in a direction is restricted, but the situation is not published as a road closure.', e, {
              explanation:
                'Under the TISA definitions (§3.5, §3.6) roadworks keep at least one lane open in the driving direction; once all lanes in a direction are blocked the event is a road closure with the roadworks as cause.',
            })
          }
        }
      for (const f of baseFindings)
        if ((f.ruleId === 'DQ-RW-001' || f.ruleId === 'DQ-RW-002') && f.recordIds)
          for (const id of f.recordIds) if (conflicts.has(id)) note(id, 'terminology', 2, `${f.ruleId}: ${f.message}`, [f.ruleId])
      crit('terminology', {
        kind: 'ceiling',
        ceiling: conflicts.size ? 2 : 5,
        evidence: conflicts.size
          ? `${conflicts.size} record(s) conflict with the TISA definitions of roadworks and road closures.`
          : 'No record conflicts with the TISA definitions of roadworks and road closures.',
        ...capIds(conflicts),
        ruleIds: ['RTTI-TERM-01', 'DQ-RW-001', 'DQ-RW-002'],
      })
    }

    // Use of specification (heuristic RRP-RTTI conformance)
    const specIssues = new Set<string>()
    {
      for (const e of recs) {
        const issues: string[] = []
        if (e.recordType && WORKS_RECORD_TYPES.has(e.recordType) && !RRP.worksRecordTypes.has(e.recordType))
          issues.push(`record type ${e.recordType} is not MaintenanceWorks or ConstructionWorks`)
        for (const w of e.workTypes) if (!RRP.workTypes.has(w)) issues.push(`work type "${w}" is not in the RRP-RTTI list`)
        for (const m of e.managementTypes) if (!RRP.managementTypes.has(m)) issues.push(`management type "${m}" is not in the RRP-RTTI list`)
        const situationHasClosureType = (eventsBySituation.get(e.situationId) ?? []).some((x) => x.type === 'fullClosure' && x.typeBasis === 'managementType')
        if (e.type === 'fullClosure' && e.typeBasis === 'laneStatus' && !situationHasClosureType)
          issues.push('the closure is only implied by lane status; RRP-RTTI uses RoadOrCarriagewayOrLaneManagement with roadClosed / carriagewayClosures')
        if (e.laneDetail.laneUsageWithoutNumber) issues.push('laneUsage without laneNumber (RRP-RTTI: use them jointly)')
        if (issues.length) {
          specIssues.add(e.id)
          note(e.id, 'useOfSpecification', 2, `Deviates from the DATEX II RTTI reference profile: ${issues.join('; ')}.`, ['RTTI-SPEC-01'])
          add('RTTI-SPEC-01', 'info', `Deviates from the DATEX II RTTI reference profile: ${issues[0]}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}.`, e, {
            explanation: `${issues.join('; ')}. Reference profile: https://docs.datex2.eu/recommended-profiles/rrp/rtti/`,
          })
        }
      }
      // Per situation: a closure published with a closure management type, or only through lane status.
      const closureSits = sits.map((c) => (eventsBySituation.get(c.situationId) ?? []).filter((e) => e.type === 'fullClosure')).filter((l) => l.length)
      const viaType = closureSits.filter((l) => l.some((e) => e.typeBasis === 'managementType')).length
      const viaLanes = closureSits.length - viaType
      let inconsistent = false
      if (viaType && viaLanes) {
        inconsistent = true
        add('RTTI-SPEC-02', 'info', `Closures are encoded in two ways: ${viaType} with a closure management type, ${viaLanes} only through lane status.`, undefined, {
          explanation: 'Consistent use of the specification means one encoding per data category.',
        })
      }
      crit('useOfSpecification', {
        kind: 'ceiling',
        ceiling: specIssues.size || inconsistent ? 2 : 5,
        evidence:
          specIssues.size || inconsistent
            ? `${specIssues.size} record(s) deviate from the DATEX II RTTI reference profile${inconsistent ? '; closures are encoded inconsistently' : ''}.`
            : 'No deviation from the DATEX II RTTI reference profile found (heuristic check of record types and value lists).',
        ...capIds(specIssues),
        ruleIds: ['RTTI-SPEC-01', 'RTTI-SPEC-02'],
        notes: ['Heuristic: checks record types, enumeration values and encodings, not every element. Run XSD validation to confirm schema validity.'],
      })
    }

    // Data format used
    {
      const v = meta.datexVersion
      const ceiling = v === '3' ? (specIssues.size ? 4 : 5) : v === '2' ? 3 : 1
      crit('dataFormat', {
        kind: 'ceiling',
        ceiling,
        evidence: v === 'unknown' ? 'Not DATEX II.' : `DATEX II v${v}${meta.modelBaseVersion ? ` (modelBaseVersion ${meta.modelBaseVersion})` : ''}.`,
        notes: [
          v === '3'
            ? '5★ requires compliance with the related DATEX II reference profile: checked heuristically under "Use of specification". Confirm with XSD validation.'
            : 'DATEX II v3 is required for 4★ and above.',
          ...(uc === 'plannedRoadworks' ? ['Table 15 merges the v2/v3 cells; the levels follow Tables 16–18 (v2 up to 3★, v3 4★).'] : []),
        ],
      })
    }

    // Location referencing
    {
      const levels = facts.map((f) => f.locLevel)
      const min = Math.min(...levels)
      for (const f of facts) if (f.locLevel < 5) note(f.e.id, 'locationReferencing', f.locLevel, `Best location reference: ${f.locMethod}.`, ['RTTI-LOC-01'])
      crit('locationReferencing', {
        kind: 'ceiling',
        ceiling: min,
        evidence: `Best method per record: ${distribution(facts.map((f) => f.locMethod))
          .map((d) => `${d.label} ${d.count}`)
          .join(' · ')}.`,
        distribution: starDistribution(levels),
        ...capIds(facts.filter((f) => f.locLevel === min && min < 5).map((f) => f.e.id)),
        ruleIds: ['RTTI-LOC-01', 'OLR-001', 'OLR-002', 'OLR-003'],
        notes: ['Structured OpenLR counts only when every LRP is a valid WGS 84 position. Binary OpenLR is not decoded and counts unverified.'],
      })
    }

    // Linear referencing and its sub-criterion, direction
    {
      const missing = facts.filter((f) => !f.line && !f.projected)
      for (const f of missing) note(f.e.id, 'linearReferencing', 0, f.lineNote ?? 'No polyline.', ['RTTI-LIN-01'])
      for (const f of facts)
        if (f.dir !== 'unambiguous')
          note(
            f.e.id,
            'direction',
            f.dir === 'not-checked' ? undefined : 2,
            f.dir === 'no-polyline' ? 'Not referenced: without a polyline the direction cannot be tied to the geometry.' : `${label0[f.dir]}: ${f.dirHow}.`,
            f.dir === 'contradiction' ? ['RTTI-DIR-02'] : f.dir === 'ambiguous' ? ['RTTI-DIR-01', 'RTTI-DIR-03'] : undefined,
          )
      const projected = facts.filter((f) => f.projected).length
      const fromOpenlr = facts.filter((f) => f.lineSource === 'openlr').length
      crit('linearReferencing', {
        kind: 'ceiling',
        ceiling: missing.length ? 0 : 5,
        evidence: `${facts.length - missing.length} of ${facts.length} records have a polyline${fromOpenlr ? ` (${fromOpenlr} from an OpenLR line)` : ''}${projected ? `, ${projected} not in WGS 84 degrees` : ''}.`,
        distribution: [
          { label: 'gmlLineString', count: facts.filter((f) => f.lineSource === 'gml').length },
          { label: 'OpenLR line', count: fromOpenlr },
          { label: 'gmlLineString, not WGS 84', count: projected },
          { label: 'gmlLineString of zero length', count: missing.filter((f) => f.zeroLength).length },
          { label: 'no polyline', count: missing.filter((f) => !f.zeroLength).length },
        ].filter((d) => d.count),
        notes: [
          'A gmlLineString needs at least two distinct positions; one whose positions all coincide has zero length and counts as no polyline.',
          'A structured OpenLR line counts as a polyline when its points are valid WGS 84 positions at most 15 km apart (the OpenLR maximum).',
        ],
        ...capIds(missing.map((f) => f.e.id)),
        ruleIds: ['RTTI-LIN-01', 'RTTI-LIN-02', 'RTTI-LIN-03'],
      })
      const label: Record<DirectionStatus, string> = {
        unambiguous: 'unambiguous',
        ambiguous: 'ambiguous',
        contradiction: 'contradiction',
        'no-polyline': 'no polyline',
        'not-checked': 'not checked (not WGS 84)',
      }
      const order: Record<DirectionStatus, number> = { contradiction: 0, ambiguous: 1, 'no-polyline': 2, 'not-checked': 3, unambiguous: 4 }
      // Records whose polyline cannot be read are not checked and do not lower the ceiling.
      const limiting = facts.filter((f) => f.dir !== 'unambiguous' && f.dir !== 'not-checked').sort((x, y) => order[x.dir] - order[y.dir])
      crit('direction', {
        kind: 'ceiling',
        parent: 'linearReferencing',
        ceiling: limiting.length ? 2 : 5,
        evidence: `Traffic direction along the polyline: ${distribution(facts.map((f) => label[f.dir]))
          .map((d) => `${d.label} ${d.count}`)
          .join(' · ')}.`,
        distribution: distribution(facts.map((f) => label[f.dir])),
        ...capIds(limiting.map((f) => f.e.id)),
        ruleIds: ['RTTI-DIR-01', 'RTTI-DIR-02', 'RTTI-DIR-03', 'RTTI-LIN-01'],
        notes: [
          'Evaluated only on records with a polyline (gmlLineString or OpenLR line): a direction without a polyline cannot be tied to the geometry. For an OpenLR line, its direction section gives the direction.',
          'Counts: both directions affected; OpenLR whose end LRPs match the polyline ends within the offsets; aligned/opposite on a linear element given by coordinates; a compass direction matching the polyline bearing.',
          'FRC is unknown, so direction is required for every record (the spec requires it for FRC3–6).',
        ],
      })
    }

    // Not judged from one file
    {
      const noTimes = recs.filter((e) => !e.createdAt || !e.versionTime)
      for (const e of noTimes)
        add('RTTI-TIME-01', 'info', `Missing ${[!e.createdAt && 'situationRecordCreationTime', !e.versionTime && 'situationRecordVersionTime'].filter(Boolean).join(' and ')}.`, e, {
          explanation: 'Without creation and version times, a data user cannot measure timeliness or update cycle.',
        })
      crit('updateCycle', {
        kind: 'not-from-file',
        evidence: 'Not measurable from one file.',
        needs: 'Repeated downloads of the feed over time, comparing record versions and version times.',
      })
      crit('timeliness', {
        kind: 'not-from-file',
        evidence: `Prerequisites: publicationTime ${meta.publicationTime ? 'present' : 'missing'}; ${recs.length - noTimes.length} of ${recs.length} records have creation and version times.`,
        needs: 'Repeated downloads, compared with when events were recorded at the source.',
        ...capIds(noTimes.map((e) => e.id)),
        ruleIds: ['RTTI-TIME-01'],
      })
      crit('secureApi', {
        kind: 'not-from-file',
        evidence: 'Not visible in a file.',
        needs: 'The access URL and its authentication: https counts from 3★.',
      })
    }

    // Accuracy (upper bound from coordinate resolution)
    {
      const withRes = facts.filter((f) => f.resolutionM !== undefined)
      const levels = withRes.map((f) => levelBelow(f.resolutionM!, thresholds.accuracyM))
      const min = levels.length ? Math.min(...levels) : 5
      withRes.forEach((f, i) => {
        if (levels[i]! < 5)
          note(f.e.id, 'accuracy', levels[i], `Coordinates have ${f.e.coordinateDecimals} significant decimal(s): resolution ≈ ${f.resolutionM! < 1 ? f.resolutionM!.toFixed(2) : Math.round(f.resolutionM!)} m.`, ['RTTI-ACC-01'])
        if (levels[i]! < 5)
          add('RTTI-ACC-01', 'info', `Coordinates have ${f.e.coordinateDecimals} decimal(s): resolution ≈ ${f.resolutionM! < 1 ? f.resolutionM!.toFixed(2) : Math.round(f.resolutionM!)} m.`, f.e, {
            explanation: `Coordinate resolution alone limits this record's accuracy to ${star(levels[i]!)} for ${USE_CASES[uc].label.toLowerCase()}.`,
          })
      })
      const decimals = distribution(withRes.map((f) => `${f.e.coordinateDecimals} decimals`))
      crit('accuracy', {
        kind: 'ceiling',
        ceiling: min,
        evidence: withRes.length
          ? `Upper bound from coordinate resolution: ${decimals.map((d) => `${d.label} ${d.count}`).join(' · ')}.`
          : 'No coordinates to bound accuracy.',
        distribution: starDistribution(levels),
        ...capIds(withRes.filter((_, i) => levels[i] === min && min < 5).map((f) => f.e.id)),
        ruleIds: ['RTTI-ACC-01', 'RTTI-ACC-02'],
        notes: ['Accuracy against the real road needs ground truth. FRC is unknown, so the looser FRC1–4 distances are used.'],
      })
    }

    // Correctness (upper bound: share of records without internal contradictions)
    {
      const recIds = new Set(recs.map((e) => e.id))
      const bad = new Set<string>()
      for (const id of flagged('SEM-002', 'LANE-003', 'DQ-RW-001', 'DQ-RW-002')) if (recIds.has(id)) bad.add(id)
      for (const f of findings) if ((f.ruleId === 'RTTI-TERM-01' || f.ruleId === 'RTTI-DIR-02') && f.recordIds?.[0] && recIds.has(f.recordIds[0])) bad.add(f.recordIds[0])
      const contradictionRules = new Set(['SEM-002', 'LANE-003', 'DQ-RW-001', 'DQ-RW-002', 'RTTI-TERM-01', 'RTTI-DIR-02'])
      for (const f of [...baseFindings, ...findings])
        if (contradictionRules.has(f.ruleId))
          for (const id of f.recordIds ?? []) if (bad.has(id)) note(id, 'correctness', undefined, `Internal contradiction (${f.ruleId}): ${f.message}`, [f.ruleId])
      const pct = recs.length ? (100 * (recs.length - bad.size)) / recs.length : 100
      crit('correctness', {
        kind: 'ceiling',
        ceiling: levelAbove(pct, thresholds.correctnessPct),
        evidence: `${recs.length - bad.size} of ${recs.length} records (${pct.toFixed(1)} %) are free of internal contradictions.`,
        ...capIds(bad),
        ruleIds: ['SEM-002', 'LANE-003', 'DQ-RW-001', 'DQ-RW-002', 'RTTI-TERM-01', 'RTTI-DIR-02'],
        notes: ['Upper bound only: correctness against reality needs ground truth. FRC is unknown, so the looser percentages are used.'],
      })
    }

    // Completeness (attribute presence, spec §2.1 note)
    {
      const missingCount = new Map<string, number>()
      const incomplete: string[] = []
      let sum = 0
      for (const f of facts) {
        const e = f.e
        const siblings = eventsBySituation.get(e.situationId) ?? []
        const attrs: Array<[string, boolean]> = [
          ['start time', !!e.validFrom],
          ['end time', !!e.validTo],
          ['polyline', !!f.line || f.projected],
          // Not checked counts as present: an upper bound must not assume the worst.
          ['direction', f.dir === 'unambiguous' || f.dir === 'not-checked'],
        ]
        const isWorksRecord = (x: RoadEvent) => x.recordType !== undefined && WORKS_RECORD_TYPES.has(x.recordType)
        if (isClosure)
          // A works record is itself the cause of the closure in its situation.
          attrs.push(['cause', isWorksRecord(e) || !!e.causeType || e.causeRecordIds.length > 0 || siblings.some((s) => s !== e && isWorksRecord(s))])
        else
          attrs.push([
            'effect',
            e.laneCodes.length > 0 ||
              Object.values(e.laneImpact).some((v) => v !== undefined) ||
              e.managementTypes.length > 0 ||
              e.laneDetail.laneNumbers.length > 0 ||
              e.laneDetail.residualRoadWidth !== undefined,
          ])
        const present = attrs.filter(([, ok]) => ok).length
        sum += present / attrs.length
        if (present < attrs.length) {
          incomplete.push(e.id)
          note(e.id, 'completeness', undefined, `${Math.round((100 * present) / attrs.length)} % of the attributes present; missing: ${attrs.filter(([, ok]) => !ok).map(([n]) => n).join(', ')}.`)
        }
        for (const [name, ok] of attrs) if (!ok) missingCount.set(`missing ${name}`, (missingCount.get(`missing ${name}`) ?? 0) + 1)
      }
      const pct = facts.length ? (100 * sum) / facts.length : 100
      crit('completeness', {
        kind: 'ceiling',
        ceiling: levelAbove(pct, thresholds.completenessPct),
        evidence: `Mean attribute completeness ${pct.toFixed(1)} % (${isClosure ? 'start, end, polyline, direction, cause' : 'start, end, polyline, direction, effect'}).`,
        distribution: [...missingCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
        ...capIds(incomplete),
        notes: ['Per the spec (§2.1), completeness of events is about attribute presence. Whether every real event is published needs ground truth.'],
      })
    }

    // RTTI event message ID
    {
      const problems = new Set<string>()
      for (const e of recs) {
        const missing = [e.id.startsWith('(') && 'id', !e.version && 'version', !e.versionTime && 'situationRecordVersionTime'].filter(Boolean)
        if (missing.length) {
          problems.add(e.id)
          note(e.id, 'eventId', 2, `Record without ${missing.join(', ')}.`, ['RTTI-ID-01'])
          add('RTTI-ID-01', 'warning', `Record without ${missing.join(', ')}.`, e, {
            explanation: 'Stable event message IDs need an id, a version and a version time on every record so that updates can be tracked.',
          })
        }
        const dup = duplicateOf.get(e.id)
        if (dup) {
          problems.add(e.id)
          note(e.id, 'eventId', 2, `Probably the same event as record ${dup}, published under a different id.`, ['RTTI-ID-02'])
          add('RTTI-ID-02', 'warning', `Probably the same event as record ${dup}, published under a different id.`, e, {
            explanation: 'Same record type, polyline ends and validity in another situation.',
          })
        }
      }
      const recIds = new Set(recs.map((e) => e.id))
      for (const id of flagged('SEM-001', 'SEM-005'))
        if (recIds.has(id)) {
          problems.add(id)
          note(id, 'eventId', 2, 'The record id is used more than once (SEM-001 / SEM-005).', ['SEM-001', 'SEM-005'])
        }
      crit('eventId', {
        kind: 'ceiling',
        ceiling: problems.size ? 2 : 5,
        evidence: problems.size
          ? `${problems.size} record(s) lack id, version or version time, reuse an id or duplicate another event.`
          : 'Every record has an id, a version and a version time; no id is reused.',
        ...capIds(problems),
        ruleIds: ['RTTI-ID-01', 'RTTI-ID-02', 'SEM-001', 'SEM-005'],
        notes: ['Whether ids stay the same for the same event across updates needs repeated downloads.'],
      })
    }

    // Outdated messages deleted from feed
    {
      if (Number.isNaN(pubTime))
        crit('outdated', { kind: 'info', evidence: 'No publicationTime, so the age of ended records cannot be measured.' })
      else {
        const ended = recs
          .map((e) => ({ e, ageH: (pubTime - ms(e.validTo)) / H }))
          .filter((x) => x.ageH > 0)
          .sort((a, b) => b.ageH - a.ageH)
        const terminated = recs.filter((e) => e.operatorActionStatus === 'terminated' || e.operatorActionStatus === 'rejected')
        const maxH = ended[0]?.ageH ?? 0
        const levelFor = (h: number) => (h <= 24 ? 5 : h <= 168 ? 4 : h <= 336 ? 3 : h <= 504 ? 2 : h <= 672 ? 1 : 0)
        const ceiling = levelFor(maxH)
        const fmt = (h: number) => (h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)
        for (const x of ended) if (levelFor(x.ageH) < 5) note(x.e.id, 'outdated', levelFor(x.ageH), `Ended ${fmt(x.ageH)} before publicationTime and still in the feed.`, ['SEM-003'])
        for (const e of terminated) note(e.id, 'outdated', undefined, `operatorActionStatus is ${e.operatorActionStatus} but the record is still in the feed.`)
        crit('outdated', {
          kind: 'ceiling',
          ceiling,
          evidence: ended.length
            ? `${ended.length} record(s) ended before publicationTime; the oldest ended ${fmt(maxH)} earlier.${terminated.length ? ` ${terminated.length} record(s) have operatorActionStatus terminated/rejected.` : ''}`
            : `No record ended before publicationTime.${terminated.length ? ` ${terminated.length} record(s) have operatorActionStatus terminated/rejected.` : ''}`,
          ...capIds([...ended.map((x) => x.e.id), ...terminated.map((e) => e.id)]),
          ruleIds: ['SEM-003'],
          notes: ['Measured against publicationTime, so archived files are judged as of their publication.'],
        })
      }
    }

    // Availability of short-term events
    if (uc === 'plannedRoadworks' || uc === 'unplannedRoadworks') {
      const n = classes.filter((c) => c.useCase === 'unplannedRoadworks').length
      crit('shortTermEvents', {
        kind: 'info',
        evidence: n ? `The file contains ${n} unplanned roadworks situation(s).` : 'The file contains no unplanned roadworks. A single download may legitimately have none.',
      })
    }

    // Road type and lane-level attribute, per situation
    {
      const laneLevelOf = (list: RoadEvent[]): number => {
        const l1 = list.some(
          (e) =>
            e.laneCodes.length > 0 ||
            Object.values(e.laneImpact).some((v) => v !== undefined) ||
            e.managementTypes.some((m) => LANE_MANAGEMENT_TYPES.has(m)),
        )
        const l2 = list.some((e) => e.laneDetail.laneNumbers.length > 0 || e.laneCodes.some((c) => summariseLaneCode(c.value).drivingLanes > 0))
        const width = list.some(
          (e) =>
            e.laneDetail.residualRoadWidth !== undefined ||
            e.managementTypes.includes('narrowLanes') ||
            e.laneCodes.some((c) => summariseLaneCode(c.value).restrictedLanes > 0),
        )
        const speed = list.some((e) => e.temporarySpeedLimit !== undefined || e.speedManagementTypes.includes('speedRestrictionInOperation'))
        if (l2 && width && speed) return 3
        if (l2) return 2
        if (l1) return 1
        return 0
      }
      const perSit = sits.map((c) => ({ c, level: laneLevelOf(eventsBySituation.get(c.situationId) ?? []) }))
      const name = ['generic', 'lane level', 'which lane', 'which lane + width + speed limit']
      const dist = distribution(perSit.map((x) => name[x.level]!))
      const roadTypeMap = unplanned ? [2, 3, 5, 5] : [2, 4, 4, 5]
      const llMapAll = [2, 2, 3, 5]
      const limitingIds = (lv: number, map: number[]) =>
        capIds(perSit.filter((x) => map[x.level] === lv && lv < 5).flatMap((x) => eventsBySituation.get(x.c.situationId)?.map((e) => e.id) ?? []))
      for (const x of perSit)
        for (const e of eventsBySituation.get(x.c.situationId) ?? []) {
          const text = `Lane detail of the situation: ${name[x.level]}.`
          if (roadTypeMap[x.level]! < 5) note(e.id, 'roadType', roadTypeMap[x.level], text)
          if (llMapAll[x.level]! < 5) note(e.id, 'laneLevel', llMapAll[x.level], text)
        }
      const rtMin = Math.min(...perSit.map((x) => roadTypeMap[x.level]!))
      crit('roadType', {
        kind: 'ceiling',
        ceiling: rtMin,
        evidence: `Lane detail per situation: ${dist.map((d) => `${d.label} ${d.count}`).join(' · ')}.`,
        distribution: dist,
        ...limitingIds(rtMin, roadTypeMap),
      })
      const llMap = llMapAll
      const llMin = Math.min(...perSit.map((x) => llMap[x.level]!))
      crit('laneLevel', {
        kind: 'ceiling',
        ceiling: llMin,
        evidence: `Lane detail per situation: ${dist.map((d) => `${d.label} ${d.count}`).join(' · ')}.`,
        distribution: dist,
        ...limitingIds(llMin, llMap),
        notes: ['4★ and 5★ need which lane is closed, the lane-width reduction and lane-level speed limit changes.'],
      })
    }

    // Validity
    {
      // Capability: does the feed use schedules anywhere?
      const usesSchedules = events.some((e) => e.hasPeriods)
      const missing: RoadEvent[] = []
      for (const e of recs) {
        const openEndOk = unplanned && !!e.validityStatus
        if (!e.validFrom || (!e.validTo && !openEndOk)) {
          missing.push(e)
          note(e.id, 'validity', 0, `Missing ${[!e.validFrom && 'overallStartTime', !e.validTo && 'overallEndTime'].filter(Boolean).join(' and ')}.`, ['RTTI-VAL-01'])
          add('RTTI-VAL-01', 'warning', `Missing ${[!e.validFrom && 'overallStartTime', !e.validTo && 'overallEndTime'].filter(Boolean).join(' and ')}.`, e, {
            explanation: 'Validity periods (start and end) are required for all roadworks and closures; unplanned events may use an open end.',
          })
        }
      }
      crit('validity', {
        kind: 'ceiling',
        ceiling: missing.length ? 0 : usesSchedules ? 5 : 2,
        evidence: `${recs.length - missing.length} of ${recs.length} records have start and end; ${recs.filter((e) => e.hasPeriods).length} here and ${events.filter((e) => e.hasPeriods).length} in the feed use schedules (validPeriod / recurring periods).`,
        ...capIds(missing.map((e) => e.id)),
        ruleIds: ['RTTI-VAL-01', 'SEM-002', 'SEM-004'],
        notes: usesSchedules ? undefined : ['The feed never uses schedules. Continuous works need none, so this is a capability check.'],
      })
    }

    // Vehicle classification
    {
      const n = recs.filter((e) => e.vehicleCharacteristics.length > 0).length
      const feedUses = events.some((e) => e.vehicleCharacteristics.length > 0)
      crit('vehicleClassification', {
        kind: 'ceiling',
        ceiling: feedUses ? 5 : 2,
        evidence: feedUses
          ? `${n} of ${recs.length} records here (and the feed elsewhere) are restricted to vehicle characteristics.`
          : 'No record in the feed uses vehicle characteristics.',
        notes: n ? undefined : ['Capability check: the feed never distinguishes vehicle types or classes.'],
      })
    }

    // Cause type
    {
      const missing: RoadEvent[] = []
      for (const c of sits) {
        const list = eventsBySituation.get(c.situationId) ?? []
        const hasWorks = list.some((e) => e.recordType !== undefined && WORKS_RECORD_TYPES.has(e.recordType))
        for (const e of list.filter((x) => x.type === 'fullClosure'))
          if (!e.causeType && !e.causeRecordIds.length && !hasWorks) {
            missing.push(e)
            note(e.id, 'causeType', 2, 'Closure without causeType, cause link or works record in its situation.', ['RTTI-CAUSE-01'])
            if (uc === 'unplannedClosure') add('RTTI-CAUSE-01', 'info', 'Closure without an explanation of its cause.', e)
          }
      }
      crit('causeType', {
        kind: 'ceiling',
        ceiling: missing.length ? 2 : 5,
        evidence: missing.length ? `${missing.length} closure record(s) give no cause.` : 'Every closure gives a cause (causeType, a cause link or a works record in the situation).',
        ...capIds(missing.map((e) => e.id)),
        ruleIds: ['RTTI-CAUSE-01'],
        notes: ['DATEX II RRP-RTTI deselects the record-level cause, so a works record in the same situation also counts.'],
      })
    }

    // Pre-announcement
    {
      const leads = recs.map((e) => (ms(e.validFrom) - ms(e.createdAt ?? e.firstSupplierVersionTime)) / H)
      const bucket = (h: number) => (Number.isNaN(h) ? 'unknown' : h >= 168 ? '≥ 1 week ahead' : h >= 24 ? '≥ 1 day ahead' : h >= 0 ? '< 1 day ahead' : 'created after start')
      crit('preAnnouncement', {
        kind: 'info',
        evidence: `Lead time from creation to start: ${distribution(leads.map(bucket))
          .map((d) => `${d.label} ${d.count}`)
          .join(' · ')}.`,
        distribution: distribution(leads.map(bucket)),
        notes: ['Tables 15 and 17 give no thresholds; the speed-limit table uses > 1 day (3★) and > 1 week (4★, 5★).'],
      })
    }

    useCases.push({
      useCase: uc,
      label: USE_CASES[uc].label,
      table: USE_CASES[uc].table,
      situationIds: sits.map((c) => c.situationId),
      recordIds: recs.map((e) => e.id),
      basis,
      criteria: orderCriteria(criteria),
    })
  }

  const outMap = new Map<string, string[]>()
  const notRated: Record<string, string> = {}
  for (const c of classes)
    if (c.outOfScope) {
      let list = outMap.get(c.outOfScope)
      if (!list) outMap.set(c.outOfScope, (list = []))
      for (const e of eventsBySituation.get(c.situationId) ?? []) {
        list.push(e.id)
        notRated[e.id] = c.outOfScope
      }
    }

  return {
    assessment: {
      specVersion: RTTI_SPEC_VERSION,
      specUrl: RTTI_SPEC_URL,
      useCases,
      recordUseCase,
      recordNotes,
      notRated,
      outOfScope: [...outMap.entries()].map(([reason, recordIds]) => ({ reason, recordIds: recordIds.slice(0, MAX_IDS) })),
      notes: [
        'Each level is a ceiling derived from this file: the feed cannot score higher on that criterion. It is not a TISA rating; the TISA Evaluation Methodology is not published yet.',
        'Static speed limits (Table 13) are not assessed: they are published via TN-ITS or DATEX II Part 14, not in a SituationPublication.',
      ],
      openlr: summariseOpenlr(events),
    },
    findings,
  }
}

const ORDER: CriterionId[] = [
  'terminology',
  'dataFormat',
  'useOfSpecification',
  'locationReferencing',
  'linearReferencing',
  'direction',
  'updateCycle',
  'timeliness',
  'accuracy',
  'correctness',
  'completeness',
  'eventId',
  'secureApi',
  'outdated',
  'shortTermEvents',
  'roadType',
  'laneLevel',
  'validity',
  'vehicleClassification',
  'causeType',
  'preAnnouncement',
]

function orderCriteria(list: RttiCriterionResult[]): RttiCriterionResult[] {
  return [...list].sort((a, b) => ORDER.indexOf(a.id as CriterionId) - ORDER.indexOf(b.id as CriterionId))
}

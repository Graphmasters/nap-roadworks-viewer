// Passability analysis across the records of a situation (concept §4.7, §5.6).
//
// Source statements (an explicit closure), lane evidence (laneStatusCoded / extended) and the
// cause links between records are evaluated separately and then compared. The result is an
// analysis hypothesis, never a legal statement about whether a road may be used.

import { laneEvidenceOf, oneSideFullyClosed, type LaneCodeSummary } from '../lanes/codes'
import type {
  Finding,
  LaneEvidence,
  Passability,
  PassabilityFinding,
  RecordPassability,
  RoadEvent,
  Situation,
} from '../model'
import { linesOf, matchEvent } from '../matching/score'
import { FULL_CLOSURE_TYPES } from '../records/normalise'

/** True when the two records' lines cover the same road section (at least half of `a`). */
function sameSection(a: RoadEvent, b: RoadEvent): boolean {
  const la = linesOf(a.geometry)
  const lb = linesOf(b.geometry)
  if (!la.length || !lb.length) return false
  return matchEvent(la, [{ key: 'b', lines: lb }], { bufferM: 30, maxSamples: 60 }).ranked[0]!.components.coverage >= 0.5
}

export interface PassabilityOutput {
  findings: PassabilityFinding[]
  records: Record<string, RecordPassability>
  /** Reference problems (missing or cyclic cause links) as report findings. */
  referenceFindings: Finding[]
}

const LANE_EVIDENCE_TEXT: Record<LaneEvidence, string> = {
  closure: 'all driving lanes closed',
  partial: 'some driving lanes closed',
  parking_stopping_only: 'only no-stopping / no-parking restrictions, no lane closed',
  open: 'all driving lanes open',
  absent: 'no lane status',
  unknown: 'lane status could not be interpreted',
}

type Overlap = 'yes' | 'no' | 'unknown'

function overlap(a: RoadEvent, b: RoadEvent): Overlap {
  if (!a.validFrom || !a.validTo || !b.validFrom || !b.validTo) return 'unknown'
  const s1 = Date.parse(a.validFrom)
  const e1 = Date.parse(a.validTo)
  const s2 = Date.parse(b.validFrom)
  const e2 = Date.parse(b.validTo)
  if ([s1, e1, s2, e2].some(Number.isNaN)) return 'unknown'
  return s1 <= e2 && s2 <= e1 ? 'yes' : 'no'
}

export function reportsFullClosure(e: RoadEvent): boolean {
  return e.managementTypes.some((t) => FULL_CLOSURE_TYPES.has(t))
}

export function analysePassability(situations: Situation[], events: RoadEvent[]): PassabilityOutput {
  const byId = new Map<string, RoadEvent>()
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e)
  const bySituation = new Map<string, RoadEvent[]>()
  for (const e of events) {
    let list = bySituation.get(e.situationId)
    if (!list) bySituation.set(e.situationId, (list = []))
    list.push(e)
  }

  const findings: PassabilityFinding[] = []
  const records: Record<string, RecordPassability> = {}
  const referenceFindings: Finding[] = []

  for (const sit of situations) {
    const recs = bySituation.get(sit.id) ?? []
    const local = new Map(recs.map((r) => [r.id, r]))

    // Reference graph: missing, cross-situation and cyclic cause links.
    for (const r of recs) {
      for (const cid of r.causeRecordIds) {
        if (local.has(cid)) continue
        if (byId.has(cid)) {
          referenceFindings.push({
            ruleId: 'REF-003',
            severity: 'info',
            layer: 'semantic',
            message: `Cause record ${cid} is in another situation (${byId.get(cid)!.situationId}).`,
            situationId: sit.id,
            recordIds: [r.id, cid],
            xmlPath: r.xmlPath,
          })
        } else {
          referenceFindings.push({
            ruleId: 'REF-001',
            severity: 'warning',
            layer: 'semantic',
            message: `Cause record ${cid} referenced by ${r.id} is not in the file.`,
            explanation: 'The referenced situation record could not be resolved. Lane or restriction evidence of the cause cannot be checked.',
            situationId: sit.id,
            recordIds: [r.id],
            xmlPath: r.xmlPath,
            rawValue: cid,
          })
        }
      }
    }
    for (const cycle of findCycles(recs, local)) {
      referenceFindings.push({
        ruleId: 'REF-002',
        severity: 'warning',
        layer: 'semantic',
        message: `Cause references form a cycle: ${cycle.join(' → ')}.`,
        situationId: sit.id,
        recordIds: cycle,
      })
    }

    for (const r of recs) records[r.id] = classifyRecord(r, sit, recs, byId, findings)
  }
  return { findings, records, referenceFindings }
}

function findCycles(recs: RoadEvent[], local: Map<string, RoadEvent>): string[][] {
  const cycles: string[][] = []
  const state = new Map<string, 1 | 2>()
  const stack: string[] = []
  const visit = (id: string) => {
    state.set(id, 1)
    stack.push(id)
    for (const c of local.get(id)?.causeRecordIds ?? []) {
      if (!local.has(c)) continue
      if (state.get(c) === 1) cycles.push([...stack.slice(stack.indexOf(c)), c])
      else if (!state.has(c)) visit(c)
    }
    stack.pop()
    state.set(id, 2)
  }
  for (const r of recs) if (!state.has(r.id)) visit(r.id)
  return cycles
}

function classifyRecord(
  r: RoadEvent,
  sit: Situation,
  recs: RoadEvent[],
  byId: Map<string, RoadEvent>,
  out: PassabilityFinding[],
): RecordPassability {
  const reportedClosure = reportsFullClosure(r)
  const own = laneEvidenceOf(r.laneCodes)
  const causes = r.causeRecordIds.map((id) => byId.get(id)).filter((x): x is RoadEvent => !!x)
  const causeLanes = causes
    .map((c) => ({ c, ...laneEvidenceOf(c.laneCodes) }))
    .filter((x) => x.evidence !== 'absent')
  const reasons: string[] = []

  if (reportedClosure) {
    // Lane evidence for the closure claim: own lane status first, else that of the cause records.
    const evidenceSet = own.evidence !== 'absent' ? [{ c: r, ...own }] : causeLanes
    const kinds = new Set(evidenceSet.map((e) => e.evidence))
    reasons.push(`Reports ${r.managementTypes.filter((t) => FULL_CLOSURE_TYPES.has(t)).join(', ')}.`)

    // DQ-RW-001: the claim is not corroborated; linked lanes only carry stopping/parking bans.
    if (kinds.has('parking_stopping_only') && !kinds.has('closure') && !kinds.has('partial')) {
      const linked = evidenceSet.filter((e) => e.evidence === 'parking_stopping_only')
      const timing = linked.map((e) => (e.c === r ? 'yes' : overlap(r, e.c)))
      if (timing.every((t) => t === 'no')) {
        reasons.push('Linked stopping/parking restriction does not overlap in time with the closure.')
        return finish(r, 'closed', reportedClosure, 'absent', hasPeriodsOrBlock(r), reasons)
      }
      const independent = recs.filter(
        (o) =>
          o !== r &&
          !r.causeRecordIds.includes(o.id) &&
          overlap(r, o) !== 'no' &&
          sameSection(r, o) &&
          (laneEvidenceOf(o.laneCodes).evidence === 'closure' || (reportsFullClosure(o) && o.causeRecordIds.some((id) => laneEvidenceOf(byId.get(id)?.laneCodes ?? []).evidence === 'closure'))),
      )
      const assumptions = [
        'Lane status is interpreted with the MDM roadworks profile 04-00-00 alphabet (P/H = no stopping).',
        'The closure record and its cause are assumed to describe the same road section and direction.',
        'Other records count as independent closure evidence only if their line covers the same section (30 m buffer) at an overlapping time.',
      ]
      if (timing.includes('unknown')) assumptions.push('The validity periods could not be compared; they are assumed to overlap.')
      const f: PassabilityFinding = {
        ruleId: 'DQ-RW-001',
        situationId: sit.id,
        recordIds: [r.id, ...linked.filter((e) => e.c !== r).map((e) => e.c.id)],
        classification: 'conflicting',
        reportedClosure: true,
        laneEvidence: 'parking_stopping_only',
        severity: 'warning',
        evidence: [
          {
            recordId: r.id,
            xmlPath: r.xmlPath,
            rawValue: r.managementTypes.join(', '),
            interpretation: 'Record claims a full closure (driving prohibition).',
          },
          ...linked.map((e) => ({
            recordId: e.c.id,
            xmlPath: e.c.laneCodes.find((c) => c.value === e.code)?.xmlPath ?? e.c.xmlPath,
            rawValue: e.code,
            interpretation: `Lane status: ${LANE_EVIDENCE_TEXT[e.evidence]}${describeCounts(e.summary)}.`,
          })),
        ],
        routingAction: 'manual_review',
        assumptions,
        message: independent.length
          ? 'Possible incorrect road closure: the linked record indicates only a stopping/parking prohibition. Other records in the situation report a closure, so this needs review rather than correction.'
          : 'Possible incorrect road closure: the linked record indicates only a stopping/parking prohibition.',
      }
      if (independent.length) f.assumptions.push(`Independent closure evidence in: ${independent.map((o) => o.id).join(', ')}.`)
      out.push(f)
      reasons.push('Conflicts with linked lane status (DQ-RW-001).')
      return finish(r, 'conflicting', true, 'parking_stopping_only', 'manual_review', reasons)
    }

    if (kinds.has('partial') && !kinds.has('closure')) {
      const sides = evidenceSet.filter((e) => e.evidence === 'partial').every((e) => e.summary && oneSideFullyClosed(e.summary))
      if (sides) {
        reasons.push('Lane status closes every lane of one direction: read as a one-direction closure.')
        return finish(r, r.hasPeriods ? 'conditional' : 'closed', true, 'partial', hasPeriodsOrBlock(r), reasons)
      }
      out.push({
        ruleId: 'DQ-RW-002',
        situationId: sit.id,
        recordIds: [r.id, ...evidenceSet.filter((e) => e.c !== r).map((e) => e.c.id)],
        classification: 'conflicting',
        reportedClosure: true,
        laneEvidence: 'partial',
        severity: 'warning',
        evidence: evidenceSet.map((e) => ({
          recordId: e.c.id,
          xmlPath: e.c.xmlPath,
          rawValue: e.code,
          interpretation: `Lane status: ${LANE_EVIDENCE_TEXT[e.evidence]}${describeCounts(e.summary)}.`,
        })),
        routingAction: 'manual_review',
        assumptions: ['The closure and the lane status are assumed to describe the same section and time.'],
        message: 'Full closure reported, but the linked lane status keeps lanes in both directions open.',
      })
      reasons.push('Lane status leaves lanes open in both directions (DQ-RW-002).')
      return finish(r, 'conflicting', true, 'partial', 'manual_review', reasons)
    }

    const ev: LaneEvidence = kinds.has('closure') ? 'closure' : evidenceSet[0]?.evidence ?? 'absent'
    if (ev === 'closure') reasons.push('Lane status confirms that all lanes are closed.')
    else reasons.push('No lane status available to corroborate the closure claim.')
    return finish(r, r.hasPeriods ? 'conditional' : 'closed', true, ev, hasPeriodsOrBlock(r), reasons)
  }

  // No explicit closure claim: classify by lane evidence.
  const ev = own.evidence !== 'absent' ? own.evidence : 'absent'
  if (ev === 'closure') {
    reasons.push('All driving lanes are closed according to the lane status (inferred, no explicit closure).')
    return finish(r, r.hasPeriods ? 'conditional' : 'closed', false, ev, 'manual_review', reasons)
  }
  if (ev === 'partial' || r.type === 'partialClosure') {
    reasons.push(ev === 'partial' ? 'Some lanes closed.' : `Management type ${r.managementTypes.join(', ')}.`)
    return finish(r, r.hasPeriods ? 'conditional' : 'restricted', false, ev, 'do_not_block', reasons)
  }
  if (ev === 'parking_stopping_only') {
    reasons.push('Only stopping/parking restrictions. A stopping ban is not a driving ban.')
    return finish(r, 'passable', false, ev, 'do_not_block', reasons)
  }
  if (ev === 'open') {
    reasons.push('All driving lanes open according to the lane status.')
    return finish(r, 'passable', false, ev, 'do_not_block', reasons)
  }
  reasons.push(ev === 'unknown' ? 'Lane status contains unknown codes.' : 'No closure claim and no lane status.')
  return finish(r, 'unknown', false, ev, 'do_not_block', reasons)
}

function hasPeriodsOrBlock(r: RoadEvent): RecordPassability['routingAction'] {
  return r.hasPeriods ? 'manual_review' : 'block'
}

function describeCounts(s: LaneCodeSummary | undefined): string {
  if (!s) return ''
  const parts = [`${s.drivingLanes} driving lane(s)`, `${s.closedLanes} closed`]
  if (s.noStoppingStrips) parts.push(`${s.noStoppingStrips} no-stopping strip(s)`)
  return ` (${parts.join(', ')})`
}

function finish(
  r: RoadEvent,
  classification: Passability,
  reportedClosure: boolean,
  laneEvidence: LaneEvidence,
  routingAction: RecordPassability['routingAction'],
  reasons: string[],
): RecordPassability {
  if (classification === 'conditional') reasons.push('Validity uses restricted periods: applies only at certain times.')
  return { recordId: r.id, classification, reportedClosure, laneEvidence, routingAction, reasons }
}

export function passabilityToFinding(p: PassabilityFinding): Finding {
  return {
    ruleId: p.ruleId,
    severity: p.severity,
    layer: 'passability',
    message: p.message,
    explanation: [...p.evidence.map((e) => `${e.recordId}: ${e.interpretation}${e.rawValue ? ` [${e.rawValue}]` : ''}`), ...p.assumptions.map((a) => `Assumption: ${a}`)].join('\n'),
    situationId: p.situationId,
    recordIds: p.recordIds,
    xmlPath: p.evidence[0]?.xmlPath,
    remedy: 'Review both records and any other applicable traffic regulation. Do not block the road in routing on this record alone.',
  }
}

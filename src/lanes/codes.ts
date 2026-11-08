// Interpretation of MDM lane-status strings (`laneStatusCoded`, `extendedLaneStatusCoded`) on top
// of the lane-status-viewer decoder. The alphabet and its meaning follow the MDM roadworks profile
// 04-00-00 (section 5.4, Annex E) as implemented in lane-status-viewer. Unknown characters are kept
// as `unknown`: they are never read as permission to drive.

import { decodeLaneStatus, type LaneStatusGlyph } from 'lane-status-viewer'
import type { LaneEvidence, LaneState, NormalizedLaneStatus } from '../model'

const DRIVING = new Set(['openDirection', 'openOncoming', 'narrowDirection', 'narrowOncoming', 'reversible', 'closed', 'unknown'])

const STATUS: Record<string, NormalizedLaneStatus> = {
  openDirection: 'open',
  openOncoming: 'open',
  reversible: 'open',
  narrowDirection: 'restricted',
  narrowOncoming: 'restricted',
  closed: 'closed',
  noStoppingRestricted: 'noStopping',
  noStoppingAbsolute: 'noStopping',
  unknown: 'unknown',
}

export interface LaneCodeSummary {
  code: string
  /** Lanes usable by motor traffic (open, narrowed, reversible, closed, unknown). */
  drivingLanes: number
  closedLanes: number
  openLanes: number
  restrictedLanes: number
  noStoppingStrips: number
  unknownSymbols: string[]
  /** Driving lanes on each side of the central separator, where there is one. */
  oncomingLanes: number
  directionLanes: number
  closedOncoming: number
  closedDirection: number
  evidence: LaneEvidence
}

/** Decodes a lane-status string into per-lane states. Separators are dropped. */
export function laneStatesFromCode(
  code: string,
  field: LaneState['field'],
  xmlPath?: string,
  validity?: { validFrom?: string; validTo?: string },
): LaneState[] {
  const glyphs = decodeLaneStatus(code)
  const sepIndex = glyphs.findIndex((g) => g.char === '2' || g.char === '1')
  const out: LaneState[] = []
  glyphs.forEach((g, i) => {
    if (g.kind !== 'lane') return
    out.push({
      source: 'datex2',
      laneReference: String(out.length),
      direction: sideOf(g, i, sepIndex),
      rawStatus: g.char,
      normalizedStatus: STATUS[g.symbol] ?? 'other',
      field,
      xmlPath,
      ...validity,
    })
  })
  return out
}

function sideOf(g: LaneStatusGlyph, i: number, sep: number): LaneState['direction'] {
  if (g.symbol === 'openDirection' || g.symbol === 'narrowDirection') return 'direction'
  if (g.symbol === 'openOncoming' || g.symbol === 'narrowOncoming') return 'oncoming'
  if (g.symbol === 'reversible') return 'both'
  if (sep < 0) return undefined
  return i < sep ? 'oncoming' : 'direction'
}

export function summariseLaneCode(code: string): LaneCodeSummary {
  const glyphs = decodeLaneStatus(code)
  const sep = glyphs.findIndex((g) => g.char === '2' || g.char === '1')
  let driving = 0
  let closed = 0
  let open = 0
  let restricted = 0
  let noStopping = 0
  let oncoming = 0
  let direction = 0
  let closedOncoming = 0
  let closedDirection = 0
  const unknown: string[] = []
  glyphs.forEach((g, i) => {
    if (g.symbol === 'unknown') unknown.push(g.char)
    if (g.symbol === 'noStoppingAbsolute' || g.symbol === 'noStoppingRestricted') noStopping++
    if (!DRIVING.has(g.symbol)) return
    driving++
    if (g.symbol === 'closed') closed++
    else if (g.symbol === 'narrowDirection' || g.symbol === 'narrowOncoming') restricted++
    else if (g.symbol !== 'unknown') open++
    const side = sideOf(g, i, sep)
    if (side === 'oncoming') {
      oncoming++
      if (g.symbol === 'closed') closedOncoming++
    }
    if (side === 'direction') {
      direction++
      if (g.symbol === 'closed') closedDirection++
    }
  })
  let evidence: LaneEvidence
  if (unknown.length) evidence = 'unknown'
  else if (driving === 0) evidence = noStopping > 0 ? 'parking_stopping_only' : 'unknown'
  else if (closed === driving) evidence = 'closure'
  else if (closed > 0) evidence = 'partial'
  else if (noStopping > 0) evidence = 'parking_stopping_only'
  else evidence = 'open'
  return {
    code,
    drivingLanes: driving,
    closedLanes: closed,
    openLanes: open,
    restrictedLanes: restricted,
    noStoppingStrips: noStopping,
    unknownSymbols: unknown,
    oncomingLanes: oncoming,
    directionLanes: direction,
    closedOncoming,
    closedDirection,
    evidence,
  }
}

const RANK: Record<LaneEvidence, number> = { closure: 5, partial: 4, unknown: 3, parking_stopping_only: 2, open: 1, absent: 0 }

/**
 * Lane evidence of a record. When both laneStatusCoded and extendedLaneStatusCoded are present
 * and disagree, the more restrictive reading wins, so a disagreement never opens a lane. A code
 * without any lane symbol (e.g. just "2") carries no evidence.
 */
export function laneEvidenceOf(codes: Array<{ field: string; value: string }>): { evidence: LaneEvidence; code?: string; summary?: LaneCodeSummary } {
  let best: { evidence: LaneEvidence; code?: string; summary?: LaneCodeSummary } = { evidence: 'absent' }
  let bestRank = -1
  // Extended first so that it wins ties.
  const ordered = [...codes].sort((a, b) => (a.field === 'extendedLaneStatusCoded' ? -1 : 0) - (b.field === 'extendedLaneStatusCoded' ? -1 : 0))
  for (const c of ordered) {
    const summary = summariseLaneCode(c.value)
    const empty = summary.drivingLanes === 0 && summary.noStoppingStrips === 0 && !summary.unknownSymbols.length
    const rank = empty ? 0 : RANK[summary.evidence]
    if (rank > bestRank) {
      bestRank = rank
      best = empty ? { evidence: 'absent', code: c.value, summary } : { evidence: summary.evidence, code: c.value, summary }
    }
  }
  return best
}

/** True when every driving lane on at least one side of the central separator is closed. */
export function oneSideFullyClosed(s: LaneCodeSummary): boolean {
  return (s.directionLanes > 0 && s.closedDirection === s.directionLanes) || (s.oncomingLanes > 0 && s.closedOncoming === s.oncomingLanes)
}

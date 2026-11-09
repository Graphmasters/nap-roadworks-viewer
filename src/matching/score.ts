// Explainable matching of a DATEX II line to OSM road candidates (concept §4.5, §5.4).
//
// The event line is sampled at regular steps. Each candidate gets a quality for the part of the line
// it covers (distance, direction, road number, road class) and a coverage (share of the line within
// the buffer). score = coverage × quality, so a candidate that explains more of the line wins over a
// short fragment that happens to lie exactly on it. Single OSM ways are preferred over merged tile
// features (no reliable OSM id) unless the merged feature is clearly better. The score is an
// internal ranking value, not a calibrated probability.

import type { Geometry } from 'geojson'

export type LonLat = [number, number]

export interface MatchCandidate {
  /** Stable key, e.g. `way/123` or `merged/456`. */
  key: string
  osmWayId?: string
  /** True when the tile feature was merged from several ways (no reliable OSM id). */
  merged?: boolean
  roadClass?: string
  ref?: string
  /** 1 = one-way along the geometry, -1 = against it, 0 / undefined = two-way. */
  oneway?: number
  lines: LonLat[][]
  /** OSM tags, when the way was fetched (e.g. while splitting a merged feature). */
  tags?: Record<string, string>
}

export interface MatchOptions {
  /** Distance in metres within which a sample counts as covered (default 25). */
  bufferM?: number
  /** Maximum number of samples along the event (default 400). */
  maxSamples?: number
  roadNumber?: string
}

export interface ScoreComponents {
  coverage: number
  distance: number
  bearing: number
  ref: number
  roadClass: number
}

export interface ScoredCandidate {
  candidate: MatchCandidate
  score: number
  components: ScoreComponents
  meanDistanceM?: number
  coveredSamples: number
  /** Match quality of the covered part (0–1): weighted mean of distance, bearing, ref and class. */
  quality: number
  /** Bounding box `[west, south, east, north]` of the event samples this candidate covers. */
  coveredBbox?: [number, number, number, number]
  reasons: string[]
}

export type MatchStatus = 'matched' | 'ambiguous' | 'none'

export interface MatchResult {
  status: MatchStatus
  /** Ways chosen to explain the event, ordered along the event. */
  sequence: ScoredCandidate[]
  /** Share of the event covered by the chosen sequence. */
  coverage: number
  confidence: number
  ranked: ScoredCandidate[]
  samples: number
  reasons: string[]
}

/** Weights of the quality components (sum 1). Coverage is not weighted: it multiplies the quality. */
export const WEIGHTS: Omit<ScoreComponents, 'coverage'> = { distance: 0.3, bearing: 0.45, ref: 0.15, roadClass: 0.1 }
/** A merged tile feature ranks this much lower, so a single OSM way within this margin wins. */
export const MERGED_PENALTY = 0.1
/** Minimum quality for a candidate to join the sequence or to make the match ambiguous. */
export const MIN_QUALITY = 0.6
/** A runner-up within this score of the best (and not on the same road) makes the match ambiguous. */
export const AMBIGUITY_MARGIN = 0.12
/** Two candidates whose nearest points are this close (mean, metres) are the same road. */
const SAME_ROAD_M = 3

interface Sample {
  x: number
  y: number
  bearing: number
  index: number
}

export function linesOf(g: Geometry | undefined): LonLat[][] {
  if (!g) return []
  if (g.type === 'LineString') return [g.coordinates as LonLat[]]
  if (g.type === 'MultiLineString') return g.coordinates as LonLat[][]
  return []
}

function projector(lines: LonLat[][]) {
  let lon0 = 0
  let lat0 = 0
  let n = 0
  for (const l of lines)
    for (const [lon, lat] of l) {
      lon0 += lon
      lat0 += lat
      n++
    }
  lon0 /= n || 1
  lat0 /= n || 1
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320
  const ky = 110_540
  return {
    project: ([lon, lat]: LonLat): [number, number] => [(lon - lon0) * kx, (lat - lat0) * ky],
    unproject: (x: number, y: number): LonLat => [lon0 + x / kx, lat0 + y / ky],
  }
}

function bearingOf(ax: number, ay: number, bx: number, by: number): number {
  return ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360
}

function sampleLines(lines: Array<Array<[number, number]>>, maxSamples: number): Sample[] {
  let length = 0
  for (const l of lines) for (let i = 1; i < l.length; i++) length += Math.hypot(l[i]![0] - l[i - 1]![0], l[i]![1] - l[i - 1]![1])
  const step = Math.max(10, length / maxSamples)
  const out: Sample[] = []
  for (const l of lines) {
    let carry = 0
    for (let i = 1; i < l.length; i++) {
      const [ax, ay] = l[i - 1]!
      const [bx, by] = l[i]!
      const seg = Math.hypot(bx - ax, by - ay)
      if (seg === 0) continue
      const b = bearingOf(ax, ay, bx, by)
      let d = carry
      while (d <= seg) {
        const t = d / seg
        out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, bearing: b, index: out.length })
        d += step
      }
      carry = d - seg
    }
  }
  return out
}

function nearest(px: number, py: number, lines: Array<Array<[number, number]>>): { d: number; bearing: number; x: number; y: number } {
  let best = Infinity
  let bearing = 0
  let bx0 = px
  let by0 = py
  for (const l of lines)
    for (let i = 1; i < l.length; i++) {
      const [ax, ay] = l[i - 1]!
      const [bx, by] = l[i]!
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      if (d < best) {
        best = d
        bearing = bearingOf(ax, ay, bx, by)
        bx0 = ax + t * dx
        by0 = ay + t * dy
      }
    }
  return { d: best, bearing, x: bx0, y: by0 }
}

const normRef = (s: string) => s.toUpperCase().replace(/[\s.-]/g, '')

/** Expected OpenMapTiles classes for a road number prefix. Heuristic, country-independent. */
function expectedClasses(roadNumber: string): Set<string> | undefined {
  const p = normRef(roadNumber)[0]
  switch (p) {
    case 'A':
    case 'E':
      return new Set(['motorway', 'trunk'])
    case 'N':
    case 'B':
      return new Set(['trunk', 'primary', 'motorway'])
    case 'L':
    case 'S':
    case 'R':
      return new Set(['primary', 'secondary', 'tertiary'])
    case 'K':
      return new Set(['secondary', 'tertiary', 'minor'])
    default:
      return undefined
  }
}

export function matchEvent(eventLines: LonLat[][], candidates: MatchCandidate[], options: MatchOptions = {}): MatchResult {
  const buffer = options.bufferM ?? 25
  const { project, unproject } = projector(eventLines)
  const samples = sampleLines(eventLines.map((l) => l.map(project)), options.maxSamples ?? 400)
  if (!samples.length || !candidates.length)
    return { status: 'none', sequence: [], coverage: 0, confidence: 0, ranked: [], samples: samples.length, reasons: [candidates.length ? 'The event line is empty.' : 'No road candidates near the event.'] }

  const classes = options.roadNumber ? expectedClasses(options.roadNumber) : undefined
  const coveredBy = new Map<string, Set<number>>()
  /** Nearest point on each candidate per covered sample, to tell the same road from a parallel one. */
  const nearestBy = new Map<string, Map<number, [number, number]>>()
  const ranked: ScoredCandidate[] = candidates.map((c) => {
    const lines = c.lines.map((l) => l.map(project))
    const covered = new Set<number>()
    const near = new Map<number, [number, number]>()
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    let dist = 0
    let bearing = 0
    for (const s of samples) {
      const n = nearest(s.x, s.y, lines)
      if (n.d > buffer) continue
      covered.add(s.index)
      near.set(s.index, [n.x, n.y])
      minX = Math.min(minX, s.x)
      minY = Math.min(minY, s.y)
      maxX = Math.max(maxX, s.x)
      maxY = Math.max(maxY, s.y)
      dist += n.d
      let diff = Math.abs(((s.bearing - n.bearing + 540) % 360) - 180) // 0 = same direction, 180 = opposite
      if (c.oneway === -1) diff = 180 - diff
      if (!c.oneway) diff = Math.min(diff, 180 - diff)
      bearing += Math.max(0, 1 - diff / 90)
    }
    coveredBy.set(c.key, covered)
    nearestBy.set(c.key, near)
    const k = covered.size
    const components: ScoreComponents = {
      coverage: k / samples.length,
      distance: k ? Math.max(0, 1 - dist / k / buffer) : 0,
      bearing: k ? bearing / k : 0,
      ref: 0.5,
      roadClass: 0.5,
    }
    const reasons: string[] = [`Covers ${Math.round(components.coverage * 100)}% of the event within ${buffer} m.`]
    if (k) reasons.push(`Mean distance ${(dist / k).toFixed(1)} m; direction agreement ${(components.bearing * 100).toFixed(0)}%${c.oneway ? ' (one-way)' : ' (two-way, undirected)'}.`)
    if (options.roadNumber && c.ref) {
      const refs = c.ref.split(/[;,]/).map(normRef)
      components.ref = refs.includes(normRef(options.roadNumber)) ? 1 : 0
      reasons.push(components.ref ? `Road number ${options.roadNumber} matches ref ${c.ref}.` : `Road number ${options.roadNumber} differs from ref ${c.ref}.`)
    }
    if (classes && c.roadClass) {
      components.roadClass = classes.has(c.roadClass.replace(/_link$/, '')) ? 1 : 0.2
      if (components.roadClass < 1) reasons.push(`Road class ${c.roadClass} is unusual for ${options.roadNumber}.`)
    }
    if (c.merged) reasons.push('Tile feature merged from several ways: the OSM id is only a hint.')
    const quality = k
      ? WEIGHTS.distance * components.distance + WEIGHTS.bearing * components.bearing + WEIGHTS.ref * components.ref + WEIGHTS.roadClass * components.roadClass
      : 0
    const coveredBbox: ScoredCandidate['coveredBbox'] = k ? [...unproject(minX, minY), ...unproject(maxX, maxY)] : undefined
    return { candidate: c, score: components.coverage * quality, quality, components, meanDistanceM: k ? dist / k : undefined, coveredSamples: k, coveredBbox, reasons }
  })
  const rankKey = (r: ScoredCandidate) => r.score - (r.candidate.merged ? MERGED_PENALTY : 0)
  ranked.sort((a, b) => rankKey(b) - rankKey(a) || b.score - a.score)
  ranked.forEach((r, i) => {
    if (!r.candidate.merged) return
    const before = ranked.slice(0, i).find((x) => !x.candidate.merged && x.score < r.score)
    if (before) r.reasons.push(`Ranked after ${before.candidate.key} (${before.score.toFixed(2)}) despite its higher score: single OSM ways are preferred over merged tile features within ${MERGED_PENALTY}.`)
  })

  /** True when both candidates lie on the same road where they overlap (e.g. a merged feature containing the way). */
  const sameRoad = (a: ScoredCandidate, b: ScoredCandidate) => {
    const na = nearestBy.get(a.candidate.key)!
    const nb = nearestBy.get(b.candidate.key)!
    let sum = 0
    let n = 0
    for (const [i, [ax, ay]] of na) {
      const p = nb.get(i)
      if (!p) continue
      sum += Math.hypot(ax - p[0], ay - p[1])
      n++
    }
    return n > 0 && sum / n < SAME_ROAD_M
  }

  // Greedy sequence: accept candidates that explain new parts of the event.
  const used = new Set<number>()
  const sequence: ScoredCandidate[] = []
  for (const r of ranked) {
    if (r.quality < MIN_QUALITY || r.components.bearing < 0.5) continue
    const cov = coveredBy.get(r.candidate.key)!
    let fresh = 0
    for (const i of cov) if (!used.has(i)) fresh++
    if (fresh < Math.max(2, samples.length * 0.05)) continue
    sequence.push(r)
    for (const i of cov) used.add(i)
  }
  const mean = (r: ScoredCandidate) => {
    const cov = [...coveredBy.get(r.candidate.key)!]
    return cov.reduce((a, b) => a + b, 0) / (cov.length || 1)
  }
  sequence.sort((a, b) => mean(a) - mean(b))
  const coverage = used.size / samples.length
  const reasons: string[] = []

  const top = ranked[0]!
  let status: MatchStatus = 'matched'
  if (!sequence.length || coverage < 0.2) {
    status = 'none'
    reasons.push('No candidate explains a sufficient part of the event.')
  } else {
    // Ambiguity: a runner-up that is nearly as good and covers the same samples (parallel carriageway).
    const second = ranked.find((r) => r !== top && r.score > top.score - AMBIGUITY_MARGIN && r.quality >= MIN_QUALITY && !sameRoad(top, r))
    if (second) {
      const a = coveredBy.get(top.candidate.key)!
      const b = coveredBy.get(second.candidate.key)!
      let both = 0
      for (const i of b) if (a.has(i)) both++
      if (both > 0.5 * Math.min(a.size, b.size)) {
        status = 'ambiguous'
        reasons.push(`${second.candidate.key} explains the same part almost as well (${second.score.toFixed(2)} vs ${top.score.toFixed(2)}), e.g. a parallel carriageway.`)
      }
    }
    reasons.push(`${sequence.length} way(s) explain ${Math.round(coverage * 100)}% of the event.`)
  }
  return { status, sequence, coverage, confidence: status === 'none' ? 0 : top.score, ranked, samples: samples.length, reasons }
}

// Refines a merged tile feature into the OSM ways it was built from.
//
// Vector tiles merge adjacent ways with equal attributes into one feature and drop their ids, so
// a merged candidate cannot say which OSM way is meant. When such a feature is the best candidate,
// the ways it may consist of are fetched (e.g. from Overpass) for just the part of the event it
// covers, filtered by its road class, and scored in its place.

import { matchEvent, type LonLat, type MatchCandidate, type MatchOptions, type MatchResult } from './score'

/** `[west, south, east, north]` in degrees. */
export type Bbox = [number, number, number, number]

export interface HighwayWay {
  id: string
  tags: Record<string, string>
  geometry: LonLat[]
  /** Where the way came from, e.g. "Overpass (overpass-api.de)" or "OSM API". */
  source?: string
}

/** Returns the ways whose `highway` value is one of `highways` and that intersect `bbox`. */
export type HighwayFetcher = (bbox: Bbox, highways: string[]) => Promise<HighwayWay[]>

export interface Refinement {
  /** Key of the merged candidate that was refined. */
  key: string
  bbox: Bbox
  highways: string[]
  /** Number of OSM ways that replaced the merged candidate (0 = kept). */
  ways: number
  /** Source of the ways, when the fetcher reports one. */
  source?: string
  error?: string
}

export interface RefineOptions extends MatchOptions {
  /** Refinement rounds when the new best candidate is another merged feature (default 3). */
  maxRounds?: number
  /** Largest bbox area in square degrees that is queried (default 0.25, the OSM API limit). */
  maxBboxArea?: number
  /** Called before each fetch, e.g. to show progress. */
  onFetch?: (r: Omit<Refinement, 'ways'>) => void
}

export interface RefinedMatchResult extends MatchResult {
  refinements: Refinement[]
}

const BASE_CLASSES: Record<string, string[]> = {
  motorway: ['motorway'],
  trunk: ['trunk'],
  primary: ['primary'],
  secondary: ['secondary'],
  tertiary: ['tertiary'],
  minor: ['unclassified', 'residential', 'living_street', 'road'],
  service: ['service'],
  track: ['track'],
  busway: ['busway'],
  raceway: ['raceway'],
}

/**
 * OSM `highway` values an OpenMapTiles `transportation` class stands for. `_link` marks ramps
 * (`ramp=1`, i.e. `highway=*_link`); `*_construction` classes are `highway=construction`.
 */
export function highwayValuesFor(roadClass: string | undefined): string[] | undefined {
  if (!roadClass) return undefined
  if (roadClass.endsWith('_construction')) return ['construction']
  const link = roadClass.endsWith('_link')
  const base = BASE_CLASSES[link ? roadClass.slice(0, -5) : roadClass]
  if (!base) return undefined
  if (!link) return base
  return ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(base[0]!) ? [`${base[0]}_link`] : base
}

function onewayOf(tags: Record<string, string>): number {
  const v = tags['oneway']
  if (v === 'yes' || v === '1' || v === 'true') return 1
  if (v === '-1' || v === 'reverse') return -1
  if (v === 'no' || v === 'false' || v === '0') return 0
  const hw = tags['highway'] ?? ''
  return hw === 'motorway' || hw === 'motorway_link' || tags['junction'] === 'roundabout' || tags['junction'] === 'circular' ? 1 : 0
}

function bboxOfLines(lines: LonLat[][]): Bbox {
  const b: Bbox = [Infinity, Infinity, -Infinity, -Infinity]
  for (const l of lines)
    for (const [x, y] of l) {
      b[0] = Math.min(b[0], x)
      b[1] = Math.min(b[1], y)
      b[2] = Math.max(b[2], x)
      b[3] = Math.max(b[3], y)
    }
  return b
}

function pad([w, s, e, n]: Bbox, m: number): Bbox {
  const lat = (s + n) / 2
  const dLat = m / 110_540
  const dLon = m / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [w - dLon, s - dLat, e + dLon, n + dLat]
}

function intersect(a: Bbox, b: Bbox): Bbox | undefined {
  const r: Bbox = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
  return r[0] <= r[2] && r[1] <= r[3] ? r : undefined
}

/**
 * Runs `matchEvent` and, while the best candidate is a merged tile feature, replaces it with the
 * OSM ways of the same road class inside the part of the event it covers, then scores again.
 * Fetch errors keep the merged candidate and are reported in `refinements` and `reasons`.
 */
export async function matchEventRefined(
  eventLines: LonLat[][],
  candidates: MatchCandidate[],
  fetchHighways: HighwayFetcher,
  options: RefineOptions = {},
): Promise<RefinedMatchResult> {
  const buffer = options.bufferM ?? 25
  const maxRounds = options.maxRounds ?? 3
  const maxArea = options.maxBboxArea ?? 0.25
  let cands = candidates
  let result = matchEvent(eventLines, cands, options)
  const refinements: Refinement[] = []
  const notes: string[] = []
  const tried = new Set<string>()

  for (let round = 0; round < maxRounds; round++) {
    const top = result.ranked[0]
    if (!top || !top.candidate.merged || !top.coveredBbox || tried.has(top.candidate.key)) break
    const c = top.candidate
    tried.add(c.key)
    const highways = highwayValuesFor(c.roadClass)
    const bbox = intersect(bboxOfLines(c.lines), pad(top.coveredBbox, buffer + 10))
    if (!highways || !bbox) {
      notes.push(`${c.key} is a merged tile feature; its OSM ways could not be looked up (${highways ? 'no overlap' : `road class ${c.roadClass ?? 'unknown'}`}).`)
      break
    }
    if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > maxArea) {
      refinements.push({ key: c.key, bbox, highways, ways: 0, error: 'area too large' })
      notes.push(`${c.key} covers too large an area to look up its OSM ways; the merged feature is kept.`)
      break
    }
    options.onFetch?.({ key: c.key, bbox, highways })
    let ways: HighwayWay[]
    try {
      ways = await fetchHighways(bbox, highways)
    } catch (err) {
      const message = (err as Error).message
      refinements.push({ key: c.key, bbox, highways, ways: 0, error: message })
      notes.push(`Looking up the OSM ways of ${c.key} failed (${message}); the merged feature is kept and its OSM id is only a hint.`)
      break
    }
    // Ways that are already candidates (single-way features elsewhere in the tiles) get the full
    // OSM geometry; the others become new candidates. Either way the merged feature is replaced.
    const byWay = new Map(cands.filter((x) => x.osmWayId).map((x) => [x.osmWayId!, x]))
    const updated = new Map<string, MatchCandidate>()
    const fresh: MatchCandidate[] = []
    for (const w of ways) {
      if (w.geometry.length < 2) continue
      const known = byWay.get(w.id)
      if (known) updated.set(known.key, { ...known, ref: known.ref ?? w.tags['ref'], oneway: onewayOf(w.tags), lines: [w.geometry], tags: w.tags })
      else fresh.push({ key: `way/${w.id}`, osmWayId: w.id, roadClass: c.roadClass, ref: w.tags['ref'], oneway: onewayOf(w.tags), lines: [w.geometry], tags: w.tags })
    }
    const count = fresh.length + updated.size
    const source = ways.find((w) => w.source)?.source
    refinements.push({ key: c.key, bbox, highways, ways: count, source })
    if (!count) {
      notes.push(`No OSM way with highway=${highways.join('|')} found for ${c.key}; the merged feature is kept.`)
      break
    }
    notes.push(
      `Merged tile feature ${c.key} replaced by ${count} OSM way(s) with highway=${highways.join('|')}${source ? ` from ${source}` : ''}` +
        (updated.size ? ` (${updated.size} already a candidate, now with full OSM geometry).` : '.'),
    )
    cands = cands.filter((x) => x.key !== c.key).map((x) => updated.get(x.key) ?? x).concat(fresh)
    result = matchEvent(eventLines, cands, options)
  }
  return { ...result, reasons: [...notes, ...result.reasons], refinements }
}

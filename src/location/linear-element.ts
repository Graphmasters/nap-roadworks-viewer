// Builds a polyline from a DATEX II `LinearElementByPoints` and cuts it to the section a
// `linearWithinLinearElement` covers.
//
// A LinearElementByPoints lists the element's shape as referents in order: `startPointOfLinearElement`,
// `intermediatePointOnLinearElement` (ordered by their `index` attribute) and
// `endPointOfLinearElement`, each with `pointCoordinates` (explicit latitude/longitude, so no axis
// order question). The record covers the part between `fromPoint` and `toPoint`, given as
// `DistanceFromLinearElementStart` (metres from the start), `DistanceFromLinearElementReferent`
// (metres from a named referent, towards another one) or `PercentageDistanceAlongLinearElement`.
// Distances are measured along the polyline built from the points.

import { childrenNamed, descendants, firstDescendant, textAt, xsiType, type XmlElement } from '../xml/tree'
import { distanceM } from './geometry'

export interface LinearElementLine {
  /** Positions as [lat, lon], cut to the covered section. */
  coords: Array<[lat: number, lon: number]>
  /** Length of the whole linear element along its points, in metres. */
  elementLengthM: number
  /** Covered section in metres from the element start, when fromPoint/toPoint were applied. */
  cut?: { fromM: number; toM: number }
  /** True when toPoint lies before fromPoint and the cut section was reversed. */
  reversed?: boolean
}

const local = (e: XmlElement) => e.local

function num(s: string | undefined): number | undefined {
  if (s === undefined || s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

interface Referent {
  id?: string
  lat: number
  lon: number
}

function referentOf(el: XmlElement | undefined): Referent | undefined {
  if (!el) return undefined
  const pc = firstDescendant(el, 'pointCoordinates')
  const lat = num(pc && textAt(pc, 'latitude'))
  const lon = num(pc && textAt(pc, 'longitude'))
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined
  return { id: firstDescendant(el, 'referentIdentifier')?.text || undefined, lat, lon }
}

/** True for a `linearElement` of type LinearElementByPoints (or one that has its start/end points). */
export function isLinearElementByPoints(el: XmlElement): boolean {
  if (/LinearElementByPoints$/.test(xsiType(el) ?? '')) return true
  return el.children.some((c) => local(c) === 'startPointOfLinearElement') && el.children.some((c) => local(c) === 'endPointOfLinearElement')
}

/** Cumulative distance in metres at each position. */
function cumulative(pts: Referent[]): number[] {
  const out = [0]
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + distanceM(pts[i - 1]!.lat, pts[i - 1]!.lon, pts[i]!.lat, pts[i]!.lon))
  return out
}

/** Position along the element in metres for a fromPoint/toPoint, or a reason it cannot be read. */
function distanceOf(el: XmlElement, pts: Referent[], cum: number[]): number | string {
  const type = xsiType(el) ?? ''
  const total = cum[cum.length - 1]!
  const pct = num(textAt(el, 'percentageDistanceAlong'))
  if (/Percentage/.test(type) || pct !== undefined) {
    if (pct === undefined) return `${local(el)} has no percentageDistanceAlong`
    return (pct / 100) * total
  }
  const along = num(textAt(el, 'distanceAlong'))
  if (along === undefined) return `${local(el)} has no distanceAlong`
  const fromRef = childrenNamed(el, 'fromReferent')[0]
  if (/Referent/.test(type) || fromRef) {
    const id = fromRef && firstDescendant(fromRef, 'referentIdentifier')?.text
    const i = id ? pts.findIndex((p) => p.id === id) : -1
    if (i < 0) return `${local(el)} refers to referent ${id ?? '(none)'}, which is not a point of the linear element`
    const towardsId = firstDescendant(childrenNamed(el, 'towardsReferent')[0] ?? el, 'referentIdentifier')?.text
    const j = towardsId ? pts.findIndex((p) => p.id === towardsId) : -1
    return cum[i]! + (j >= 0 && j < i ? -along : along)
  }
  return along
}

/** Cuts a polyline (with cumulative distances) to [a, b] metres, a <= b. */
function cut(pts: Referent[], cum: number[], a: number, b: number): Array<[number, number]> {
  const at = (d: number): [number, number] => {
    let i = 1
    while (i < cum.length - 1 && cum[i]! < d) i++
    const seg = cum[i]! - cum[i - 1]!
    const t = seg > 0 ? Math.max(0, Math.min(1, (d - cum[i - 1]!) / seg)) : 0
    const p = pts[i - 1]!
    const q = pts[i]!
    return [p.lat + t * (q.lat - p.lat), p.lon + t * (q.lon - p.lon)]
  }
  const out: Array<[number, number]> = [at(a)]
  for (let i = 0; i < pts.length; i++) if (cum[i]! > a && cum[i]! < b) out.push([pts[i]!.lat, pts[i]!.lon])
  out.push(at(b))
  return out
}

/** Reads every LinearElementByPoints in `location` as a polyline cut to its covered section. */
export function linearElementLines(location: XmlElement, warnings: string[]): LinearElementLine[] {
  const out: LinearElementLine[] = []
  for (const le of descendants(location, 'linearElement')) {
    if (!isLinearElementByPoints(le)) continue
    const start = referentOf(childrenNamed(le, 'startPointOfLinearElement')[0])
    const end = referentOf(childrenNamed(le, 'endPointOfLinearElement')[0])
    const mids = childrenNamed(le, 'intermediatePointOnLinearElement')
      .map((m, k) => ({ index: num(m.attrs['index']) ?? k, ref: referentOf(childrenNamed(m, 'referent')[0] ?? m) }))
      .sort((x, y) => x.index - y.index)
    if (!start || !end) {
      warnings.push('LinearElementByPoints lacks a start or end point with valid coordinates and is not drawn.')
      continue
    }
    const pts = [start, ...mids.flatMap((m) => (m.ref ? [m.ref] : [])), end]
    if (mids.some((m) => !m.ref)) warnings.push('LinearElementByPoints has intermediate points without valid coordinates; they are skipped.')
    const cum = cumulative(pts)
    const total = cum[cum.length - 1]!
    if (total === 0) {
      warnings.push('LinearElementByPoints has zero length (all points are the same) and is not drawn as a line.')
      continue
    }
    const whole = pts.map((p) => [p.lat, p.lon] as [number, number])
    const container = le.parent
    const fromEl = container && childrenNamed(container, 'fromPoint')[0]
    const toEl = container && childrenNamed(container, 'toPoint')[0]
    if (!fromEl && !toEl) {
      out.push({ coords: whole, elementLengthM: total })
      continue
    }
    const from = fromEl ? distanceOf(fromEl, pts, cum) : 0
    const to = toEl ? distanceOf(toEl, pts, cum) : total
    if (typeof from === 'string' || typeof to === 'string') {
      warnings.push(`${typeof from === 'string' ? from : to}; the whole LinearElementByPoints is drawn.`)
      out.push({ coords: whole, elementLengthM: total })
      continue
    }
    const tolerance = Math.max(5, total * 0.02)
    for (const [name, d] of [['fromPoint', from], ['toPoint', to]] as const)
      if (d < -tolerance || d > total + tolerance)
        warnings.push(`${name} lies ${Math.round(d)} m along a LinearElementByPoints that is ${Math.round(total)} m long; it is clamped to the element.`)
    const a = Math.max(0, Math.min(total, Math.min(from, to)))
    const b = Math.max(0, Math.min(total, Math.max(from, to)))
    if (b - a < 0.5) {
      warnings.push('fromPoint and toPoint of the LinearElementByPoints coincide; the whole element is drawn.')
      out.push({ coords: whole, elementLengthM: total })
      continue
    }
    const coords = cut(pts, cum, a, b)
    out.push({ coords: from > to ? coords.reverse() : coords, elementLengthM: total, cut: { fromM: from, toM: to }, reversed: from > to || undefined })
  }
  return out
}

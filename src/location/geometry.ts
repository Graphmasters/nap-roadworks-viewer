// Turns raw gml posList values into GeoJSON once the axis order of the file is known.
//
// DATEX II uses WGS 84 (EPSG:4326), whose axis order is latitude, longitude, so posList values are
// read as "lat lon" by default. Some feeds publish "lon lat". The order is decided once per file:
// coordinates outside ±90 settle it, otherwise explicit latitude/longitude points of the same
// record (pointCoordinates, locationForDisplay) are compared with both readings.

import type { AxisOrder, AxisOrderDecision, GeometrySource, OpenlrReference, RoadEvent } from '../model'
import { validWgs84 } from './openlr'
import type { PendingGeometry } from '../records/normalise'

export interface AxisVotes {
  latlon: number
  lonlat: number
}

export function newVotes(): AxisVotes {
  return { latlon: 0, lonlat: 0 }
}

/** Haversine distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function voteAxisOrder(g: PendingGeometry, votes: AxisVotes): void {
  for (const line of g.lines) {
    const a = line[0]!
    const b = line[1]!
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
      votes.lonlat += 5
      continue
    }
    if (Math.abs(b) > 90 && Math.abs(a) <= 90) {
      votes.latlon += 5
      continue
    }
    if (!g.points.length) continue
    let dLatLon = Infinity
    let dLonLat = Infinity
    for (const [lat, lon] of g.points) {
      dLatLon = Math.min(dLatLon, distanceM(a, b, lat, lon))
      dLonLat = Math.min(dLonLat, distanceM(b, a, lat, lon))
    }
    if (dLatLon < 50_000 && dLatLon < dLonLat * 0.5) votes.latlon++
    else if (dLonLat < 50_000 && dLonLat < dLatLon * 0.5) votes.lonlat++
  }
}

export function decideAxisOrder(votes: AxisVotes, override?: AxisOrder): AxisOrderDecision {
  if (override) return { order: override, basis: 'override', votesLatLon: votes.latlon, votesLonLat: votes.lonlat }
  if (votes.lonlat > votes.latlon) return { order: 'lonlat', basis: 'reference-points', votesLatLon: votes.latlon, votesLonLat: votes.lonlat }
  if (votes.latlon > 0) return { order: 'latlon', basis: 'reference-points', votesLatLon: votes.latlon, votesLonLat: votes.lonlat }
  return { order: 'latlon', basis: 'specification', votesLatLon: 0, votesLonLat: 0 }
}

const round = (v: number) => Math.round(v * 1e6) / 1e6

function toLonLat(flat: number[], order: AxisOrder): Array<[number, number]> | undefined {
  const out: Array<[number, number]> = []
  for (let i = 0; i < flat.length; i += 2) {
    const lat = order === 'latlon' ? flat[i]! : flat[i + 1]!
    const lon = order === 'latlon' ? flat[i + 1]! : flat[i]!
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined
    out.push([round(lon), round(lat)])
  }
  return out
}

/**
 * Straight line through the LRPs of the first usable structured OpenLR line reference, trimmed by
 * its offsets. OpenLR carries no road shape between LRPs (a decoder finds the shortest path in its
 * own map, OpenLR white paper v1.5 §5.1), so this is only a chord. Offsets are metres along the
 * location reference path; they are scaled to the chord by DNP sum / chord length.
 */
export function openlrChord(refs: OpenlrReference[]): { coords: Array<[lon: number, lat: number]>; note: string } | undefined {
  const lines = refs
    .filter((r) => r.encoding === 'structured' && r.kind === 'line' && r.lrps.length >= 2 && r.lrps.every(validWgs84))
    .sort((a, b) => Number(b.role === 'firstDirection') - Number(a.role === 'firstDirection'))
  const r = lines[0]
  if (!r) return undefined
  const pts = r.lrps.map((p) => [p.lat!, p.lon!] as [number, number])
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + distanceM(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]))
  const chord = cum[cum.length - 1]!
  if (chord === 0) return undefined
  const dnps = r.lrps.slice(0, -1).map((p) => p.dnp)
  const path = dnps.every((d): d is number => d !== undefined && d > 0) ? dnps.reduce((a, b) => a + b, 0) : chord
  const scale = chord / path
  const poff = (r.positiveOffset ?? 0) * scale
  const noff = (r.negativeOffset ?? 0) * scale
  const at = (d: number): [number, number] => {
    let i = 1
    while (i < cum.length - 1 && cum[i]! < d) i++
    const seg = cum[i]! - cum[i - 1]!
    const t = seg > 0 ? Math.max(0, Math.min(1, (d - cum[i - 1]!) / seg)) : 0
    const [alat, alon] = pts[i - 1]!
    const [blat, blon] = pts[i]!
    return [alat + t * (blat - alat), alon + t * (blon - alon)]
  }
  const trimmed = poff + noff > 0 && poff + noff < chord
  const latlon = trimmed ? [at(poff), ...pts.filter((_, i) => cum[i]! > poff && cum[i]! < chord - noff), at(chord - noff)] : pts
  const offsets = r.positiveOffset || r.negativeOffset ? ` Offsets ${r.positiveOffset ?? 0} m / ${r.negativeOffset ?? 0} m ${trimmed ? 'applied in proportion' : 'leave nothing of the line and are ignored'}.` : ''
  return {
    coords: latlon.map(([lat, lon]) => [round(lon), round(lat)]),
    note: `Straight line through the ${r.lrps.length} OpenLR location reference points${r.role ? ` (${r.role})` : ''}. OpenLR carries no road shape between its points, so the line cuts corners.${offsets}`,
  }
}

const fmtM = (m: number) => `${Math.round(m)} m`

/**
 * Sets geometry, confidence and note on the event. Preference: gmlLineString, LinearElementByPoints
 * (cut to fromPoint/toPoint), a straight line through structured OpenLR LRPs, a zero-length
 * gmlLineString as a point, then loose point coordinates.
 */
export function applyGeometry(event: RoadEvent, g: PendingGeometry, order: AxisOrder): void {
  event.warnings.push(...g.warnings)
  const lines: Array<Array<[number, number]>> = []
  let zeroLength: [number, number] | undefined
  for (const flat of g.lines) {
    const coords = toLonLat(flat, order)
    if (!coords) event.warnings.push('gmlLineString has coordinates outside the WGS 84 range')
    // All positions the same: no length, nothing a line layer can draw. Shown as a point instead.
    else if (coords.every(([x, y]) => x === coords[0]![0] && y === coords[0]![1])) zeroLength ??= coords[0]
    else lines.push(coords)
  }
  if (zeroLength) {
    event.zeroLengthLine = [zeroLength[1], zeroLength[0]]
    if (lines.length) event.warnings.push('A gmlLineString has zero length (all positions are the same point) and is not drawn.')
  }
  const set = (geometry: NonNullable<RoadEvent['geometry']>, source: GeometrySource, confidence: RoadEvent['geometryConfidence'], note: string) => {
    event.geometry = geometry
    event.geometrySource = source
    event.geometryConfidence = confidence
    event.geometryNote = note
  }
  const line = (ls: Array<Array<[number, number]>>): NonNullable<RoadEvent['geometry']> =>
    ls.length === 1 ? { type: 'LineString', coordinates: ls[0]! } : { type: 'MultiLineString', coordinates: ls }

  if (lines.length) {
    set(line(lines), 'gmlLineString', 'direct', `Line geometry taken directly from DATEX II (gmlLineString, read as ${order === 'latlon' ? 'lat lon' : 'lon lat'}).`)
    return
  }
  if (g.elementLines.length) {
    const ls = g.elementLines.map((l) => l.coords.map(([lat, lon]) => [round(lon), round(lat)] as [number, number]))
    const cuts = g.elementLines.filter((l) => l.cut)
    const cutNote = cuts.length
      ? ` Cut to ${cuts.map((l) => `${fmtM(l.cut!.fromM)}–${fmtM(l.cut!.toM)} of ${fmtM(l.elementLengthM)}${l.reversed ? ', reversed' : ''}`).join('; ')} (fromPoint/toPoint, measured along the points).`
      : ''
    set(line(ls), 'linearElementByPoints', 'direct', `Line through the points of the LinearElementByPoints (pointCoordinates in order).${cutNote}`)
    return
  }
  const chord = openlrChord(event.openlr)
  if (chord) {
    set({ type: 'LineString', coordinates: chord.coords }, 'openlr', 'approximate', chord.note)
    return
  }
  if (zeroLength) {
    set(
      { type: 'Point', coordinates: zeroLength },
      'gmlLineString',
      'approximate',
      `The gmlLineString has zero length: all its positions are ${zeroLength[1]} ${zeroLength[0]} (lat lon). Drawn as a point; the extent of the restriction is not represented.`,
    )
    return
  }
  const pts = g.points.filter(([lat, lon]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180).map(([lat, lon]) => [round(lon), round(lat)] as [number, number])
  if (pts.length) {
    set(
      pts.length === 1 ? { type: 'Point', coordinates: pts[0]! } : { type: 'MultiPoint', coordinates: pts },
      'points',
      'approximate',
      g.displayOnly
        ? 'Only a display point (locationForDisplay / coordinatesForDisplay). The extent of the restriction is not represented.'
        : 'Only point coordinates. The extent of the restriction along the road is not represented.',
    )
    return
  }
  event.geometryConfidence = 'none'
  const other = event.locationMethods.filter((m) => !['gmlLineString', 'pointCoordinates', 'locationForDisplay', 'coordinatesForDisplay'].includes(m))
  event.geometryNote = other.length
    ? `Location uses ${other.join(', ')}, which this viewer does not decode. It is reported here but not drawn.`
    : 'The record has no location reference with coordinates.'
}

/** Distance in metres from a point to the nearest segment of a lon/lat polyline (local projection). */
export function distanceToLineM(lat: number, lon: number, line: Array<[number, number]> | number[][]): number {
  if (!line.length) return Infinity
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110_574
  const px = 0
  const py = 0
  let best = Infinity
  for (let i = 0; i < line.length; i++) {
    const ax = (line[i]![0]! - lon) * kx
    const ay = (line[i]![1]! - lat) * ky
    if (line.length === 1) return Math.hypot(ax, ay)
    if (i === line.length - 1) break
    const bx = (line[i + 1]![0]! - lon) * kx
    const by = (line[i + 1]![1]! - lat) * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(ax + t * dx - px, ay + t * dy - py))
  }
  return best
}

/** Initial bearing in degrees (0 = north, clockwise) from point 1 to point 2. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const p1 = lat1 * toRad
  const p2 = lat2 * toRad
  const dl = (lon2 - lon1) * toRad
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return ((Math.atan2(y, x) / toRad) + 360) % 360
}

/** Smallest absolute difference between two bearings, 0–180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

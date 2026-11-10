// Turns raw gml posList values into GeoJSON once the axis order of the file is known.
//
// DATEX II uses WGS 84 (EPSG:4326), whose axis order is latitude, longitude, so posList values are
// read as "lat lon" by default. Some feeds publish "lon lat". The order is decided once per file:
// coordinates outside ±90 settle it, otherwise explicit latitude/longitude points of the same
// record (pointCoordinates, locationForDisplay) are compared with both readings.

import type { AxisOrder, AxisOrderDecision, RoadEvent } from '../model'
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

/** Sets geometry, confidence and note on the event. */
export function applyGeometry(event: RoadEvent, g: PendingGeometry, order: AxisOrder): void {
  event.warnings.push(...g.warnings)
  const lines: Array<Array<[number, number]>> = []
  for (const flat of g.lines) {
    const coords = toLonLat(flat, order)
    if (coords) lines.push(coords)
    else event.warnings.push('gmlLineString has coordinates outside the WGS 84 range')
  }
  if (lines.length) {
    event.geometry = lines.length === 1 ? { type: 'LineString', coordinates: lines[0]! } : { type: 'MultiLineString', coordinates: lines }
    event.geometryConfidence = 'direct'
    event.geometryNote = `Line geometry taken directly from DATEX II (gmlLineString, read as ${order === 'latlon' ? 'lat lon' : 'lon lat'}).`
    return
  }
  const pts = g.points.filter(([lat, lon]) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180).map(([lat, lon]) => [round(lon), round(lat)] as [number, number])
  if (pts.length) {
    event.geometry = pts.length === 1 ? { type: 'Point', coordinates: pts[0]! } : { type: 'MultiPoint', coordinates: pts }
    event.geometryConfidence = 'approximate'
    event.geometryNote = g.displayOnly
      ? 'Only a display point (locationForDisplay / coordinatesForDisplay). The extent of the restriction is not represented.'
      : 'Only point coordinates. The extent of the restriction along the road is not represented.'
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

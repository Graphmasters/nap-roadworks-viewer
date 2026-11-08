// OSM API helpers. Tile features merged from several ways carry no usable way id; for those the
// way under the pointer is found with a small bounding-box query (`/api/0.6/map.json`).

import { DEFAULT_OSM_API_BASE_URL, type OsmWay } from '@graphmasters/osm-lanes'

interface ApiNode {
  type: 'node'
  id: number
  lat: number
  lon: number
}
interface ApiWay {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Record<string, string>
  version?: number
  timestamp?: string
}

/** OSM ways with a highway tag within `radiusM` of the point, with geometry. */
export async function fetchHighwaysNear(lon: number, lat: number, radiusM = 25, signal?: AbortSignal): Promise<OsmWay[]> {
  const dLat = radiusM / 110_540
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(7)).join(',')
  const res = await fetch(`${DEFAULT_OSM_API_BASE_URL}/api/0.6/map.json?bbox=${bbox}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`OSM API answered ${res.status} ${res.statusText}`)
  const json = (await res.json()) as { elements: Array<ApiNode | ApiWay> }
  const nodes = new Map<number, ApiNode>()
  for (const e of json.elements) if (e.type === 'node') nodes.set(e.id, e)
  const out: OsmWay[] = []
  for (const e of json.elements) {
    if (e.type !== 'way' || !e.tags?.['highway']) continue
    const geometry = e.nodes.map((id) => nodes.get(id)).filter((n): n is ApiNode => !!n).map((n) => ({ lat: n.lat, lon: n.lon }))
    out.push({ type: 'way', id: String(e.id), tags: e.tags, geometry, version: e.version, timestamp: e.timestamp, source: 'osm-api' })
  }
  return out
}

/** The way whose geometry passes closest to the point (metres), preferring the given road class. */
export function nearestWay(ways: OsmWay[], lon: number, lat: number): { way: OsmWay; distanceM: number } | undefined {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110_540
  let best: { way: OsmWay; distanceM: number } | undefined
  for (const w of ways) {
    const g = w.geometry ?? []
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1]!.lon - lon) * kx
      const ay = (g[i - 1]!.lat - lat) * ky
      const bx = (g[i]!.lon - lon) * kx
      const by = (g[i]!.lat - lat) * ky
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0
      const d = Math.hypot(ax + t * dx, ay + t * dy)
      if (!best || d < best.distanceM) best = { way: w, distanceM: d }
    }
  }
  return best
}

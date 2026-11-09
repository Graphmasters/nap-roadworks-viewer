// OSM API helpers. Tile features merged from several ways carry no usable way id; for those the
// way under the pointer is found with a small bounding-box query (`/api/0.6/map.json`).

import { DEFAULT_OSM_API_BASE_URL, DEFAULT_OVERPASS_ENDPOINT, type OsmWay } from '@graphmasters/osm-lanes'
import type { Bbox, HighwayWay } from '../src/index'

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
export function fetchHighwaysNear(lon: number, lat: number, radiusM = 25, signal?: AbortSignal): Promise<OsmWay[]> {
  const dLat = radiusM / 110_540
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return fetchOsmApiHighways([lon - dLon, lat - dLat, lon + dLon, lat + dLat], signal)
}

/** All OSM ways with a highway tag in the bbox, from the OSM API (`map.json`, returns every element in it). */
async function fetchOsmApiHighways(bbox: Bbox, signal?: AbortSignal): Promise<OsmWay[]> {
  const res = await fetch(`${DEFAULT_OSM_API_BASE_URL}/api/0.6/map.json?bbox=${bbox.map((v) => v.toFixed(7)).join(',')}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${hostOf(DEFAULT_OSM_API_BASE_URL)} answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`)
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

// Ways of given highway values in a bbox, used to split merged tile features into the OSM ways
// they were built from. User-triggered and small (one road class, the covered part of a record).
//
// Fallback chain: overpass-api.de (FOSSGIS e.V.) → for small boxes the OSM API (`map.json`, fast
// and reliable but returns every element in the box) → a second public Overpass instance.

/** Overpass instances, tried in order (see https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances). */
export const OVERPASS_ENDPOINTS = [DEFAULT_OVERPASS_ENDPOINT, 'https://overpass.private.coffee/api/interpreter']
/** Boxes up to this area (square degrees, ≈ 3–5 km²) may use the OSM API, which returns all elements. */
export const OSM_API_MAX_AREA = 0.0005
const OVERPASS_TIMEOUT_MS = 90_000

const highwayCache = new Map<string, Promise<HighwayWay[]>>()

interface OverpassWay {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number } | null>
}

const hostOf = (url: string) => new URL(url).host

async function fetchOverpass(endpoint: string, query: string, signal?: AbortSignal): Promise<HighwayWay[]> {
  const timeout = AbortSignal.timeout(OVERPASS_TIMEOUT_MS)
  const res = await fetch(endpoint, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${hostOf(endpoint)} answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`)
  const json = (await res.json()) as { elements?: OverpassWay[] }
  return (json.elements ?? [])
    .filter((x): x is OverpassWay => x.type === 'way')
    .map((x) => ({
      id: String(x.id),
      tags: x.tags ?? {},
      geometry: (x.geometry ?? []).filter((g): g is { lat: number; lon: number } => !!g).map((g) => [g.lon, g.lat] as [number, number]),
      source: `Overpass (${hostOf(endpoint)})`,
    }))
}

/** One failure as "<host> answered 502" / "<host> did not answer in time" / "<host> is unreachable". */
function describe(err: unknown, host: string, signal?: AbortSignal): string {
  if (signal?.aborted) throw err
  const e = err as Error
  if (e.name === 'TimeoutError') return `${host} did not answer in time`
  if (e.name === 'TypeError') return `${host} is unreachable`
  return e.message.startsWith(host) ? e.message : `${host}: ${e.message}`
}

export function fetchHighwaysInBbox(
  bbox: Bbox,
  highways: string[],
  options: { signal?: AbortSignal; onStatus?: (text: string) => void } = {},
): Promise<HighwayWay[]> {
  const { signal, onStatus } = options
  const [w, s, e, n] = bbox
  const values = highways.map((v) => v.replace(/[^a-z_]/g, ''))
  const query = `[out:json][timeout:25];way["highway"~"^(${values.join('|')})$"](${[s, w, n, e].map((v) => v.toFixed(6)).join(',')});out tags geom;`
  const cached = highwayCache.get(query)
  if (cached) return cached
  const small = (e - w) * (n - s) <= OSM_API_MAX_AREA

  const p = (async () => {
    const failures: string[] = []
    const [primary, ...others] = OVERPASS_ENDPOINTS
    try {
      return await fetchOverpass(primary!, query, signal)
    } catch (err) {
      failures.push(describe(err, hostOf(primary!), signal))
    }
    if (small) {
      onStatus?.(`${failures.join('; ')}. Asking the OSM API instead…`)
      try {
        const wanted = new Set(values)
        return (await fetchOsmApiHighways(bbox, signal))
          .filter((x) => wanted.has(x.tags['highway'] ?? ''))
          .map((x) => ({ id: x.id, tags: x.tags, geometry: (x.geometry ?? []).map((g) => [g.lon, g.lat] as [number, number]), source: 'OSM API' }))
      } catch (err) {
        failures.push(describe(err, hostOf(DEFAULT_OSM_API_BASE_URL), signal))
      }
    }
    for (const endpoint of others) {
      onStatus?.(`${failures.join('; ')}. Trying ${hostOf(endpoint)} (can take a minute)…`)
      try {
        return await fetchOverpass(endpoint, query, signal)
      } catch (err) {
        failures.push(describe(err, hostOf(endpoint), signal))
      }
    }
    throw new Error(failures.join('; '))
  })()
  highwayCache.set(query, p)
  p.catch(() => highwayCache.delete(query))
  return p
}

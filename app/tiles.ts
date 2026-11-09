// Reads road candidates for matching straight from the z14 vector tiles, without moving the map.
//
// OpenFreeMap tiles stop at z14; the map shows z15+ by enlarging them, so z14 holds every road
// geometry the map can show. Tiles are fetched over HTTP (shared with the map through the browser
// cache) and decoded with @mapbox/vector-tile, the decoder MapLibre itself uses.

import { decodeTileFeatureId } from 'osm-lanes'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import type { LonLat, MatchCandidate } from '../src/index'

export const TILE_ZOOM = 14
/** Upper bound on tiles per record (a z14 tile is about 1.5 km wide at 52° N). */
export const MAX_TILES = 150
/** Roads within this distance of the record are read (metres). */
const PAD_M = 60
const CONCURRENCY = 8

export type TileXY = [number, number]

export interface TileRead {
  candidates: MatchCandidate[]
  /** Tiles read (after truncation). */
  tiles: number
  /** Tiles that could not be loaded. */
  failed: number
  /** True when the record needed more than MAX_TILES tiles and only every n-th was read. */
  truncated: boolean
}

export function lonLatToTile(lon: number, lat: number, z = TILE_ZOOM): TileXY {
  const n = 2 ** z
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v))
  return [clamp(x), clamp(y)]
}

/** Tiles that contain any part of the lines or lie within `padM` of them, in order along the lines. */
export function tilesAlong(lines: LonLat[][], padM = PAD_M, z = TILE_ZOOM): TileXY[] {
  const out = new Map<string, TileXY>()
  const add = (lon: number, lat: number) => {
    const dLat = padM / 110_540
    const dLon = padM / (111_320 * Math.cos((lat * Math.PI) / 180))
    for (const [a, b] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      const t = lonLatToTile(lon + a * dLon, lat + b * dLat, z)
      out.set(`${t[0]}/${t[1]}`, t)
    }
  }
  for (const l of lines) {
    if (l.length === 1) add(l[0]![0], l[0]![1])
    for (let i = 1; i < l.length; i++) {
      const [ax, ay] = l[i - 1]!
      const [bx, by] = l[i]!
      const kx = 111_320 * Math.cos((ay * Math.PI) / 180)
      const steps = Math.max(1, Math.ceil(Math.hypot((bx - ax) * kx, (by - ay) * 110_540) / 100))
      for (let k = 0; k <= steps; k++) add(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps)
    }
  }
  return [...out.values()]
}

async function fetchTile(template: string, [x, y]: TileXY, signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const url = template.replace('{z}', String(TILE_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y))
  const res = await fetch(url, { signal })
  if (res.status === 204 || res.status === 404) return null // empty tile (sea, no data)
  if (!res.ok) throw new Error(`Tile ${TILE_ZOOM}/${x}/${y}: HTTP ${res.status}`)
  return res.arrayBuffer()
}

/**
 * Road features near the record, grouped into match candidates: single-way features by OSM way
 * id, merged features (no reliable id) by hint id and class. Only line parts that touch the
 * record's bounding box (plus PAD_M) are kept.
 */
export async function readRoadCandidates(
  lines: LonLat[][],
  template: string,
  options: { roadClasses: Set<string>; signal?: AbortSignal; onStatus?: (text: string) => void; maxTiles?: number },
): Promise<TileRead> {
  const { roadClasses, signal, onStatus } = options
  const maxTiles = options.maxTiles ?? MAX_TILES
  let tiles = tilesAlong(lines)
  const truncated = tiles.length > maxTiles
  if (truncated) tiles = tiles.filter((_, i) => i % Math.ceil(tiles.length / maxTiles) === 0)

  const all = lines.flat()
  const lat0 = all.reduce((a, p) => a + p[1], 0) / (all.length || 1)
  const dLat = PAD_M / 110_540
  const dLon = PAD_M / (111_320 * Math.cos((lat0 * Math.PI) / 180))
  const box = {
    w: Math.min(...all.map((p) => p[0])) - dLon,
    e: Math.max(...all.map((p) => p[0])) + dLon,
    s: Math.min(...all.map((p) => p[1])) - dLat,
    n: Math.max(...all.map((p) => p[1])) + dLat,
  }

  const byKey = new Map<string, MatchCandidate>()
  const refs = new Map<string, string>()
  const decode = (buf: ArrayBuffer, [x, y]: TileXY) => {
    const vt = new VectorTile(new Pbf(buf))
    const names = vt.layers['transportation_name']
    for (let i = 0; i < (names?.length ?? 0); i++) {
      const f = names!.feature(i)
      const d = decodeTileFeatureId(f.id)
      const ref = f.properties['ref']
      if (d.kind === 'element' && ref) refs.set(d.id, String(ref))
    }
    const roads = vt.layers['transportation']
    for (let i = 0; i < (roads?.length ?? 0); i++) {
      const f = roads!.feature(i)
      if (f.type !== 2) continue // lines only
      const cls = String(f.properties['class'])
      if (!roadClasses.has(cls)) continue
      const g = f.toGeoJSON(x, y, TILE_ZOOM).geometry
      const parts = g.type === 'LineString' ? [g.coordinates as LonLat[]] : g.type === 'MultiLineString' ? (g.coordinates as LonLat[][]) : []
      const inBox = parts.filter((p) => p.some(([px, py]) => px >= box.w && px <= box.e && py >= box.s && py <= box.n))
      if (!inBox.length) continue
      const d = decodeTileFeatureId(f.id)
      let key: string
      let wayId: string | undefined
      let merged = false
      if (d.kind === 'element' && d.type === 'way') {
        key = `way/${d.id}`
        wayId = d.id
      } else if (d.kind === 'merged') {
        key = `merged/${d.hintWayId}/${cls}`
        merged = true
      } else continue
      let c = byKey.get(key)
      if (!c) {
        const oneway = Number(f.properties['oneway'] ?? 0)
        c = { key, osmWayId: wayId, merged, roadClass: cls + (f.properties['ramp'] ? '_link' : ''), oneway: Number.isFinite(oneway) ? oneway : 0, lines: [] }
        byKey.set(key, c)
      }
      c.lines.push(...inBox)
    }
  }

  let next = 0
  let done = 0
  let failed = 0
  const worker = async () => {
    while (next < tiles.length) {
      const t = tiles[next++]!
      try {
        const buf = await fetchTile(template, t, signal)
        if (buf) decode(buf, t)
      } catch (err) {
        if (signal?.aborted) throw err
        failed++
      }
      onStatus?.(`Reading road tiles ${++done}/${tiles.length}…`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, worker))
  if (tiles.length && failed === tiles.length) throw new Error('No road tile could be loaded from the tile server.')
  for (const c of byKey.values()) if (c.osmWayId && refs.has(c.osmWayId)) c.ref = refs.get(c.osmWayId)
  return { candidates: [...byKey.values()], tiles: tiles.length, failed, truncated }
}

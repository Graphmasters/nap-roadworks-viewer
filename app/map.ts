// MapLibre map with the shared basemap-world-openfreemap style. Draws the DATEX II records,
// lets the user pick OSM roads (tile feature id → OSM way) and collects road candidates for
// matching.

import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { decodeTileFeatureId, type OsmWay } from '@graphmasters/osm-lanes'
import type { Feature, FeatureCollection } from 'geojson'
import type { LonLat, MatchCandidate, MatchResult, RecordPassability, RoadEvent } from '../src/index'

export const STYLE_BASE = 'https://graphmasters.github.io/basemap-world-openfreemap'
export const STYLE_URL = `${STYLE_BASE}/style.json`
/** Below this zoom most tile features are merged from several ways. */
export const MIN_SELECT_ZOOM = 14

const ROAD_CLASSES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'minor',
  'service',
  'track',
  'busway',
  'raceway',
  'motorway_construction',
  'trunk_construction',
  'primary_construction',
  'secondary_construction',
  'tertiary_construction',
  'minor_construction',
  'service_construction',
])

export const TYPE_COLORS: Record<RoadEvent['type'], string> = {
  fullClosure: '#c8102e',
  partialClosure: '#e8740c',
  roadworks: '#7b4fc9',
  unknown: '#6b7280',
}

export type MapMode = 'records' | 'osm'

export interface MapHandlers {
  onSelectEvent(index: number | null): void
  onSelectWay(wayId: string): void
  /** A road was clicked whose tile feature merges several ways. */
  onSelectNear(lonLat: LonLat): void
  onZoomHint(text: string | null): void
}

const EVENTS = 'nrv-events'
const SEL: maplibregl.ExpressionSpecification = ['boolean', ['feature-state', 'selected'], false]
const WAY = 'nrv-way'
const CANDIDATES = 'nrv-candidates'

export class RoadworksMap {
  readonly map: maplibregl.Map
  private roadLayers: string[] = []
  private nameLayers: string[] = []
  private mode: MapMode = 'records'
  private selected: number | null = null
  private ready: Promise<void>
  private events: RoadEvent[] = []

  constructor(container: HTMLElement, private handlers: MapHandlers) {
    this.map = new maplibregl.Map({
      container,
      style: STYLE_URL,
      center: [9, 51.5],
      zoom: 4.5,
      hash: 'map',
      attributionControl: {
        compact: true,
        customAttribution: [
          `<a href="${STYLE_BASE}/attribution.html" target="_blank" rel="noopener noreferrer">Map style: basemap.world / BKG (CC BY 4.0), adapted by Graphmasters</a>`,
          '<a href="https://www.graphmasters.net/imprint" target="_blank" rel="noopener noreferrer">Impressum</a>',
        ],
      },
    })
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    this.map.addControl(new maplibregl.ScaleControl({}), 'bottom-left')
    this.ready = new Promise((resolve) => this.map.once('load', () => resolve()))
    this.map.once('load', () => this.setup())
    this.map.on('click', (e) => this.onClick(e.point))
    this.map.on('mousemove', (e) => this.onMove(e.point))
    this.map.on('zoomend', () => this.updateHint())
  }

  private setup() {
    const style = this.map.getStyle()
    const transport = style.layers.filter((l) => l.type === 'line' && 'source-layer' in l && l['source-layer'] === 'transportation')
    this.roadLayers = transport.map((l) => l.id)
    this.nameLayers = style.layers.filter((l) => 'source-layer' in l && l['source-layer'] === 'transportation_name').map((l) => l.id)

    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
    this.map.addSource(WAY, { type: 'geojson', data: empty })
    this.map.addSource(CANDIDATES, { type: 'geojson', data: empty })
    this.map.addSource(EVENTS, { type: 'geojson', data: empty, promoteId: 'i' })

    this.map.addLayer({
      id: `${CANDIDATES}-line`,
      type: 'line',
      source: CANDIDATES,
      paint: {
        'line-color': ['case', ['get', 'chosen'], '#0a9d58', '#8a94a0'],
        'line-width': ['case', ['get', 'chosen'], 9, 6],
        'line-opacity': ['case', ['get', 'chosen'], 0.55, 0.45],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    this.map.addLayer({
      id: `${EVENTS}-casing`,
      type: 'line',
      source: EVENTS,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3, 12, 6, 17, 12],
        'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0.8],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    this.map.addLayer({
      id: `${EVENTS}-line`,
      type: 'line',
      source: EVENTS,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ['match', ['get', 't'], 'fullClosure', TYPE_COLORS.fullClosure, 'partialClosure', TYPE_COLORS.partialClosure, 'roadworks', TYPE_COLORS.roadworks, TYPE_COLORS.unknown],
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['case', SEL, 4, 1.5], 12, ['case', SEL, 7, 3.5], 17, ['case', SEL, 12, 7]],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    // Conflicting passability: dashed overlay so the record does not look like a plain closure.
    this.map.addLayer({
      id: `${EVENTS}-conflict`,
      type: 'line',
      source: EVENTS,
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'p'], 'conflicting']],
      paint: { 'line-color': '#111827', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 12, 3, 17, 5], 'line-dasharray': [1, 1.5] },
    })
    this.map.addLayer({
      id: `${EVENTS}-point`,
      type: 'circle',
      source: EVENTS,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', SEL, 7, 3], 14, ['case', SEL, 10, 6]],
        'circle-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': ['match', ['get', 't'], 'fullClosure', TYPE_COLORS.fullClosure, 'partialClosure', TYPE_COLORS.partialClosure, 'roadworks', TYPE_COLORS.roadworks, TYPE_COLORS.unknown],
      },
    })
    this.map.addLayer({
      id: `${WAY}-casing`,
      type: 'line',
      source: WAY,
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 8, 18, 18] },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    this.map.addLayer({
      id: WAY,
      type: 'line',
      source: WAY,
      paint: { 'line-color': '#1a73e8', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 10] },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    this.updateHint()
  }

  whenReady(): Promise<void> {
    return this.ready
  }

  setMode(mode: MapMode) {
    this.mode = mode
    this.updateHint()
  }

  private updateHint() {
    if (this.mode === 'osm')
      this.handlers.onZoomHint(this.map.getZoom() < MIN_SELECT_ZOOM ? `Zoom in to level ${MIN_SELECT_ZOOM} or more to select an OSM road.` : 'Click a road to look it up in OpenStreetMap.')
    else this.handlers.onZoomHint(null)
  }

  /** Draws the given events. `visible` limits which ones are drawn (indices into `events`). */
  async setEvents(events: RoadEvent[], passability: Record<string, RecordPassability>, visible?: Set<number>) {
    await this.ready
    this.events = events
    const features: Feature[] = []
    events.forEach((e, i) => {
      if (!e.geometry || (visible && !visible.has(i))) return
      const props = { i, t: e.type, p: passability[e.id]?.classification ?? 'unknown' }
      const g = e.geometry
      // Split multi-geometries so that the geometry-type filters apply.
      if (g.type === 'MultiLineString') for (const c of g.coordinates) features.push({ type: 'Feature', id: i, properties: props, geometry: { type: 'LineString', coordinates: c } })
      else if (g.type === 'MultiPoint') for (const c of g.coordinates) features.push({ type: 'Feature', id: i, properties: props, geometry: { type: 'Point', coordinates: c } })
      else features.push({ type: 'Feature', id: i, properties: props, geometry: g })
    })
    ;(this.map.getSource(EVENTS) as GeoJSONSource).setData({ type: 'FeatureCollection', features })
    if (this.selected !== null) this.map.setFeatureState({ source: EVENTS, id: this.selected }, { selected: true })
  }

  fitEvents(events: RoadEvent[]) {
    const b = new maplibregl.LngLatBounds()
    let n = 0
    for (const e of events) {
      for (const c of coordsOf(e)) {
        b.extend(c as [number, number])
        n++
      }
    }
    if (n) this.map.fitBounds(b, { padding: 40, maxZoom: 15, duration: 0 })
  }

  select(index: number | null, fit: boolean) {
    if (this.selected !== null && this.map.getSource(EVENTS)) this.map.setFeatureState({ source: EVENTS, id: this.selected }, { selected: false })
    this.selected = index
    if (index === null) return
    if (this.map.getSource(EVENTS)) this.map.setFeatureState({ source: EVENTS, id: index }, { selected: true })
    const e = this.events[index]
    if (fit && e) {
      const coords = coordsOf(e)
      if (coords.length) {
        const b = new maplibregl.LngLatBounds()
        for (const c of coords) b.extend(c as [number, number])
        this.map.fitBounds(b, { padding: 80, maxZoom: 16, duration: 300 })
      }
    }
  }

  showWay(way: OsmWay | null) {
    const src = this.map.getSource(WAY) as GeoJSONSource | undefined
    const coords = (way?.geometry ?? []).map((p) => [p.lon, p.lat])
    src?.setData({
      type: 'FeatureCollection',
      features: coords.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] : [],
    })
  }

  showCandidates(match: MatchResult | null) {
    const src = this.map.getSource(CANDIDATES) as GeoJSONSource | undefined
    if (!src) return
    const chosen = new Set(match?.sequence.map((s) => s.candidate.key) ?? [])
    const features: Feature[] = []
    for (const r of match?.ranked.slice(0, 12) ?? [])
      for (const l of r.candidate.lines)
        features.push({ type: 'Feature', properties: { key: r.candidate.key, chosen: chosen.has(r.candidate.key) }, geometry: { type: 'LineString', coordinates: l } })
    src.setData({ type: 'FeatureCollection', features })
  }

  private roadAt(point: maplibregl.PointLike): MapGeoJSONFeature | undefined {
    if (!this.roadLayers.length) return undefined
    const p = maplibregl.Point.convert(point)
    return this.map
      .queryRenderedFeatures([[p.x - 4, p.y - 4], [p.x + 4, p.y + 4]], { layers: this.roadLayers })
      .filter((f) => ROAD_CLASSES.has(String(f.properties['class'])) && decodeTileFeatureId(f.id).kind !== 'invalid')
      .sort((a, b) => Number(isSingleWay(b.id)) - Number(isSingleWay(a.id)))[0]
  }

  private eventAt(point: maplibregl.PointLike): number | null {
    const layers = [`${EVENTS}-line`, `${EVENTS}-point`].filter((l) => this.map.getLayer(l))
    if (!layers.length) return null
    const p = maplibregl.Point.convert(point)
    const hits = this.map.queryRenderedFeatures([[p.x - 5, p.y - 5], [p.x + 5, p.y + 5]], { layers })
    if (!hits.length) return null
    // Cycle through overlapping records on repeated clicks.
    const ids = [...new Set(hits.map((f) => Number(f.id)))]
    const at = this.selected === null ? -1 : ids.indexOf(this.selected)
    return ids[(at + 1) % ids.length]!
  }

  private onMove(point: maplibregl.Point) {
    const canvas = this.map.getCanvas()
    if (this.mode === 'osm') canvas.style.cursor = this.map.getZoom() >= MIN_SELECT_ZOOM && this.roadAt(point) ? 'pointer' : ''
    else canvas.style.cursor = this.eventAt(point) !== null ? 'pointer' : ''
  }

  private onClick(point: maplibregl.Point) {
    if (this.mode === 'osm') {
      if (this.map.getZoom() < MIN_SELECT_ZOOM) return this.updateHint()
      const f = this.roadAt(point)
      const d = f ? decodeTileFeatureId(f.id) : undefined
      if (d?.kind === 'element' && d.type === 'way') this.handlers.onSelectWay(d.id)
      // Merged tile feature: its id does not name the clicked way; look it up by location.
      else if (d?.kind === 'merged') this.handlers.onSelectNear(this.map.unproject(point).toArray() as LonLat)
      return
    }
    const i = this.eventAt(point)
    if (i !== null) this.handlers.onSelectEvent(i)
  }

  /**
   * Collects road features around the event line from the rendered vector tiles. Long lines are
   * visited viewport by viewport at zoom 15. Tile features merged from several ways keep a
   * `merged/…` key: their id only hints at the first merged way.
   */
  async collectCandidates(lines: LonLat[][], onStatus: (s: string) => void, signal: AbortSignal): Promise<{ candidates: MatchCandidate[]; viewports: number; truncated: boolean }> {
    await this.ready
    const all = lines.flat()
    const bounds = new maplibregl.LngLatBounds()
    for (const c of all) bounds.extend(c)
    const pad = 0.0006
    const box = { w: bounds.getWest() - pad, e: bounds.getEast() + pad, s: bounds.getSouth() - pad, n: bounds.getNorth() + pad }
    const before = { center: this.map.getCenter(), zoom: this.map.getZoom() }
    const cam = this.map.cameraForBounds(bounds, { padding: 60 })
    const centers: maplibregl.LngLat[] = []
    let zoom = 15
    if (cam && cam.zoom !== undefined && cam.zoom >= MIN_SELECT_ZOOM + 0.5) {
      centers.push(maplibregl.LngLat.convert(cam.center!))
      zoom = Math.min(cam.zoom, 17)
    } else {
      // Step along the line; one viewport at z15 covers roughly the container size in pixels.
      const canvas = this.map.getCanvas()
      const mPerPx = (156543.03 * Math.cos((bounds.getCenter().lat * Math.PI) / 180)) / 2 ** 15
      const step = Math.min(canvas.clientWidth, canvas.clientHeight) * mPerPx * 0.7
      for (const l of lines) {
        let acc = step
        for (let i = 0; i < l.length; i++) {
          if (i > 0) acc += distM(l[i - 1]!, l[i]!)
          if (acc >= step || i === l.length - 1) {
            centers.push(new maplibregl.LngLat(l[i]![0], l[i]![1]))
            acc = 0
          }
        }
      }
    }
    const MAX = 20
    const truncated = centers.length > MAX
    const visit = truncated ? centers.filter((_, i) => i % Math.ceil(centers.length / MAX) === 0) : centers
    const byKey = new Map<string, MatchCandidate>()
    const refs = new Map<string, string>()
    for (let k = 0; k < visit.length; k++) {
      if (signal.aborted) break
      onStatus(`Reading road features ${k + 1}/${visit.length}…`)
      this.map.jumpTo({ center: visit[k]!, zoom })
      await idle(this.map)
      for (const f of this.map.queryRenderedFeatures({ layers: this.nameLayers })) {
        const d = decodeTileFeatureId(f.id)
        const ref = f.properties['ref']
        if (d.kind === 'element' && ref) refs.set(d.id, String(ref))
      }
      for (const f of this.map.queryRenderedFeatures({ layers: this.roadLayers })) {
        const cls = String(f.properties['class'])
        if (!ROAD_CLASSES.has(cls)) continue
        const g = f.geometry
        const parts = g.type === 'LineString' ? [g.coordinates as LonLat[]] : g.type === 'MultiLineString' ? (g.coordinates as LonLat[][]) : []
        const inBox = parts.filter((p) => p.some(([x, y]) => x >= box.w && x <= box.e && y >= box.s && y <= box.n))
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
          byKey.set(key, (c = { key, osmWayId: wayId, merged, roadClass: cls + (f.properties['ramp'] ? '_link' : ''), oneway: Number.isFinite(oneway) ? oneway : 0, lines: [] }))
        }
        c.lines.push(...inBox)
      }
    }
    for (const c of byKey.values()) if (c.osmWayId && refs.has(c.osmWayId)) c.ref = refs.get(c.osmWayId)
    this.map.jumpTo(before)
    const b = new maplibregl.LngLatBounds()
    for (const c of all) b.extend(c)
    this.map.fitBounds(b, { padding: 80, maxZoom: 17, duration: 0 })
    return { candidates: [...byKey.values()], viewports: visit.length, truncated }
  }
}

function isSingleWay(id: MapGeoJSONFeature['id']): boolean {
  const d = decodeTileFeatureId(id)
  return d.kind === 'element' && d.type === 'way'
}

function coordsOf(e: RoadEvent): number[][] {
  const g = e.geometry
  if (!g) return []
  if (g.type === 'Point') return [g.coordinates]
  if (g.type === 'LineString' || g.type === 'MultiPoint') return g.coordinates
  if (g.type === 'MultiLineString') return g.coordinates.flat()
  return []
}

function distM(a: LonLat, b: LonLat): number {
  const kx = Math.cos((a[1] * Math.PI) / 180) * 111_320
  return Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110_540)
}

function idle(map: maplibregl.Map): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 8000)
    map.once('idle', () => {
      clearTimeout(t)
      resolve()
    })
  })
}

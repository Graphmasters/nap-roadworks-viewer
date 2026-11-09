// MapLibre map with the shared basemap-world-openfreemap style. Draws the DATEX II records,
// lets the user pick OSM roads (tile feature id → OSM way) and collects road candidates for
// matching.

import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { decodeTileFeatureId, type OsmWay } from 'osm-lanes'
import type { Feature, FeatureCollection } from 'geojson'
import { linesOf, type LonLat, type MatchResult, type RecordPassability, type RoadEvent } from '../src/index'
import { readRoadCandidates, type TileRead } from './tiles'

// MapLibre 6 resolves its worker file at runtime, which bundlers cannot follow; hand it the
// worker URL that Vite emits instead.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

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

const DIRECTION_ICON = 'nrv-way-direction'
const RECORD_DIRECTION_ICON = (type: RoadEvent['type']) => `nrv-record-direction-${type}`

/**
 * A chevron pointing right (+x), drawn on a canvas so the style needs no sprite. Symbols placed
 * along a line turn +x into the line direction, so the chevrons follow the line's vertex order.
 * Same design as the osm-lanes demo: dark blue for the way highlight, the record type colour for
 * the selected record.
 */
function directionIcon(color = '#0b3d91'): ImageData {
  const px = 48
  const ctx = document.createElement('canvas').getContext('2d')!
  ctx.canvas.width = ctx.canvas.height = px
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const chevron = () => {
    ctx.beginPath()
    ctx.moveTo(px * 0.32, px * 0.18)
    ctx.lineTo(px * 0.68, px * 0.5)
    ctx.lineTo(px * 0.32, px * 0.82)
    ctx.stroke()
  }
  ctx.strokeStyle = color
  ctx.lineWidth = px * 0.26
  chevron()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = px * 0.14
  chevron()
  return ctx.getImageData(0, 0, px, px)
}

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
/** The selected record's lines, for its direction chevrons (layout filters cannot read feature-state). */
const SELECTED = 'nrv-selected'

const DIRECTION_LAYOUT = {
  'symbol-placement': 'line',
  'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 10, 50, 14, 70, 18, 140],
  'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 0.7, 18, 1.3],
  'icon-rotation-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
} satisfies maplibregl.SymbolLayerSpecification['layout']

export class RoadworksMap {
  readonly map: maplibregl.Map
  private roadLayers: string[] = []
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

    const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
    this.map.addSource(WAY, { type: 'geojson', data: empty })
    this.map.addSource(CANDIDATES, { type: 'geojson', data: empty })
    this.map.addSource(EVENTS, { type: 'geojson', data: empty, promoteId: 'i' })
    this.map.addSource(SELECTED, { type: 'geojson', data: empty })

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
    // Chevrons along the selected record show the direction of its line (vertex order).
    for (const type of Object.keys(TYPE_COLORS) as RoadEvent['type'][])
      if (!this.map.hasImage(RECORD_DIRECTION_ICON(type))) this.map.addImage(RECORD_DIRECTION_ICON(type), directionIcon(TYPE_COLORS[type]), { pixelRatio: 2 })
    this.map.addLayer({
      id: `${SELECTED}-direction`,
      type: 'symbol',
      source: SELECTED,
      layout: {
        ...DIRECTION_LAYOUT,
        'icon-image': ['match', ['get', 't'], 'fullClosure', RECORD_DIRECTION_ICON('fullClosure'), 'partialClosure', RECORD_DIRECTION_ICON('partialClosure'), 'roadworks', RECORD_DIRECTION_ICON('roadworks'), RECORD_DIRECTION_ICON('unknown')],
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
    // Chevrons along the selected way show the direction it is drawn in: "up" in the osm-lanes
    // graphic, and the direction the compass rose in the Lanes and OSM tabs points to. That is the
    // way's node order, or the reverse: the travel direction of a oneway=-1 way, or the record's
    // direction on a two-way road that the record runs against.
    if (!this.map.hasImage(DIRECTION_ICON)) this.map.addImage(DIRECTION_ICON, directionIcon(), { pixelRatio: 2 })
    this.map.addLayer({
      id: `${WAY}-direction`,
      type: 'symbol',
      source: WAY,
      layout: { ...DIRECTION_LAYOUT, 'icon-image': DIRECTION_ICON },
    })
    // The record chevrons go on top: the matched way usually covers the record line.
    this.map.moveLayer(`${SELECTED}-direction`)
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
    this.showSelectedLine()
  }

  /** The selected record's line(s), for its direction chevrons. */
  private showSelectedLine() {
    const e = this.selected === null ? undefined : this.events[this.selected]
    ;(this.map.getSource(SELECTED) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: linesOf(e?.geometry).map((l) => ({ type: 'Feature', properties: { t: e!.type }, geometry: { type: 'LineString', coordinates: l } })),
    })
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
    this.showSelectedLine()
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

  /** Highlights a way; `reversed` draws it (and its chevrons) against its node order. */
  showWay(way: OsmWay | null, reversed = false) {
    const src = this.map.getSource(WAY) as GeoJSONSource | undefined
    const coords = (way?.geometry ?? []).map((p) => [p.lon, p.lat])
    if (reversed) coords.reverse()
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
  /**
   * Road candidates near the record, read from the z14 vector tiles of the road source. The
   * visible map does not move.
   */
  async collectCandidates(lines: LonLat[][], onStatus: (s: string) => void, signal: AbortSignal): Promise<TileRead> {
    await this.ready
    const template = this.roadTileTemplate()
    if (!template) throw new Error('The map style has no vector tile source for roads.')
    return readRoadCandidates(lines, template, { roadClasses: ROAD_CLASSES, signal, onStatus })
  }

  /** Tile URL template of the source behind the `transportation` layers (resolved from its TileJSON). */
  private roadTileTemplate(): string | undefined {
    const layer = this.roadLayers.map((id) => this.map.getLayer(id)).find(Boolean)
    const source = layer && 'source' in layer ? this.map.getSource(String(layer.source)) : undefined
    const tiles = (source as { tiles?: string[] } | undefined)?.tiles
    return tiles?.[0]
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


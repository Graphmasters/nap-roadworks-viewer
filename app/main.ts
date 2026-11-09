import { fetchWayFromOsmApi, type OsmWay } from 'osm-lanes'
import { linesOf, matchEventRefined, runChecks, type AnalysisResult, type AxisOrder, type Finding } from '../src/index'
import { formatBytes } from './dom'
import { fetchHighwaysInBbox, fetchHighwaysNear, nearestWay } from './osm'
import { renderInspector, type InspectorState, type Tab } from './inspector'
import { RoadworksMap } from './map'
import { RecordList } from './records'
import { renderReport, type XsdState } from './report'
import type { WorkerRequest, WorkerResponse } from './worker'
import { validateWithXsd, XSD_MAX_BYTES } from './xsd'
import './style.css'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const fileInput = $<HTMLInputElement>('file')
const progress = $('progress')
const progressBar = $('progress-bar')
const progressText = $('progress-text')
const reportEl = $('report')
const inspectorEl = $('inspector')
const hint = $('hint')
const intro = $('intro')
const modeRecords = $<HTMLButtonElement>('mode-records')
const modeOsm = $<HTMLButtonElement>('mode-osm')

let result: AnalysisResult | null = null
let file: File | null = null
let axisOverride: AxisOrder | undefined
let profileOverride: string | undefined
let xsd: XsdState = { status: 'none' }
let idIndex = new Map<string, number>()
let visible: Set<number> | undefined

const state: InspectorState = { result: null, index: null, tab: 'record', xml: { status: 'idle' }, way: { status: 'idle' }, match: { status: 'idle' } }

// ---------------------------------------------------------------------------------------- worker
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
let nextRequest = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const m = ev.data
  if (m.type === 'progress') {
    const pct = m.totalBytes ? Math.min(100, (m.bytesRead / m.totalBytes) * 100) : 0
    progressBar.style.width = `${pct.toFixed(1)}%`
    progressText.textContent = `${formatBytes(m.bytesRead)} of ${formatBytes(m.totalBytes)} read · ${m.situations.toLocaleString('en')} situations · ${m.records.toLocaleString('en')} records`
  } else if (m.type === 'result') onResult(m.result)
  else if (m.type === 'extracted') pending.get(m.requestId)?.resolve(m.text)
  else if (m.type === 'decompressed') pending.get(m.requestId)?.resolve(m.bytes)
  else if (m.type === 'error') {
    for (const p of pending.values()) p.reject(new Error(m.message))
    pending.clear()
    if (!result) {
      progress.hidden = false
      progressText.textContent = `Could not read the file: ${m.message}`
    }
  }
}

type Request = WorkerRequest extends infer R ? (R extends { requestId: number } ? Omit<R, 'requestId'> : never) : never

function request<T>(msg: Request): Promise<T> {
  const requestId = nextRequest++
  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject })
    worker.postMessage({ ...msg, requestId } as WorkerRequest)
  }).finally(() => pending.delete(requestId))
}

// ------------------------------------------------------------------------------------------- map
const roadMap = new RoadworksMap($('map'), {
  onSelectEvent: (i) => select(i, false),
  onSelectWay: (id) => void loadWay(id, true),
  onSelectNear: (ll) => void loadWayNear(ll),
  onZoomHint: (text) => {
    hint.hidden = !text
    hint.textContent = text ?? ''
  },
})

function setMode(mode: 'records' | 'osm') {
  roadMap.setMode(mode)
  modeRecords.classList.toggle('active', mode === 'records')
  modeOsm.classList.toggle('active', mode === 'osm')
  modeRecords.setAttribute('aria-pressed', String(mode === 'records'))
  modeOsm.setAttribute('aria-pressed', String(mode === 'osm'))
}
modeRecords.onclick = () => setMode('records')
modeOsm.onclick = () => setMode('osm')

// --------------------------------------------------------------------------------------- records
const records = new RecordList(
  $('records'),
  (i) => select(i, true),
  (v) => {
    visible = v
    if (result) void roadMap.setEvents(result.events, result.recordPassability, v)
  },
)

// ------------------------------------------------------------------------------------------ load
function loadFile(f: File) {
  file = f
  axisOverride = undefined
  profileOverride = undefined
  analyse()
}

function analyse() {
  if (!file) return
  result = null
  xsd = { status: 'none' }
  Object.assign(state, { result: null, index: null, xml: { status: 'idle' }, match: { status: 'idle' } })
  intro.hidden = true
  progress.hidden = false
  progressBar.style.width = '0%'
  progressText.textContent = `Reading ${file.name}…`
  reportEl.replaceChildren()
  records.setResult(null)
  roadMap.showCandidates(null)
  render()
  worker.postMessage({ type: 'analyse', file, fileName: file.name, axisOrder: axisOverride, profileId: profileOverride } satisfies WorkerRequest)
}

function onResult(r: AnalysisResult) {
  result = r
  idIndex = new Map(r.events.map((e, i) => [e.id, i]))
  progress.hidden = true
  state.result = r
  renderReportPanel()
  records.setResult(r)
  void roadMap.setEvents(r.events, r.recordPassability, visible).then(() => roadMap.fitEvents(r.events))
  document.title = `${r.fileName ?? 'DATEX II'} · NAP Roadworks Viewer`
  render()
}

function renderReportPanel() {
  if (!result) return
  renderReport(reportEl, result, xsd, {
    onProfile: (id) => {
      profileOverride = id
      runChecks(result!, id)
      records.refresh()
      renderReportPanel()
      render()
    },
    onAxisOrder: (o) => {
      axisOverride = o === 'auto' ? undefined : o
      const keep = profileOverride
      analyse()
      profileOverride = keep
    },
    onXsd: (files, main) => void runXsd(files, main),
    onFinding: (f: Finding) => {
      const id = f.recordIds?.[0]
      const i = id !== undefined ? idIndex.get(id) : result?.events.findIndex((e) => e.situationId === f.situationId)
      if (i !== undefined && i >= 0) {
        state.tab = f.layer === 'passability' ? 'situation' : f.layer === 'lanes' ? 'lanes' : 'record'
        select(i, true)
      }
    },
  })
}

async function runXsd(files: File[], main: string) {
  if (!file) return
  xsd = { status: 'running' }
  renderReportPanel()
  try {
    const bytes = await request<Uint8Array>({ type: 'decompress' })
    if (bytes.length > XSD_MAX_BYTES) throw new Error(`The document is ${formatBytes(bytes.length)}; XSD validation in the browser is limited to ${formatBytes(XSD_MAX_BYTES)}.`)
    xsd = { status: 'done', outcome: await validateWithXsd(bytes, files, main) }
  } catch (e) {
    xsd = { status: 'error', message: (e as Error).message }
  }
  renderReportPanel()
}

// ------------------------------------------------------------------------------------- selection
function select(i: number | null, fromList: boolean) {
  matchAbort?.abort()
  state.index = i
  state.xml = { status: 'idle' }
  state.match = { status: 'idle' }
  state.overpass = undefined
  state.confirmedKey = undefined
  roadMap.showCandidates(null)
  roadMap.select(i, fromList)
  records.select(i, true)
  if (state.tab === 'xml') void loadXml('record')
  render()
}

function render() {
  renderInspector(inspectorEl, state, {
    setTab: (t: Tab) => {
      state.tab = t
      if (t === 'xml' && state.xml.status === 'idle') void loadXml('record')
      render()
    },
    loadXml: (w) => void loadXml(w),
    runMatch: () => void runMatch(),
    chooseCandidate: (key, wayId) => {
      state.confirmedKey = key
      if (wayId) void loadWay(wayId, false)
      else {
        const c = state.match.status === 'done' ? state.match.value.ranked.find((r) => r.candidate.key === key)?.candidate : undefined
        const mid = c && midpoint(c.lines)
        if (mid) void loadWayNear(mid, false)
      }
      render()
    },
    selectRecord: (id) => {
      const i = idIndex.get(id)
      if (i !== undefined) select(i, true)
    },
  })
}

async function loadXml(which: 'record' | 'situation') {
  const e = result && state.index !== null ? result.events[state.index] : undefined
  if (!e) return
  const span = which === 'record' ? e.span : e.situationSpan
  const index = state.index
  state.xml = { status: 'loading' }
  render()
  try {
    const text = await request<string>({ type: 'extract', start: span.start, end: span.end })
    if (state.index !== index) return
    state.xml = { status: 'done', value: { which, text } }
  } catch (err) {
    state.xml = { status: 'error', message: (err as Error).message }
  }
  render()
}

// ------------------------------------------------------------------------------------------- OSM
const wayCache = new Map<string, OsmWay>()
let wayAbort: AbortController | undefined

async function loadWay(id: string, showTab: boolean) {
  wayAbort?.abort()
  const ac = (wayAbort = new AbortController())
  state.way = { status: 'loading', id }
  if (showTab) state.tab = state.index !== null && state.tab === 'lanes' ? 'lanes' : 'osm'
  render()
  try {
    let way = wayCache.get(id)
    if (!way) {
      way = await fetchWayFromOsmApi(id, { signal: ac.signal })
      wayCache.set(id, way)
    }
    if (ac.signal.aborted) return
    state.way = { status: 'done', value: way, id }
    roadMap.showWay(way)
  } catch (err) {
    if (ac.signal.aborted) return
    state.way = { status: 'error', message: (err as Error).message, id }
    roadMap.showWay(null)
  }
  render()
}

/** A vertex in the middle of the longest line. */
function midpoint(lines: Array<Array<[number, number]>>): [number, number] | undefined {
  const l = [...lines].sort((a, b) => b.length - a.length)[0]
  return l?.[Math.floor(l.length / 2)]
}

async function loadWayNear([lon, lat]: [number, number], showTab = true) {
  wayAbort?.abort()
  const ac = (wayAbort = new AbortController())
  state.way = { status: 'loading' }
  if (showTab) state.tab = state.tab === 'lanes' ? 'lanes' : 'osm'
  render()
  try {
    const near = nearestWay(await fetchHighwaysNear(lon, lat, 25, ac.signal), lon, lat)
    if (ac.signal.aborted) return
    if (!near || near.distanceM > 25) throw new Error('No OSM road within 25 m of the click.')
    wayCache.set(near.way.id, near.way)
    state.way = { status: 'done', value: near.way, id: near.way.id }
    roadMap.showWay(near.way)
  } catch (err) {
    if (ac.signal.aborted) return
    state.way = { status: 'error', message: (err as Error).message }
    roadMap.showWay(null)
  }
  render()
}

// -------------------------------------------------------------------------------------- matching
let matchAbort: AbortController | undefined

async function runMatch() {
  const e = result && state.index !== null ? result.events[state.index] : undefined
  if (!e) return
  const lines = linesOf(e.geometry)
  if (!lines.length) return
  matchAbort?.abort()
  const ac = (matchAbort = new AbortController())
  state.match = { status: 'loading', note: 'Reading road tiles…' }
  render()
  try {
    const { candidates, tiles, failed, truncated } = await roadMap.collectCandidates(
      lines,
      (note) => {
        if (ac.signal.aborted) return
        state.match = { status: 'loading', note }
        render()
      },
      ac.signal,
    )
    if (ac.signal.aborted) return
    const m = await matchEventRefined(lines, candidates, (bbox, highways) =>
        fetchHighwaysInBbox(bbox, highways, {
          signal: ac.signal,
          onStatus: (text) => {
            if (ac.signal.aborted) return
            state.overpass = text
            render()
          },
        }),
      {
        roadNumber: e.roadNumber,
        onFetch: (r) => {
          if (ac.signal.aborted) return
          state.overpass = `Fetching the OSM ways (highway=${r.highways.join('|')}) of merged tile feature ${r.key} from Overpass…`
          render()
        },
      },
    )
    state.overpass = undefined
    if (ac.signal.aborted) return
    state.match = { status: 'done', value: { ...m, tiles, failedTiles: failed, truncated } }
    roadMap.showCandidates(m)
    const first = m.sequence[0]
    if (m.status !== 'none' && first) {
      state.confirmedKey = first.candidate.key
      const mid = midpoint(first.candidate.lines)
      if (first.candidate.osmWayId) void loadWay(first.candidate.osmWayId, false)
      else if (mid) void loadWayNear(mid, false)
    }
  } catch (err) {
    if (!ac.signal.aborted) {
      state.overpass = undefined
      state.match = { status: 'error', message: (err as Error).message }
    }
  }
  render()
}

// ------------------------------------------------------------------------------------ file input
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0]
  if (f) loadFile(f)
  fileInput.value = ''
})
$('pick').addEventListener('click', () => fileInput.click())
$('intro-pick').addEventListener('click', () => fileInput.click())

let dragDepth = 0
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return
  e.preventDefault()
  dragDepth++
  document.body.classList.add('dragging')
})
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
})
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) document.body.classList.remove('dragging')
})
window.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  document.body.classList.remove('dragging')
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f)
})

// Small screens: switch between the three panes.
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-view]'))
  btn.addEventListener('click', () => {
    document.body.dataset['view'] = btn.dataset['view']
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.classList.toggle('active', b === btn)
    if (btn.dataset['view'] === 'map') roadMap.map.resize()
  })

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.index !== null && !(e.target instanceof HTMLInputElement)) select(null, false)
})

setMode('records')
render()

// Development-only handle for debugging in the browser console.
if (import.meta.env.DEV) Object.assign(window, { __nrv: { roadMap, state, records } })

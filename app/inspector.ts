// Right panel: context-sensitive inspector with tabs for the record, its XML, lanes, the
// situation (passability), the selected OSM way and matching.

import { renderLanesElement, wikiUrlForKey, type OsmWay } from '@graphmasters/osm-lanes'
import { getLaneStatusLegend, renderLaneStatusElement } from 'lane-status-viewer'
import { compareLanes, osmLaneAttributes, WEIGHTS, type AnalysisResult, type MatchResult, type RoadEvent } from '../src/index'
import { append, badge, clear, dl, formatTime, h, link } from './dom'
import { PASS_LABEL, TYPE_LABEL } from './records'

export type Tab = 'record' | 'xml' | 'lanes' | 'situation' | 'osm' | 'match'

export type Loadable<T> = { status: 'idle' } | { status: 'loading'; note?: string } | { status: 'done'; value: T } | { status: 'error'; message: string }

export interface InspectorState {
  result: AnalysisResult | null
  index: number | null
  tab: Tab
  xml: Loadable<{ which: 'record' | 'situation'; text: string }>
  way: Loadable<OsmWay> & { id?: string }
  match: Loadable<MatchResult & { viewports: number; truncated: boolean }>
  /** Candidate key confirmed by the user (manual override). */
  confirmedKey?: string
}

export interface InspectorCallbacks {
  setTab(tab: Tab): void
  loadXml(which: 'record' | 'situation'): void
  runMatch(): void
  chooseCandidate(key: string, wayId?: string): void
  selectRecord(id: string): void
}

const TABS: Array<[Tab, string]> = [
  ['record', 'Record'],
  ['xml', 'XML'],
  ['lanes', 'Lanes'],
  ['situation', 'Situation'],
  ['match', 'Matching'],
  ['osm', 'OSM'],
]

const XML_DISPLAY_LIMIT = 400_000

export function renderInspector(el: HTMLElement, s: InspectorState, cb: InspectorCallbacks) {
  clear(el)
  const tabs = h('nav', { class: 'tabs', role: 'tablist' })
  for (const [id, label] of TABS)
    tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': s.tab === id ? 'true' : 'false', class: s.tab === id ? 'active' : '', onclick: () => cb.setTab(id) }, label))
  append(el, tabs)
  const body = h('div', { class: 'tab-body' })
  append(el, body)

  const e = s.result && s.index !== null ? s.result.events[s.index] : undefined
  if (s.tab === 'osm') return renderOsm(body, s, e)
  if (!s.result) {
    append(body, h('p', { class: 'muted' }, 'Load a DATEX II file to inspect its records.'))
    return
  }
  if (!e) {
    append(body, h('p', { class: 'muted' }, 'Select a record in the list or on the map.'))
    return
  }
  if (s.tab === 'record') renderRecord(body, s.result, e)
  else if (s.tab === 'xml') renderXml(body, s, cb)
  else if (s.tab === 'lanes') renderLanes(body, s, e)
  else if (s.tab === 'situation') renderSituation(body, s.result, e, cb)
  else if (s.tab === 'match') renderMatch(body, s, e, cb)
}

function prov(text: string) {
  return h('span', { class: 'prov' }, text)
}

function renderRecord(el: HTMLElement, r: AnalysisResult, e: RoadEvent) {
  const p = r.recordPassability[e.id]
  append(el, 
    h('h2', null, e.description ?? e.recordType ?? e.id),
    h('p', null, badge(TYPE_LABEL[e.type], `type-${e.type}`), ' ', p ? badge(PASS_LABEL[p.classification], `pass-${p.classification}`) : null),
    dl([
      ['Record id', [h('code', null, e.id), e.version ? ` v${e.version}` : '']],
      ['Situation', h('code', null, e.situationId)],
      ['Record type', [e.recordType, prov('DATEX II')]],
      ['Type', [TYPE_LABEL[e.type], prov(`derived from ${{ managementType: 'management type', laneStatus: 'lane status', recordType: 'record type', none: 'nothing' }[e.typeBasis]}`)]],
      ['Management', e.managementTypes.length ? [e.managementTypes.join(', '), prov('DATEX II')] : undefined],
      ['Compliance', e.complianceOption],
      ['Cause', [e.causeType, e.causeRecordIds.length ? ` → ${e.causeRecordIds.join(', ')}` : ''].join('') || undefined],
      ['Valid from', formatTime(e.validFrom)],
      ['Valid to', formatTime(e.validTo)],
      ['Validity', [e.validityStatus, e.hasPeriods ? ' · restricted periods' : ''].join('') || undefined],
      ['Road', [e.roadNumber, e.roadName].filter(Boolean).join(' · ') || undefined],
      ['Carriageway', e.carriageway],
      ['Direction', e.direction],
      ['Lanes', e.laneCodes.length ? e.laneCodes.map((c) => `${c.field}=${c.value}`).join(', ') : undefined],
      ['Lane impact', laneImpactText(e) || undefined],
      ['Location methods', e.locationMethods.join(', ') || 'none'],
      ['Geometry', [badge(e.geometryConfidence, `geo-${e.geometryConfidence}`), ' ', e.geometryNote ?? '']],
      ['XML path', h('code', { class: 'wrap' }, e.xmlPath)],
      ['Line', String(e.span.line)],
    ]),
  )
  if (e.comments.length) {
    const list = h('ul', { class: 'compact' })
    for (const c of e.comments) list.append(h('li', null, c.type ? h('span', { class: 'muted' }, `${c.type}: `) : null, c.text, c.lang ? h('span', { class: 'muted' }, ` [${c.lang}]`) : null))
    append(el, h('h3', null, 'Comments'), list)
  }
  if (p) append(el, h('h3', null, 'Passability'), h('ul', { class: 'compact' }, ...p.reasons.map((x) => h('li', null, x))), h('p', { class: 'muted' }, `Routing action: ${p.routingAction.replace(/_/g, ' ')}. An analysis hypothesis, not a legal statement.`))
  if (e.warnings.length) append(el, h('h3', null, 'Warnings'), h('ul', { class: 'compact' }, ...e.warnings.map((w) => h('li', null, w))))
}

function laneImpactText(e: RoadEvent): string {
  const li = e.laneImpact
  return [
    li.originalNumberOfLanes !== undefined ? `${li.originalNumberOfLanes} original` : '',
    li.numberOfLanesRestricted !== undefined ? `${li.numberOfLanesRestricted} restricted` : '',
    li.numberOfOperationalLanes !== undefined ? `${li.numberOfOperationalLanes} operational` : '',
    li.capacityRemaining !== undefined ? `capacity remaining ${li.capacityRemaining}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function renderXml(el: HTMLElement, s: InspectorState, cb: InspectorCallbacks) {
  const which = s.xml.status === 'done' ? s.xml.value.which : 'record'
  append(el, 
    h(
      'div',
      { class: 'row' },
      h('button', { type: 'button', class: which === 'record' ? 'active' : '', onclick: () => cb.loadXml('record') }, 'Record'),
      h('button', { type: 'button', class: which === 'situation' ? 'active' : '', onclick: () => cb.loadXml('situation') }, 'Whole situation'),
    ),
  )
  if (s.xml.status === 'loading') append(el, h('p', { class: 'muted' }, 'Reading the original XML from the file…'))
  else if (s.xml.status === 'error') append(el, h('p', { class: 'error' }, s.xml.message))
  else if (s.xml.status === 'done') {
    const t = s.xml.value.text
    append(el, 
      h('p', { class: 'muted' }, 'Original text from the file, unchanged.'),
      h('pre', { class: 'xml' }, t.length > XML_DISPLAY_LIMIT ? `${t.slice(0, XML_DISPLAY_LIMIT)}\n… (${(t.length - XML_DISPLAY_LIMIT).toLocaleString('en')} more characters)` : t),
    )
  }
}

function renderLanes(el: HTMLElement, s: InspectorState, e: RoadEvent) {
  append(el, h('h3', null, 'DATEX II'))
  if (!e.laneCodes.length) append(el, h('p', { class: 'muted' }, 'This record has no laneStatusCoded or extendedLaneStatusCoded.'))
  for (const c of e.laneCodes) {
    const svg = renderLaneStatusElement(c.value, { legend: false })
    const legend = getLaneStatusLegend(c.value)
    append(el, 
      h(
        'figure',
        { class: 'lane-fig' },
        svg ?? h('span', { class: 'muted' }, '(no lanes)'),
        h('figcaption', null, h('code', null, c.field), ' = ', h('code', null, c.value)),
        legend.length ? h('ul', { class: 'legend' }, ...legend.map((l) => h('li', null, h('code', null, l.char), ` ${l.label}`))) : null,
      ),
    )
  }
  const li = laneImpactText(e)
  if (li) append(el, h('p', null, 'Impact: ', li))

  append(el, h('h3', null, 'OpenStreetMap'))
  if (s.way.status !== 'done') {
    append(el, 
      h('p', { class: 'muted' }, s.way.status === 'loading' ? 'Loading OSM way…' : 'No OSM way selected. Run Matching, or switch to "Select OSM road" and click a road.'),
    )
    return
  }
  const way = s.way.value
  const osmSvg = renderLanesElement(way.tags, { showSigns: false })
  append(el, 
    h('p', null, link(`https://www.openstreetmap.org/way/${way.id}`, `way/${way.id}`), way.tags['ref'] ? ` · ${way.tags['ref']}` : '', way.tags['name'] ? ` · ${way.tags['name']}` : ''),
    osmSvg ? h('figure', { class: 'lane-fig' }, osmSvg, h('figcaption', null, 'Usual layout according to OSM (osm-lanes)')) : h('p', { class: 'muted' }, 'No lane diagram for this way.'),
  )
  const matched = s.match.status === 'done' ? s.match.value.ranked.find((r) => r.candidate.osmWayId === way.id || r.candidate.key === s.confirmedKey) : undefined
  const cmp = compareLanes(e, osmLaneAttributes('way', way.id, way.tags), matched?.score)
  append(el, 
    h('h3', null, 'Comparison'),
    dl([
      ['DATEX II', cmp.datex ? `${cmp.datex.drivingLanes} driving lane(s): ${cmp.datex.openLanes} open, ${cmp.datex.restrictedLanes} narrowed, ${cmp.datex.closedLanes} closed (${cmp.datex.field})` : 'no lane status'],
      ['OSM', `lanes=${cmp.osm.lanesTotal ?? '–'}, forward ${cmp.osm.interpretedForward}, backward ${cmp.osm.interpretedBackward}${cmp.osm.oneWay ? ', one-way' : ''}`],
      ['Assessment', h('strong', null, cmp.assessment)],
    ]),
    h('ul', { class: 'compact' }, ...cmp.indicators.map((i) => h('li', null, badge(i.severity, i.severity), ' ', i.message))),
    h('p', { class: 'muted' }, 'DATEX II describes the temporary situation, OSM the usual layout. A difference is a hint, not an error.'),
  )
}

function renderSituation(el: HTMLElement, r: AnalysisResult, e: RoadEvent, cb: InspectorCallbacks) {
  const sit = r.situations.find((x) => x.id === e.situationId)
  const recs = r.events.filter((x) => x.situationId === e.situationId)
  const all = r.passability.filter((p) => p.situationId === e.situationId)
  // Findings about the selected record first.
  const dq = [...all.filter((p) => p.recordIds.includes(e.id)), ...all.filter((p) => !p.recordIds.includes(e.id))]
  append(
    el,
    h('h2', null, `Situation ${e.situationId}`),
    h('p', null, sit?.severity ? `Severity ${sit.severity} · ` : '', `${recs.length} record(s)`, all.length ? [' · ', badge(`${all.length} conflict(s)`, 'pass-conflicting')] : ''),
  )
  // Records linked to the selected one: its causes and the records that name it as cause.
  const linked = new Set([e.id, ...e.causeRecordIds, ...recs.filter((x) => x.causeRecordIds.includes(e.id)).map((x) => x.id)])
  const row = (x: RoadEvent) => {
    const p = r.recordPassability[x.id]
    const lane = x.laneCodes.find((c) => c.field === 'extendedLaneStatusCoded') ?? x.laneCodes[0]
    return h(
      'li',
      { class: x.id === e.id ? 'current' : '' },
      h('button', { type: 'button', class: 'linkish', onclick: () => cb.selectRecord(x.id) }, x.id),
      ' ',
      h('span', { class: 'muted' }, x.recordType ?? ''),
      x.managementTypes.length ? ` · ${x.managementTypes.join(', ')}` : '',
      lane ? [' · ', h('code', null, lane.value)] : '',
      ' ',
      p ? badge(PASS_LABEL[p.classification], `pass-${p.classification}`) : null,
      x.causeRecordIds.length ? h('div', { class: 'muted' }, `└ cause record → ${x.causeRecordIds.join(', ')}`) : null,
    )
  }
  append(el, h('h3', null, 'Selected record and linked records'), h('ul', { class: 'records-tree' }, ...recs.filter((x) => linked.has(x.id)).map(row)))
  const dqBlock = (f: (typeof all)[number]) =>
    h(
      'div',
      { class: 'dq' },
      h('p', null, badge(f.severity, f.severity), ' ', h('strong', null, f.ruleId), ' ', f.message),
      h('ul', { class: 'compact' }, ...f.evidence.map((ev) => h('li', null, h('button', { type: 'button', class: 'linkish', onclick: () => cb.selectRecord(ev.recordId) }, ev.recordId), ': ', ev.interpretation, ev.rawValue ? [' ', h('code', null, ev.rawValue)] : '', ev.xmlPath ? h('div', { class: 'muted wrap' }, ev.xmlPath) : null))),
      h('p', null, h('strong', null, 'Routing: '), f.routingAction === 'manual_review' ? 'do not block the road automatically on this record; review manually.' : f.routingAction),
      h('details', null, h('summary', null, 'Assumptions'), h('ul', { class: 'compact' }, ...f.assumptions.map((a) => h('li', null, a)))),
    )
  const own = dq.filter((p) => p.recordIds.includes(e.id))
  const other = dq.filter((p) => !p.recordIds.includes(e.id))
  for (const f of own) append(el, dqBlock(f))
  if (other.length) append(el, h('details', null, h('summary', null, `Other conflicts in this situation (${other.length})`), ...other.slice(0, 50).map(dqBlock)))
  const rest = recs.filter((x) => !linked.has(x.id))
  if (rest.length) append(el, h('details', null, h('summary', null, `All other records in the situation (${rest.length})`), h('ul', { class: 'records-tree' }, ...rest.slice(0, 300).map(row))))
  if (!all.length) append(el, h('p', { class: 'muted' }, 'No passability conflicts in this situation.'))
  append(el, h('p', { class: 'muted' }, 'Passability is inferred from the published records. It is not a legal statement on whether the road may be used.'))
}

function renderMatch(el: HTMLElement, s: InspectorState, e: RoadEvent, cb: InspectorCallbacks) {
  const hasLine = e.geometry?.type === 'LineString' || e.geometry?.type === 'MultiLineString'
  append(el, 
    h('p', { class: 'muted' }, 'Matches the record line against OSM roads from the vector tiles: coverage within 25 m, distance, direction, road number and class. The score ranks candidates; it is not a probability.'),
    h('button', { type: 'button', disabled: !hasLine || s.match.status === 'loading', onclick: () => cb.runMatch() }, s.match.status === 'done' ? 'Match again' : 'Match to OSM'),
  )
  if (!hasLine) {
    append(el, h('p', null, 'Matching needs a line geometry. This record has ', e.geometryConfidence === 'none' ? 'none' : 'only points', '.'))
    return
  }
  if (s.match.status === 'loading') append(el, h('p', { class: 'muted' }, s.match.note ?? 'Matching…'))
  if (s.match.status === 'error') append(el, h('p', { class: 'error' }, s.match.message))
  if (s.match.status !== 'done') return
  const m = s.match.value
  const statusText = { matched: 'matched', ambiguous: 'ambiguous: no unambiguous match', none: 'no match' }[m.status]
  append(el, 
    h('p', null, badge(statusText, m.status === 'matched' ? 'ok' : m.status === 'ambiguous' ? 'warning' : 'error'), ` · confidence score ${m.confidence.toFixed(2)} · ${Math.round(m.coverage * 100)}% of the record explained · ${m.samples} samples · ${m.viewports} map view(s)`),
    m.truncated ? h('p', { class: 'warning' }, 'The record is long; only part of it was searched.') : null,
    h('ul', { class: 'compact' }, ...m.reasons.map((x) => h('li', null, x))),
  )
  const table = h('table', { class: 'cands' })
  table.append(h('tr', null, h('th', null, 'Candidate'), h('th', null, 'Score'), h('th', { title: `weight ${WEIGHTS.coverage}` }, 'Cov.'), h('th', { title: `weight ${WEIGHTS.distance}` }, 'Dist.'), h('th', { title: `weight ${WEIGHTS.bearing}` }, 'Dir.'), h('th', { title: `weight ${WEIGHTS.ref}` }, 'Ref'), h('th', null, '')))
  const seq = new Set(m.sequence.map((x) => x.candidate.key))
  for (const r of m.ranked.slice(0, 15)) {
    const c = r.candidate
    const pct = (v: number) => `${Math.round(v * 100)}`
    table.append(
      h(
        'tr',
        { class: seq.has(c.key) ? 'chosen' : '', title: r.reasons.join('\n') },
        h('td', null, c.osmWayId ? link(`https://www.openstreetmap.org/way/${c.osmWayId}`, c.key) : h('span', { class: 'muted' }, c.key), h('div', { class: 'muted' }, [c.roadClass, c.ref].filter(Boolean).join(' · '))),
        h('td', null, r.score.toFixed(2)),
        h('td', null, pct(r.components.coverage)),
        h('td', null, pct(r.components.distance)),
        h('td', null, pct(r.components.bearing)),
        h('td', null, r.components.ref === 0.5 ? '–' : pct(r.components.ref)),
        h('td', null, h('button', { type: 'button', class: s.confirmedKey === c.key ? 'active' : '', title: c.merged ? 'Merged tile feature: the way is looked up by location in the OSM API' : '', onclick: () => cb.chooseCandidate(c.key, c.osmWayId) }, s.confirmedKey === c.key ? 'selected' : 'use')),
      ),
    )
  }
  append(el, table, h('p', { class: 'muted' }, 'Green on the map: ways chosen to explain the record. "use" picks a way manually and loads its OSM tags for the lane comparison. merged/… candidates are tile features merged from several ways; their OSM way is looked up by location.'))
}

function renderOsm(el: HTMLElement, s: InspectorState, e: RoadEvent | undefined) {
  if (s.way.status === 'idle') {
    append(el, h('p', { class: 'muted' }, 'Switch the map to "Select OSM road", zoom in to level 14 or more and click a road. Only the way id is sent to the OSM API.'))
    return
  }
  if (s.way.status === 'loading') {
    append(el, h('p', { class: 'muted' }, `Loading way ${s.way.id ?? ''} from the OSM API…`))
    return
  }
  if (s.way.status === 'error') {
    append(el, h('p', { class: 'error' }, `Could not load way ${s.way.id ?? ''}: ${s.way.message}`), h('p', { class: 'muted' }, 'The rest of the viewer keeps working without the OSM API.'))
    return
  }
  const way = s.way.value
  const t = way.tags
  const svg = renderLanesElement(t)
  append(el, 
    h('h2', null, t['name'] || t['ref'] || `Way ${way.id}`),
    h('p', null, link(`https://www.openstreetmap.org/way/${way.id}`, `way/${way.id}`), way.version ? ` · version ${way.version}` : '', way.timestamp ? ` · edited ${formatTime(way.timestamp)}` : '', prov('OSM API')),
    h('p', { class: 'muted' }, 'Tags come from the live OSM API; the map tiles may be older.'),
    svg ? h('figure', { class: 'lane-fig' }, svg, h('figcaption', null, 'Lanes (osm-lanes)')) : null,
  )
  const rows = Object.keys(t)
    .sort()
    .map((k) => {
      const url = wikiUrlForKey(k)
      return h('tr', null, h('th', null, url ? link(url, k) : k), h('td', null, t[k]!))
    })
  append(el, h('table', { class: 'tags' }, ...rows))
  if (e) append(el, h('p', { class: 'muted' }, 'See the Lanes tab for the comparison with the selected record.'))
}

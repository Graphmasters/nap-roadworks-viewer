// Right panel: context-sensitive inspector with tabs for the record, its XML, lanes, the
// situation (passability), the selected OSM way and matching.

import { interpretLanes, renderCompassElement, renderDestinationSignElement, renderLanesElement, wayBearing, wikiUrlForKey, type OsmWay } from 'osm-lanes'
import { getLaneStatusLegend, renderLaneStatusElement } from 'lane-status-viewer'
import { compareLanes, describeOpenlr, laneCategoriesOf, linesOf, osmLaneAttributes, recordWayOrientation, validWgs84, WEIGHTS, type AnalysisResult, type OpenlrReference, type RefinedMatchResult, type RoadEvent } from '../src/index'
import { append, badge, clear, dl, formatTime, h, link, spinner, type Child } from './dom'
import { PASS_LABEL, TYPE_LABEL } from './records'
import { laneCategoryIcon } from './lane-icons'

export type Tab = 'record' | 'xml' | 'lanes' | 'situation' | 'osm' | 'match'

export type Loadable<T> = { status: 'idle' } | { status: 'loading'; note?: string } | { status: 'done'; value: T } | { status: 'error'; message: string }

export interface InspectorState {
  result: AnalysisResult | null
  index: number | null
  tab: Tab
  xml: Loadable<{ which: 'record' | 'situation'; text: string }>
  way: Loadable<OsmWay> & { id?: string }
  match: Loadable<RefinedMatchResult & { tiles: number; failedTiles: number; truncated: boolean }>
  /** Candidate key confirmed by the user (manual override). */
  confirmedKey?: string
  /** Set while an Overpass request for matching is pending: what is being looked up. */
  overpass?: string
  /** OSM ways loaded so far (OSM tab, matching), by way id. */
  ways?: ReadonlyMap<string, OsmWay>
  /** Direction of the selected record relative to the loaded way's node order (0: unknown). */
  orientation: 1 | -1 | 0
  /**
   * The loaded way is shown against its node order (map, lane diagram, destination sign, compass):
   * a one-way way is always shown in its travel direction (so `oneway=-1` is reversed), a two-way
   * way in the direction of the record when it runs against the node order.
   */
  wayReversed: boolean
}

/**
 * Whether to show a way against its node order for a record running in `orientation` relative to
 * it. One-way ways follow their travel direction whatever the record does, so a record against
 * the traffic stays visible; two-way ways follow the record.
 */
export function showReversed(way: OsmWay, orientation: 1 | -1 | 0): boolean {
  const oneway = interpretLanes(way.tags).oneway
  return oneway === 'no' ? orientation === -1 : oneway === '-1'
}

/** A note when the record runs against the travel direction of a one-way way. */
function onewayConflict(way: OsmWay, orientation: 1 | -1 | 0): string | undefined {
  const oneway = interpretLanes(way.tags).oneway
  if ((orientation === -1 && oneway === 'yes') || (orientation === 1 && oneway === '-1'))
    return 'The record runs against the travel direction of this one-way way. The way is shown in its travel direction, so its map arrows point against the record\'s.'
  return undefined
}

/** Where the lane diagram's "up" points, for captions. */
function directionText(way: OsmWay, reversed: boolean): string {
  if (!reversed) return 'in way direction'
  return interpretLanes(way.tags).oneway === '-1' ? 'in travel direction (oneway=-1: against the OSM way\'s node order)' : 'in record direction (against the OSM way\'s node order)'
}

/** What OSM data is being fetched right now, if any. */
function osmBusy(s: InspectorState): string | undefined {
  if (s.overpass) return s.overpass
  if (s.way.status === 'loading') return s.way.id ? `Loading way ${s.way.id} from the OSM API…` : 'Looking up the OSM road at this location in the OSM API…'
  return undefined
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
      ['Created', e.createdAt ? formatTime(e.createdAt) : undefined],
      ['Version time', e.versionTime ? formatTime(e.versionTime) : undefined],
      ['Valid from', formatTime(e.validFrom)],
      ['Valid to', formatTime(e.validTo)],
      ['Validity', [e.validityStatus, e.hasPeriods ? ' · restricted periods' : ''].join('') || undefined],
      ['Road', [e.roadNumber, e.roadName].filter(Boolean).join(' · ') || undefined],
      ['Carriageway', e.carriageway],
      ['Length affected', e.lengthAffected !== undefined ? `${e.lengthAffected.toLocaleString('en')} m` : undefined],
      ['Direction', e.direction],
      ['Work type', e.workTypes.join(', ') || undefined],
      ['Lane detail', laneDetailText(e) || undefined],
      ['Speed', [e.speedManagementTypes.join(', '), e.temporarySpeedLimit !== undefined ? `${e.temporarySpeedLimit} km/h` : ''].filter(Boolean).join(' · ') || undefined],
      ['Vehicles', e.vehicleCharacteristics.join(', ') || undefined],
      ['Lanes', e.laneCodes.length ? e.laneCodes.map((c) => `${c.field}=${c.value}`).join(', ') : undefined],
      ['Lane impact', laneImpactText(e) || undefined],
      ['Location methods', e.locationMethods.join(', ') || 'none'],
      ['Geometry', [badge(e.geometryConfidence, `geo-${e.geometryConfidence}`), ' ', e.geometryNote ?? '']],
      ['XML path', h('code', { class: 'wrap' }, e.xmlPath)],
      ['Line', String(e.span.line)],
    ]),
  )
  append(el, h('h3', null, 'OpenLR'), e.openlr.length ? e.openlr.map(openlrBlock) : h('p', { class: 'muted' }, 'none'))
  if (e.comments.length) {
    const list = h('ul', { class: 'compact' })
    for (const c of e.comments) list.append(h('li', null, c.type ? h('span', { class: 'muted' }, `${c.type}: `) : null, c.text, c.lang ? h('span', { class: 'muted' }, ` [${c.lang}]`) : null))
    append(el, h('h3', null, 'Comments'), list)
  }
  if (p) append(el, h('h3', null, 'Passability'), h('ul', { class: 'compact' }, ...p.reasons.map((x) => h('li', null, x))), h('p', { class: 'muted' }, `Routing action: ${p.routingAction.replace(/_/g, ' ')}. An analysis hypothesis, not a legal statement.`))
  if (e.warnings.length) append(el, h('h3', null, 'Warnings'), h('ul', { class: 'compact' }, ...e.warnings.map((w) => h('li', null, w))))
}

function laneDetailText(e: RoadEvent): string {
  const d = e.laneDetail
  return [
    d.laneNumbers.length ? `lane ${d.laneNumbers.join(', ')}` : '',
    d.laneUsages.length ? `usage ${d.laneUsages.join(', ')}` : '',
    d.residualRoadWidth !== undefined ? `residual width ${d.residualRoadWidth} m` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Decoded OpenLR reference: summary line and a table of its location reference points. */
function openlrBlock(r: OpenlrReference): HTMLElement {
  const wrap = h('div', { class: 'openlr' })
  append(
    wrap,
    h('p', null, describeOpenlr(r)),
    dl([
      ['Point type', r.pointType],
      ['Offsets', r.positiveOffset !== undefined || r.negativeOffset !== undefined ? `+${r.positiveOffset ?? 0} m / −${r.negativeOffset ?? 0} m` : undefined],
      ['Orientation', r.orientation],
      ['Side of road', r.sideOfRoad],
      ['Binary', r.binaryLength !== undefined ? `${r.binaryLength} characters, not decoded` : undefined],
      ['XML path', h('code', { class: 'wrap' }, r.xmlPath)],
    ]),
  )
  if (r.lrps.length) {
    const head = h('tr', null, ...['#', 'lat', 'lon', 'FRC', 'FOW', 'bearing', 'LFRCNP', 'DNP'].map((t) => h('th', null, t)))
    const body = h('tbody')
    r.lrps.forEach((p, i) => {
      const ok = validWgs84(p)
      body.append(
        h(
          'tr',
          { class: ok ? '' : 'invalid', title: ok ? '' : 'Not a valid WGS 84 position in decimal degrees' },
          h('td', null, `${i + 1}${p.last ? ' (last)' : ''}`),
          h('td', null, p.rawLat ?? '–'),
          h('td', null, p.rawLon ?? '–'),
          h('td', null, p.frc ?? ''),
          h('td', null, p.fow ?? ''),
          h('td', null, p.bearing !== undefined ? `${p.bearing}°` : ''),
          h('td', null, p.lfrcnp ?? ''),
          h('td', null, p.dnp !== undefined ? `${p.dnp} m` : ''),
        ),
      )
    })
    wrap.append(h('div', { class: 'table-scroll' }, h('table', { class: 'lrp' }, h('thead', null, head), body)))
    wrap.append(h('p', { class: 'muted' }, 'On the map: first LRP green, last red, dashed line in LRP order; chevrons along the record polyline show its vertex order.'))
  }
  return wrap
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
  const busy = osmBusy(s)
  if (busy) {
    append(el, spinner(busy))
    return
  }
  if (s.way.status !== 'done') {
    append(el, 
      h('p', { class: s.way.status === 'error' ? 'error' : 'muted' }, s.way.status === 'error' ? `Could not load the OSM way: ${s.way.message}` : 'No OSM way selected. Matching runs when a record with a line is selected; or switch to "Select OSM road" and click a road.'),
    )
    return
  }
  const way = s.way.value
  append(el, 
    h('p', null, link(`https://www.openstreetmap.org/way/${way.id}`, `way/${way.id}`), way.tags['ref'] ? ` · ${way.tags['ref']}` : '', way.tags['name'] ? ` · ${way.tags['name']}` : ''),
    directionNote(way, s),
    osmLaneFigure(way, { showSigns: false, reverse: s.wayReversed, caption: `Usual layout according to OSM (osm-lanes), ${directionText(way, s.wayReversed)}` }) ?? h('p', { class: 'muted' }, 'No lane diagram for this way.'),
  )
  const matched = s.match.status === 'done' ? s.match.value.ranked.find((r) => r.candidate.osmWayId === way.id || r.candidate.key === s.confirmedKey) : undefined
  const cmp = compareLanes(e, osmLaneAttributes('way', way.id, way.tags, { reverse: s.wayReversed }), matched?.quality)
  append(el, 
    h('h3', null, 'Comparison'),
    dl([
      ['DATEX II', cmp.datex ? `${cmp.datex.drivingLanes} driving lane(s): ${cmp.datex.openLanes} open, ${cmp.datex.restrictedLanes} narrowed, ${cmp.datex.closedLanes} closed (${cmp.datex.field})` : 'no lane status'],
      ['OSM', `lanes=${cmp.osm.lanesTotal ?? '–'}, forward ${cmp.osm.interpretedForward}, backward ${cmp.osm.interpretedBackward}${cmp.osm.oneWay ? ', one-way' : ''}${s.wayReversed ? ' (forward = direction shown, against the way\'s node order)' : ''}`],
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
    const cats = laneCategoriesOf(x.laneCodes)
    return h(
      'li',
      { class: x.id === e.id ? 'current' : '' },
      h('button', { type: 'button', class: 'linkish', onclick: () => cb.selectRecord(x.id) }, x.id),
      ' ',
      h('span', { class: 'muted' }, x.recordType ?? ''),
      x.managementTypes.length ? ` · ${x.managementTypes.join(', ')}` : '',
      lane ? [' · ', h('code', null, lane.value)] : '',
      cats.length ? [' ', h('span', { class: 'lane-icons' }, ...cats.map((c) => laneCategoryIcon(c, 14, { title: true })))] : '',
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
    h('p', { class: 'muted' }, 'Matches the record line against OSM roads from the vector tiles. Score = coverage (share of the record within 25 m) × quality (distance, direction, road number, class), so roads that explain more of the record win. Single OSM ways are preferred over merged tile features; a merged feature that still wins is split into its OSM ways. The score ranks candidates; it is not a probability.'),
    h('button', { type: 'button', disabled: !hasLine || s.match.status === 'loading', onclick: () => cb.runMatch() }, s.match.status === 'done' ? 'Match again' : 'Match to OSM'),
  )
  if (!hasLine) {
    append(el, h('p', null, 'Matching needs a line geometry. This record has ', e.geometryConfidence === 'none' ? 'none' : 'only points', '.'))
    return
  }
  if (s.match.status === 'loading') append(el, spinner(s.overpass ?? s.match.note ?? 'Matching…'))
  if (s.match.status === 'error') append(el, h('p', { class: 'error' }, s.match.message))
  if (s.match.status !== 'done') return
  const m = s.match.value
  const statusText = { matched: 'matched', ambiguous: 'ambiguous: no unambiguous match', none: 'no match' }[m.status]
  append(el, 
    h('p', null, badge(statusText, m.status === 'matched' ? 'ok' : m.status === 'ambiguous' ? 'warning' : 'error'), ` · confidence score ${m.confidence.toFixed(2)} · ${Math.round(m.coverage * 100)}% of the record explained · ${m.samples} samples · ${m.tiles} z14 tile(s)`),
    m.truncated ? h('p', { class: 'warning' }, 'The record is long; only part of it was searched.') : null,
    m.failedTiles ? h('p', { class: 'warning' }, `${m.failedTiles} tile(s) could not be loaded; roads there are missing.`) : null,
    h('ul', { class: 'compact' }, ...m.reasons.map((x) => h('li', null, x))),
  )
  const table = h('table', { class: 'cands' })
  table.append(
    h(
      'tr',
      null,
      h('th', null, ''),
      h('th', null, 'Candidate'),
      h('th', { title: 'coverage × quality' }, 'Score'),
      h('th', { title: 'Share of the record within 25 m; multiplies the quality' }, 'Cov.'),
      h('th', { title: 'Quality of the covered part: weighted mean of distance, direction, road number and class' }, 'Qual.'),
      h('th', { title: `weight ${WEIGHTS.distance} in the quality` }, 'Dist.'),
      h('th', { title: `weight ${WEIGHTS.bearing} in the quality` }, 'Dir.'),
      h('th', { title: `weight ${WEIGHTS.ref} in the quality` }, 'Ref'),
      h('th', { title: 'OSM lanes (osm-lanes), once the way has been loaded' }, 'Lanes'),
    ),
  )
  // Candidate keys break after each "/" so the table fits the side panel.
  const keyText = (key: string): Child[] => key.split('/').flatMap((p, i, a) => (i < a.length - 1 ? [`${p}/`, h('wbr')] : [p]))
  const seq = new Set(m.sequence.map((x) => x.candidate.key))
  const loaded = (id: string | undefined) => (id ? s.ways?.get(id) : undefined)
  const lines = linesOf(e.geometry)
  // Tiny lane graphics are turned like the Lanes tab: one-way ways by their tags, two-way ways
  // once their geometry is known.
  const candidateReversed = (tags: Record<string, string> | undefined, way: OsmWay | undefined) =>
    !!tags && showReversed({ type: 'way', id: '', tags }, way?.geometry ? recordWayOrientation(lines, way.geometry.map((p) => [p.lon, p.lat])) : 0)
  for (const r of m.ranked.slice(0, 15)) {
    const c = r.candidate
    const pct = (v: number) => `${Math.round(v * 100)}`
    table.append(
      h(
        'tr',
        { class: seq.has(c.key) ? 'chosen' : '', title: r.reasons.join('\n') },
        h('td', null, h('button', { type: 'button', class: s.confirmedKey === c.key ? 'active' : '', title: c.merged ? 'Merged tile feature: the way is looked up by location in the OSM API' : '', onclick: () => cb.chooseCandidate(c.key, c.osmWayId) }, s.confirmedKey === c.key ? 'selected' : 'use')),
        h('td', { class: 'cand-key' }, c.osmWayId ? link(`https://www.openstreetmap.org/way/${c.osmWayId}`, keyText(c.key)) : h('span', { class: 'muted' }, keyText(c.key)), h('div', { class: 'muted' }, [c.roadClass, c.ref].filter(Boolean).join(' · '))),
        h('td', null, r.score.toFixed(2)),
        h('td', null, pct(r.components.coverage)),
        h('td', null, pct(r.quality)),
        h('td', null, pct(r.components.distance)),
        h('td', null, pct(r.components.bearing)),
        h('td', null, r.components.ref === 0.5 ? '–' : pct(r.components.ref)),
        h('td', { class: 'cand-lanes' }, candidateLanes(c.tags ?? loaded(c.osmWayId)?.tags, candidateReversed(c.tags ?? loaded(c.osmWayId)?.tags, loaded(c.osmWayId)))),
      ),
    )
  }
  append(el, h('div', { class: 'table-scroll' }, table), h('p', { class: 'muted' }, 'Green on the map: ways chosen to explain the record. "use" picks a way manually and loads its OSM tags for the lane comparison; the Lanes column shows the OSM lanes of every way loaded so far (· not loaded, – no lane tags). merged/… candidates are tile features merged from several ways.'))
}

/** Tiny OSM lane graphic for the candidate table, or a dash when the way's tags are not loaded. */
function candidateLanes(tags: Record<string, string> | undefined, reverse: boolean): Node | string {
  if (!tags) return h('span', { class: 'muted', title: 'OSM data not loaded yet' }, '·')
  const svg = renderLanesElement(tags, { showSigns: false, reverse })
  if (!svg) return h('span', { class: 'muted', title: 'No lane tags in OSM' }, '–')
  const [, , w, hgt] = (svg.getAttribute('viewBox') ?? '0 0 1 1').split(/\s+/).map(Number)
  const height = 22
  svg.setAttribute('height', String(height))
  svg.setAttribute('width', String(Math.max(8, Math.round((height * (w || 1)) / (hgt || 1)))))
  svg.classList.add('lanes-tiny')
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
  title.textContent = ([tags['lanes'] ? `lanes=${tags['lanes']}` : '', tags['turn:lanes'] ? `turn:lanes=${tags['turn:lanes']}` : ''].filter(Boolean).join(', ') || 'OSM lanes') + (reverse ? ' (drawn in record direction)' : '')
  svg.prepend(title)
  return svg
}

/**
 * The OSM lane graphic with a compass rose beside it. osm-lanes draws lanes in the way's drawing
 * direction ("up"); the compass shows where that points, and the map highlight carries matching
 * arrows. Without lanes to draw, the compass is shown alone; without geometry, nothing.
 */
function osmLaneFigure(way: OsmWay, opts: { showSigns?: boolean; reverse?: boolean; caption: string }): HTMLElement | null {
  const lanes = renderLanesElement(way, { showSigns: opts.showSigns, reverse: opts.reverse })
  const bearing = wayBearing(way.geometry)
  const compass = renderCompassElement(bearing !== null && opts.reverse ? (bearing + 180) % 360 : bearing)
  if (!lanes && !compass) return null
  return h(
    'figure',
    { class: 'lane-fig' },
    h('div', { class: 'lanes-row' }, lanes, compass),
    h('figcaption', null, lanes ? `${opts.caption}${compass ? '; compass and map arrows show that direction' : ''}` : `Shown ${directionText(way, !!opts.reverse)} (no lanes to draw; map arrows show the same direction)`),
  )
}

/** How the selected record runs relative to the way, when that is known. */
function directionNote(way: OsmWay, s: InspectorState): HTMLElement | null {
  if (s.index === null || !s.orientation) return null
  const conflict = onewayConflict(way, s.orientation)
  if (conflict) return h('p', { class: 'warning' }, conflict)
  if (s.wayReversed && interpretLanes(way.tags).oneway === 'no') return h('p', { class: 'muted' }, 'The record runs against the node order of this two-way way, so the way is shown reversed: map arrows, lane diagram, destination sign and compass follow the record.')
  return null
}

function renderOsm(el: HTMLElement, s: InspectorState, e: RoadEvent | undefined) {
  const busy = osmBusy(s)
  if (busy || s.way.status === 'loading') {
    append(el, spinner(busy ?? 'Loading the OSM way…'))
    return
  }
  if (s.way.status === 'idle') {
    append(el, h('p', { class: 'muted' }, 'Switch the map to "Select OSM road", zoom in to level 14 or more and click a road. Only the way id is sent to the OSM API.'))
    return
  }
  if (s.way.status === 'error') {
    append(el, h('p', { class: 'error' }, `Could not load way ${s.way.id ?? ''}: ${s.way.message}`), h('p', { class: 'muted' }, 'The rest of the viewer keeps working without the OSM API.'))
    return
  }
  const way = s.way.value
  const t = way.tags
  const dest = renderDestinationSignElement(way, { reverse: s.wayReversed })
  append(el, 
    h('h2', null, t['name'] || t['ref'] || `Way ${way.id}`),
    h('p', null, link(`https://www.openstreetmap.org/way/${way.id}`, `way/${way.id}`), way.version ? ` · version ${way.version}` : '', way.timestamp ? ` · edited ${formatTime(way.timestamp)}` : '', prov('OSM API')),
    h('p', { class: 'muted' }, 'Tags come from the live OSM API; the map tiles may be older.'),
    e ? directionNote(way, s) : null,
    dest ? h('figure', { class: 'lane-fig' }, dest, h('figcaption', null, `Destination sign (destination:lanes), ${directionText(way, s.wayReversed)}`)) : null,
    osmLaneFigure(way, { reverse: s.wayReversed, caption: `Lanes ${directionText(way, s.wayReversed)} (osm-lanes)` }),
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

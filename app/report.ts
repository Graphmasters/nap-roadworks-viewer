// Left panel, "Report" section: keeps XML parsing, DATEX II detection, XSD validation, profile
// checks, extensions and findings visibly apart (concept §5.1, §11.3).

import { PROFILES, type AnalysisResult, type Finding, type FindingLayer } from '../src/index'
import { append, badge, clear, dl, formatTime, h } from './dom'
import type { XsdOutcome } from './xsd'

export interface ReportCallbacks {
  onProfile(id: string): void
  onAxisOrder(order: 'auto' | 'latlon' | 'lonlat'): void
  onXsd(files: File[], main: string): void
  onFinding(f: Finding): void
}

export type XsdState = { status: 'none' } | { status: 'running' } | { status: 'done'; outcome: XsdOutcome } | { status: 'error'; message: string }

export const LAYER_LABEL: Record<FindingLayer, string> = {
  xml: 'XML',
  datex: 'DATEX II',
  xsd: 'XSD',
  profile: 'Profile (heuristic)',
  extension: 'Extensions',
  semantic: 'Semantics',
  location: 'Location',
  lanes: 'Lanes',
  passability: 'Passability',
  rtti: 'RTTI 5-Star',
}

export const RULE_TITLE: Record<string, string> = {
  'XML-001': 'Not well-formed',
  'XML-002': 'DOCTYPE present',
  'DTX-001': 'No DATEX II namespace',
  'DTX-002': 'Unsupported publication type',
  'DTX-003': 'No situations',
  'SEM-001': 'Duplicate record id in situation',
  'SEM-002': 'End before start',
  'SEM-003': 'Ended before publication time',
  'SEM-004': 'Missing start time',
  'SEM-005': 'Record id in several situations',
  'REF-001': 'Unresolved cause reference',
  'REF-002': 'Cyclic cause references',
  'REF-003': 'Cause in another situation',
  'LOC-001': 'Location not drawable',
  'LOC-002': 'Approximate location',
  'LOC-003': 'Location warnings',
  'LOC-004': 'posList in lon/lat order',
  'LANE-001': 'Unknown lane-status symbols',
  'LANE-002': 'Basic and extended lane status differ',
  'LANE-003': 'More lanes restricted than exist',
  'DQ-RW-001': 'Possible incorrect road closure (stopping/parking only)',
  'DQ-RW-002': 'Closure vs. lanes open in both directions',
  'MDM-H01': 'Works record without lane status',
  'MDM-H02': 'Management record without cause link',
  'NDW-H01': 'AlertC location without gmlLineString',
  'OLR-001': 'OpenLR coordinate missing or not a number',
  'OLR-002': 'OpenLR coordinate not WGS 84 degrees',
  'OLR-003': 'OpenLR latitude/longitude swapped',
  'OLR-004': 'OpenLR far from the record geometry',
  'OLR-005': 'OpenLR LRPs farther apart than their DNP',
  'OLR-006': 'OpenLR reference incomplete',
  'RTTI-LOC-01': 'No location reference that counts for RTTI',
  'RTTI-LIN-01': 'No polyline (RTTI linear referencing)',
  'RTTI-LIN-02': 'Polyline defects',
  'RTTI-LIN-03': 'Polyline not in WGS 84 (not checked)',
  'RTTI-DIR-01': 'Direction along the polyline ambiguous',
  'RTTI-DIR-02': 'OpenLR contradicts the polyline',
  'RTTI-DIR-03': 'Location references disagree on direction',
  'RTTI-ACC-01': 'Coarse coordinate resolution',
  'RTTI-ACC-02': 'Point far from its own polyline',
  'RTTI-TERM-01': 'All lanes restricted but not a closure',
  'RTTI-SPEC-01': 'Deviation from the DATEX II RTTI reference profile',
  'RTTI-SPEC-02': 'Closures encoded in two ways',
  'RTTI-ID-01': 'Record without id, version or version time',
  'RTTI-ID-02': 'Probable duplicate event',
  'RTTI-VAL-01': 'Missing start or end time',
  'RTTI-CAUSE-01': 'Closure without cause',
  'RTTI-TIME-01': 'Missing creation or version time',
}

export function renderReport(el: HTMLElement, r: AnalysisResult, xsd: XsdState, cb: ReportCallbacks) {
  clear(el)
  const m = r.meta
  const sev = (s: Finding['severity']) => r.findings.filter((f) => f.severity === s).length

  // 1. XML
  append(el, 
    section(
      '1 · XML well-formedness',
      r.wellFormed.ok
        ? h('p', null, badge('passed', 'ok'), ' Parsed with a streaming XML parser. DTDs and external entities are not resolved.')
        : h('p', null, badge('failed', 'error'), ` Line ${r.wellFormed.error!.line}, column ${r.wellFormed.error!.column}: ${r.wellFormed.error!.message}`),
      dl([
        ['File', r.fileName],
        ['Size', `${m.characters.toLocaleString('en')} characters${m.compressed ? ' (from a gzip-compressed file)' : ''}`],
        ['Encoding', m.encoding],
        ['Elements', m.elementCount.toLocaleString('en')],
        ['Max depth', String(m.maxDepth)],
        ['Parsed in', `${(r.durationMs / 1000).toFixed(1)} s`],
      ]),
    ),
  )

  // 2. DATEX II detection
  append(el, 
    section(
      '2 · DATEX II detection',
      dl([
        ['Version', m.datexVersion === 'unknown' ? badge('not DATEX II', 'error') : `DATEX II v${m.datexVersion}${m.modelBaseVersion ? ` (modelBaseVersion ${m.modelBaseVersion})` : ''}`],
        ['Root', m.rootElement],
        ['Publication', m.publicationType],
        ['Publication time', m.publicationTime ? formatTime(m.publicationTime) : undefined],
        ['Creator', [m.country?.toUpperCase(), m.nationalIdentifier].filter(Boolean).join(' · ') || undefined],
        ['Language', m.lang],
        ['SOAP envelope', m.soapEnvelope ? 'yes' : undefined],
        ['Situations', r.situations.length.toLocaleString('en')],
        ['Records', r.events.length.toLocaleString('en')],
        ['OpenLR', openlrText(r)],
      ]),
      axisControl(r, cb),
    ),
  )

  // 3. XSD
  append(el, section('3 · XSD validation', xsdBlock(xsd, cb)))

  // 4. Profile
  const select = h('select', { 'aria-label': 'Profile', onchange: (e: Event) => cb.onProfile((e.target as HTMLSelectElement).value) })
  for (const p of PROFILES) select.append(h('option', { value: p.id, selected: p.id === r.profileId }, p.label))
  const profile = PROFILES.find((p) => p.id === r.profileId)
  const profileFindings = r.findings.filter((f) => f.layer === 'profile')
  append(el, 
    section(
      '4 · Profile checks',
      h('label', { class: 'row' }, 'Profile ', select),
      h('p', { class: 'muted' }, profile?.description ?? ''),
      h('p', { class: 'muted' }, 'Profile checks are heuristic rules. They do not establish conformance with the profile.'),
      profileFindings.length ? null : h('p', null, badge('no findings', 'ok')),
    ),
  )

  // 5. Extensions and namespaces
  const nsList = h('ul', { class: 'compact' })
  for (const n of m.namespaces) {
    const kind = { 'datex2-base': 'base', 'datex2-other': 'other DATEX II', infrastructure: 'infrastructure', foreign: 'foreign' }[n.classification]
    nsList.append(
      h('li', null, badge(kind, n.classification === 'datex2-base' || n.classification === 'infrastructure' ? 'muted' : 'warn'), ' ', h('code', null, n.uri), ` · ${n.elementCount.toLocaleString('en')} elements${n.prefixes.filter(Boolean).length ? ` · prefix ${n.prefixes.filter(Boolean).join(', ')}` : ''}`),
    )
  }
  const extList = h('ul', { class: 'compact' })
  for (const x of m.extensions) {
    const mech = { 'v2-extension': 'v2 extension mechanism', 'v3-extension': 'v3 extension mechanism', 'foreign-namespace': 'elements in a non-base namespace' }[x.mechanism]
    const top = Object.entries(x.contents)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k} (${v})`)
      .join(', ')
    extList.append(h('li', null, h('code', null, x.container), ` · ${mech} · ${x.count.toLocaleString('en')}×`, top ? h('div', { class: 'muted' }, top) : null))
  }
  append(el, 
    section(
      '5 · Extensions and namespaces',
      h('p', { class: 'muted' }, 'An element outside a profile is not necessarily an error. The list separates the official extension mechanisms from other namespaces.'),
      m.extensions.length ? extList : h('p', null, 'No extensions used.'),
      h('details', null, h('summary', null, `Namespaces (${m.namespaces.length})`), nsList),
    ),
  )

  // 6. Findings
  const groups = new Map<string, Finding[]>()
  for (const f of r.findings) {
    let g = groups.get(f.ruleId)
    if (!g) groups.set(f.ruleId, (g = []))
    g.push(f)
  }
  const order: Finding['severity'][] = ['error', 'warning', 'info']
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[1][0]!.severity) - order.indexOf(b[1][0]!.severity) || a[0].localeCompare(b[0]))
  const list = h('div', { class: 'findings' })
  for (const [rule, fs] of sorted) {
    const first = fs[0]!
    const total = r.findingCounts[rule] ?? fs.length
    const items = h('ul', { class: 'compact' })
    for (const f of fs.slice(0, 200)) {
      items.append(
        h(
          'li',
          null,
          f.recordIds?.length || f.situationId
            ? h('button', { type: 'button', class: 'linkish', onclick: () => cb.onFinding(f), title: f.xmlPath ?? '' }, f.recordIds?.[0] ?? f.situationId ?? '')
            : null,
          f.line ? `line ${f.line}: ` : '',
          ' ',
          f.message,
          f.explanation && fs.length <= 20 ? h('div', { class: 'muted pre' }, f.explanation) : null,
        ),
      )
    }
    if (fs.length > 200 || total > fs.length) items.append(h('li', { class: 'muted' }, `… ${total - Math.min(200, fs.length)} more`))
    list.append(
      h(
        'details',
        { class: `finding ${first.severity}`, open: first.ruleId.startsWith('DQ-') || first.severity === 'error' ? true : undefined },
        h('summary', null, badge(first.severity, first.severity), ' ', h('code', null, rule), ' ', RULE_TITLE[rule] ?? first.message, ` · ${total.toLocaleString('en')}`, h('span', { class: 'muted' }, ` · ${LAYER_LABEL[first.layer]}`)),
        fs.length > 20 && first.explanation ? h('p', { class: 'muted pre' }, first.explanation) : null,
        items,
      ),
    )
  }
  append(el, 
    section(
      '6 · Findings',
      h('p', null, badge(`${sev('error')} errors`, sev('error') ? 'error' : 'muted'), ' ', badge(`${sev('warning')} warnings`, sev('warning') ? 'warning' : 'muted'), ' ', badge(`${sev('info')} notes`, 'muted')),
      sorted.length ? list : h('p', null, 'No findings.'),
    ),
  )
}

/** Whether the feed carries OpenLR, how it is encoded and whether its coordinates are WGS 84. */
export function openlrText(r: AnalysisResult): string {
  const o = r.rtti?.openlr
  if (!o || !o.recordsWithOpenlr) return 'not present'
  const enc = [o.structured && `structured ${o.structured.toLocaleString('en')}`, o.binary && `binary ${o.binary.toLocaleString('en')} (not decoded)`].filter(Boolean).join(' · ')
  const kinds = [o.lines && `${o.lines.toLocaleString('en')} line`, o.points && `${o.points.toLocaleString('en')} point`, o.areas && `${o.areas.toLocaleString('en')} area`].filter(Boolean).join(', ')
  const lrps = o.lrps ? ` · LRP coordinates valid WGS 84: ${o.validLrps.toLocaleString('en')} of ${o.lrps.toLocaleString('en')}` : ''
  return `present in ${o.recordsWithOpenlr.toLocaleString('en')} of ${o.records.toLocaleString('en')} records (${enc}${kinds ? `; ${kinds}` : ''})${lrps}`
}

function section(title: string, ...children: Array<Node | null>): HTMLElement {
  return h('section', { class: 'report-section' }, h('h3', null, title), ...children)
}

function axisControl(r: AnalysisResult, cb: ReportCallbacks): HTMLElement {
  const a = r.meta.axisOrder
  const sel = h('select', { 'aria-label': 'posList axis order', onchange: (e: Event) => cb.onAxisOrder((e.target as HTMLSelectElement).value as 'auto') })
  sel.append(
    h('option', { value: 'auto', selected: a.basis !== 'override' }, 'auto'),
    h('option', { value: 'latlon', selected: a.basis === 'override' && a.order === 'latlon' }, 'lat lon'),
    h('option', { value: 'lonlat', selected: a.basis === 'override' && a.order === 'lonlat' }, 'lon lat'),
  )
  const basis = {
    specification: 'by specification (no reference points to test against)',
    'reference-points': `from reference points (${a.votesLatLon} lat-lon / ${a.votesLonLat} lon-lat)`,
    override: 'set manually',
  }[a.basis]
  return h('div', { class: 'row' }, h('label', null, 'posList order ', sel), h('span', { class: 'muted' }, ` read as ${a.order === 'latlon' ? 'lat lon' : 'lon lat'}, ${basis}`))
}

function xsdBlock(state: XsdState, cb: ReportCallbacks): HTMLElement {
  const wrap = h('div')
  const input = h('input', { type: 'file', accept: '.xsd,application/xml,text/xml', multiple: true, hidden: true })
  const pick = h('button', { type: 'button', onclick: () => input.click() }, 'Validate against XSD files…')
  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])]
    if (!files.length) return
    cb.onXsd(files, '')
  })
  if (state.status === 'none')
    append(wrap, 
      h('p', null, badge('not performed', 'muted'), ' Parsing alone does not check the schema.'),
      h('p', { class: 'muted' }, 'Select the XSD of the DATEX II version or profile (plus any files it imports). Validation runs in your browser with libxml2 (WebAssembly).'),
      pick,
      input,
    )
  else if (state.status === 'running') append(wrap, h('p', null, badge('running', 'muted'), ' Validating…'))
  else if (state.status === 'error') append(wrap, h('p', null, badge('could not run', 'error'), ` ${state.message}`), pick, input)
  else {
    const o = state.outcome
    const list = h('ul', { class: 'compact' })
    for (const e of o.errors.slice(0, 100)) list.append(h('li', null, e.line ? `line ${e.line}: ` : '', e.message))
    append(wrap, 
      h('p', null, o.valid ? badge('valid', 'ok') : badge(`${o.errorCount} error${o.errorCount === 1 ? '' : 's'}`, 'error'), ` against ${o.mainSchema}${o.schemaFiles.length > 1 ? ` (+${o.schemaFiles.length - 1} imported)` : ''} in ${(o.durationMs / 1000).toFixed(1)} s`),
      o.errors.length ? list : null,
      o.errorCount > 100 ? h('p', { class: 'muted' }, `${o.errorCount - 100} more errors not shown.`) : null,
      pick,
      input,
    )
  }
  return wrap
}

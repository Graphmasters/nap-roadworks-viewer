// Left panel, "RTTI 5-Star" block: per use case and criterion, the highest star level this file
// allows under the TISA RTTI 5-Star Rating Specification (https://tisa.org/rtti-5-star-rating-specification/).

import { RTTI_SPEC_URL, type AnalysisResult, type RttiCriterionResult, type RttiUseCaseResult } from '../src/index'
import { append, badge, clear, h, link } from './dom'
import type { XsdState } from './report'

export interface RttiCallbacks {
  onRecord(id: string): void
}

const RECORD_BUTTONS = 12

export function stars(level: number): HTMLElement {
  const el = h('span', { class: `stars s${level}`, role: 'img', 'aria-label': level === 0 ? 'below 1 star' : `at most ${level} of 5 stars` })
  el.textContent = '★'.repeat(level) + '☆'.repeat(5 - level)
  return el
}

/** XSD outcome overlaid on the format criteria: a failed validation caps "Use of specification". */
function xsdOverlay(c: RttiCriterionResult, xsd: XsdState, datexVersion: string): { ceiling?: number; note?: string } {
  if (c.id !== 'dataFormat' && c.id !== 'useOfSpecification') return {}
  if (xsd.status === 'done') {
    const o = xsd.outcome
    if (o.valid) return { note: `XSD: valid against ${o.mainSchema}.` }
    if (c.id === 'useOfSpecification') return { ceiling: Math.min(c.ceiling ?? 5, 2), note: `XSD: ${o.errorCount} error(s) against ${o.mainSchema}, so the specification is not used consistently.` }
    if (datexVersion === '3') return { ceiling: Math.min(c.ceiling ?? 5, 4), note: `XSD: ${o.errorCount} error(s); 5★ needs a valid, profile-conformant document.` }
    return { note: `XSD: ${o.errorCount} error(s) against ${o.mainSchema}.` }
  }
  return { note: 'XSD validation not run (Report, section 3). Run it to confirm schema conformance.' }
}

function criterionRow(c: RttiCriterionResult, xsd: XsdState, r: AnalysisResult, cb: RttiCallbacks): HTMLElement {
  const overlay = xsdOverlay(c, xsd, r.meta.datexVersion)
  const ceiling = overlay.ceiling ?? c.ceiling
  const level =
    c.kind === 'ceiling' && ceiling !== undefined
      ? stars(ceiling)
      : c.kind === 'info'
        ? badge('info', 'muted')
        : badge('not from a file', 'muted')
  const body = h('div', { class: 'crit-body' })
  if (c.levels) {
    const list = h('ol', { class: 'levels' })
    c.levels.forEach((t, i) => list.append(h('li', { class: c.kind === 'ceiling' && ceiling !== undefined && i + 1 <= ceiling ? 'met' : '' }, h('span', { class: 'lvl' }, `${i + 1}★`), ' ', t)))
    append(body, h('p', { class: 'muted' }, 'Spec levels (highlighted: allowed by this file):'), list)
  }
  if (c.distribution?.length) append(body, h('p', null, c.distribution.map((d) => `${d.label}: ${d.count.toLocaleString('en')}`).join(' · ')))
  if (overlay.note) append(body, h('p', null, overlay.note))
  if (c.needs) append(body, h('p', null, h('strong', null, 'Needs: '), c.needs))
  for (const n of c.notes ?? []) append(body, h('p', { class: 'muted' }, n))
  if (c.recordIds?.length) {
    const ids = h('p', { class: 'record-ids' }, h('span', { class: 'muted' }, c.kind === 'ceiling' ? 'Limiting records: ' : 'Records: '))
    for (const id of c.recordIds.slice(0, RECORD_BUTTONS)) ids.append(h('button', { type: 'button', class: 'linkish', onclick: () => cb.onRecord(id) }, id), ' ')
    const total = c.recordCount ?? c.recordIds.length
    if (total > RECORD_BUTTONS) ids.append(h('span', { class: 'muted' }, `… ${(total - RECORD_BUTTONS).toLocaleString('en')} more`))
    body.append(ids)
  }
  if (c.ruleIds?.length) {
    const present = c.ruleIds.filter((id) => (r.findingCounts[id] ?? 0) > 0)
    if (present.length) append(body, h('p', { class: 'muted' }, 'Findings: ', present.map((id) => `${id} (${r.findingCounts[id]!.toLocaleString('en')})`).join(', ')))
  }
  return h(
    'details',
    { class: `crit${c.parent ? ' sub' : ''} kind-${c.kind}` },
    h(
      'summary',
      null,
      h('span', { class: 'crit-level' }, level),
      h('span', { class: 'crit-name' }, c.parent ? '↳ ' : '', c.name, ' ', h('span', { class: `weight w-${c.weight}` }, c.weight)),
      h('span', { class: 'crit-evidence' }, c.evidence),
    ),
    body,
  )
}

function useCaseBlock(u: RttiUseCaseResult, open: boolean, xsd: XsdState, r: AnalysisResult, cb: RttiCallbacks): HTMLElement {
  const basis = Object.entries(u.basis)
    .map(([k, v]) => `${k}: ${v.toLocaleString('en')}`)
    .join(' · ')
  const list = h('div', { class: 'crit-list' })
  for (const c of u.criteria) list.append(criterionRow(c, xsd, r, cb))
  return h(
    'details',
    { class: 'rtti-uc', open: open || undefined },
    h('summary', null, h('strong', null, u.label), ` · ${u.situationIds.length.toLocaleString('en')} situations · ${u.recordIds.length.toLocaleString('en')} records`, h('span', { class: 'muted' }, ` · ${u.table}`)),
    h('p', { class: 'muted' }, `Planned/unplanned decided by: ${basis}.`),
    list,
  )
}

export function renderRtti(el: HTMLElement, r: AnalysisResult, xsd: XsdState, cb: RttiCallbacks) {
  clear(el)
  const a = r.rtti
  append(
    el,
    h(
      'p',
      null,
      'Indicators against the ',
      link(RTTI_SPEC_URL, 'TISA RTTI 5-Star Rating Specification v1.0'),
      '. Each level is a ceiling: this file shows the feed cannot score higher on that criterion. It is not a TISA rating; the TISA Evaluation Methodology is not published yet.',
    ),
  )
  if (!a) return
  if (!a.useCases.length) append(el, h('p', null, badge('nothing to rate', 'muted'), ' The file contains no roadworks or road closures in scope.'))
  a.useCases.forEach((u, i) => el.append(useCaseBlock(u, i === 0, xsd, r, cb)))
  if (a.outOfScope.length) {
    const list = h('ul', { class: 'compact' })
    for (const o of a.outOfScope) {
      const li = h('li', null, `${o.reason}: ${o.recordIds.length.toLocaleString('en')} record(s) `)
      for (const id of o.recordIds.slice(0, 3)) li.append(h('button', { type: 'button', class: 'linkish', onclick: () => cb.onRecord(id) }, id), ' ')
      list.append(li)
    }
    append(el, h('details', { class: 'rtti-uc' }, h('summary', null, 'Not rated'), list))
  }
  const notes = h('ul', { class: 'compact muted' })
  for (const n of a.notes) notes.append(h('li', null, n))
  el.append(notes)
}

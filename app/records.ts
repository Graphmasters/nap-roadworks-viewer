// Left panel, "Records" section: filters and a virtualised list (feeds can have 60 000+ records).

import { LANE_CATEGORIES, laneCategoriesOf, type AnalysisResult, type LaneCategory, type Passability, type RestrictionType, type RoadEvent } from '../src/index'
import { clear, h } from './dom'
import { laneCategoryIcon } from './lane-icons'
import { TYPE_COLORS } from './map'

export interface RecordFilter {
  types: Set<RestrictionType>
  passability: Passability | 'any'
  location: 'any' | 'drawn' | 'not-drawn' | 'openlr'
  activeNow: boolean
  text: string
  /** Lane configurations; a record matches when it has any of them. Empty = no lane filter. */
  lanes: Set<LaneCategory>
}

export const TYPE_LABEL: Record<RestrictionType, string> = {
  fullClosure: 'Full closure',
  partialClosure: 'Partial closure',
  roadworks: 'Roadworks',
  unknown: 'Other / unknown',
}

export const PASS_LABEL: Record<Passability, string> = {
  passable: 'passable',
  restricted: 'restricted',
  closed: 'closed',
  conditional: 'conditional',
  conflicting: 'conflicting',
  unknown: 'unknown',
}

const ROW = 46

export class RecordList {
  readonly filter: RecordFilter = {
    types: new Set(['fullClosure', 'partialClosure', 'roadworks', 'unknown']),
    passability: 'any',
    location: 'any',
    activeNow: false,
    text: '',
    lanes: new Set(),
  }
  private result: AnalysisResult | null = null
  /** Lane categories per event index. */
  private laneCats: LaneCategory[][] = []
  private visible: number[] = []
  private selected: number | null = null
  private viewport: HTMLElement
  private spacer: HTMLElement
  private rows: HTMLElement
  private summary: HTMLElement
  private controls: HTMLElement

  constructor(
    el: HTMLElement,
    private onSelect: (index: number) => void,
    private onFilterChange: (visible: Set<number>) => void,
  ) {
    this.controls = h('div', { class: 'filters' })
    this.summary = h('p', { class: 'muted summary' })
    this.rows = h('div', { class: 'rows' })
    this.spacer = h('div', { class: 'spacer' }, this.rows)
    this.viewport = h('div', { class: 'viewport', role: 'listbox', 'aria-label': 'Records', tabindex: 0 }, this.spacer)
    this.viewport.addEventListener('scroll', () => this.paint())
    this.viewport.addEventListener('keydown', (e) => this.onKey(e))
    el.append(this.controls, this.summary, this.viewport)
  }

  setResult(r: AnalysisResult | null) {
    this.result = r
    this.selected = null
    this.laneCats = r ? r.events.map((e) => laneCategoriesOf(e.laneCodes)) : []
    this.filter.lanes.clear()
    this.renderControls()
    this.apply()
  }

  /** Re-applies the filter (e.g. after passability changed with the profile). */
  refresh() {
    this.apply()
  }

  private renderControls() {
    clear(this.controls)
    if (!this.result) return
    const counts: Record<string, number> = {}
    for (const e of this.result.events) counts[e.type] = (counts[e.type] ?? 0) + 1
    const chips = h('div', { class: 'chips' })
    for (const t of Object.keys(TYPE_LABEL) as RestrictionType[]) {
      const cb = h('input', { type: 'checkbox', checked: this.filter.types.has(t) })
      cb.addEventListener('change', () => {
        if (cb.checked) this.filter.types.add(t)
        else this.filter.types.delete(t)
        this.apply()
      })
      chips.append(h('label', { class: 'chip' }, cb, h('span', { class: 'swatch', style: `background:${TYPE_COLORS[t]}` }), `${TYPE_LABEL[t]} (${(counts[t] ?? 0).toLocaleString('en')})`))
    }
    const pass = h('select', { 'aria-label': 'Passability' })
    pass.append(h('option', { value: 'any' }, 'any passability'))
    for (const [k, v] of Object.entries(PASS_LABEL)) pass.append(h('option', { value: k }, v))
    pass.addEventListener('change', () => {
      this.filter.passability = pass.value as Passability
      this.apply()
    })
    const loc = h('select', { 'aria-label': 'Location' })
    loc.append(h('option', { value: 'any' }, 'all locations'), h('option', { value: 'drawn' }, 'on the map'), h('option', { value: 'not-drawn' }, 'not drawable'), h('option', { value: 'openlr' }, 'OpenLR present'))
    loc.addEventListener('change', () => {
      this.filter.location = loc.value as RecordFilter['location']
      this.apply()
    })
    const active = h('input', { type: 'checkbox' })
    active.addEventListener('change', () => {
      this.filter.activeNow = active.checked
      this.apply()
    })
    const search = h('input', { type: 'search', placeholder: 'Search id, road, text…', 'aria-label': 'Search records' })
    let t: ReturnType<typeof setTimeout>
    search.addEventListener('input', () => {
      clearTimeout(t)
      t = setTimeout(() => {
        this.filter.text = search.value.trim().toLowerCase()
        this.apply()
      }, 200)
    })
    this.controls.append(chips, h('div', { class: 'row' }, pass, loc, h('label', { class: 'chip' }, active, 'active now')), this.laneControls() ?? '', search)
  }

  /** Lane-configuration chips, only when the feed has lane status codes. */
  private laneControls(): HTMLElement | null {
    const r = this.result!
    if (!r.events.some((e) => e.laneCodes.length)) return null
    const counts = new Map<LaneCategory, number>()
    for (const cats of this.laneCats) for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1)
    const chips = h('div', { class: 'chips lane-chips' })
    for (const spec of LANE_CATEGORIES) {
      const n = counts.get(spec.id) ?? 0
      const cb = h('input', { type: 'checkbox', disabled: n === 0, checked: this.filter.lanes.has(spec.id) })
      cb.addEventListener('change', () => {
        if (cb.checked) this.filter.lanes.add(spec.id)
        else this.filter.lanes.delete(spec.id)
        this.apply()
      })
      chips.append(
        h('label', { class: `chip${n ? '' : ' empty'}`, title: `Lane status codes with ${spec.rule}` }, cb, laneCategoryIcon(spec.id, 16), `${spec.label} (${n.toLocaleString('en')})`),
      )
    }
    return h(
      'details',
      { class: 'lane-filter', open: true },
      h('summary', null, 'Lane configuration'),
      h('p', { class: 'muted' }, 'Records whose laneStatusCoded or extendedLaneStatusCoded shows any of the selected configurations.'),
      chips,
    )
  }

  private matches(e: RoadEvent, i: number, now: number): boolean {
    const f = this.filter
    if (!f.types.has(e.type)) return false
    if (f.lanes.size && !this.laneCats[i]!.some((c) => f.lanes.has(c))) return false
    if (f.passability !== 'any' && this.result!.recordPassability[e.id]?.classification !== f.passability) return false
    if (f.location === 'drawn' && !e.geometry) return false
    if (f.location === 'not-drawn' && e.geometry) return false
    if (f.location === 'openlr' && !e.openlr.length) return false
    if (f.activeNow) {
      const from = e.validFrom ? Date.parse(e.validFrom) : -Infinity
      const to = e.validTo ? Date.parse(e.validTo) : Infinity
      if (!(from <= now && now <= to)) return false
    }
    if (f.text) {
      const hay = `${e.id} ${e.situationId} ${e.roadNumber ?? ''} ${e.roadName ?? ''} ${e.description ?? ''} ${e.recordType ?? ''} ${e.managementTypes.join(' ')}`.toLowerCase()
      if (!hay.includes(f.text)) return false
    }
    return true
  }

  private apply() {
    const r = this.result
    this.visible = []
    if (r) {
      const now = Date.now()
      r.events.forEach((e, i) => {
        if (this.matches(e, i, now)) this.visible.push(i)
      })
    }
    const drawn = r ? this.visible.filter((i) => r.events[i]!.geometry).length : 0
    this.summary.textContent = r ? `${this.visible.length.toLocaleString('en')} of ${r.events.length.toLocaleString('en')} records · ${drawn.toLocaleString('en')} on the map` : ''
    this.spacer.style.height = `${this.visible.length * ROW}px`
    this.paint()
    this.onFilterChange(new Set(this.visible))
  }

  select(index: number | null, scroll = true) {
    this.selected = index
    if (index !== null && scroll) {
      const pos = this.visible.indexOf(index)
      if (pos >= 0) {
        const top = pos * ROW
        if (top < this.viewport.scrollTop || top > this.viewport.scrollTop + this.viewport.clientHeight - ROW) this.viewport.scrollTop = top - this.viewport.clientHeight / 2
      }
    }
    this.paint()
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const pos = this.selected === null ? -1 : this.visible.indexOf(this.selected)
    const next = this.visible[Math.max(0, Math.min(this.visible.length - 1, pos + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next !== undefined) this.onSelect(next)
  }

  private paint() {
    clear(this.rows)
    const r = this.result
    if (!r) return
    const first = Math.max(0, Math.floor(this.viewport.scrollTop / ROW) - 5)
    const last = Math.min(this.visible.length, first + Math.ceil((this.viewport.clientHeight || 600) / ROW) + 10)
    this.rows.style.transform = `translateY(${first * ROW}px)`
    for (let k = first; k < last; k++) {
      const i = this.visible[k]!
      const e = r.events[i]!
      const p = r.recordPassability[e.id]
      const title = [e.roadNumber, e.description ?? e.recordType].filter(Boolean).join(' · ') || e.id
      const row = h(
        'div',
        { class: `rec${i === this.selected ? ' selected' : ''}`, role: 'option', 'aria-selected': i === this.selected ? 'true' : 'false', title: e.id },
        h('span', { class: 'swatch', style: `background:${TYPE_COLORS[e.type]}` }),
        h('span', { class: 'rec-main' }, h('span', { class: 'rec-title' }, title), h('span', { class: 'rec-sub' }, `${e.id}${e.geometry ? '' : ' · not drawable'}`)),
        p ? h('span', { class: `pass ${p.classification}` }, PASS_LABEL[p.classification]) : null,
      )
      row.addEventListener('click', () => this.onSelect(i))
      this.rows.append(row)
    }
  }
}

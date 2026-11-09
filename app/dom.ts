// Tiny DOM helpers. Text from the feed is only ever set with textContent, never as HTML.

export type Child = Node | string | number | null | undefined | false | Child[]
type Attrs = Record<string, string | number | boolean | undefined | null | ((ev: Event) => void)>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue
      if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v as EventListener)
      else if (k === 'class') el.className = String(v)
      else if (v === true) el.setAttribute(k, '')
      else el.setAttribute(k, String(v))
    }
  append(el, ...children)
  return el
}

export function append(el: Element, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    if (Array.isArray(c)) append(el, ...c)
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove()
}

export function link(href: string, text: Child): HTMLAnchorElement {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text)
}

export function formatTime(iso?: string): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').replace(/:\d\d\.\d+Z$|:\d\dZ$/, ' UTC')
}

export function formatBytes(n?: number): string {
  if (n === undefined) return '–'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Definition-list rows; values that are undefined are skipped. */
export function dl(rows: Array<[string, Child]>, cls = 'kv'): HTMLDListElement {
  const el = h('dl', { class: cls })
  for (const [k, v] of rows) {
    if (v === undefined || v === null || v === '') continue
    const dd = h('dd')
    append(dd, v)
    append(el, h('dt', null, k), dd)
  }
  return el
}

export function badge(text: string, kind: string): HTMLSpanElement {
  return h('span', { class: `badge ${kind}` }, text)
}

/** A status line with a spinner, for waits on the network (Overpass, OSM API). */
export function spinner(text: string): HTMLElement {
  return h('p', { class: 'loading', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text)
}

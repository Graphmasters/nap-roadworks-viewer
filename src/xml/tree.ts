// A minimal, namespace-aware element tree. The streaming parser builds one of these per DATEX II
// `situation` and throws it away after normalisation, so the full document never sits in memory.

export interface XmlElement {
  /** Qualified name as written in the document, e.g. `sit:situationRecord`. */
  name: string
  /** Local name without prefix, e.g. `situationRecord`. */
  local: string
  /** Namespace URI ('' when the element is in no namespace). */
  ns: string
  /** Attributes keyed by local name. Namespaced attributes are also stored as `{uri}local`. */
  attrs: Record<string, string>
  children: XmlElement[]
  /** Concatenated character data directly inside this element (trimmed). */
  text: string
  /** Character offset (JavaScript string index) of the `<` of the start tag in the decoded text. */
  start: number
  /** Character offset just after the end tag. */
  end: number
  /** 1-based line of the start tag. */
  line: number
  parent?: XmlElement
}

export const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

/** The value of `xsi:type` without its namespace prefix (e.g. `MaintenanceWorks`). */
export function xsiType(el: XmlElement | undefined): string | undefined {
  const raw = el?.attrs[`{${XSI_NS}}type`]
  if (!raw) return undefined
  const i = raw.indexOf(':')
  return i >= 0 ? raw.slice(i + 1) : raw
}

export function child(el: XmlElement | undefined, local: string): XmlElement | undefined {
  return el?.children.find((c) => c.local === local)
}

export function childrenNamed(el: XmlElement | undefined, local: string): XmlElement[] {
  return el ? el.children.filter((c) => c.local === local) : []
}

/** Follows a path of local names through first-matching children. */
export function path(el: XmlElement | undefined, ...locals: string[]): XmlElement | undefined {
  let cur = el
  for (const l of locals) cur = child(cur, l)
  return cur
}

export function textAt(el: XmlElement | undefined, ...locals: string[]): string | undefined {
  const t = path(el, ...locals)?.text
  return t === undefined || t === '' ? undefined : t
}

/** All descendants (depth-first, document order) with the given local name. */
export function descendants(el: XmlElement | undefined, local: string, out: XmlElement[] = []): XmlElement[] {
  if (!el) return out
  for (const c of el.children) {
    if (c.local === local) out.push(c)
    descendants(c, local, out)
  }
  return out
}

export function firstDescendant(el: XmlElement | undefined, local: string): XmlElement | undefined {
  if (!el) return undefined
  for (const c of el.children) {
    if (c.local === local) return c
    const d = firstDescendant(c, local)
    if (d) return d
  }
  return undefined
}

export function descendantText(el: XmlElement | undefined, local: string): string | undefined {
  const t = firstDescendant(el, local)?.text
  return t === undefined || t === '' ? undefined : t
}

/** Every element in the subtree, including `el` itself. */
export function* walk(el: XmlElement): Generator<XmlElement> {
  yield el
  for (const c of el.children) yield* walk(c)
}

/** XPath-like location with `[@id='…']` predicates where an element carries an id. */
export function xmlPath(el: XmlElement, basePath = ''): string {
  const parts: string[] = []
  for (let cur: XmlElement | undefined = el; cur; cur = cur.parent) {
    const id = cur.attrs['id']
    parts.unshift(id ? `${cur.name}[@id='${id}']` : cur.name)
  }
  return `${basePath}/${parts.join('/')}`
}

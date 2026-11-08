// Streaming DATEX II reader. It checks well-formedness with a SAX parser (saxes), collects feed
// metadata, namespace and extension statistics, and hands every `situation` to a callback as a
// small element tree. saxes never resolves DTDs or external entities, so XXE is not possible.

import { SaxesParser, type SaxesTagNS } from 'saxes'
import type { DatexVersion, ExtensionUse, NamespaceClass, NamespaceInfo, WellFormedness } from '../model'
import { XSI_NS, type XmlElement } from '../xml/tree'

export const DATEX_NS_PREFIX = 'http://datex2.eu/schema/'
export const DATEX_V2_NS = 'http://datex2.eu/schema/2/2_0'
const SOAP_NS = new Set(['http://www.w3.org/2003/05/soap-envelope', 'http://schemas.xmlsoap.org/soap/envelope/'])
const INFRA_NS = new Set([XSI_NS, 'http://www.w3.org/XML/1998/namespace', ...SOAP_NS])

/** DATEX II v3 namespaces defined by the base specification (not national extensions). */
const V3_BASE_MODULES = new Set([
  'common',
  'situation',
  'locationReferencing',
  'locationExtension',
  'messageContainer',
  'exchangeInformation',
  'informationManagement',
  'd2Payload',
  'roadTrafficData',
  'vms',
  'parking',
  'facilities',
  'energyInfrastructure',
  'trafficManagementPlan',
  'faultAndStatus',
  'cctv',
  'trafficRegulation',
  'trafficSignal',
  'urbanExtensions',
  'commonExtension',
  'reroutingExtension',
])

export function classifyNamespace(uri: string): NamespaceClass {
  if (INFRA_NS.has(uri)) return 'infrastructure'
  if (uri === DATEX_V2_NS) return 'datex2-base'
  if (uri.startsWith('http://datex2.eu/schema/3/')) {
    const module = uri.slice('http://datex2.eu/schema/3/'.length).replace(/\/$/, '')
    return V3_BASE_MODULES.has(module) ? 'datex2-base' : 'datex2-other'
  }
  if (uri.startsWith(DATEX_NS_PREFIX)) return 'datex2-other'
  return 'foreign'
}

export interface ParseHeader {
  datexVersion: DatexVersion
  modelBaseVersion?: string
  rootElement?: string
  rootNamespace?: string
  publicationType?: string
  publicationTime?: string
  country?: string
  nationalIdentifier?: string
  lang?: string
  soapEnvelope: boolean
  hasDoctype: boolean
  namespaces: NamespaceInfo[]
  extensions: ExtensionUse[]
  elementCount: number
  maxDepth: number
  characters: number
}

export interface ParseOptions {
  onSituation(situation: XmlElement, basePath: string): void
  /** Called with the number of characters consumed so far. */
  onProgress?(characters: number): void
  /** Abort when the element nesting gets deeper than this (default 256). */
  maxDepth?: number
  signal?: AbortSignal
}

export interface ParseOutput {
  wellFormed: WellFormedness
  header: ParseHeader
}

interface Frame {
  local: string
  ns: string
  name: string
  /** Element tree node while inside a situation. */
  el?: XmlElement
  /** Text buffer for header fields outside situations. */
  text?: string
  extension?: ExtensionUse
}

const HEADER_TEXT = new Set(['publicationTime', 'country', 'nationalIdentifier'])

export async function parseDatexStream(text: ReadableStream<string>, options: ParseOptions): Promise<ParseOutput> {
  const maxDepth = options.maxDepth ?? 256
  const parser = new SaxesParser<{ xmlns: true; position: true }>({ xmlns: true, position: true })
  const header: ParseHeader = {
    datexVersion: 'unknown',
    soapEnvelope: false,
    hasDoctype: false,
    namespaces: [],
    extensions: [],
    elementCount: 0,
    maxDepth: 0,
    characters: 0,
  }
  const nsCounts = new Map<string, { prefixes: Set<string>; count: number; names: Map<string, number> }>()
  const extensions = new Map<string, ExtensionUse>()
  const stack: Frame[] = []
  let situationRoot: XmlElement | undefined
  let situationBase = ''
  let error: WellFormedness['error']
  let pendingStart = 0
  let chunkOffset = 0

  const fail = (message: string) => {
    if (!error) error = { message, line: parser.line, column: parser.column + 1 }
  }

  parser.on('error', (e) => fail(e.message.replace(/^(?:[^:]*:)?\d+:\d+: /, '')))
  parser.on('doctype', () => {
    header.hasDoctype = true
  })

  // saxes reports opentagstart after the tag name and the character following it were read, so
  // the `<` sits name.length + 2 characters back (checked in test/parse.test.ts).
  parser.on('opentagstart', (tag) => {
    pendingStart = parser.position - tag.name.length - 2
  })

  parser.on('opentag', (tag: SaxesTagNS) => {
    header.elementCount++
    const depth = stack.length + 1
    if (depth > header.maxDepth) header.maxDepth = depth
    if (depth > maxDepth) {
      fail(`Element nesting deeper than ${maxDepth} levels`)
      return
    }
    const ns = tag.uri ?? ''
    const local = tag.local ?? tag.name
    let entry = nsCounts.get(ns)
    if (!entry) nsCounts.set(ns, (entry = { prefixes: new Set(), count: 0, names: new Map() }))
    entry.prefixes.add(tag.prefix ?? '')
    entry.count++
    entry.names.set(local, (entry.names.get(local) ?? 0) + 1)
    for (const [prefix, uri] of Object.entries(tag.ns ?? {})) {
      let e = nsCounts.get(uri)
      if (!e) nsCounts.set(uri, (e = { prefixes: new Set(), count: 0, names: new Map() }))
      e.prefixes.add(prefix)
    }

    if (stack.length === 0) {
      header.rootElement = tag.name
      header.rootNamespace = ns
    }
    if (SOAP_NS.has(ns)) header.soapEnvelope = true

    // DATEX II version and publication type
    if (header.datexVersion === 'unknown' && ns.startsWith(DATEX_NS_PREFIX)) {
      header.datexVersion = ns.startsWith('http://datex2.eu/schema/3/') ? '3' : ns.startsWith('http://datex2.eu/schema/2/') ? '2' : 'unknown'
      const mbv = tag.attributes['modelBaseVersion']
      if (mbv) header.modelBaseVersion = mbv.value
    }
    const parentLocal = stack[stack.length - 1]?.local
    if ((local === 'payloadPublication' || local === 'payload') && ns.startsWith(DATEX_NS_PREFIX)) {
      const t = attrValue(tag, XSI_NS, 'type')
      if (t && !header.publicationType) header.publicationType = t.replace(/^.*:/, '')
      const lang = tag.attributes['lang']?.value
      if (lang) header.lang = lang
      const mbv = tag.attributes['modelBaseVersion']?.value
      if (mbv && !header.modelBaseVersion) header.modelBaseVersion = mbv
    }

    // Extension bookkeeping
    const parentExt = stack[stack.length - 1]?.extension
    let extension = parentExt
    const nsClass = classifyNamespace(ns)
    if (!parentExt) {
      if (ns === DATEX_V2_NS && local.endsWith('Extension')) extension = useExtension(extensions, local, 'v2-extension')
      else if (ns.startsWith(DATEX_NS_PREFIX) && local.startsWith('_') && local.endsWith('Extension'))
        extension = useExtension(extensions, local, 'v3-extension')
      else if (nsClass === 'foreign' || nsClass === 'datex2-other') {
        extension = useExtension(extensions, `{${ns}}`, 'foreign-namespace')
        extension.count++
        bump(extension.contents, local)
      }
    } else bump(parentExt.contents, local)

    const frame: Frame = { local, ns, name: tag.name, extension }

    if (situationRoot) {
      const parent = stack[stack.length - 1]?.el
      frame.el = element(tag, ns, local, pendingStart, parser.line, parent)
      parent?.children.push(frame.el)
    } else if (local === 'situation' && ns.startsWith(DATEX_NS_PREFIX)) {
      situationRoot = element(tag, ns, local, pendingStart, parser.line, undefined)
      frame.el = situationRoot
      situationBase = stack.map((f) => f.name).join('/')
      situationBase = situationBase ? `/${situationBase}` : ''
    } else if (HEADER_TEXT.has(local) && (parentLocal === 'publicationCreator' || parentLocal === 'supplierIdentification' || local === 'publicationTime')) {
      frame.text = ''
    }
    stack.push(frame)
  })

  parser.on('text', (t) => {
    const top = stack[stack.length - 1]
    if (!top) return
    if (top.el) top.el.text += t
    else if (top.text !== undefined) top.text += t
  })
  parser.on('cdata', (t) => {
    const top = stack[stack.length - 1]
    if (top?.el) top.el.text += t
  })

  parser.on('closetag', () => {
    const frame = stack.pop()
    if (!frame) return
    if (frame.el) {
      frame.el.text = frame.el.text.trim()
      frame.el.end = parser.position
      if (frame.el === situationRoot) {
        const done = situationRoot
        situationRoot = undefined
        options.onSituation(done, situationBase)
      }
    } else if (frame.text !== undefined) {
      const v = frame.text.trim()
      const parent = stack[stack.length - 1]?.local
      if (frame.local === 'publicationTime' && !header.publicationTime) header.publicationTime = v
      if (frame.local === 'country' && (parent === 'publicationCreator' || !header.country)) header.country = v
      if (frame.local === 'nationalIdentifier' && (parent === 'publicationCreator' || !header.nationalIdentifier))
        header.nationalIdentifier = v
    }
  })

  const reader = text.getReader()
  try {
    for (;;) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const r = await reader.read()
      if (r.done) break
      parser.write(r.value)
      chunkOffset += r.value.length
      header.characters = chunkOffset
      options.onProgress?.(chunkOffset)
      if (error) break
    }
    if (!error) parser.close()
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    fail((e as Error).message)
  } finally {
    if (error) await reader.cancel().catch(() => undefined)
  }
  if (!error && header.elementCount === 0) fail('The document contains no elements')

  header.namespaces = [...nsCounts.entries()]
    .filter(([uri]) => uri !== '')
    .map(([uri, e]) => ({
      uri,
      prefixes: [...e.prefixes].filter((p) => p !== undefined),
      elementCount: e.count,
      topElements: Object.fromEntries([...e.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)),
      classification: classifyNamespace(uri),
    }))
    .sort((a, b) => b.elementCount - a.elementCount)
  header.extensions = [...extensions.values()].sort((a, b) => b.count - a.count)

  return { wellFormed: error ? { ok: false, error } : { ok: true }, header }
}

function attrValue(tag: SaxesTagNS, uri: string, local: string): string | undefined {
  for (const a of Object.values(tag.attributes)) if (a.uri === uri && a.local === local) return a.value
  return undefined
}

function element(tag: SaxesTagNS, ns: string, local: string, start: number, line: number, parent?: XmlElement): XmlElement {
  const attrs: Record<string, string> = {}
  for (const a of Object.values(tag.attributes)) {
    if (a.prefix === 'xmlns' || a.name === 'xmlns') continue
    if (a.uri) attrs[`{${a.uri}}${a.local}`] = a.value
    else attrs[a.local] = a.value
  }
  return { name: tag.name, local, ns, attrs, children: [], text: '', start, end: start, line, parent }
}

function useExtension(map: Map<string, ExtensionUse>, container: string, mechanism: ExtensionUse['mechanism']): ExtensionUse {
  let e = map.get(container)
  if (!e) map.set(container, (e = { container, mechanism, count: 0, contents: {} }))
  if (mechanism !== 'foreign-namespace') e.count++
  return e
}

function bump(rec: Record<string, number>, key: string) {
  rec[key] = (rec[key] ?? 0) + 1
}

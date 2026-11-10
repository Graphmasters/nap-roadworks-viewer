// Reads OpenLR location references from a DATEX II location.
//
// DATEX II v3 carries OpenLR natively in the LocationReferencing package as a structured XML
// model (ISO/TS 21219-22): `openlrLinear` with `firstDirection` / `oppositeDirection` sections of
// location reference points (LRPs), and `openlrPointLocationReference` for points
// (https://docs.datex2.eu/levels/mastering/location/openlr/). DATEX II v2 feeds use the same
// structure inside extensions (`linearExtension/openlrExtendedLinear`,
// `pointExtension/openlrExtendedPoint`). Element names differ slightly between versions
// (`openlrCoordinate` vs `openlrCoordinates`, `openlrLowestFRCToNextLRPoint` vs
// `openlrLowestFrcToNextLRPoint`), so names are matched case-insensitively.
//
// Binary OpenLR (base64, e.g. `locationExtension/openlr/binary` in the TISA RTTI 5-Star
// specification, https://tisa.org/rtti-5-star-rating-specification/, Annex 1) only appears in
// feed-specific v2 extensions. It is detected and reported, never decoded.

import type { OpenlrLrp, OpenlrReference } from '../model'
import { xmlPath, xsiType, type XmlElement } from '../xml/tree'

const lc = (s: string) => s.toLowerCase()
const isOpenlr = (e: XmlElement) => lc(e.local).startsWith('openlr')

const LRP = new Set(['openlrlocationreferencepoint', 'openlrlastlocationreferencepoint'])
const COORD = new Set(['openlrcoordinate', 'openlrcoordinates'])
const POINT_ROOT = new Set(['openlrpointlocationreference', 'openlrextendedpoint'])
const ROLE = new Set(['firstdirection', 'oppositedirection'])

function firstDesc(el: XmlElement, pred: (e: XmlElement) => boolean): XmlElement | undefined {
  for (const c of el.children) {
    if (pred(c)) return c
    const d = firstDesc(c, pred)
    if (d) return d
  }
  return undefined
}

function allDesc(el: XmlElement, pred: (e: XmlElement) => boolean, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (pred(c)) out.push(c)
    allDesc(c, pred, out)
  }
  return out
}

const named = (name: string) => (e: XmlElement) => lc(e.local) === name

function textOf(el: XmlElement, name: string): string | undefined {
  const t = firstDesc(el, named(name))?.text
  return t ? t : undefined
}

function numberOf(el: XmlElement, name: string): number | undefined {
  const t = textOf(el, name)
  if (t === undefined) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

/** `frc3`, `FRC3`, `3` → `FRC3`; anything else is returned unchanged. */
export function normaliseFrc(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const m = /^(?:frc)?\s*([0-7])$/i.exec(raw.trim())
  return m ? `FRC${m[1]}` : raw
}

function coordinatesOf(el: XmlElement): Pick<OpenlrLrp, 'lat' | 'lon' | 'rawLat' | 'rawLon'> {
  const coord = firstDesc(el, (e) => COORD.has(lc(e.local))) ?? el
  const rawLat = firstDesc(coord, named('latitude'))?.text
  const rawLon = firstDesc(coord, named('longitude'))?.text
  const num = (s: string | undefined) => {
    if (s === undefined || s.trim() === '') return undefined
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }
  return { rawLat, rawLon, lat: num(rawLat), lon: num(rawLon) }
}

function decodeLrp(el: XmlElement, basePath: string): OpenlrLrp {
  return {
    ...coordinatesOf(el),
    frc: normaliseFrc(textOf(el, 'openlrfunctionalroadclass')),
    fow: textOf(el, 'openlrformofway'),
    bearing: numberOf(el, 'openlrbearing'),
    lfrcnp: normaliseFrc(textOf(el, 'openlrlowestfrctonextlrpoint')),
    dnp: numberOf(el, 'openlrdistancetonextlrpoint'),
    last: lc(el.local) === 'openlrlastlocationreferencepoint',
    xmlPath: xmlPath(el, basePath),
  }
}

function lrpsOf(el: XmlElement, basePath: string): OpenlrLrp[] {
  return allDesc(el, (e) => LRP.has(lc(e.local))).map((e) => decodeLrp(e, basePath))
}

function hasAncestor(el: XmlElement, stop: XmlElement, pred: (e: XmlElement) => boolean): boolean {
  for (let p = el.parent; p && p !== stop; p = p.parent) if (pred(p)) return true
  return false
}

/**
 * Decodes every OpenLR reference in `location`: one entry per direction section of a line, per
 * point reference, per area reference and per binary blob. Returns an empty array when the
 * location has no OpenLR.
 */
export function decodeOpenlr(location: XmlElement, basePath: string): OpenlrReference[] {
  if (!firstDesc(location, isOpenlr)) return []
  const out: OpenlrReference[] = []
  const covered = new Set<XmlElement>()

  // Binary: a `binary` element inside an OpenLR container, or an element named like `openlrBinary`.
  for (const b of allDesc(location, (e) => (lc(e.local) === 'binary' && hasAncestor(e, location, isOpenlr)) || lc(e.local) === 'openlrbinary')) {
    covered.add(b)
    out.push({ encoding: 'binary', kind: 'unknown', lrps: [], binaryLength: b.text.length, xmlPath: xmlPath(b, basePath) })
  }

  // Lines: `firstDirection` / `oppositeDirection` sections of an OpenLR line container.
  for (const role of allDesc(location, (e) => ROLE.has(lc(e.local)) && !!e.parent && isOpenlr(e.parent))) {
    const offsetsEl = role
    out.push({
      encoding: 'structured',
      kind: 'line',
      role: lc(role.local) === 'firstdirection' ? 'firstDirection' : 'oppositeDirection',
      lrps: lrpsOf(role, basePath),
      positiveOffset: numberOf(offsetsEl, 'openlrpositiveoffset'),
      negativeOffset: numberOf(offsetsEl, 'openlrnegativeoffset'),
      xmlPath: xmlPath(role, basePath),
    })
    for (const d of allDesc(role, () => true)) covered.add(d)
  }

  // Line references without a direction role (other encodings of the same model).
  for (const line of allDesc(location, (e) => lc(e.local) === 'openlrlinelocationreference' && !covered.has(e))) {
    out.push({
      encoding: 'structured',
      kind: 'line',
      lrps: lrpsOf(line, basePath),
      positiveOffset: numberOf(line, 'openlrpositiveoffset'),
      negativeOffset: numberOf(line, 'openlrnegativeoffset'),
      xmlPath: xmlPath(line, basePath),
    })
    for (const d of allDesc(line, () => true)) covered.add(d)
  }

  // Points: the outermost point container (v2 `openlrExtendedPoint` wraps `openlrPointLocationReference`).
  for (const p of allDesc(location, (e) => POINT_ROOT.has(lc(e.local)) && !hasAncestor(e, location, (a) => POINT_ROOT.has(lc(a.local))))) {
    let lrps = lrpsOf(p, basePath)
    if (!lrps.length) {
      // OpenlrGeoCoordinate and similar: a single coordinate pair, no line attributes.
      const c = firstDesc(p, (e) => COORD.has(lc(e.local)))
      if (c) lrps = [{ ...coordinatesOf(c), last: true, xmlPath: xmlPath(c, basePath) }]
    }
    out.push({
      encoding: 'structured',
      kind: 'point',
      pointType: xsiType(p) ?? firstDesc(p, (e) => /^openlr(pointalongline|geocoordinate|poiwithaccesspoint)$/.test(lc(e.local)))?.local,
      lrps,
      positiveOffset: numberOf(p, 'openlrpositiveoffset'),
      negativeOffset: numberOf(p, 'openlrnegativeoffset'),
      orientation: textOf(p, 'openlrorientation'),
      sideOfRoad: textOf(p, 'openlrsideofroad'),
      xmlPath: xmlPath(p, basePath),
    })
    for (const d of allDesc(p, () => true)) covered.add(d)
  }

  // Areas: recognised but not decoded further.
  for (const a of allDesc(location, (e) => lc(e.local).startsWith('openlrarea') && !hasAncestor(e, location, (x) => lc(x.local).startsWith('openlrarea')))) {
    out.push({ encoding: 'structured', kind: 'area', lrps: [], xmlPath: xmlPath(a, basePath) })
    for (const d of allDesc(a, () => true)) covered.add(d)
  }

  if (!out.length) {
    const first = firstDesc(location, isOpenlr)!
    out.push({ encoding: 'structured', kind: 'unknown', lrps: lrpsOf(location, basePath), xmlPath: xmlPath(first, basePath) })
  }
  return out
}

/** True when the LRP has finite coordinates inside the WGS 84 range and is not exactly 0/0. */
export function validWgs84(p: { lat?: number; lon?: number }): p is { lat: number; lon: number } {
  return (
    p.lat !== undefined &&
    p.lon !== undefined &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180 &&
    !(p.lat === 0 && p.lon === 0)
  )
}

/** A structured reference whose LRPs all carry valid WGS 84 coordinates. */
export function usableOpenlr(r: OpenlrReference): boolean {
  return r.encoding === 'structured' && r.lrps.length > 0 && r.lrps.every(validWgs84)
}

/** Short label for lists, e.g. `OpenLR line (structured, firstDirection, 3 LRPs)`. */
export function describeOpenlr(r: OpenlrReference): string {
  if (r.encoding === 'binary') return 'OpenLR (binary, not decoded)'
  const parts = [r.role, r.lrps.length ? `${r.lrps.length} LRP${r.lrps.length === 1 ? '' : 's'}` : undefined].filter(Boolean)
  return `OpenLR ${r.kind === 'unknown' ? '' : `${r.kind} `}(structured${parts.length ? `, ${parts.join(', ')}` : ''})`
}

// Converts one DATEX II `situation` element tree (v2 or v3) into the normalised model. Both
// versions share most local names, so the code matches on local names and ignores prefixes.

import type { LaneCode, LaneImpact, RestrictionType, RoadEvent, Situation, TypeBasis } from '../model'
import { laneEvidenceOf, laneStatesFromCode } from '../lanes/codes'
import {
  child,
  childrenNamed,
  descendants,
  firstDescendant,
  path,
  textAt,
  walk,
  xmlPath,
  xsiType,
  type XmlElement,
} from '../xml/tree'

/** `roadOrCarriagewayOrLaneManagementType` values that claim the road or carriageway is closed. */
export const FULL_CLOSURE_TYPES = new Set(['roadClosed', 'carriagewayClosures'])

/** Management types that reduce capacity without closing the carriageway. */
export const PARTIAL_CLOSURE_TYPES = new Set([
  'laneClosures',
  'narrowLanes',
  'singleAlternateLineTraffic',
  'contraflow',
  'lanesDeviated',
  'intermittentShortTermClosures',
  'hardShoulderRunningNotInOperation',
  'carPoolLaneInOperation',
  'useOfSpecifiedLanesOrCarriagewaysAllowed',
  'useSpecifiedLanesOrCarriageways',
  'doNotUseSpecifiedLanesOrCarriageways',
  'twoWayTrafficOnCarriageway',
])

const WORKS_RECORD_TYPES = new Set(['MaintenanceWorks', 'ConstructionWorks', 'Roadworks', 'RoadOrCarriagewayOrLaneManagement'])

/** Location referencing elements → label shown to users. */
const LOCATION_METHODS: Record<string, string> = {
  gmlLineString: 'gmlLineString',
  pointCoordinates: 'pointCoordinates',
  locationForDisplay: 'locationForDisplay',
  alertCLinear: 'alertC (linear)',
  alertCPoint: 'alertC (point)',
  openlrLocationReferencePoint: 'OpenLR',
  openlrPointLocationReference: 'OpenLR',
  tpegLinearLocation: 'TPEG (linear)',
  tpegPointLocation: 'TPEG (point)',
  linearWithinLinearElement: 'linear element reference',
  pointAlongLinearElement: 'point along linear element',
  areaLocation: 'area',
  namedArea: 'named area',
}

/** Raw coordinates kept until the file-wide axis order is known. */
export interface PendingGeometry {
  lines: number[][]
  /** Points with explicit latitude/longitude elements (unambiguous axis order). */
  points: Array<[lat: number, lon: number]>
  /** True when `points` come only from `locationForDisplay`. */
  displayOnly: boolean
  warnings: string[]
}

export interface NormalisedSituation {
  situation: Situation
  events: RoadEvent[]
  geometries: PendingGeometry[]
  duplicateRecordIds: string[]
}

export function normaliseSituation(sit: XmlElement, basePath: string): NormalisedSituation {
  const situationId = sit.attrs['id'] ?? `(situation at line ${sit.line})`
  const situationPath = xmlPath(sit, basePath)
  const situationSpan = { start: sit.start, end: sit.end, line: sit.line }
  const events: RoadEvent[] = []
  const geometries: PendingGeometry[] = []
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const rec of childrenNamed(sit, 'situationRecord')) {
    const id = rec.attrs['id'] ?? `(record at line ${rec.line})`
    if (seen.has(id)) duplicates.push(id)
    seen.add(id)
    const { event, geometry } = normaliseRecord(rec, situationId, basePath, situationSpan)
    events.push(event)
    geometries.push(geometry)
  }

  const related = [
    ...descendants(child(sit, 'relatedSituation'), 'objectReference').map((e) => e.attrs['id']),
    ...childrenNamed(sit, 'relatedSituation').map((e) => e.attrs['id']),
  ].filter((x): x is string => !!x)

  return {
    situation: {
      id: situationId,
      version: sit.attrs['version'],
      severity: textAt(sit, 'overallSeverity'),
      recordIds: events.map((e) => e.id),
      relatedSituationIds: [...new Set(related)],
      span: situationSpan,
      xmlPath: situationPath,
    },
    events,
    geometries,
    duplicateRecordIds: duplicates,
  }
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

function commentsOf(rec: XmlElement): RoadEvent['comments'] {
  const out: RoadEvent['comments'] = []
  for (const gpc of childrenNamed(rec, 'generalPublicComment')) {
    const type =
      textAt(gpc, 'commentType') ??
      textAt(gpc, 'commentExtension', 'commentExtended', 'commentType2') ??
      textAt(gpc, '_generalPublicCommentExtension', 'commentType2')
    for (const v of descendants(child(gpc, 'comment'), 'value')) {
      if (v.text) out.push({ type, lang: v.attrs['lang'], text: v.text })
    }
  }
  return out
}

function deepestText(el: XmlElement | undefined, local: string): string | undefined {
  for (const d of descendants(el, local)) if (d.text) return d.text
  return undefined
}

function normaliseRecord(
  rec: XmlElement,
  situationId: string,
  basePath: string,
  situationSpan: RoadEvent['situationSpan'],
): { event: RoadEvent; geometry: PendingGeometry } {
  const id = rec.attrs['id'] ?? `(record at line ${rec.line})`
  const recordType = xsiType(rec)
  const warnings: string[] = []

  // validity
  const validity = child(rec, 'validity')
  const spec = child(validity, 'validityTimeSpecification')
  const validFrom = textAt(spec, 'overallStartTime')
  const validTo = textAt(spec, 'overallEndTime')
  const hasPeriods =
    childrenNamed(spec, 'validPeriod').length > 0 ||
    childrenNamed(spec, 'exceptionPeriod').length > 0 ||
    [...walk(rec)].some((e) => /^TimePeriod/.test(xsiType(e) ?? ''))

  // management, cause
  const managementTypes = [
    ...new Set(descendants(rec, 'roadOrCarriagewayOrLaneManagementType').map((e) => e.text).filter(Boolean)),
  ]
  const causeEl = child(rec, 'cause')
  const causeRecordIds = [
    ...new Set(
      descendants(causeEl, 'managedCause')
        .map((e) => e.attrs['id'])
        .concat(descendants(causeEl, 'causingSituationRecordReference').map((e) => e.attrs['id']))
        .filter((x): x is string => !!x),
    ),
  ]

  // lanes
  const laneCodes: LaneCode[] = []
  for (const field of ['laneStatusCoded', 'extendedLaneStatusCoded'] as const) {
    for (const e of descendants(rec, field)) if (e.text) laneCodes.push({ field, value: e.text, xmlPath: xmlPath(e, basePath) })
  }
  const laneStates = laneCodes.flatMap((c) => laneStatesFromCode(c.value, c.field, c.xmlPath, { validFrom, validTo }))
  const impact = child(rec, 'impact')
  const laneImpact: LaneImpact = {
    numberOfLanesRestricted: num(textAt(impact, 'numberOfLanesRestricted')),
    originalNumberOfLanes: num(textAt(impact, 'originalNumberOfLanes')) ?? num(deepestText(rec, 'originalNumberOfLanes')),
    numberOfOperationalLanes: num(textAt(impact, 'numberOfOperationalLanes')),
    capacityRemaining: num(textAt(impact, 'capacityRemaining')),
  }

  // restriction type
  let type: RestrictionType = 'unknown'
  let typeBasis: TypeBasis = 'none'
  const lanes = laneEvidenceOf(laneCodes)
  if (managementTypes.some((t) => FULL_CLOSURE_TYPES.has(t))) {
    type = 'fullClosure'
    typeBasis = 'managementType'
  } else if (managementTypes.some((t) => PARTIAL_CLOSURE_TYPES.has(t))) {
    type = 'partialClosure'
    typeBasis = 'managementType'
  } else if (lanes.evidence === 'closure') {
    type = 'fullClosure'
    typeBasis = 'laneStatus'
  } else if (lanes.evidence === 'partial') {
    type = 'partialClosure'
    typeBasis = 'laneStatus'
  } else if (recordType && WORKS_RECORD_TYPES.has(recordType)) {
    type = 'roadworks'
    typeBasis = 'recordType'
  }

  // location
  const location = child(rec, 'groupOfLocations') ?? child(rec, 'locationReference') ?? rec
  const methods = new Set<string>()
  for (const e of walk(location)) {
    const m = LOCATION_METHODS[e.local]
    if (m) methods.add(m)
  }
  const geometry = collectGeometry(location, warnings)

  const comments = commentsOf(rec)
  const description =
    comments.find((c) => c.type === 'description')?.text ?? comments.find((c) => c.type === 'roadworksName')?.text ?? comments[0]?.text

  const event: RoadEvent = {
    id,
    version: rec.attrs['version'],
    situationId,
    recordType,
    type,
    typeBasis,
    managementTypes,
    complianceOption: textAt(rec, 'complianceOption'),
    causeType: deepestText(causeEl, 'causeType'),
    causeRecordIds,
    description,
    comments,
    validFrom,
    validTo,
    validityStatus: textAt(validity, 'validityStatus'),
    hasPeriods,
    geometryConfidence: 'none',
    locationMethods: [...methods],
    roadNumber: deepestText(location, 'roadNumber'),
    roadName: deepestText(path(firstDescendant(location, 'roadName'), 'values'), 'value') ?? deepestText(firstDescendant(location, 'roadName'), 'value'),
    carriageway: deepestText(location, 'carriageway'),
    direction:
      deepestText(location, 'directionRelativeOnLinearSection') ??
      deepestText(location, 'alertCAffectedDirection') ??
      deepestText(location, 'tpegDirection') ??
      deepestText(location, 'directionBoundOnLinearSection'),
    laneCodes,
    laneStates,
    laneImpact,
    xmlPath: xmlPath(rec, basePath),
    span: { start: rec.start, end: rec.end, line: rec.line },
    situationSpan,
    warnings,
  }
  return { event, geometry }
}

function collectGeometry(location: XmlElement, warnings: string[]): PendingGeometry {
  const lines: number[][] = []
  for (const ls of descendants(location, 'gmlLineString')) {
    const pl = child(ls, 'posList') ?? firstDescendant(ls, 'posList')
    if (!pl) continue
    const dim = Number(pl.attrs['srsDimension'] ?? ls.attrs['srsDimension'] ?? 2) || 2
    const values = pl.text.split(/[\s,]+/).filter(Boolean).map(Number)
    if (values.some((v) => !Number.isFinite(v))) {
      warnings.push('posList contains values that are not numbers')
      continue
    }
    if (values.length % dim !== 0) {
      warnings.push(`posList has ${values.length} values, not a multiple of srsDimension ${dim}`)
      continue
    }
    const flat: number[] = []
    for (let i = 0; i < values.length; i += dim) flat.push(values[i]!, values[i + 1]!)
    if (flat.length < 4) {
      warnings.push('gmlLineString has fewer than two positions')
      continue
    }
    lines.push(flat)
  }
  const points: Array<[number, number]> = []
  let displayOnly = true
  for (const pc of descendants(location, 'pointCoordinates')) {
    const lat = num(textAt(pc, 'latitude'))
    const lon = num(textAt(pc, 'longitude'))
    if (lat !== undefined && lon !== undefined) {
      points.push([lat, lon])
      displayOnly = false
    }
  }
  for (const lfd of descendants(location, 'locationForDisplay')) {
    const lat = num(textAt(lfd, 'latitude'))
    const lon = num(textAt(lfd, 'longitude'))
    if (lat !== undefined && lon !== undefined) points.push([lat, lon])
  }
  return { lines, points, displayOnly: points.length > 0 && displayOnly, warnings }
}

// The normalised core model shared by all modules (concept §6.4). Modules work on these objects,
// never on XML DOM nodes.

import type { Geometry } from 'geojson'

export type DatexVersion = '2' | '3' | 'unknown'

/** How a geometry was obtained (concept §5.2). */
export type GeometryConfidence = 'direct' | 'decoded' | 'approximate' | 'matched' | 'none'

export type RestrictionType = 'fullClosure' | 'partialClosure' | 'roadworks' | 'unknown'

/** What the restriction type was derived from. */
export type TypeBasis = 'managementType' | 'laneStatus' | 'recordType' | 'none'

export type Severity = 'error' | 'warning' | 'info'

/** Validation layer a finding belongs to. The UI keeps these visibly apart. */
export type FindingLayer =
  | 'xml'
  | 'datex'
  | 'xsd'
  | 'profile'
  | 'extension'
  | 'semantic'
  | 'location'
  | 'lanes'
  | 'passability'
  | 'rtti'

export interface Finding {
  ruleId: string
  severity: Severity
  layer: FindingLayer
  /** One-line, human-readable statement. */
  message: string
  /** Longer explanation, assumptions and what to check. */
  explanation?: string
  situationId?: string
  recordIds?: string[]
  xmlPath?: string
  line?: number
  column?: number
  rawValue?: string
  remedy?: string
}

export type NormalizedLaneStatus = 'open' | 'closed' | 'restricted' | 'noStopping' | 'other' | 'unknown'

export interface LaneState {
  source: 'datex2'
  /** Position in the lane-status string (0-based, lanes only). */
  laneReference?: string
  /** `direction` = direction of the location, `oncoming` = opposite carriageway. */
  direction?: 'direction' | 'oncoming' | 'both'
  rawStatus?: string
  normalizedStatus?: NormalizedLaneStatus
  /** Field the value came from. */
  field?: 'laneStatusCoded' | 'extendedLaneStatusCoded'
  xmlPath?: string
  validFrom?: string
  validTo?: string
}

export interface LaneCode {
  field: 'laneStatusCoded' | 'extendedLaneStatusCoded'
  value: string
  xmlPath: string
}

export interface LaneImpact {
  numberOfLanesRestricted?: number
  originalNumberOfLanes?: number
  numberOfOperationalLanes?: number
  capacityRemaining?: number
}

/** One OpenLR location reference point as written in the feed (structured encoding). */
export interface OpenlrLrp {
  lat?: number
  lon?: number
  /** Coordinate text as written, kept for messages about invalid values. */
  rawLat?: string
  rawLon?: string
  /** Functional road class, normalised to `FRC0`…`FRC7` when recognised. */
  frc?: string
  fow?: string
  bearing?: number
  /** Lowest FRC to the next LRP. */
  lfrcnp?: string
  /** Distance to the next LRP in metres. */
  dnp?: number
  /** True for `openlrLastLocationReferencePoint`. */
  last: boolean
  xmlPath: string
}

/** An OpenLR location reference found in a record's location (see `src/location/openlr.ts`). */
export interface OpenlrReference {
  encoding: 'structured' | 'binary'
  kind: 'line' | 'point' | 'area' | 'unknown'
  /** Direction section of a line (`OpenlrLinear`). */
  role?: 'firstDirection' | 'oppositeDirection'
  /** Point reference type, e.g. `OpenlrPointAlongLine`. */
  pointType?: string
  lrps: OpenlrLrp[]
  positiveOffset?: number
  negativeOffset?: number
  orientation?: string
  sideOfRoad?: string
  /** Length of the binary text (binary encoding only). */
  binaryLength?: number
  xmlPath: string
}

export interface LaneDetail {
  /** `laneNumber` values (supplementaryPositionalDescription / carriageway / lane). */
  laneNumbers: string[]
  /** `laneUsage` values. */
  laneUsages: string[]
  /** True when a `lane` element carries both laneNumber and laneUsage. */
  laneNumberWithUsage: boolean
  /** True when a `lane` element carries laneUsage without laneNumber (RRP-RTTI: use them jointly). */
  laneUsageWithoutNumber: boolean
  residualRoadWidth?: number
}

export interface SourceSpan {
  /** Character offsets in the decoded document. */
  start: number
  end: number
  line: number
}

export interface RoadEvent {
  /** situationRecord id. */
  id: string
  version?: string
  situationId: string
  publicationId?: string
  /** `xsi:type` of the situation record, e.g. `MaintenanceWorks`. */
  recordType?: string
  type: RestrictionType
  typeBasis: TypeBasis
  /** Raw `roadOrCarriagewayOrLaneManagementType` value(s). */
  managementTypes: string[]
  complianceOption?: string
  causeType?: string
  /** Situation record ids named as cause (`managedCause`). */
  causeRecordIds: string[]
  description?: string
  comments: Array<{ type?: string; lang?: string; text: string }>
  validFrom?: string
  validTo?: string
  validityStatus?: string
  /** True when the validity uses recurring or restricted periods (e.g. by hour). */
  hasPeriods: boolean
  geometry?: Geometry
  geometryConfidence: GeometryConfidence
  /** Explanation of where the geometry came from or why there is none. */
  geometryNote?: string
  /** Location referencing methods present in the record (gmlLineString, alertC, openlr, …). */
  locationMethods: string[]
  roadNumber?: string
  roadName?: string
  carriageway?: string
  direction?: string
  laneCodes: LaneCode[]
  laneStates: LaneState[]
  laneImpact: LaneImpact
  /** `situationRecordCreationTime`. */
  createdAt?: string
  /** `situationRecordVersionTime`. */
  versionTime?: string
  /** `situationRecordFirstSupplierVersionTime`. */
  firstSupplierVersionTime?: string
  probabilityOfOccurrence?: string
  /** `urgentRoadworks` (v2) as a boolean. */
  urgentRoadworks?: boolean
  roadworksDuration?: string
  /** `mobilityType` (e.g. `mobile`, `stationary`). */
  mobilityType?: string
  /** Work type values: maintenanceWorkType, constructionWorkType (v3), roadMaintenanceType (v2). */
  workTypes: string[]
  /** `operatorActionStatus` / `actionStatus` (e.g. `implemented`, `terminated`). */
  operatorActionStatus?: string
  laneDetail: LaneDetail
  speedManagementTypes: string[]
  temporarySpeedLimit?: number
  generalNetworkManagementTypes: string[]
  /** Vehicle characteristics the record is restricted to, as `name=value` strings. */
  vehicleCharacteristics: string[]
  /** Raw `directionRelativeOnLinearSection` (relative to the linear element, not to a polyline). */
  directionRelative?: string
  /** Raw `directionBoundOnLinearSection` (compass or ring direction). */
  directionBound?: string
  /** Raw `alertCAffectedDirection`. */
  alertCAffectedDirection?: string
  /** `xsi:type` of the `linearElement` the direction refers to, e.g. `LinearElementByCode`. */
  linearElementKind?: string
  /** Largest number of significant decimals in the record's coordinate text. */
  coordinateDecimals?: number
  /** Explicit latitude/longitude points of the record (pointCoordinates, display points). */
  referencePoints: Array<[lat: number, lon: number]>
  /** OpenLR references in the location (decoded when structured). */
  openlr: OpenlrReference[]
  xmlPath: string
  span: SourceSpan
  situationSpan: SourceSpan
  sourceProfile?: string
  warnings: string[]
}

export interface Situation {
  id: string
  version?: string
  severity?: string
  recordIds: string[]
  /** Ids of related situations (v3 `relatedSituation`). */
  relatedSituationIds: string[]
  span: SourceSpan
  xmlPath: string
}

export type Passability = 'passable' | 'restricted' | 'closed' | 'conditional' | 'conflicting' | 'unknown'

export type LaneEvidence = 'closure' | 'partial' | 'parking_stopping_only' | 'open' | 'absent' | 'unknown'

export interface PassabilityFinding {
  ruleId: string
  situationId: string
  recordIds: string[]
  classification: Passability
  reportedClosure: boolean
  laneEvidence: LaneEvidence
  severity: Severity
  evidence: Array<{ recordId: string; xmlPath?: string; rawValue?: string; interpretation: string }>
  routingAction: 'block' | 'do_not_block' | 'manual_review'
  assumptions: string[]
  message: string
}

export interface RecordPassability {
  recordId: string
  classification: Passability
  /** Whether this record itself claims a full closure. */
  reportedClosure: boolean
  laneEvidence: LaneEvidence
  routingAction: 'block' | 'do_not_block' | 'manual_review'
  reasons: string[]
}

export interface NamespaceInfo {
  uri: string
  prefixes: string[]
  elementCount: number
  /** Most frequent element local names in this namespace (name → count). */
  topElements: Record<string, number>
  classification: NamespaceClass
}

export type NamespaceClass =
  | 'datex2-base'
  | 'datex2-other'
  | 'infrastructure'
  | 'foreign'

export interface ExtensionUse {
  /** Element that opens the extension (e.g. `impactExtension`, `_situationRecordExtension`). */
  container: string
  mechanism: 'v2-extension' | 'v3-extension' | 'foreign-namespace'
  count: number
  /** Element names found inside the extension (name → count). */
  contents: Record<string, number>
}

export interface FeedMeta {
  datexVersion: DatexVersion
  modelBaseVersion?: string
  rootElement?: string
  rootNamespace?: string
  /** Publication type, e.g. `SituationPublication`. */
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
  compressed: boolean
  encoding: string
  /** Statistics used for axis-order detection of gml posList values. */
  axisOrder: AxisOrderDecision
}

export type AxisOrder = 'latlon' | 'lonlat'

export interface AxisOrderDecision {
  order: AxisOrder
  /** How the order was chosen. */
  basis: 'specification' | 'reference-points' | 'override'
  votesLatLon: number
  votesLonLat: number
}

export interface WellFormedness {
  ok: boolean
  error?: { message: string; line: number; column: number }
}

export interface AnalysisResult {
  fileName?: string
  wellFormed: WellFormedness
  meta: FeedMeta
  situations: Situation[]
  events: RoadEvent[]
  findings: Finding[]
  /** Findings per rule beyond the stored cap are counted, not stored. */
  findingCounts: Record<string, number>
  passability: PassabilityFinding[]
  recordPassability: Record<string, RecordPassability>
  profileId: string
  /** RTTI 5-Star indicators (https://tisa.org/rtti-5-star-rating-specification/). */
  rtti?: RttiAssessment
  durationMs: number
}

// RTTI 5-Star indicators. Plain data so the result can cross the worker boundary.

export type RttiUseCase = 'plannedRoadworks' | 'unplannedRoadworks' | 'plannedClosure' | 'unplannedClosure'

export type RttiWeight = 'critical' | 'high' | 'medium' | 'low'

export interface RttiCriterionResult {
  id: string
  name: string
  weight: RttiWeight
  /** `ceiling`: the file caps the level; `info`: shown without a level; `not-from-file`: needs other evidence. */
  kind: 'ceiling' | 'info' | 'not-from-file'
  /** 0–5; 0 means even 1★ is not met. Set when kind is `ceiling`. */
  ceiling?: number
  /** One-line summary of the evidence. */
  evidence: string
  /** What each star level requires in the spec table (index 0 = 1★). */
  levels?: string[]
  /** Records per level or category, e.g. `[{ label: '5★', count: 12 }]`. */
  distribution?: Array<{ label: string; count: number }>
  /** Records that limit the ceiling (capped). */
  recordIds?: string[]
  /** Total number of limiting records (before capping). */
  recordCount?: number
  /** Finding rule ids with details. */
  ruleIds?: string[]
  /** For `not-from-file`: what would be needed. */
  needs?: string
  /** Sub-criterion of another criterion (e.g. direction under linear referencing). */
  parent?: string
  /** Assumptions made for this criterion. */
  notes?: string[]
}

export interface RttiUseCaseResult {
  useCase: RttiUseCase
  label: string
  /** Spec table the thresholds come from, e.g. `Table 15`. */
  table: string
  situationIds: string[]
  recordIds: string[]
  /** How planned/unplanned was decided, e.g. `{ 'lead time ≥ 24 h': 40 }`. */
  basis: Record<string, number>
  criteria: RttiCriterionResult[]
}

export interface RttiAssessment {
  specVersion: string
  specUrl: string
  useCases: RttiUseCaseResult[]
  /** Records not rated, grouped by reason. */
  outOfScope: Array<{ reason: string; recordIds: string[] }>
  /** Feed-wide notes (e.g. static speed limits not applicable). */
  notes: string[]
  /** OpenLR summary for the feed. */
  openlr: OpenlrSummary
}

export interface OpenlrSummary {
  records: number
  recordsWithOpenlr: number
  structured: number
  binary: number
  lines: number
  points: number
  areas: number
  lrps: number
  validLrps: number
}

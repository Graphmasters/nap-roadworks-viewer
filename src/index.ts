// nap-roadworks-viewer: analyse DATEX II roadworks and closure publications in the browser.

export * from './model'
export { analyseDatex, runChecks, FINDINGS_PER_RULE, type AnalyseOptions, type AnalyseProgress } from './analyse'
export { openText, isGzip, sniffEncoding, sourceFromBytes, extractText, type ByteSource, type OpenedText } from './ingest/read'
export { parseDatexStream, classifyNamespace, type ParseOptions, type ParseOutput, type ParseHeader } from './datex/parse'
export { normaliseSituation, FULL_CLOSURE_TYPES, PARTIAL_CLOSURE_TYPES } from './records/normalise'
export { applyGeometry, decideAxisOrder, distanceM, distanceToLineM, bearingDeg, angleDiff } from './location/geometry'
export {
  laneStatesFromCode,
  summariseLaneCode,
  laneEvidenceOf,
  oneSideFullyClosed,
  type LaneCodeSummary,
} from './lanes/codes'
export { LANE_CATEGORIES, laneCategoriesOf, type LaneCategory, type LaneCategorySpec } from './lanes/categories'
export { compareLanes, osmLaneAttributes, type LaneComparison, type LaneIndicator, type OsmLaneAttributes } from './lanes/compare'
export { analysePassability, reportsFullClosure, passabilityToFinding, type PassabilityOutput } from './passability/classify'
export { PROFILES, detectProfile, profileById, type Profile, type ProfileContext } from './validation/profiles'
export { feedChecks, recordChecks, openlrChecks, OPENLR_MAX_DNP_M } from './validation/rules'
export { decodeOpenlr, validWgs84, usableOpenlr, describeOpenlr, normaliseFrc } from './location/openlr'
export { assessRtti, summariseOpenlr, type RttiOutput } from './rtti/assess'
export { classifySituations, type SituationClass } from './rtti/classify'
export {
  RTTI_SPEC_URL,
  RTTI_SPEC_VERSION,
  USE_CASES,
  WEIGHTS as RTTI_WEIGHTS,
  CRITERION_NAME as RTTI_CRITERION_NAME,
  PLANNED_LEAD_TIME_H,
} from './rtti/spec'
export {
  matchEvent,
  linesOf,
  recordWayOrientation,
  WEIGHTS,
  AMBIGUITY_MARGIN,
  MERGED_PENALTY,
  MIN_QUALITY,
  type MatchCandidate,
  type MatchOptions,
  type MatchResult,
  type MatchStatus,
  type ScoredCandidate,
  type ScoreComponents,
  type LonLat,
} from './matching/score'
export {
  highwayValuesFor,
  matchEventRefined,
  type Bbox,
  type HighwayFetcher,
  type HighwayWay,
  type RefinedMatchResult,
  type Refinement,
  type RefineOptions,
} from './matching/refine'
export type { XmlElement } from './xml/tree'

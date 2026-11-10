// Thresholds, weights and level texts of the TISA RTTI 5-Star Rating Specification v1.0
// (21 October 2025), https://tisa.org/rtti-5-star-rating-specification/, kept in one place so the
// assessment can be audited against the spec tables (Tables 10 and 15–18, Annex 3).

import type { RttiUseCase, RttiWeight } from '../model'

export const RTTI_SPEC_URL = 'https://tisa.org/rtti-5-star-rating-specification/'
export const RTTI_SPEC_VERSION = 'TISA RTTI 5-Star Rating Specification v1.0 (21 October 2025)'

/** Lead time (creation → start) from which roadworks or closures count as planned. Assumption, not in the spec. */
export const PLANNED_LEAD_TIME_H = 24
/** An explicit point farther than this from the record's own polyline is reported (RTTI-ACC-02). */
export const POINT_TO_LINE_WARN_M = 250
/** Tolerance on top of the OpenLR offset when matching polyline ends to OpenLR LRPs. */
export const OPENLR_END_TOLERANCE_M = 100
/** Polyline bearing vs. compass direction (`northBound` …) tolerance. */
export const COMPASS_TOLERANCE_DEG = 60
/** Metres per degree of latitude, for the coordinate-resolution bound. */
export const M_PER_DEG = 111_320

export const USE_CASES: Record<RttiUseCase, { label: string; table: string }> = {
  plannedRoadworks: { label: 'Planned roadworks', table: 'Table 15' },
  unplannedRoadworks: { label: 'Unplanned roadworks', table: 'Table 16' },
  plannedClosure: { label: 'Planned full road closure', table: 'Table 17' },
  unplannedClosure: { label: 'Unplanned full road closure', table: 'Table 18' },
}

export const USE_CASE_ORDER: RttiUseCase[] = ['plannedRoadworks', 'unplannedRoadworks', 'plannedClosure', 'unplannedClosure']

export type CriterionId =
  | 'terminology'
  | 'dataFormat'
  | 'useOfSpecification'
  | 'locationReferencing'
  | 'linearReferencing'
  | 'direction'
  | 'updateCycle'
  | 'timeliness'
  | 'accuracy'
  | 'correctness'
  | 'completeness'
  | 'eventId'
  | 'secureApi'
  | 'outdated'
  | 'shortTermEvents'
  | 'roadType'
  | 'laneLevel'
  | 'validity'
  | 'vehicleClassification'
  | 'causeType'
  | 'preAnnouncement'

export const CRITERION_NAME: Record<CriterionId, string> = {
  terminology: 'Terminology & definition',
  dataFormat: 'Data format used',
  useOfSpecification: 'Use of specification',
  locationReferencing: 'Location referencing',
  linearReferencing: 'Linear referencing',
  direction: 'Direction defined FRC3–6',
  updateCycle: 'Update cycle',
  timeliness: 'Timeliness',
  accuracy: 'Accuracy (FRC rows)',
  correctness: 'Correctness (FRC rows)',
  completeness: 'Completeness (FRC rows)',
  eventId: 'RTTI event message ID',
  secureApi: 'Secure API access',
  outdated: 'Outdated messages deleted from feed',
  shortTermEvents: 'Availability short-term events',
  roadType: 'Road type',
  laneLevel: 'Lane-level attribute',
  validity: 'Validity',
  vehicleClassification: 'Vehicle classification',
  causeType: 'Cause type',
  preAnnouncement: 'Pre-announcement',
}

const C: RttiWeight = 'critical'
const H: RttiWeight = 'high'
const M: RttiWeight = 'medium'
const L: RttiWeight = 'low'

const COMMON: Partial<Record<CriterionId, RttiWeight>> = {
  terminology: H,
  dataFormat: H,
  useOfSpecification: H,
  locationReferencing: H,
  linearReferencing: C,
  direction: C,
  updateCycle: M,
  timeliness: C,
  accuracy: C,
  correctness: C,
  completeness: C,
  eventId: C,
  secureApi: M,
  outdated: L,
}

/** Criteria and weights per use case (rows of Tables 15–18; lane-level attribute from Annex 3). */
export const WEIGHTS: Record<RttiUseCase, Partial<Record<CriterionId, RttiWeight>>> = {
  plannedRoadworks: { ...COMMON, shortTermEvents: L, roadType: L, laneLevel: L, validity: L, vehicleClassification: L, preAnnouncement: L },
  unplannedRoadworks: { ...COMMON, shortTermEvents: L, roadType: L, validity: L },
  plannedClosure: { ...COMMON, validity: L, preAnnouncement: L },
  unplannedClosure: { ...COMMON, vehicleClassification: L, causeType: M },
}

/** Thresholds per star level (index 0 = 1★). Accuracy in metres ("<"), percentages (">"). */
export interface FrcThresholds {
  accuracyM: number[]
  correctnessPct: number[]
  completenessPct: number[]
}

export const FRC_THRESHOLDS: Record<RttiUseCase, { frc1to4: FrcThresholds; frc5to6?: FrcThresholds }> = {
  plannedRoadworks: {
    frc1to4: { accuracyM: [1000, 500, 250, 100, 50], correctnessPct: [70, 75, 80, 85, 90], completenessPct: [70, 75, 80, 85, 90] },
    frc5to6: { accuracyM: [200, 100, 50, 25, 10], correctnessPct: [60, 65, 70, 75, 80], completenessPct: [60, 65, 70, 75, 80] },
  },
  unplannedRoadworks: {
    frc1to4: { accuracyM: [1000, 500, 250, 100, 50], correctnessPct: [70, 75, 80, 85, 90], completenessPct: [70, 75, 80, 85, 90] },
  },
  plannedClosure: {
    frc1to4: { accuracyM: [250, 100, 50, 25, 10], correctnessPct: [80, 85, 90, 95, 99], completenessPct: [80, 85, 90, 95, 99] },
    frc5to6: { accuracyM: [50, 20, 10, 5, 1], correctnessPct: [70, 75, 80, 85, 90], completenessPct: [70, 75, 80, 85, 90] },
  },
  unplannedClosure: {
    frc1to4: { accuracyM: [250, 100, 50, 25, 10], correctnessPct: [80, 85, 90, 95, 99], completenessPct: [80, 85, 90, 95, 99] },
    frc5to6: { accuracyM: [50, 20, 10, 5, 1], correctnessPct: [70, 75, 80, 85, 90], completenessPct: [70, 75, 80, 85, 90] },
  },
}

/**
 * FRC is unknown, so each measure uses the looser of the FRC groups to stay an upper bound:
 * FRC1–4 for accuracy (larger distances), FRC5–6 for correctness and completeness (lower %).
 */
export function looserThresholds(uc: RttiUseCase): FrcThresholds {
  const t = FRC_THRESHOLDS[uc]
  return {
    accuracyM: t.frc1to4.accuracyM,
    correctnessPct: (t.frc5to6 ?? t.frc1to4).correctnessPct,
    completenessPct: (t.frc5to6 ?? t.frc1to4).completenessPct,
  }
}

/** Highest level whose threshold the value beats; 0 when even 1★ is not met. */
export function levelBelow(valueM: number, thresholdsM: number[]): number {
  let level = 0
  thresholdsM.forEach((t, i) => {
    if (valueM < t) level = i + 1
  })
  return level
}

export function levelAbove(pct: number, thresholdsPct: number[]): number {
  let level = 0
  thresholdsPct.forEach((t, i) => {
    if (pct > t) level = i + 1
  })
  return level
}

const fmtM = (m: number) => (m >= 1000 ? `<${m / 1000} km` : `<${m} m`)

/** Level texts (index 0 = 1★) for display, per use case. */
export function levelTexts(uc: RttiUseCase, id: CriterionId): string[] | undefined {
  const t = FRC_THRESHOLDS[uc]
  const unplanned = uc === 'unplannedRoadworks' || uc === 'unplannedClosure'
  const closure = uc === 'plannedClosure' || uc === 'unplannedClosure'
  const frc = (pick: (x: FrcThresholds) => number[], fmt: (v: number) => string) =>
    [0, 1, 2, 3, 4].map((i) => `FRC1–4 ${fmt(pick(t.frc1to4)[i]!)}${t.frc5to6 ? ` · FRC5–6 ${fmt(pick(t.frc5to6)[i]!)}` : ''}`)
  switch (id) {
    case 'terminology':
      return ['Self-defined', 'Self-defined', 'Harmonised definition', 'Harmonised definition', 'Harmonised definition']
    case 'dataFormat':
      return uc === 'plannedRoadworks'
        ? ['Bespoke local format or DATEX II', 'Only DATEX II v2', 'Only DATEX II v2', 'Only DATEX II v3', 'DATEX II v3+, compliant with the reference profile']
        : ['Bespoke local format or DATEX II', 'Bespoke local format or DATEX II', 'DATEX II v2', 'DATEX II v3', 'DATEX II v3+, compliant with the reference profile']
    case 'useOfSpecification':
      return ['Ad hoc implementation', 'Ad hoc implementation', 'Consistent use (EU reference profiles)', 'Consistent use (EU reference profiles)', 'Consistent use (EU reference profiles)']
    case 'locationReferencing':
      return uc === 'unplannedClosure'
        ? ['Basic GNSS coordinates', 'Basic GNSS coordinates', 'Strong preference for OpenLR over TMC', 'Strong preference for OpenLR over TMC', 'Only OpenLR']
        : ['Basic GNSS coordinates', 'Basic GNSS coordinates', 'Basic GNSS coordinates', 'OpenLR or TMC', 'OpenLR']
    case 'linearReferencing':
      return ['Polylines', 'Polylines', 'Polylines', 'Polylines', 'Polylines']
    case 'direction':
      return ['Not referenced', 'Not referenced', 'Referenced', 'Referenced', 'Referenced']
    case 'accuracy':
      return frc((x) => x.accuracyM, fmtM)
    case 'correctness':
      return frc((x) => x.correctnessPct, (v) => `>${v} %`)
    case 'completeness':
      return frc((x) => x.completenessPct, (v) => `>${v} %`)
    case 'eventId':
      return ['IDs may change for the same event', 'IDs may change for the same event', 'Same ID for same event (stable)', 'Same ID for same event (stable)', 'Same ID for same event (stable)']
    case 'outdated':
      return ['Max 4 weeks', 'Max 3 weeks', 'Max 2 weeks', 'Max 1 week', 'Max 24 hours']
    case 'shortTermEvents':
      return unplanned
        ? ['Scheduled roadworks only', 'Scheduled roadworks only', 'Scheduled and unplanned', 'Scheduled and unplanned', 'Scheduled and unplanned']
        : ['Yes', 'Yes', 'Yes', 'Yes', 'Yes']
    case 'roadType':
      return unplanned
        ? ['Generic roadworks only', 'Generic roadworks only', 'Lane level incl. narrow lanes', 'Lane level specific', 'Lane level specific']
        : ['Generic roadworks only', 'Generic roadworks only', 'Lane level incl. narrow lanes', 'Lane level incl. narrow lanes', 'Which lane is closed, lane-width reduction, lane-level speed limit changes']
    case 'laneLevel':
      return ['Not available', 'Not available', 'Which lane is closed', 'Which lane, lane-width reduction, lane-level speed limits', 'Which lane, lane-width reduction, lane-level speed limits']
    case 'validity':
      return ['Start/stop times', 'Start/stop times', 'Schedules available', 'Schedules available', 'Schedules available']
    case 'vehicleClassification':
      return closure
        ? ['No detail on vehicle type', 'No detail on vehicle type', 'Vehicle type specific (e.g. HDV)', 'Vehicle type specific (e.g. HDV)', 'Vehicle type specific (e.g. HDV)']
        : ['M1 + N1', 'M1 + N1', 'M1–M3, N1–N3', 'M1–M3, N1–N3', 'M1–M3, N1–N3']
    case 'causeType':
      return ['No explanation', 'No explanation', 'Explanation provided', 'Explanation provided', 'Explanation provided']
    case 'updateCycle':
      return closure
        ? unplanned
          ? ['Every 3 days', 'Daily', 'Every 10 minutes', 'Every 5 minutes', 'Every minute']
          : ['Every 3 days', 'Daily', 'Twice daily', 'Every 3 hours', 'Every 5–60 minutes']
        : unplanned
          ? ['Every 3 days', 'Daily', 'Every 10 minutes', 'Every 5 minutes', 'Every minute']
          : ['Weekly', 'Every 3 days', 'Daily', 'Max 6 hours', 'Hourly']
    case 'timeliness':
      return closure
        ? unplanned
          ? ['Max 3 days', 'Max 24 hours', 'Max 10 minutes', 'Max 5 minutes', 'Max 1 minute']
          : ['Max 3 days', 'Max 24 hours', 'Max 12 hours', 'Max 3 hours', 'Max 5–60 minutes']
        : unplanned
          ? ['Max 3 days', 'Max 24 hours', 'Max 10 minutes', 'Max 5 minutes', 'Max 1 minute']
          : ['Max 1 week', 'Max 3 days', 'Max 24 hours', 'Max 6 hours', 'Max 1 hour']
    case 'secureApi':
      return ['Non-secured', 'Non-secured', 'Secured (https)', 'Secured via https', 'Secured via https']
    default:
      return undefined
  }
}

/** DATEX II RRP-RTTI (https://docs.datex2.eu/recommended-profiles/rrp/rtti/) value lists. */
export const RRP = {
  worksRecordTypes: new Set(['MaintenanceWorks', 'ConstructionWorks']),
  closureTypes: new Set(['roadClosed', 'carriagewayClosures', 'rollingRoadBlock']),
  workTypes: new Set([
    // constructionWorkType
    'blastingWork',
    'constructionWork',
    'demolitionWork',
    'roadImprovementOrUpgrading',
    'roadWideningWork',
    // maintenanceWorkType (v2 roadMaintenanceType uses the same names)
    'accidentRepairWork',
    'clearanceWork',
    'controlledAvalanche',
    'grassCuttingWork',
    'installationWork',
    'litterClearance',
    'maintenancePeopleOnRoad',
    'maintenanceWork',
    'other',
    'overheadWorks',
    'repairWork',
    'resurfacingWork',
    'roadMarkingWork',
    'roadsideWork',
    'roadworks',
    'roadworksClearance',
    'rockFallPreventativeMaintenance',
    'saltingInProgress',
    'snowploughsInUse',
    'sweepingOfRoad',
    'treeAndVegetationCuttingWork',
  ]),
  managementTypes: new Set([
    'carPoolLaneInOperation',
    'carriagewayClosures',
    'clearALaneForEmergencyVehicles',
    'clearALaneForSnowploughsAndGrittingVehicles',
    'closedPermanentlyForTheWinter',
    'contraflow',
    'doNotUseSpecifiedLanesOrCarriageways',
    'hardShoulderRunningInOperation',
    'hardShoulderRunningNotInOperation',
    'heightRestrictionInOperation',
    'intermittentShortTermClosures',
    'keepToTheLeft',
    'keepToTheRight',
    'laneClosures',
    'lanesDeviated',
    'narrowLanes',
    'newRoadworksLayout',
    'other',
    'overnightClosures',
    'roadCleared',
    'roadClosed',
    'rollingRoadBlock',
    'rushHourLaneInOperation',
    'singleAlternateLineTraffic',
    'tidalFlowLaneInOperation',
    'turnAroundInOperation',
    'useOfSpecifiedLanesOrCarriagewaysAllowed',
    'useSpecifiedLanesOrCarriageways',
    'vehicleStorageInOperation',
    'weightRestrictionInOperation',
  ]),
}

/** Maintenance work done by moving vehicles, outside the roadworks scope of the spec (§3.5 note). */
export const MOVING_WORK_TYPES = new Set(['snowploughsInUse', 'saltingInProgress', 'sweepingOfRoad', 'grassCuttingWork'])

export const WORKS_RECORD_TYPES = new Set(['MaintenanceWorks', 'ConstructionWorks', 'Roadworks'])

/** Management types that give lane-level detail (roadworks road type L1). */
export const LANE_MANAGEMENT_TYPES = new Set(['laneClosures', 'narrowLanes', 'contraflow', 'singleAlternateLineTraffic', 'lanesDeviated', 'intermittentShortTermClosures', 'newRoadworksLayout'])

export const COMPASS: Record<string, number> = { northBound: 0, eastBound: 90, southBound: 180, westBound: 270 }

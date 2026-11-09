// Special lane configurations found in MDM lane-status codes (`laneStatusCoded`,
// `extendedLaneStatusCoded`), used to filter records and as small icons.
//
// The alphabet is lane-status-viewer's: w reversible, e/i narrowed, x closed, p parking lane,
// P no parking, H no stopping, f/F cycle path open/closed, g/G foot path open/closed, s hard
// shoulder, r/l hard-shoulder marking (direction of travel / oncoming). The hard shoulder has no
// open/closed code of its own: it is the space outside a marking (right of `r`, left of `l`).
// A drivable lane there means the shoulder is in use; `x` there means it is closed. A plain `s`
// is a hard shoulder that is not open to traffic, its normal state, and counts as neither.

export type LaneCategory =
  | 'reversible'
  | 'hardShoulderClosed'
  | 'hardShoulderOpen'
  | 'narrowed'
  | 'closed'
  | 'parkingLane'
  | 'parkingRestriction'
  | 'cyclewayOpen'
  | 'cyclewayClosed'
  | 'footpathOpen'
  | 'footpathClosed'

export interface LaneCategorySpec {
  id: LaneCategory
  label: string
  /** Lane-status code drawn as the category's icon (lane-status-viewer). */
  icon: string
  /** Which codes count, in words. */
  rule: string
  pattern: RegExp
}

const DRIVABLE = 'oueiw'

/** In filter order. */
export const LANE_CATEGORIES: readonly LaneCategorySpec[] = [
  { id: 'reversible', label: 'Reversible lane', icon: 'w', rule: 'w', pattern: /w/ },
  { id: 'hardShoulderClosed', label: 'Hard shoulder closed', icon: 'rx', rule: 'x outside a hard-shoulder marking (rx, xl)', pattern: /rx|xl/ },
  {
    id: 'hardShoulderOpen',
    label: 'Hard shoulder open',
    icon: 'ro',
    rule: 'a drivable lane (o, u, e, i, w) outside a hard-shoulder marking',
    pattern: new RegExp(`r[${DRIVABLE}]|[${DRIVABLE}]l`),
  },
  { id: 'narrowed', label: 'Narrowed lane', icon: 'e', rule: 'e, i', pattern: /[ei]/ },
  { id: 'closed', label: 'Lane closed', icon: 'x', rule: 'x', pattern: /x/ },
  { id: 'parkingLane', label: 'Parking lane', icon: 'p', rule: 'p', pattern: /p/ },
  { id: 'parkingRestriction', label: 'Parking restrictions', icon: 'P', rule: 'P (no parking), H (no stopping)', pattern: /[PH]/ },
  { id: 'cyclewayOpen', label: 'Cycleway open', icon: 'f', rule: 'f', pattern: /f/ },
  { id: 'cyclewayClosed', label: 'Cycleway closed', icon: 'F', rule: 'F', pattern: /F/ },
  { id: 'footpathOpen', label: 'Pedestrian path open', icon: 'g', rule: 'g', pattern: /g/ },
  { id: 'footpathClosed', label: 'Pedestrian path closed', icon: 'G', rule: 'G', pattern: /G/ },
]

/** Categories present in any of the codes (order of LANE_CATEGORIES). */
export function laneCategoriesOf(codes: ReadonlyArray<{ value: string } | string>): LaneCategory[] {
  const values = codes.map((c) => (typeof c === 'string' ? c : c.value).replace(/\s+/g, ''))
  return LANE_CATEGORIES.filter((c) => values.some((v) => c.pattern.test(v))).map((c) => c.id)
}

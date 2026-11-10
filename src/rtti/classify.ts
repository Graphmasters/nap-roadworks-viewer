// Assigns each situation to one RTTI 5-Star use case (https://tisa.org/rtti-5-star-rating-specification/,
// §3.5 roadworks, §3.6 road closures) or marks it out of scope with a reason.
//
// Closure: at least one record closes the road or carriageway (all lanes in a direction).
// Roadworks: otherwise, a works record, or a lane restriction caused by roadworks.
// Planned vs unplanned: `urgentRoadworks`, else the lead time between creation and start
// (assumption: under PLANNED_LEAD_TIME_H hours is unplanned, see §3.5 "scheduled unplanned").

import type { RoadEvent, RttiUseCase, Situation } from '../model'
import { MOVING_WORK_TYPES, PLANNED_LEAD_TIME_H, WORKS_RECORD_TYPES } from './spec'

export interface SituationClass {
  situationId: string
  useCase?: RttiUseCase
  /** How planned/unplanned was decided. */
  basis?: string
  /** Why the situation is not rated. */
  outOfScope?: string
}

const WORKS_CAUSES = /roadmaintenance|roadworks|construction|maintenance/i

function isWorks(e: RoadEvent): boolean {
  return (e.recordType !== undefined && WORKS_RECORD_TYPES.has(e.recordType)) || e.workTypes.length > 0
}

function ms(s: string | undefined): number {
  return s ? Date.parse(s) : NaN
}

/** Earliest creation (or first supplier version) and earliest start over the records. */
function leadTimeH(records: RoadEvent[]): number | undefined {
  const created = records.map((e) => ms(e.createdAt ?? e.firstSupplierVersionTime)).filter((v) => !Number.isNaN(v))
  const start = records.map((e) => ms(e.validFrom)).filter((v) => !Number.isNaN(v))
  if (!created.length || !start.length) return undefined
  return (Math.min(...start) - Math.min(...created)) / 3_600_000
}

export function classifySituations(situations: Situation[], events: RoadEvent[]): SituationClass[] {
  const bySituation = new Map<string, RoadEvent[]>()
  for (const e of events) {
    let list = bySituation.get(e.situationId)
    if (!list) bySituation.set(e.situationId, (list = []))
    list.push(e)
  }
  const out: SituationClass[] = []
  const seen = new Set<string>()
  for (const s of situations) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    const recs = bySituation.get(s.id) ?? []
    if (!recs.length) {
      out.push({ situationId: s.id, outOfScope: 'situation without records' })
      continue
    }
    const closure = recs.some((e) => e.type === 'fullClosure')
    const works = recs.some(isWorks)
    const worksCaused = recs.some((e) => e.type === 'partialClosure' && WORKS_CAUSES.test(e.causeType ?? ''))
    if (!closure && recs.some((e) => e.mobilityType === 'mobile')) {
      out.push({ situationId: s.id, outOfScope: 'moving roadworks (mobilityType mobile)' })
      continue
    }
    const worksRecs = recs.filter(isWorks)
    if (!closure && worksRecs.length && worksRecs.every((e) => e.workTypes.length > 0 && e.workTypes.every((w) => MOVING_WORK_TYPES.has(w)))) {
      out.push({ situationId: s.id, outOfScope: 'mobile maintenance (snowploughs, salting, sweeping, grass cutting)' })
      continue
    }
    if (!closure && !works && !worksCaused) {
      const types = [...new Set(recs.map((e) => e.recordType ?? '(no xsi:type)'))].join(', ')
      out.push({
        situationId: s.id,
        outOfScope: recs.some((e) => e.type === 'partialClosure')
          ? 'lane restriction without a roadworks cause (no works record or roadworks causeType)'
          : `not roadworks or a closure (${types})`,
      })
      continue
    }
    let planned: boolean
    let basis: string
    if (recs.some((e) => e.urgentRoadworks === true)) {
      planned = false
      basis = 'urgentRoadworks = true'
    } else {
      const lead = leadTimeH(recs)
      if (lead === undefined) {
        planned = true
        basis = 'no creation or start time (assumed planned)'
      } else if (lead >= PLANNED_LEAD_TIME_H) {
        planned = true
        basis = `lead time ≥ ${PLANNED_LEAD_TIME_H} h`
      } else {
        planned = false
        basis = lead < 0 ? 'created after start' : `lead time < ${PLANNED_LEAD_TIME_H} h`
      }
    }
    const useCase: RttiUseCase = closure ? (planned ? 'plannedClosure' : 'unplannedClosure') : planned ? 'plannedRoadworks' : 'unplannedRoadworks'
    out.push({ situationId: s.id, useCase, basis })
  }
  return out
}

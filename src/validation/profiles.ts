// Profile registry. A profile names the data model a feed is expected to follow and carries
// profile-specific checks. These checks are heuristics derived from observed feeds and the
// profile documentation: they are labelled as such and never presented as a full conformance test.

import type { FeedMeta, Finding, RoadEvent } from '../model'

export interface ProfileContext {
  meta: FeedMeta
  events: RoadEvent[]
}

export interface Profile {
  id: string
  label: string
  datexVersion: '2' | '3' | 'any'
  description: string
  /** Score in [0, 1] for automatic selection. */
  detect(ctx: ProfileContext): number
  checks(ctx: ProfileContext): Finding[]
}

const WORKS = new Set(['MaintenanceWorks', 'ConstructionWorks', 'Roadworks'])

const generic = (v: '2' | '3'): Profile => ({
  id: `datex2-v${v}`,
  label: `DATEX II v${v} (generic)`,
  datexVersion: v,
  description: `Generic DATEX II v${v} situation publication. No profile-specific rules.`,
  detect: ({ meta }) => (meta.datexVersion === v ? 0.1 : 0),
  checks: () => [],
})

export const PROFILES: Profile[] = [
  {
    id: 'de-mdm-roadworks-04-00-00',
    label: 'MDM roadworks profile 04-00-00 (DE)',
    datexVersion: '2',
    description:
      'German MDM "Datenmodell für Baustellen" 04-00-00 on DATEX II v2.3, with laneStatusCoded / extendedLaneStatusCoded in impactExtension. Checks are heuristic.',
    detect: ({ meta, events }) => {
      if (meta.datexVersion !== '2') return 0
      let s = 0
      if (/^DE-MDM/i.test(meta.nationalIdentifier ?? '')) s += 0.6
      if (events.some((e) => e.laneCodes.length)) s += 0.3
      if (meta.extensions.some((x) => x.container === 'impactExtension')) s += 0.1
      return s
    },
    checks: ({ events }) => {
      const out: Finding[] = []
      for (const e of events) {
        if (e.recordType && WORKS.has(e.recordType) && !e.laneCodes.length)
          out.push({
            ruleId: 'MDM-H01',
            severity: 'info',
            layer: 'profile',
            message: `${e.recordType} record without laneStatusCoded.`,
            explanation: 'Heuristic: in MDM roadworks feeds, works records usually describe the lane layout. Without it, lane closures cannot be compared.',
            situationId: e.situationId,
            recordIds: [e.id],
            xmlPath: e.xmlPath,
          })
        if (e.recordType === 'RoadOrCarriagewayOrLaneManagement' && !e.causeRecordIds.length)
          out.push({
            ruleId: 'MDM-H02',
            severity: 'info',
            layer: 'profile',
            message: 'Traffic management record without a managedCause link.',
            explanation: 'Heuristic: MDM closure records normally point to the works record that causes them. Without the link, the closure cannot be checked against the lane layout.',
            situationId: e.situationId,
            recordIds: [e.id],
            xmlPath: e.xmlPath,
          })
      }
      return out
    },
  },
  {
    id: 'nl-ndw-v3',
    label: 'NDW situation feeds (NL, DATEX II v3)',
    datexVersion: '3',
    description: 'DATEX II v3 situation publications with NDW extensions (nlExtensions, nlxExtensions). Checks are heuristic.',
    detect: ({ meta }) => {
      if (meta.datexVersion !== '3') return 0
      let s = 0
      if (meta.nationalIdentifier === 'NDWNL') s += 0.6
      if (meta.namespaces.some((n) => /\/nlx?Extensions$/.test(n.uri))) s += 0.3
      return s
    },
    checks: ({ events }) =>
      events
        .filter((e) => !e.locationMethods.includes('gmlLineString') && e.locationMethods.some((m) => m.startsWith('alertC')))
        .map((e) => ({
          ruleId: 'NDW-H01',
          severity: 'info' as const,
          layer: 'profile' as const,
          message: 'Record has an AlertC location but no gmlLineString.',
          explanation: 'Heuristic: NDW situation feeds usually add a gmlLineString to every linear location. This record can only be located by decoding AlertC.',
          situationId: e.situationId,
          recordIds: [e.id],
          xmlPath: e.xmlPath,
        })),
  },
  generic('2'),
  generic('3'),
]

export function detectProfile(ctx: ProfileContext): Profile {
  let best = PROFILES[PROFILES.length - 1]!
  let bestScore = -1
  for (const p of PROFILES) {
    const s = p.detect(ctx)
    if (s > bestScore) {
      best = p
      bestScore = s
    }
  }
  return best
}

export function profileById(id: string): Profile | undefined {
  return PROFILES.find((p) => p.id === id)
}

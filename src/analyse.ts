// End-to-end analysis of one DATEX II document: stream → parse → normalise → locate → check.

import { parseDatexStream } from './datex/parse'
import { openText, type ByteSource } from './ingest/read'
import { applyGeometry, decideAxisOrder, newVotes, voteAxisOrder } from './location/geometry'
import type { AnalysisResult, AxisOrder, FeedMeta, Finding, RoadEvent, Situation } from './model'
import { analysePassability, passabilityToFinding } from './passability/classify'
import { normaliseSituation, type PendingGeometry } from './records/normalise'
import { detectProfile, profileById } from './validation/profiles'
import { assessRtti } from './rtti/assess'
import { feedChecks, openlrChecks, recordChecks } from './validation/rules'

/** Findings stored per rule id; further ones are only counted. */
export const FINDINGS_PER_RULE = 2000

export interface AnalyseProgress {
  bytesRead: number
  totalBytes?: number
  characters: number
  situations: number
  records: number
}

export interface AnalyseOptions {
  fileName?: string
  /** Force the posList axis order instead of detecting it. */
  axisOrder?: AxisOrder
  /** Force a profile instead of detecting it. */
  profileId?: string
  onProgress?(p: AnalyseProgress): void
  signal?: AbortSignal
}

export async function analyseDatex(source: ByteSource, options: AnalyseOptions = {}): Promise<AnalysisResult> {
  const t0 = Date.now()
  const situations: Situation[] = []
  const events: RoadEvent[] = []
  const pending: PendingGeometry[] = []
  const duplicates: Array<{ situationId: string; id: string }> = []
  const votes = newVotes()
  const progress: AnalyseProgress = { bytesRead: 0, totalBytes: source.size, characters: 0, situations: 0, records: 0 }
  let lastReport = 0
  const report = (force = false) => {
    const now = Date.now()
    if (force || now - lastReport > 100) {
      lastReport = now
      options.onProgress?.({ ...progress })
    }
  }

  const opened = await openText(source, (n) => {
    progress.bytesRead = n
  })
  const parsed = await parseDatexStream(opened.text, {
    signal: options.signal,
    onProgress: (c) => {
      progress.characters = c
      report()
    },
    onSituation: (el, base) => {
      const n = normaliseSituation(el, base)
      situations.push(n.situation)
      for (let i = 0; i < n.events.length; i++) {
        events.push(n.events[i]!)
        pending.push(n.geometries[i]!)
        voteAxisOrder(n.geometries[i]!, votes)
      }
      for (const id of n.duplicateRecordIds) duplicates.push({ situationId: n.situation.id, id })
      progress.situations = situations.length
      progress.records = events.length
    },
  })
  report(true)

  const axisOrder = decideAxisOrder(votes, options.axisOrder)
  for (let i = 0; i < events.length; i++) applyGeometry(events[i]!, pending[i]!, axisOrder.order)

  const meta: FeedMeta = {
    ...parsed.header,
    compressed: opened.compressed,
    encoding: opened.encoding,
    axisOrder,
  }
  const result: AnalysisResult = {
    fileName: options.fileName,
    wellFormed: parsed.wellFormed,
    meta,
    situations,
    events,
    findings: [],
    findingCounts: {},
    passability: [],
    recordPassability: {},
    profileId: '',
    durationMs: 0,
  }
  runChecks(result, options.profileId, duplicates)
  result.durationMs = Date.now() - t0
  return result
}

/**
 * (Re)computes findings, passability and the profile. Call again with another profile id to
 * re-run the profile checks after the user changed the profile.
 */
export function runChecks(
  result: AnalysisResult,
  profileId?: string,
  duplicates: Array<{ situationId: string; id: string }> = [],
): AnalysisResult {
  const { meta, situations, events } = result
  const ctx = { meta, events }
  const profile = (profileId && profileById(profileId)) || detectProfile(ctx)
  for (const e of events) e.sourceProfile = profile.id
  const pass = analysePassability(situations, events)

  const all: Finding[] = []
  if (!result.wellFormed.ok && result.wellFormed.error) {
    const e = result.wellFormed.error
    all.push({
      ruleId: 'XML-001',
      severity: 'error',
      layer: 'xml',
      message: `The file is not well-formed XML: ${e.message}`,
      explanation:
        situations.length > 0
          ? `Parsing stopped at line ${e.line}, column ${e.column}. The ${situations.length} situation(s) read before that point are shown, but the file is incomplete.`
          : `Parsing stopped at line ${e.line}, column ${e.column}.`,
      line: e.line,
      column: e.column,
    })
  }
  all.push(...feedChecks(meta, situations))
  all.push(...recordChecks(events, meta, duplicates.length ? duplicates : findDuplicates(situations)))
  all.push(...openlrChecks(events))
  all.push(...pass.referenceFindings)
  all.push(...pass.findings.map(passabilityToFinding))
  all.push(...profile.checks(ctx))
  const rtti = assessRtti(result, all)
  all.push(...rtti.findings)

  const counts: Record<string, number> = {}
  const kept: Finding[] = []
  for (const f of all) {
    counts[f.ruleId] = (counts[f.ruleId] ?? 0) + 1
    if (counts[f.ruleId]! <= FINDINGS_PER_RULE) kept.push(f)
  }
  result.findings = kept
  result.findingCounts = counts
  result.passability = pass.findings
  result.recordPassability = pass.records
  result.profileId = profile.id
  result.rtti = rtti.assessment
  return result
}

function findDuplicates(situations: Situation[]): Array<{ situationId: string; id: string }> {
  const out: Array<{ situationId: string; id: string }> = []
  for (const s of situations) {
    const seen = new Set<string>()
    for (const id of s.recordIds) {
      if (seen.has(id)) out.push({ situationId: s.id, id })
      seen.add(id)
    }
  }
  return out
}

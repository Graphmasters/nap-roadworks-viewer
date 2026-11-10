/// <reference types="node" />
// Opt-in checks against real NAP feeds. The repository contains no real feed data, so this suite
// only runs when DATEX_SAMPLES_DIR points at a local folder of downloaded feeds, e.g.
//   DATEX_SAMPLES_DIR="$HOME/Downloads/DATEX II Examples" npx vitest run test/samples.test.ts
// Exact counts are pinned for the snapshots named below; other snapshots get the invariant checks.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyseDatex, sourceFromBytes, validWgs84, type AnalysisResult } from '../src/index'

const dir = process.env['DATEX_SAMPLES_DIR']
const available = !!dir && existsSync(dir)

function find(sub: string, prefix: string): string | undefined {
  const d = join(dir!, sub)
  if (!existsSync(d)) return undefined
  const f = readdirSync(d)
    .filter((n) => n.startsWith(prefix) && n.endsWith('.xml'))
    .sort()
    .at(-1)
  return f ? join(d, f) : undefined
}

const load = async (file: string) => analyseDatex(sourceFromBytes(new Uint8Array(readFileSync(file))), { fileName: file })
const count = (r: AnalysisResult, rule: string) => r.findingCounts[rule] ?? 0

function openlrInvariants(r: AnalysisResult) {
  const refs = r.events.flatMap((e) => e.openlr)
  expect(refs.length).toBeGreaterThan(0)
  expect(refs.every((x) => x.encoding === 'structured')).toBe(true)
  const lrps = refs.flatMap((x) => x.lrps)
  expect(lrps.every(validWgs84)).toBe(true)
  expect(lrps.every((p) => /^FRC[0-7]$/.test(p.frc ?? ''))).toBe(true)
  for (const rule of ['OLR-001', 'OLR-002', 'OLR-003', 'OLR-004', 'OLR-005']) expect([rule, count(r, rule)]).toEqual([rule, 0])
}

describe.skipIf(!available)('real sample feeds (DATEX_SAMPLES_DIR)', () => {
  it('HR v2 roadworks: structured OpenLR in extensions, OpenLR lines as polylines', async () => {
    const file = find('hr', 'npt-hak-roadworks')
    if (!file) return
    const r = await load(file)
    expect(r.meta.datexVersion).toBe('2')
    openlrInvariants(r)
    const crit = (id: string) => r.rtti!.useCases.flatMap((u) => u.criteria).filter((c) => c.id === id)
    // The feed has no gmlLineString: its polylines come from OpenLR lines only.
    for (const c of crit('linearReferencing')) expect(c.distribution!.map((d) => d.label).sort()).toEqual(['OpenLR line', 'no polyline'])
    if (file.endsWith('2026-11-10T10_38_46.xml')) {
      expect(r.events).toHaveLength(147)
      expect(r.rtti!.openlr).toMatchObject({ recordsWithOpenlr: 53, structured: 53, binary: 0, lines: 37, points: 16, lrps: 117, validLrps: 117 })
      // Seven references (5 lines, 2 points) have a distance to the next point above the OpenLR maximum of 15 km.
      expect(count(r, 'OLR-006')).toBe(7)
      const dist = (id: string) => Object.fromEntries(crit(id)[0]!.distribution!.map((d) => [d.label, d.count]))
      expect(dist('linearReferencing')).toEqual({ 'OpenLR line': 32, 'no polyline': 115 })
      // directionRelativeOnLinearSection = both on 4 of them, while OpenLR has firstDirection only.
      expect(dist('direction')).toEqual({ 'no polyline': 115, unambiguous: 28, ambiguous: 4 })
      expect(count(r, 'RTTI-DIR-03')).toBe(4)
    }
  })

  it('SI v3 roadworks: native OpenLR, coordinatesForDisplay, direction via OpenLR offsets', async () => {
    const file = find('si', 'svn-ncup-roadworks')
    if (!file) return
    const r = await load(file)
    expect(r.meta.datexVersion).toBe('3')
    openlrInvariants(r)
    expect(r.events.some((e) => e.locationMethods.includes('coordinatesForDisplay'))).toBe(true)
    if (file.endsWith('2026-11-10T10_38_46.xml')) {
      expect(r.events).toHaveLength(160)
      expect(r.rtti!.openlr).toMatchObject({ recordsWithOpenlr: 160, structured: 160, binary: 0, lines: 21, points: 139, lrps: 321, validLrps: 321 })
      expect(count(r, 'OLR-006')).toBe(0)
      // The 88 singleAlternateLineTraffic records have no roadworks cause and are not rated.
      expect(r.rtti!.outOfScope).toEqual([{ reason: expect.stringContaining('lane restriction without a roadworks cause'), recordIds: expect.any(Array) }])
      expect(r.rtti!.outOfScope[0]!.recordIds).toHaveLength(88)
      const dir = r.rtti!.useCases.find((u) => u.useCase === 'unplannedRoadworks')!.criteria.find((c) => c.id === 'direction')!
      expect(Object.fromEntries(dir.distribution!.map((d) => [d.label, d.count]))).toEqual({ 'no polyline': 64, unambiguous: 3, ambiguous: 2, contradiction: 1 })
      // OpenLR firstDirection only, but ALERT-C says both directions.
      expect(count(r, 'RTTI-DIR-03')).toBe(2)
      // One record's polyline starts 5.6 km from the first LRP with a 3.3 km offset.
      expect(count(r, 'RTTI-DIR-02')).toBe(1)
    }
  })

  it('analyses every sample feed and its RTTI indicators without throwing', async () => {
    const files: string[] = []
    for (const sub of readdirSync(dir!, { withFileTypes: true }))
      if (sub.isDirectory())
        for (const f of readdirSync(join(dir!, sub.name))) if (f.endsWith('.xml')) files.push(join(dir!, sub.name, f))
    for (const f of files) {
      const r = await load(f)
      if (r.meta.publicationType !== 'SituationPublication') continue
      expect(r.rtti, f).toBeDefined()
      expect(() => structuredClone(r.rtti)).not.toThrow()
    }
  }, 300_000)
})

import { describe, expect, it } from 'vitest'
import { analyseDatex, decodeOpenlr, normaliseFrc, RTTI_SPEC_URL, sourceFromBytes, type AnalysisResult, type RttiUseCase } from '../src/index'
import {
  LINE_A,
  V2_ALL_LANES,
  V2_MDM,
  V2_OPENLR,
  V2_URGENT,
  V3_DIRECTIONS,
  V3_RICH,
  v2Doc,
  v2Record,
  v2Situation,
  gml,
  LINE_E,
  v3Doc,
  v3Lrp,
  v3Record,
  v3Situation,
} from './fixtures'

const run = (xml: string) => analyseDatex(sourceFromBytes(xml))
const rules = (r: AnalysisResult) => new Set(r.findings.map((f) => f.ruleId))
const useCase = (r: AnalysisResult, id: RttiUseCase) => r.rtti!.useCases.find((u) => u.useCase === id)!
const criterion = (r: AnalysisResult, uc: RttiUseCase, id: string) => useCase(r, uc).criteria.find((c) => c.id === id)!
const ceiling = (r: AnalysisResult, uc: RttiUseCase, id: string) => criterion(r, uc, id).ceiling
const recordsWith = (r: AnalysisResult, rule: string) => r.findings.filter((f) => f.ruleId === rule).map((f) => f.recordIds?.[0])
const line = (posList: string) => `<linearExtension><linearExtended><gmlLineString><posList>${posList}</posList></gmlLineString></linearExtended></linearExtension>`

describe('OpenLR decoding', () => {
  it('decodes v3 native and v2 extension OpenLR with line attributes', async () => {
    const v3 = await run(V3_RICH)
    const ref = v3.events.find((e) => e.id === 'R-1-W')!.openlr[0]!
    expect(ref).toMatchObject({ encoding: 'structured', kind: 'line', role: 'firstDirection', positiveOffset: 72, negativeOffset: 72 })
    expect(ref.lrps).toHaveLength(2)
    expect(ref.lrps[0]).toMatchObject({ lat: 50, lon: 7.999, frc: 'FRC3', fow: 'singleCarriageway', bearing: 90, lfrcnp: 'FRC3', dnp: 1150, last: false })
    expect(ref.lrps[1]!.last).toBe(true)

    const v2 = await run(V2_OPENLR)
    const line = v2.events.find((e) => e.id === 'H-1-R')!
    expect(line.openlr).toHaveLength(1)
    expect(line.openlr[0]).toMatchObject({ kind: 'line', role: 'firstDirection' })
    expect(line.openlr[0]!.lrps.map((p) => p.frc)).toEqual(['FRC0', 'FRC0'])
    expect(line.locationMethods).toContain('OpenLR (structured)')
    const point = v2.events.find((e) => e.id === 'H-2-R')!.openlr[0]!
    expect(point).toMatchObject({ kind: 'point', pointType: 'openlrPointAlongLine', positiveOffset: 300, sideOfRoad: 'onRoadOrUnknown' })
    expect(point.lrps).toHaveLength(2)
  })

  it('detects binary OpenLR without decoding it', async () => {
    const r = await run(V2_OPENLR)
    const e = r.events.find((x) => x.id === 'H-BIN-R')!
    expect(e.openlr).toEqual([expect.objectContaining({ encoding: 'binary', kind: 'unknown', lrps: [] })])
    expect(e.locationMethods).toContain('OpenLR (binary)')
    expect(r.rtti!.openlr).toMatchObject({ records: 10, recordsWithOpenlr: 10, structured: 9, binary: 1, lines: 8, points: 1 })
  })

  it('reports OpenLR presence for feeds without OpenLR', async () => {
    const r = await run(V2_MDM)
    expect(r.rtti!.openlr.recordsWithOpenlr).toBe(0)
    expect(r.events.every((e) => e.openlr.length === 0)).toBe(true)
  })

  it('normalises FRC spellings', () => {
    expect(normaliseFrc('frc3')).toBe('FRC3')
    expect(normaliseFrc('FRC0')).toBe('FRC0')
    expect(normaliseFrc('5')).toBe('FRC5')
    expect(normaliseFrc('motorway')).toBe('motorway')
    expect(decodeOpenlr).toBeTypeOf('function')
  })

  it('checks that LRP coordinates are WGS 84 decimal degrees', async () => {
    const r = await run(V2_OPENLR)
    expect(recordsWith(r, 'OLR-002').sort()).toEqual(['H-NULL-R', 'H-PROJ-R', 'H-PROJ-R'])
    expect(recordsWith(r, 'OLR-001')).toEqual(['H-NAN-R'])
    expect(recordsWith(r, 'OLR-003')).toEqual(['H-SWAP-R'])
    expect(recordsWith(r, 'OLR-005')).toEqual(['H-DNP-R'])
    expect(recordsWith(r, 'OLR-006').sort()).toEqual(['H-LONG-R', 'H-NOLAST-R'])
    expect(r.findings.find((f) => f.ruleId === 'OLR-006' && f.recordIds?.[0] === 'H-LONG-R')!.message).toContain('exceeds the OpenLR maximum of 15000 m')
    expect(rules(r).has('OLR-004')).toBe(false)
    // Swapped OpenLR does not flip the file's posList axis order.
    expect(r.meta.axisOrder.order).toBe('latlon')
  })

  it('does not count invalid or swapped OpenLR for location referencing', async () => {
    const r = await run(V2_OPENLR)
    const loc = criterion(r, 'plannedRoadworks', 'locationReferencing')
    expect(loc.ceiling).toBe(0)
    expect(recordsWith(r, 'RTTI-LOC-01').sort()).toEqual(['H-NAN-R', 'H-NULL-R', 'H-PROJ-R'])
    expect(loc.evidence).toContain('coordinates only 1') // H-SWAP falls back to its polyline
  })
})

describe('RTTI 5-Star indicators', () => {
  it('links the specification and explains the ceilings', async () => {
    const r = await run(V3_RICH)
    expect(r.rtti!.specUrl).toBe('https://tisa.org/rtti-5-star-rating-specification/')
    expect(RTTI_SPEC_URL).toBe(r.rtti!.specUrl)
    expect(r.rtti!.notes.join(' ')).toContain('not a TISA rating')
  })

  it('reaches 5★ on every file-assessable criterion for a complete v3 feed', async () => {
    const r = await run(V3_RICH)
    expect(r.rtti!.useCases.map((u) => u.useCase)).toEqual(['plannedRoadworks', 'plannedClosure'])
    for (const u of r.rtti!.useCases)
      for (const c of u.criteria)
        if (c.kind === 'ceiling') expect([u.useCase, c.id, c.ceiling]).toEqual([u.useCase, c.id, 5])
    expect([...rules(r)].filter((x) => /^(RTTI|OLR)/.test(x))).toEqual([])
    const kinds = Object.fromEntries(useCase(r, 'plannedRoadworks').criteria.map((c) => [c.id, c.kind]))
    expect(kinds).toMatchObject({ updateCycle: 'not-from-file', timeliness: 'not-from-file', secureApi: 'not-from-file', preAnnouncement: 'info', shortTermEvents: 'info' })
  })

  it('uses the criteria and weights of the use-case tables', async () => {
    const r = await run(V3_RICH)
    const planned = useCase(r, 'plannedRoadworks').criteria
    expect(planned.find((c) => c.id === 'linearReferencing')!.weight).toBe('critical')
    expect(planned.find((c) => c.id === 'dataFormat')!.weight).toBe('high')
    expect(planned.find((c) => c.id === 'roadType')!.weight).toBe('low')
    const closure = useCase(r, 'plannedClosure').criteria.map((c) => c.id)
    expect(closure).not.toContain('roadType')
    expect(closure).toContain('validity')
    expect(criterion(r, 'plannedClosure', 'direction').parent).toBe('linearReferencing')
  })

  it('caps a v2 MDM feed by format, direction and location referencing', async () => {
    const r = await run(V2_MDM)
    expect(ceiling(r, 'plannedRoadworks', 'dataFormat')).toBe(3)
    expect(ceiling(r, 'plannedRoadworks', 'locationReferencing')).toBe(3)
    expect(ceiling(r, 'plannedRoadworks', 'linearReferencing')).toBe(5)
    expect(ceiling(r, 'plannedRoadworks', 'direction')).toBe(2)
    expect(ceiling(r, 'plannedClosure', 'dataFormat')).toBe(3)
    // 3 significant decimals ≈ 56 m: below 100 m (4★ for roadworks), below 100 m but not 50 m (2★ for closures).
    expect(ceiling(r, 'plannedRoadworks', 'accuracy')).toBe(4)
    expect(ceiling(r, 'plannedClosure', 'accuracy')).toBe(2)
    expect(rules(r).has('RTTI-ID-01')).toBe(true) // no situationRecordVersionTime
  })

  it('classifies planned and unplanned by urgency and lead time', async () => {
    const urgent = await run(V2_URGENT)
    expect(useCase(urgent, 'unplannedRoadworks').basis).toEqual({ 'urgentRoadworks = true': 1 })
    const mdm = await run(V2_MDM)
    expect(useCase(mdm, 'plannedClosure').situationIds.sort()).toEqual(['S-1', 'S-2'])
    expect(useCase(mdm, 'plannedRoadworks').situationIds).toEqual(['S-3'])
    const late = await run(v2Doc(v2Situation('L-1', v2Record('L-1-W', line(LINE_A), '', { created: '2026-06-12T00:00:00+02:00' }))))
    expect(useCase(late, 'unplannedRoadworks').basis).toEqual({ 'created after start': 1 })
  })

  it('flags roadworks that close every lane without a closure (TISA definitions)', async () => {
    const r = await run(V2_ALL_LANES)
    expect(recordsWith(r, 'RTTI-TERM-01')).toEqual(['T-1-W'])
    expect(ceiling(r, 'plannedRoadworks', 'terminology')).toBe(2)
    expect(ceiling(r, 'plannedRoadworks', 'correctness')).toBe(0)
  })

  it('measures outdated records against publicationTime', async () => {
    const ended = (to: string) =>
      run(v2Doc(v2Situation('O-1', v2Record('O-1-W', line(LINE_A), '', { from: '2026-04-10T00:00:00+02:00', to, created: '2026-04-01T00:00:00+02:00' }))))
    expect(ceiling(await ended('2026-05-31T22:00:00+02:00'), 'plannedRoadworks', 'outdated')).toBe(5) // 12 h
    expect(ceiling(await ended('2026-05-22T10:00:00+02:00'), 'plannedRoadworks', 'outdated')).toBe(3) // 10 days
    expect(ceiling(await ended('2026-04-22T10:00:00+02:00'), 'plannedRoadworks', 'outdated')).toBe(0) // 40 days
  })

  it('treats validity and vehicle classes as feed capabilities', async () => {
    const mdm = await run(V2_MDM)
    expect(ceiling(mdm, 'plannedRoadworks', 'validity')).toBe(2)
    expect(ceiling(mdm, 'plannedRoadworks', 'vehicleClassification')).toBe(2)
    const noEnd = await run(v2Doc(v2Situation('V-1', v2Record('V-1-W', line(LINE_A), '', { to: '' }))))
    expect(recordsWith(noEnd, 'RTTI-VAL-01')).toEqual(['V-1-W'])
    expect(ceiling(noEnd, 'plannedRoadworks', 'validity')).toBe(0)
  })

  it('survives structured cloning (worker boundary)', async () => {
    const r = await run(V3_DIRECTIONS)
    expect(JSON.parse(JSON.stringify(r.rtti))).toEqual(r.rtti)
    expect(structuredClone(r.events.map((e) => e.openlr))).toEqual(r.events.map((e) => e.openlr))
  })
})

describe('RTTI direction sub-criterion', () => {
  it('needs a polyline and an unambiguous traffic direction along it', async () => {
    const r = await run(V3_DIRECTIONS)
    const dir = criterion(r, 'plannedRoadworks', 'direction')
    expect(dir.ceiling).toBe(2)
    expect(Object.fromEntries(dir.distribution!.map((d) => [d.label, d.count]))).toEqual({ unambiguous: 4, ambiguous: 3, contradiction: 1, 'no polyline': 1 })
    // Contradictions and ambiguous records are listed before records without a polyline.
    expect(dir.recordIds![0]).toBe('D-FAR-R')
    expect(dir.recordIds!.at(-1)).toBe('D-POINT-R')
  })

  it('resolves forward, backward and short polylines through OpenLR offsets', async () => {
    const r = await run(V3_DIRECTIONS)
    const limiting = new Set(criterion(r, 'plannedRoadworks', 'direction').recordIds)
    for (const ok of ['D-FWD-R', 'D-BWD-R', 'D-SHORT-R', 'D-REL-LS-R']) expect(limiting.has(ok)).toBe(false)
  })

  it('reports contradictions, ambiguity and disagreeing references', async () => {
    const r = await run(V3_DIRECTIONS)
    expect(recordsWith(r, 'RTTI-DIR-02')).toEqual(['D-FAR-R'])
    expect(recordsWith(r, 'RTTI-DIR-01').sort()).toEqual(['D-ALERTC-R', 'D-REL-CODE-R'])
    expect(recordsWith(r, 'RTTI-DIR-03')).toEqual(['D-DISAGREE-R'])
    expect(recordsWith(r, 'RTTI-LIN-01')).toEqual(['D-POINT-R'])
    const alertc = r.findings.find((f) => f.ruleId === 'RTTI-DIR-01' && f.recordIds?.[0] === 'D-ALERTC-R')!
    expect(alertc.explanation).toContain('ALERT-C direction is relative to the location table')
    const code = r.findings.find((f) => f.ruleId === 'RTTI-DIR-01' && f.recordIds?.[0] === 'D-REL-CODE-R')!
    expect(code.explanation).toContain('LinearElementByCode')
    expect(code.explanation).toContain(RTTI_SPEC_URL)
  })

  it('names a zero-length gmlLineString instead of reporting a missing polyline', async () => {
    const r = await run(v2Doc(v2Situation('Z-1', v2Record('Z-1-W', line('53.728949 10.260071 53.728949 10.260071')))))
    const f = r.findings.find((x) => x.ruleId === 'RTTI-LIN-01')!
    expect(f.recordIds).toEqual(['Z-1-W'])
    expect(f.message).toContain('zero length')
    expect(f.explanation).toContain('53.728949 10.260071')
    expect(criterion(r, 'plannedRoadworks', 'linearReferencing').distribution).toEqual([{ label: 'gmlLineString of zero length', count: 1 }])
    expect(ceiling(r, 'plannedRoadworks', 'linearReferencing')).toBe(0)
  })

  it('counts a polyline in a projected CRS but does not check its direction', async () => {
    const utm = `<linearExtension><linearExtended><gmlLineString srsName="25833"><posList>328036.75 7104847.08 328093.1 7104801.7 328131.3 7104772</posList></gmlLineString></linearExtended></linearExtension>`
    const r = await run(v2Doc(v2Situation('P-1', v2Record('P-1-W', utm))))
    expect(recordsWith(r, 'RTTI-LIN-03')).toEqual(['P-1-W'])
    expect(rules(r).has('RTTI-LIN-01')).toBe(false)
    expect(ceiling(r, 'plannedRoadworks', 'linearReferencing')).toBe(5)
    expect(criterion(r, 'plannedRoadworks', 'direction').distribution).toEqual([{ label: 'not checked (not WGS 84)', count: 1 }])
    expect(ceiling(r, 'plannedRoadworks', 'direction')).toBe(5)
    // Projected metres say nothing about the resolution in degrees.
    expect(r.events[0]!.coordinateDecimals).toBeUndefined()
  })

  it('counts a structured OpenLR line as a polyline unless its points are invalid or over 15 km apart', async () => {
    const r = await run(V2_OPENLR)
    const lin = criterion(r, 'plannedRoadworks', 'linearReferencing')
    expect(Object.fromEntries(lin.distribution!.map((d) => [d.label, d.count]))).toEqual({ gmlLineString: 2, 'OpenLR line': 3, 'no polyline': 5 })
    expect(recordsWith(r, 'RTTI-LIN-01').sort()).toEqual(['H-2-R', 'H-LONG-R', 'H-NAN-R', 'H-NULL-R', 'H-PROJ-R'])
    const long = r.findings.find((f) => f.ruleId === 'RTTI-LIN-01' && f.recordIds?.[0] === 'H-LONG-R')!
    expect(long.explanation).toContain('more than the OpenLR maximum of 15000 m')
  })

  it('takes the direction of an OpenLR-only line from its direction section', async () => {
    const r = await run(V2_OPENLR)
    const dir = criterion(r, 'plannedRoadworks', 'direction')
    expect(Object.fromEntries(dir.distribution!.map((d) => [d.label, d.count]))).toEqual({ unambiguous: 3, ambiguous: 2, 'no polyline': 5 })
    const limiting = new Set(dir.recordIds)
    for (const ok of ['H-1-R', 'H-DNP-R', 'H-NOLAST-R']) expect(limiting.has(ok)).toBe(false)
    expect(recordsWith(r, 'RTTI-DIR-01').sort()).toEqual(['H-BIN-R', 'H-SWAP-R'])
  })

  it('reads OpenLR firstDirection plus oppositeDirection as both directions', async () => {
    const both = `<loc:openlrLinear><loc:firstDirection>${v3Lrp(50, 7.999, 1150)}${v3Lrp(50, 8.015, undefined, true)}</loc:firstDirection><loc:oppositeDirection>${v3Lrp(50, 8.015, 1150)}${v3Lrp(50, 7.999, undefined, true)}</loc:oppositeDirection></loc:openlrLinear>`
    const alertCBoth = `<loc:alertCLinear xsi:type="loc:AlertCMethod4Linear"><loc:alertCDirection><loc:alertCDirectionCoded>positive</loc:alertCDirectionCoded><loc:alertCAffectedDirection>both</loc:alertCAffectedDirection></loc:alertCDirection></loc:alertCLinear>`
    const r = await run(v3Doc(v3Situation('B-1', v3Record('B-1-R', gml(LINE_E) + both + alertCBoth))))
    expect(criterion(r, 'plannedRoadworks', 'direction').distribution).toEqual([{ label: 'unambiguous', count: 1 }])
    expect(rules(r).has('RTTI-DIR-03')).toBe(false)
  })
})

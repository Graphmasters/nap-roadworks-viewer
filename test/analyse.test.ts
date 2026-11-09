import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { analyseDatex, extractText, isGzip, runChecks, sourceFromBytes } from '../src/index'
import { BROKEN, NOT_DATEX, V2_MDM, V2_NO_CONFLICT, V2_REFS, V3_NDW, V3_SWAPPED } from './fixtures'

const run = (xml: string | Uint8Array, opts = {}) => analyseDatex(sourceFromBytes(xml), opts)
const rules = (r: Awaited<ReturnType<typeof run>>) => new Set(r.findings.map((f) => f.ruleId))

describe('ingest', () => {
  it('detects gzip by magic bytes and decompresses', async () => {
    const gz = new Uint8Array(gzipSync(Buffer.from(V2_MDM)))
    expect(isGzip(gz)).toBe(true)
    const r = await run(gz)
    expect(r.meta.compressed).toBe(true)
    expect(r.events).toHaveLength(5)
  })

  it('extracts the original XML of a record by character offsets', async () => {
    const src = sourceFromBytes(V2_MDM)
    const r = await analyseDatex(src)
    const ev = r.events.find((e) => e.id === 'S-2-C')!
    const xml = await extractText(src, ev.span.start, ev.span.end)
    expect(xml.startsWith('<situationRecord id="S-2-C"')).toBe(true)
    expect(xml.endsWith('</situationRecord>')).toBe(true)
    expect(V2_MDM.slice(ev.span.start, ev.span.end)).toBe(xml)
  })

  it('extracts from gzip input too', async () => {
    const src = sourceFromBytes(new Uint8Array(gzipSync(Buffer.from(V3_NDW))))
    const r = await analyseDatex(src)
    const sit = r.situations[0]!
    const xml = await extractText(src, sit.span.start, sit.span.end)
    expect(xml.startsWith('<sit:situation id="SIT-1">')).toBe(true)
    expect(xml.endsWith('</sit:situation>')).toBe(true)
  })
})

describe('well-formedness and detection', () => {
  it('reports line and column of a broken document', async () => {
    const r = await run(BROKEN)
    expect(r.wellFormed.ok).toBe(false)
    expect(r.wellFormed.error!.line).toBe(4)
    expect(r.wellFormed.error!.message).toMatch(/close tag/)
    expect(rules(r).has('XML-001')).toBe(true)
  })

  it('flags documents without DATEX II namespace', async () => {
    const r = await run(NOT_DATEX)
    expect(r.wellFormed.ok).toBe(true)
    expect(r.meta.datexVersion).toBe('unknown')
    expect(rules(r).has('DTX-001')).toBe(true)
  })

  it('detects v2 metadata and the MDM profile', async () => {
    const r = await run(V2_MDM)
    expect(r.meta.datexVersion).toBe('2')
    expect(r.meta.publicationType).toBe('SituationPublication')
    expect(r.meta.nationalIdentifier).toBe('DE-MDM-Example Authority')
    expect(r.meta.publicationTime).toBe('2026-06-01T10:00:00+02:00')
    expect(r.profileId).toBe('de-mdm-roadworks-04-00-00')
    expect(r.meta.extensions.find((e) => e.container === 'impactExtension')?.mechanism).toBe('v2-extension')
  })

  it('detects v3 metadata, extensions and the NDW profile', async () => {
    const r = await run(V3_NDW)
    expect(r.meta.datexVersion).toBe('3')
    expect(r.meta.modelBaseVersion).toBe('3')
    expect(r.meta.publicationType).toBe('SituationPublication')
    expect(r.meta.nationalIdentifier).toBe('NDWNL')
    expect(r.profileId).toBe('nl-ndw-v3')
    const nlxe = r.meta.namespaces.find((n) => n.uri.endsWith('nlxExtensions'))
    expect(nlxe?.classification).toBe('datex2-other')
    expect(r.meta.extensions.some((e) => e.mechanism === 'v3-extension' && e.contents['extra'] === 1)).toBe(true)
  })
})

describe('records and locations', () => {
  it('normalises v3 records', async () => {
    const r = await run(V3_NDW)
    const e = r.events[0]!
    expect(e.id).toBe('REC-1')
    expect(e.type).toBe('partialClosure')
    expect(e.geometry).toEqual({ type: 'LineString', coordinates: [[5.1, 52.1], [5.102, 52.101]] })
    expect(e.geometryConfidence).toBe('direct')
    expect(e.locationMethods).toContain('alertC (linear)')
    expect(e.laneImpact.originalNumberOfLanes).toBe(3)
    expect(e.carriageway).toBe('mainCarriageway')
    expect(r.situations[0]!.relatedSituationIds).toEqual(['SIT-0'])
  })

  it('reads posList as lat lon by default (v2)', async () => {
    const r = await run(V2_MDM)
    const g = r.events[0]!.geometry
    expect(g?.type).toBe('LineString')
    expect((g as { coordinates: number[][] }).coordinates[0]).toEqual([10, 53.5])
    expect(r.meta.axisOrder.order).toBe('latlon')
    expect(r.events[0]!.roadNumber).toBe('L 99')
  })

  it('detects lon lat posList order from explicit point coordinates', async () => {
    const r = await run(V3_SWAPPED)
    expect(r.meta.axisOrder.order).toBe('lonlat')
    expect((r.events[0]!.geometry as { coordinates: number[][] }).coordinates[0]).toEqual([4.4, 51.2])
    expect(rules(r).has('LOC-004')).toBe(true)
    const forced = await run(V3_SWAPPED, { axisOrder: 'latlon' })
    expect(forced.meta.axisOrder.basis).toBe('override')
  })

  it('reports unsupported locations as a viewer limitation, plus semantic errors', async () => {
    const r = await run(V2_REFS)
    const loc = r.findings.find((f) => f.ruleId === 'LOC-001')!
    expect(loc.severity).toBe('info')
    expect(loc.explanation).toMatch(/alertC/)
    expect(rules(r).has('SEM-002')).toBe(true)
    expect(rules(r).has('REF-001')).toBe(true)
  })

  it('decodes lane codes into lane states', async () => {
    const r = await run(V2_MDM)
    const e = r.events.find((x) => x.id === 'S-3-W')!
    const ext = e.laneStates.filter((s) => s.field === 'extendedLaneStatusCoded')
    expect(ext.map((s) => s.normalizedStatus)).toEqual(['noStopping', 'open', 'open', 'noStopping'])
    expect(ext.map((s) => s.direction)).toEqual(['oncoming', 'oncoming', 'direction', 'direction'])
    expect(rules(r).has('LANE-002')).toBe(true)
  })
})

describe('passability', () => {
  it('raises DQ-RW-001 for a closure caused by a stopping/parking prohibition', async () => {
    const r = await run(V2_MDM)
    const dq = r.passability.filter((p) => p.ruleId === 'DQ-RW-001')
    expect(dq).toHaveLength(1)
    expect(dq[0]!.situationId).toBe('S-2')
    expect(dq[0]!.recordIds).toEqual(['S-2-C', 'S-2-W'])
    expect(dq[0]!.routingAction).toBe('manual_review')
    expect(dq[0]!.evidence[1]!.rawValue).toBe('H2H')
    expect(r.recordPassability['S-2-C']!.classification).toBe('conflicting')
    // The stopping/parking record itself is not a closure.
    expect(r.recordPassability['S-2-W']!.classification).toBe('passable')
  })

  it('classifies a corroborated closure as closed and blocks it', async () => {
    const r = await run(V2_MDM)
    expect(r.recordPassability['S-1-C']).toMatchObject({ classification: 'closed', routingAction: 'block', laneEvidence: 'closure' })
    expect(r.recordPassability['S-3-W']!.classification).toBe('restricted')
  })

  it('does not raise DQ-RW-001 when lanes are closed or periods do not overlap', async () => {
    const r = await run(V2_NO_CONFLICT)
    expect(r.passability.filter((p) => p.ruleId === 'DQ-RW-001')).toHaveLength(0)
    expect(r.recordPassability['S-4-C']!.classification).toBe('closed')
  })

  it('re-runs checks with another profile', async () => {
    const r = await run(V2_MDM)
    runChecks(r, 'datex2-v2')
    expect(r.profileId).toBe('datex2-v2')
    expect([...rules(r)].some((id) => id.startsWith('MDM-'))).toBe(false)
  })
})

describe('lane comparison and matching', async () => {
  const { compareLanes, osmLaneAttributes, matchEvent } = await import('../src/index')
  it('compares DATEX II lanes with OSM lane counts', async () => {
    const r = await run(V2_MDM)
    const e = r.events.find((x) => x.id === 'S-1-W')!
    const same = compareLanes(e, osmLaneAttributes('way', '1', { highway: 'secondary', lanes: '2' }))
    expect(same.assessment).toMatch(/^Lane count consistent/)
    expect(same.indicators.some((i) => i.id === 'temporary-closure')).toBe(true)
    const differs = compareLanes(e, osmLaneAttributes('way', '1', { highway: 'secondary', lanes: '4' }))
    expect(differs.indicators.some((i) => i.id === 'count-differs')).toBe(true)
    const none = compareLanes(e, osmLaneAttributes('way', '1', { highway: 'secondary' }))
    expect(none.assessment).toBe('OSM has no lane count to compare with')
  })

  it('matches a line to the closest parallel road and flags ambiguity', () => {
    const line: Array<[number, number]> = [[10, 53.5], [10.01, 53.5]]
    const off = (dy: number): Array<[number, number]> => [[9.999, 53.5 + dy], [10.011, 53.5 + dy]]
    const clear = matchEvent([line], [
      { key: 'way/1', osmWayId: '1', lines: [off(0.00005)] },
      { key: 'way/2', osmWayId: '2', lines: [off(0.002)] },
    ])
    expect(clear.status).toBe('matched')
    expect(clear.sequence.map((s) => s.candidate.key)).toEqual(['way/1'])
    const twin = matchEvent([line], [
      { key: 'way/1', osmWayId: '1', lines: [off(0.00005)] },
      { key: 'way/3', osmWayId: '3', lines: [off(-0.00005)] },
    ])
    expect(twin.status).toBe('ambiguous')
    const reverse = matchEvent([line], [{ key: 'way/4', osmWayId: '4', oneway: 1, lines: [[...off(0.00005)].reverse()] }])
    expect(reverse.status).toBe('none')
    expect(matchEvent([line], []).status).toBe('none')
  })

  it('splits a merged top candidate into OSM ways of its road class', async () => {
    const { matchEventRefined, highwayValuesFor } = await import('../src/index')
    expect(highwayValuesFor('motorway')).toEqual(['motorway'])
    expect(highwayValuesFor('primary_link')).toEqual(['primary_link'])
    expect(highwayValuesFor('minor')).toContain('residential')
    expect(highwayValuesFor('trunk_construction')).toEqual(['construction'])
    expect(highwayValuesFor('path')).toBeUndefined()

    const line: Array<[number, number]> = [[10, 53.5], [10.01, 53.5]]
    const off = (dy: number, x0 = 9.999, x1 = 10.011): Array<[number, number]> => [[x0, 53.5 + dy], [x1, 53.5 + dy]]
    // A dual carriageway merged into one tile feature (its id names only the first way), far beyond the record.
    const merged = { key: 'merged/7/motorway', merged: true, roadClass: 'motorway', oneway: 0, lines: [off(0.00005, 9.9, 10.1), off(-0.00005, 9.9, 10.1)] }
    const calls: Array<{ bbox: number[]; highways: string[] }> = []
    const r = await matchEventRefined([line], [merged], async (bbox, highways) => {
      calls.push({ bbox, highways })
      return [
        { id: '7', tags: { highway: 'motorway', ref: 'A 1' }, geometry: [...off(-0.00005)].reverse(), source: 'OSM API' }, // opposite carriageway
        { id: '8', tags: { highway: 'motorway', ref: 'A 1' }, geometry: off(0.00005), source: 'OSM API' },
      ]
    }, { roadNumber: 'A1' })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.highways).toEqual(['motorway'])
    // Only the covered part of the record is queried, not the whole merged feature.
    expect(calls[0]!.bbox[0]).toBeGreaterThan(9.99)
    expect(calls[0]!.bbox[2]).toBeLessThan(10.02)
    expect(r.status).toBe('matched')
    expect(r.sequence.map((x) => x.candidate.key)).toEqual(['way/8'])
    expect(r.refinements).toEqual([expect.objectContaining({ key: 'merged/7/motorway', ways: 2 })])
    expect(r.reasons[0]).toMatch(/replaced by 2 OSM way.* from OSM API/)
    expect(r.refinements[0]!.source).toBe('OSM API')

    // Ways already known as single-way candidates get the full geometry; the merged feature still goes.
    const partial = { key: 'way/8', osmWayId: '8', roadClass: 'motorway', oneway: 1, lines: [off(0.00005, 10.008, 10.011)] }
    const known = await matchEventRefined([line], [merged, partial], async () => [{ id: '8', tags: { highway: 'motorway' }, geometry: off(0.00005) }])
    expect(known.ranked.map((x) => x.candidate.key)).toEqual(['way/8'])
    expect(known.sequence[0]!.components.coverage).toBe(1)

    const failed = await matchEventRefined([line], [merged], async () => {
      throw new Error('Overpass answered 504')
    })
    expect(failed.sequence[0]!.candidate.key).toBe('merged/7/motorway')
    expect(failed.refinements[0]!.error).toMatch(/504/)
  })
})

describe('tile reading', async () => {
  const { lonLatToTile, tilesAlong } = await import('../app/tiles')
  it('finds the z14 tiles along a record', () => {
    expect(lonLatToTile(13.4, 52.52)).toEqual([8801, 5373]) // Berlin: (13.4 + 180) / 360 * 2^14 = 8801.8
    const one = tilesAlong([[[13.4005, 52.5205], [13.401, 52.521]]])
    expect(one).toEqual([[8801, 5373]])
    // 10 km eastwards at 52.5° N crosses about 7 tiles (~1.49 km wide); the 60 m pad adds none here.
    const long = tilesAlong([[[13.4005, 52.5205], [13.548, 52.5205]]])
    expect(long.length).toBeGreaterThanOrEqual(7)
    expect(long.length).toBeLessThanOrEqual(9)
    expect(new Set(long.map(([, y]) => y))).toEqual(new Set([5373]))
    // Near a tile border the pad pulls in the neighbour.
    const [x0] = lonLatToTile(13.4, 52.52)
    const edgeLon = ((x0 + 1) / 2 ** 14) * 360 - 180 - 0.0003 // ~20 m west of the border
    expect(tilesAlong([[[edgeLon, 52.5205], [edgeLon, 52.5206]]]).map(([x]) => x).sort()).toEqual([x0, x0 + 1])
  })
})

describe('lane categories', async () => {
  const { laneCategoriesOf } = await import('../src/index')
  it('classifies special lane configurations from MDM codes', () => {
    expect(laneCategoriesOf(['w2x'])).toEqual(['reversible', 'closed'])
    // Hard shoulder: the space outside a marking (right of r, left of l).
    expect(laneCategoriesOf(['2xrx'])).toEqual(['hardShoulderClosed', 'closed'])
    expect(laneCategoriesOf(['xlx2x'])).toEqual(['hardShoulderClosed', 'closed'])
    expect(laneCategoriesOf(['2re'])).toEqual(['hardShoulderOpen', 'narrowed'])
    expect(laneCategoriesOf(['wlu2orx'])).toEqual(['reversible', 'hardShoulderClosed', 'hardShoulderOpen', 'closed'])
    // A plain hard shoulder (s) and lanes inside the markings are neither.
    expect(laneCategoriesOf(['slu2ors'])).toEqual([])
    expect(laneCategoriesOf(['p2P', 'H'])).toEqual(['parkingLane', 'parkingRestriction'])
    expect(laneCategoriesOf([{ value: 'GFLx2xRFG' }])).toEqual(['closed', 'cyclewayClosed', 'footpathClosed'])
    expect(laneCategoriesOf(['fgLx2x'])).toEqual(['closed', 'cyclewayOpen', 'footpathOpen'])
    expect(laneCategoriesOf(['o 2 u'])).toEqual([])
    expect(laneCategoriesOf([])).toEqual([])
  })
})

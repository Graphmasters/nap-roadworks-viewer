/// <reference types="node" />
// The XML examples in docs/examples/ are published with the documentation and quoted in its
// pages. These tests keep them honest: each file must produce the results the pages describe, and
// every excerpt a page marks with `<!-- example: <file> -->` must appear verbatim in that file.
//
// Schema validity is checked by hand, not here (the schemas are not part of the repository):
// lane-closure-v2.xml against the MDM roadworks profile 04-00-00 XSD, extended-lane-status-v2.xml
// against it without its extendedLaneStatusCoded elements, locations-v3.xml against the
// DATEX II v3.5 schemas (DATEXII_3_D2Payload.xsd).

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyseDatex, sourceFromBytes } from '../src/index'

const DOCS = join(__dirname, '..', 'docs')
const EXAMPLES = join(DOCS, 'examples')

const load = (file: string) => analyseDatex(sourceFromBytes(readFileSync(join(EXAMPLES, file))))
const event = (r: Awaited<ReturnType<typeof load>>, id: string) => {
  const e = r.events.find((x) => x.id === id)
  if (!e) throw new Error(`record ${id} not found`)
  return e
}

describe('docs/examples', () => {
  it('lane-closure-v2.xml: one closed lane is restricted, not closed', async () => {
    const r = await load('lane-closure-v2.xml')
    expect(r.wellFormed.ok).toBe(true)
    expect(r.meta.datexVersion).toBe('2')
    expect(r.profileId).toBe('de-mdm-roadworks-04-00-00')
    expect(r.recordPassability['EX-1-W']).toMatchObject({ classification: 'restricted', routingAction: 'do_not_block' })
    expect(event(r, 'EX-1-W').geometrySource).toBe('gmlLineString')
  })

  it('extended-lane-status-v2.xml: cycle-path works stay passable, the closure conflicts with its cause', async () => {
    const r = await load('extended-lane-status-v2.xml')
    expect(r.recordPassability['EX-2-W']).toMatchObject({ classification: 'passable', routingAction: 'do_not_block' })
    expect(r.recordPassability['EX-3-W']).toMatchObject({ classification: 'passable', routingAction: 'do_not_block' })
    expect(r.recordPassability['EX-3-C']).toMatchObject({ classification: 'conflicting', routingAction: 'manual_review' })
    const dq = r.passability.filter((f) => f.ruleId === 'DQ-RW-001')
    expect(dq).toHaveLength(1)
    expect(dq[0]!.recordIds).toEqual(['EX-3-C', 'EX-3-W'])
  })

  it('locations-v3.xml: gmlLineString, LinearElementByPoints and OpenLR are drawn in that order of preference', async () => {
    const r = await load('locations-v3.xml')
    expect(r.meta.datexVersion).toBe('3')
    expect(event(r, 'EX-4-GML')).toMatchObject({ geometrySource: 'gmlLineString', geometryConfidence: 'direct' })
    const points = event(r, 'EX-4-POINTS')
    expect(points).toMatchObject({ geometrySource: 'linearElementByPoints', geometryConfidence: 'direct' })
    expect(points.geometryNote).toContain('Cut to 50 m–350 m')
    const olr = event(r, 'EX-4-OPENLR')
    expect(olr).toMatchObject({ geometrySource: 'openlr', geometryConfidence: 'approximate' })
    expect(olr.openlr[0]!.lrps).toHaveLength(2)
    // A line drawn from a LinearElementByPoints is not an RTTI polyline.
    const lin = r.findings.filter((f) => f.ruleId === 'RTTI-LIN-01').flatMap((f) => f.recordIds ?? [])
    expect(lin).toEqual(['EX-4-POINTS'])
  })

  it('every example quoted in the docs appears verbatim in its file', () => {
    const files = new Set(readdirSync(EXAMPLES))
    const marker = /<!-- example: ([\w.-]+) -->\s*\n(\s*)```xml\n([\s\S]*?)\n\s*```/g
    let quoted = 0
    for (const page of readdirSync(DOCS).filter((f) => f.endsWith('.md'))) {
      const md = readFileSync(join(DOCS, page), 'utf8')
      for (const [, file, indent, body] of md.matchAll(marker)) {
        expect(files.has(file!), `${page} quotes missing ${file}`).toBe(true)
        const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
        const source = lines(readFileSync(join(EXAMPLES, file!), 'utf8')).join('\n')
        const excerpt = lines(body!.replace(new RegExp(`^${indent}`, 'gm'), '')).join('\n')
        expect(source.includes(excerpt), `${page}: excerpt from ${file} does not match the file`).toBe(true)
        quoted++
      }
    }
    expect(quoted).toBeGreaterThan(0)
  })
})

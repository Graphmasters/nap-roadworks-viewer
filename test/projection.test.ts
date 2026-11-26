import { describe, expect, it } from 'vitest'
import { analyseDatex, sourceFromBytes } from '../src/index'
import { utmToWgs84, utmZoneOf } from '../src/location/projection'
import { v2Doc, v2Record, v2Situation } from './fixtures'

describe('utmZoneOf', () => {
  it('reads the zone from the srsName forms used in DATEX II feeds', () => {
    expect(utmZoneOf('ETRS89 EPSG 25832')).toBe(32)
    expect(utmZoneOf('EPSG:25833')).toBe(33)
    expect(utmZoneOf('25832')).toBe(32)
    expect(utmZoneOf('25833')).toBe(33)
    expect(utmZoneOf('urn:ogc:def:crs:EPSG::25833')).toBe(33)
  })

  it('returns undefined for other coordinate reference systems and longer numbers', () => {
    expect(utmZoneOf(undefined)).toBeUndefined()
    expect(utmZoneOf('WGS 84')).toBeUndefined()
    expect(utmZoneOf('EPSG:4326')).toBeUndefined()
    expect(utmZoneOf('EPSG:31467')).toBeUndefined()
    expect(utmZoneOf('EPSG:258320')).toBeUndefined()
  })
})

describe('utmToWgs84', () => {
  it('maps the equator on each zone’s central meridian to 0° and 9° E (zone 32) or 15° E (zone 33)', () => {
    const [lat32, lon32] = utmToWgs84(32, 500000, 0)
    expect(lat32).toBeCloseTo(0, 9)
    expect(lon32).toBeCloseTo(9, 9)
    const [lat33, lon33] = utmToWgs84(33, 500000, 0)
    expect(lat33).toBeCloseTo(0, 9)
    expect(lon33).toBeCloseTo(15, 9)
  })

  it('maps the northing of 45° N on the central meridian (k0 × meridian arc, 4 982 950.4 m) to 45°', () => {
    // Meridian arc to 45° on GRS 80 is 4 984 944.378 m; the UTM scale factor is 0.9996.
    const [lat, lon] = utmToWgs84(32, 500000, 4982950.4)
    expect(lat).toBeCloseTo(45, 6)
    expect(lon).toBeCloseTo(9, 9)
  })
})

describe('a gmlLineString labelled UTM but given in degrees', () => {
  const degrees = `<linearExtension><linearExtended><gmlLineString><srsName>EPSG:25832</srsName><posList>50.4 6.9 50.5 7.0</posList></gmlLineString></linearExtended></linearExtension>`

  it('is neither drawn nor reinterpreted, and gets LOC-005 instead of an RTTI polyline', async () => {
    const r = await analyseDatex(sourceFromBytes(v2Doc(v2Situation('M-1', v2Record('M-1-W', degrees)))))
    const ev = r.events[0]!
    expect(ev.crsLabelMismatch).toBe('EPSG:25832')
    expect(ev.geometry).toBeUndefined()
    expect(ev.geometrySource).toBeUndefined()
    const loc5 = r.findings.find((f) => f.ruleId === 'LOC-005')!
    expect(loc5.recordIds).toEqual(['M-1-W'])
    expect(r.findings.some((f) => f.ruleId === 'RTTI-LIN-03')).toBe(false)
    expect(r.findings.some((f) => f.ruleId === 'RTTI-LIN-01' && f.recordIds?.[0] === 'M-1-W')).toBe(true)
  })
})

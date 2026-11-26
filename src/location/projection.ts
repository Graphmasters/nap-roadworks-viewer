// ETRS89 / UTM zones 32N and 33N (EPSG:25832 and EPSG:25833) to WGS 84 degrees.
//
// ETRS89 and WGS 84 differ by less than a metre, so the inverse transverse Mercator projection on
// the GRS 80 ellipsoid (the ETRS89 ellipsoid) gives WGS 84 positions to well within a metre. The
// series are the Krüger-type expansions in Snyder, "Map Projections: A Working Manual" (1987).

const SEMI_MAJOR = 6378137
const FLATTENING = 1 / 298.257222101
const K0 = 0.9996
const E2 = FLATTENING * (2 - FLATTENING)
const EP2 = E2 / (1 - E2)
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))

/**
 * The UTM zone (32 or 33) named by a srsName such as `EPSG:25832`, `25833`, `ETRS89 EPSG 25832` or
 * `urn:ogc:def:crs:EPSG::25832`. Undefined for any other coordinate reference system.
 */
export function utmZoneOf(srsName: string | undefined): 32 | 33 | undefined {
  const m = srsName ? /(?<!\d)(2583[23])(?!\d)/.exec(srsName) : null
  if (!m) return undefined
  return m[1] === '25832' ? 32 : 33
}

/** Inverse UTM: easting and northing in metres of the given zone → [latitude, longitude] in degrees. */
export function utmToWgs84(zone: 32 | 33, easting: number, northing: number): [lat: number, lon: number] {
  const lon0 = zone === 32 ? 9 : 15
  const x = easting - 500000
  const m = northing / K0
  const mu = m / (SEMI_MAJOR * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256))
  const phi1 =
    mu +
    ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu)
  const sinPhi1 = Math.sin(phi1)
  const n1 = SEMI_MAJOR / Math.sqrt(1 - E2 * sinPhi1 ** 2)
  const t1 = Math.tan(phi1) ** 2
  const c1 = EP2 * Math.cos(phi1) ** 2
  const r1 = (SEMI_MAJOR * (1 - E2)) / (1 - E2 * sinPhi1 ** 2) ** 1.5
  const d = x / (n1 * K0)
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d ** 2 / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720)
  const lon =
    (lon0 * Math.PI) / 180 + (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) / Math.cos(phi1)
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI]
}

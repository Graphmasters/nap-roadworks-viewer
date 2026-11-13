// Synthetic, hand-written DATEX II documents for tests. They are not excerpts of real feeds; ids,
// places and values are invented.

const V2_HEAD = `<?xml version="1.0" encoding="UTF-8"?>
<d2LogicalModel xmlns="http://datex2.eu/schema/2/2_0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" modelBaseVersion="2">
  <exchange><supplierIdentification><country>de</country><nationalIdentifier>DE-MDM-Example Authority</nationalIdentifier></supplierIdentification></exchange>
  <payloadPublication xsi:type="SituationPublication" lang="DE">
    <publicationTime>2026-06-01T10:00:00+02:00</publicationTime>
    <publicationCreator><country>de</country><nationalIdentifier>DE-MDM-Example Authority</nationalIdentifier></publicationCreator>`
const V2_TAIL = `
  </payloadPublication>
</d2LogicalModel>`

export function v2Works(id: string, lane: string, ext: string | undefined, posList: string, from = '2026-05-01T00:00:00+02:00', to = '2026-07-01T00:00:00+02:00') {
  return `
      <situationRecord id="${id}" version="1" xsi:type="MaintenanceWorks">
        <situationRecordCreationTime>2026-04-01T00:00:00+02:00</situationRecordCreationTime>
        <validity><validityStatus>definedByValidityTimeSpec</validityStatus>
          <validityTimeSpecification><overallStartTime>${from}</overallStartTime><overallEndTime>${to}</overallEndTime></validityTimeSpecification>
        </validity>
        <impact><numberOfLanesRestricted>1</numberOfLanesRestricted><originalNumberOfLanes>2</originalNumberOfLanes>
          <impactExtension><impactExtended><laneStatusCoded>${lane}</laneStatusCoded>${ext ? `<extendedLaneStatusCoded>${ext}</extendedLaneStatusCoded>` : ''}</impactExtended></impactExtension>
        </impact>
        <generalPublicComment><comment><values><value lang="DE">Testbaustelle ${id}</value></values></comment>
          <commentExtension><commentExtended><commentType2>roadworksName</commentType2></commentExtended></commentExtension></generalPublicComment>
        <groupOfLocations xsi:type="Linear">
          <locationForDisplay><latitude>${posList.split(' ')[0]}</latitude><longitude>${posList.split(' ')[1]}</longitude></locationForDisplay>
          <linearWithinLinearElement><linearElement><roadNumber>L 99</roadNumber></linearElement></linearWithinLinearElement>
          <linearExtension><linearExtended><gmlLineString><srsName>WGS84 EPSG 4326</srsName><posList>${posList}</posList></gmlLineString></linearExtended></linearExtension>
        </groupOfLocations>
      </situationRecord>`
}

export function v2Closure(id: string, cause: string, posList: string, from = '2026-05-01T00:00:00+02:00', to = '2026-07-01T00:00:00+02:00') {
  return `
      <situationRecord id="${id}" version="1" xsi:type="RoadOrCarriagewayOrLaneManagement">
        <situationRecordCreationTime>2026-04-01T00:00:00+02:00</situationRecordCreationTime>
        <validity><validityStatus>definedByValidityTimeSpec</validityStatus>
          <validityTimeSpecification><overallStartTime>${from}</overallStartTime><overallEndTime>${to}</overallEndTime></validityTimeSpecification>
        </validity>
        <cause xsi:type="ManagedCause"><managedCause id="${cause}" targetClass="SituationRecord" version="1"/></cause>
        <groupOfLocations xsi:type="Linear">
          <linearExtension><linearExtended><gmlLineString><posList>${posList}</posList></gmlLineString></linearExtended></linearExtension>
        </groupOfLocations>
        <complianceOption>mandatory</complianceOption>
        <roadOrCarriagewayOrLaneManagementType>roadClosed</roadOrCarriagewayOrLaneManagementType>
      </situationRecord>`
}

export const LINE_A = '53.500000 10.000000 53.501000 10.002000 53.502000 10.004000'
const LINE_B = '53.600000 10.100000 53.601000 10.101000'

/** v2 MDM-style feed: a genuine closure (S-1), a DQ-RW-001 case (S-2) and a lane reduction (S-3). */
export const V2_MDM = `${V2_HEAD}
    <situation id="S-1" version="1">
      <overallSeverity>high</overallSeverity>
      ${v2Works('S-1-W', 'x2x', 'x2x', LINE_A)}
      ${v2Closure('S-1-C', 'S-1-W', LINE_A)}
    </situation>
    <situation id="S-2" version="1">
      ${v2Works('S-2-W', '2', 'H2H', LINE_B)}
      ${v2Closure('S-2-C', 'S-2-W', LINE_B)}
    </situation>
    <situation id="S-3" version="1">
      ${v2Works('S-3-W', 'u2x', 'Hu2oH', LINE_A)}
    </situation>${V2_TAIL}`

/** DQ-RW-001 negative: the cause record closes lanes. Validity of S-5 closure does not overlap. */
export const V2_NO_CONFLICT = `${V2_HEAD}
    <situation id="S-4" version="1">
      ${v2Works('S-4-W', 'x2x', 'uux2x', LINE_A)}
      ${v2Closure('S-4-C', 'S-4-W', LINE_A)}
    </situation>
    <situation id="S-5" version="1">
      ${v2Works('S-5-W', '2', 'H2H', LINE_B, '2026-01-01T00:00:00+01:00', '2026-01-31T00:00:00+01:00')}
      ${v2Closure('S-5-C', 'S-5-W', LINE_B, '2026-03-01T00:00:00+01:00', '2026-03-31T00:00:00+01:00')}
    </situation>${V2_TAIL}`

/** v2 with a dangling cause reference and a record without location. */
export const V2_REFS = `${V2_HEAD}
    <situation id="S-6" version="1">
      ${v2Closure('S-6-C', 'MISSING', LINE_A)}
      <situationRecord id="S-6-X" version="1" xsi:type="MaintenanceWorks">
        <validity><validityStatus>active</validityStatus><validityTimeSpecification><overallStartTime>2026-05-01T00:00:00Z</overallStartTime><overallEndTime>2026-04-01T00:00:00Z</overallEndTime></validityTimeSpecification></validity>
        <groupOfLocations xsi:type="Linear"><alertCLinear xsi:type="AlertCMethod4Linear"><alertCLocationCountryCode>D</alertCLocationCountryCode></alertCLinear></groupOfLocations>
      </situationRecord>
    </situation>${V2_TAIL}`

/** v3 NDW-style feed with extension namespaces and an itinerary. */
export const V3_NDW = `<?xml version="1.0" encoding="UTF-8"?><mc:messageContainer xmlns:sit="http://datex2.eu/schema/3/situation" xmlns:mc="http://datex2.eu/schema/3/messageContainer" xmlns:nlxe="http://datex2.eu/schema/3/nlxExtensions" xmlns:loc="http://datex2.eu/schema/3/locationReferencing" xmlns:com="http://datex2.eu/schema/3/common" modelBaseVersion="3"><mc:payload xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="sit:SituationPublication" lang="nl" modelBaseVersion="3"><com:publicationTime>2026-06-01T08:00:00Z</com:publicationTime><com:publicationCreator><com:country>nl</com:country><com:nationalIdentifier>NDWNL</com:nationalIdentifier></com:publicationCreator><sit:situation id="SIT-1"><sit:overallSeverity>medium</sit:overallSeverity><sit:situationRecord xsi:type="sit:RoadOrCarriagewayOrLaneManagement" id="REC-1" version="2"><sit:validity><com:validityStatus>definedByValidityTimeSpec</com:validityStatus><com:validityTimeSpecification><com:overallStartTime>2026-05-30T00:00:00Z</com:overallStartTime><com:overallEndTime>2026-06-30T00:00:00Z</com:overallEndTime></com:validityTimeSpecification></sit:validity><sit:impact><sit:numberOfLanesRestricted>1</sit:numberOfLanesRestricted><sit:numberOfOperationalLanes>2</sit:numberOfOperationalLanes></sit:impact><sit:cause><sit:causeType>roadMaintenance</sit:causeType></sit:cause><sit:locationReference xsi:type="loc:ItineraryByIndexedLocations"><loc:locationContainedInItinerary index="0"><loc:location xsi:type="loc:LinearLocation"><loc:supplementaryPositionalDescription><loc:carriageway><loc:carriageway>mainCarriageway</loc:carriageway><loc:originalNumberOfLanes>3</loc:originalNumberOfLanes></loc:carriageway></loc:supplementaryPositionalDescription><loc:gmlLineString srsName="WGS 84"><loc:posList>52.100000 5.100000 52.101000 5.102000</loc:posList></loc:gmlLineString></loc:location></loc:locationContainedInItinerary><loc:locationContainedInItinerary index="1"><loc:location xsi:type="loc:SingleRoadLinearLocation"><loc:alertCLinear xsi:type="loc:AlertCMethod4Linear"><loc:alertCLocationCountryCode>8</loc:alertCLocationCountryCode></loc:alertCLinear></loc:location></loc:locationContainedInItinerary></sit:locationReference><sit:complianceOption>mandatory</sit:complianceOption><sit:roadOrCarriagewayOrLaneManagementType>laneClosures</sit:roadOrCarriagewayOrLaneManagementType><sit:_situationRecordExtension><nlxe:extra>1</nlxe:extra></sit:_situationRecordExtension></sit:situationRecord><sit:relatedSituation><sit:objectReference targetClass="sit:Situation" id="SIT-0"/></sit:relatedSituation></sit:situation></mc:payload></mc:messageContainer>`

/** v3 payload whose posList is "lon lat" (with explicit point coordinates to prove it). */
export const V3_SWAPPED = `<?xml version="1.0" encoding="UTF-8"?><ns4:payload xmlns="http://datex2.eu/schema/3/common" xmlns:ns2="http://datex2.eu/schema/3/situation" xmlns:ns3="http://datex2.eu/schema/3/locationReferencing" xmlns:ns4="http://datex2.eu/schema/3/d2Payload" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" modelBaseVersion="3" xsi:type="ns2:SituationPublication"><publicationTime>2026-06-01T08:00:00Z</publicationTime><publicationCreator><country>be</country><nationalIdentifier>EXAMPLE</nationalIdentifier></publicationCreator><ns2:situation id="B-1"><ns2:situationRecord xsi:type="ns2:MaintenanceWorks" id="B-1-R" version="1"><ns2:validity><validityStatus>active</validityStatus><validityTimeSpecification><overallStartTime>2026-05-01T00:00:00Z</overallStartTime></validityTimeSpecification></ns2:validity><ns2:locationReference xsi:type="ns3:LinearLocation"><ns3:gmlLineString srsName="WGS 84"><ns3:posList>4.400000 51.200000 4.401000 51.201000</ns3:posList></ns3:gmlLineString></ns2:locationReference></ns2:situationRecord><ns2:situationRecord xsi:type="ns2:MaintenanceWorks" id="B-1-P" version="1"><ns2:locationReference xsi:type="ns3:ItineraryByIndexedLocations"><ns3:locationContainedInItinerary index="0"><ns3:location xsi:type="ns3:PointLocation"><ns3:pointByCoordinates><ns3:pointCoordinates><ns3:latitude>51.2001</ns3:latitude><ns3:longitude>4.4001</ns3:longitude></ns3:pointCoordinates></ns3:pointByCoordinates></ns3:location></ns3:locationContainedInItinerary><ns3:locationContainedInItinerary index="1"><ns3:location xsi:type="ns3:LinearLocation"><ns3:gmlLineString><ns3:posList>4.400100 51.200100 4.402000 51.202000</ns3:posList></ns3:gmlLineString></ns3:location></ns3:locationContainedInItinerary></ns2:locationReference></ns2:situationRecord></ns2:situation></ns4:payload>`

/** Broken: mismatched end tag on line 4. */
export const BROKEN = `<?xml version="1.0"?>
<d2LogicalModel xmlns="http://datex2.eu/schema/2/2_0">
  <payloadPublication>
    <situation id="x"></situatio>
  </payloadPublication>
</d2LogicalModel>`

export const NOT_DATEX = `<?xml version="1.0"?><root><child/></root>`

// ------------------------------------------------------------------------------------------------
// RTTI 5-Star and OpenLR fixtures. Synthetic: they copy the element structure of real v2 (HR-style
// `openlrExtendedLinear`) and v3 (SI-style native `openlrLinear`) feeds with invented values.

/** A v2 document with the given situations (publicationTime 2026-06-01T10:00:00+02:00). */
export function v2Doc(...situations: string[]): string {
  return `${V2_HEAD}${situations.join('')}${V2_TAIL}`
}

export function v2Situation(id: string, ...records: string[]): string {
  return `
    <situation id="${id}" version="1">${records.join('')}
    </situation>`
}

/** A v2 MaintenanceWorks record with free location and extra elements. */
export function v2Record(id: string, location: string, extra = '', opts: { from?: string; to?: string; created?: string; type?: string } = {}): string {
  const { from = '2026-06-10T00:00:00+02:00', to = '2026-06-20T00:00:00+02:00', created = '2026-05-01T00:00:00+02:00', type = 'MaintenanceWorks' } = opts
  return `
      <situationRecord id="${id}" version="1" xsi:type="${type}">
        <situationRecordCreationTime>${created}</situationRecordCreationTime>
        <situationRecordVersionTime>${created}</situationRecordVersionTime>
        <validity><validityStatus>definedByValidityTimeSpec</validityStatus>
          <validityTimeSpecification><overallStartTime>${from}</overallStartTime>${to ? `<overallEndTime>${to}</overallEndTime>` : ''}</validityTimeSpecification>
        </validity>${extra}
        <groupOfLocations xsi:type="Linear">${location}
        </groupOfLocations>
      </situationRecord>`
}

/** v2 OpenLR LRP (HR style: `openlrCoordinate`, `FRC0`, `openlrLowestFRCToNextLRPoint`). */
function v2Lrp(lat: string | number, lon: string | number, dnp?: number, last = false): string {
  const tag = last ? 'openlrLastLocationReferencePoint' : 'openlrLocationReferencePoint'
  return `<${tag}><openlrCoordinate><latitude>${lat}</latitude><longitude>${lon}</longitude></openlrCoordinate>
            <openlrLineAttributes><openlrFunctionalRoadClass>FRC0</openlrFunctionalRoadClass><openlrFormOfWay>motorway</openlrFormOfWay><openlrBearing>${last ? 270 : 90}</openlrBearing></openlrLineAttributes>${
              dnp !== undefined ? `<openlrPathAttributes><openlrLowestFRCToNextLRPoint>FRC0</openlrLowestFRCToNextLRPoint><openlrDistanceToNextLRPoint>${dnp}</openlrDistanceToNextLRPoint></openlrPathAttributes>` : ''
            }</${tag}>`
}

export function v2OpenlrLine(lrps: string, po = 72, no = 72): string {
  return `
          <linearExtension><openlrExtendedLinear><firstDirection>${lrps}
            <openlrOffsets><openlrPositiveOffset>${po}</openlrPositiveOffset><openlrNegativeOffset>${no}</openlrNegativeOffset></openlrOffsets>
          </firstDirection></openlrExtendedLinear></linearExtension>`
}

const V2_LINE_45 = '45.50001 16.00003 45.50011 16.00702 45.50002 16.01404'

/** HR-style v2 feed: OpenLR without polyline, point OpenLR, binary OpenLR and invalid coordinates. */
export const V2_OPENLR = v2Doc(
  v2Situation(
    'H-1',
    v2Record(
      'H-1-R',
      `
          <locationForDisplay><latitude>45.5</latitude><longitude>16.007</longitude></locationForDisplay>
          <linearWithinLinearElement><directionRelativeOnLinearSection>opposite</directionRelativeOnLinearSection>
            <linearElement xsi:type="LinearElementByCode"><linearElementIdentifier>A9</linearElementIdentifier></linearElement>
          </linearWithinLinearElement>${v2OpenlrLine(v2Lrp(45.5, 15.999, 1150) + v2Lrp(45.5, 16.015, undefined, true))}`,
    ),
  ),
  v2Situation(
    'H-2',
    v2Record(
      'H-2-R',
      `
          <pointByCoordinates><pointCoordinates><latitude>45.60012</latitude><longitude>16.10034</longitude></pointCoordinates></pointByCoordinates>
          <pointExtension><openlrExtendedPoint><openlrPointLocationReference><openlrPointAlongLine>
            <openlrSideOfRoad>onRoadOrUnknown</openlrSideOfRoad><openlrOrientation>noOrientationOrUnknown</openlrOrientation><openlrPositiveOffset>300</openlrPositiveOffset>
            ${v2Lrp(45.6, 16.096, 900)}${v2Lrp(45.6, 16.108, undefined, true)}
          </openlrPointAlongLine></openlrPointLocationReference></openlrExtendedPoint></pointExtension>`,
    ),
  ),
  v2Situation(
    'H-BIN',
    v2Record(
      'H-BIN-R',
      `
          <linearExtension><linearExtended><gmlLineString><posList>${V2_LINE_45}</posList></gmlLineString></linearExtended></linearExtension>
          <locationExtension><openlr><binary version="3">CwiVbSRvaQEI/EwVChwBdzkL</binary></openlr></locationExtension>`,
    ),
  ),
  v2Situation('H-PROJ', v2Record('H-PROJ-R', v2OpenlrLine(v2Lrp(5432100, 612345, 1150) + v2Lrp(5432100, 613500, undefined, true)))),
  v2Situation('H-NULL', v2Record('H-NULL-R', v2OpenlrLine(v2Lrp(0, 0, 1150) + v2Lrp(45.5, 16.015, undefined, true)))),
  v2Situation('H-NAN', v2Record('H-NAN-R', v2OpenlrLine(v2Lrp('n/a', 16.0, 1150) + v2Lrp(45.5, 16.015, undefined, true)))),
  v2Situation(
    'H-SWAP',
    v2Record(
      'H-SWAP-R',
      `
          <linearExtension><linearExtended><gmlLineString><posList>${V2_LINE_45}</posList></gmlLineString></linearExtended></linearExtension>${v2OpenlrLine(v2Lrp(15.999, 45.5, 1150) + v2Lrp(16.015, 45.5, undefined, true))}`,
      '',
      { to: '2026-06-21T00:00:00+02:00' },
    ),
  ),
  v2Situation('H-DNP', v2Record('H-DNP-R', v2OpenlrLine(v2Lrp(45.5, 15.999, 500) + v2Lrp(45.5, 16.03, undefined, true)))),
  v2Situation('H-NOLAST', v2Record('H-NOLAST-R', v2OpenlrLine(v2Lrp(45.5, 15.999, 1150) + v2Lrp(45.5, 16.015, 300)))),
  // LRPs 15.6 km apart with a DNP above the OpenLR maximum of 15 km: not a usable polyline.
  v2Situation('H-LONG', v2Record('H-LONG-R', v2OpenlrLine(v2Lrp(45.5, 15.9, 16000) + v2Lrp(45.5, 16.1, undefined, true)))),
)

// v3 ---------------------------------------------------------------------------------------------

const V3_HEAD = `<?xml version="1.0" encoding="UTF-8"?><d2:payload xmlns="http://datex2.eu/schema/3/common" xmlns:sit="http://datex2.eu/schema/3/situation" xmlns:loc="http://datex2.eu/schema/3/locationReferencing" xmlns:d2="http://datex2.eu/schema/3/d2Payload" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" modelBaseVersion="3" xsi:type="sit:SituationPublication" lang="en"><publicationTime>2026-06-01T08:00:00Z</publicationTime><publicationCreator><country>xx</country><nationalIdentifier>EXAMPLE</nationalIdentifier></publicationCreator>`
const V3_TAIL = `</d2:payload>`

export function v3Doc(...situations: string[]): string {
  return `${V3_HEAD}${situations.join('')}${V3_TAIL}`
}

export function v3Situation(id: string, ...records: string[]): string {
  return `<sit:situation id="${id}">${records.join('')}</sit:situation>`
}

export interface V3RecordOptions {
  type?: string
  from?: string
  to?: string
  created?: string
  periods?: boolean
  locType?: string
  /** Elements between validity and the location (impact, cause, characteristics, …). */
  before?: string
  /** Elements after the location (management type, works type, …). */
  after?: string
}

export function v3Record(id: string, location: string, o: V3RecordOptions = {}): string {
  const { type = 'MaintenanceWorks', from = '2026-06-10T00:00:00Z', to = '2026-06-20T00:00:00Z', created = '2026-05-20T00:00:00Z', locType = 'SingleRoadLinearLocation' } = o
  const periods = o.periods
    ? `<validPeriod><recurringTimePeriodOfDay xsi:type="TimePeriodByHour"><startTimeOfPeriod>22:00:00</startTimeOfPeriod><endTimeOfPeriod>06:00:00</endTimeOfPeriod></recurringTimePeriodOfDay></validPeriod>`
    : ''
  return `<sit:situationRecord xsi:type="sit:${type}" id="${id}" version="1"><sit:situationRecordCreationTime>${created}</sit:situationRecordCreationTime><sit:situationRecordVersionTime>${created}</sit:situationRecordVersionTime><sit:probabilityOfOccurrence>certain</sit:probabilityOfOccurrence><sit:validity><validityStatus>definedByValidityTimeSpec</validityStatus><validityTimeSpecification><overallStartTime>${from}</overallStartTime>${to ? `<overallEndTime>${to}</overallEndTime>` : ''}${periods}</validityTimeSpecification></sit:validity>${o.before ?? ''}<sit:locationReference xsi:type="loc:${locType}">${location}</sit:locationReference>${o.after ?? ''}</sit:situationRecord>`
}

/** v3 OpenLR LRP (SI style: `openlrCoordinates`, `frc3`, `openlrLowestFrcToNextLRPoint`). */
export function v3Lrp(lat: number, lon: number, dnp?: number, last = false): string {
  const tag = last ? 'openlrLastLocationReferencePoint' : 'openlrLocationReferencePoint'
  return `<loc:${tag}><loc:openlrCoordinates><loc:latitude>${lat}</loc:latitude><loc:longitude>${lon}</loc:longitude></loc:openlrCoordinates><loc:openlrLineAttributes><loc:openlrFunctionalRoadClass>frc3</loc:openlrFunctionalRoadClass><loc:openlrFormOfWay>singleCarriageway</loc:openlrFormOfWay><loc:openlrBearing>${last ? 270 : 90}</loc:openlrBearing></loc:openlrLineAttributes>${
    dnp !== undefined ? `<loc:openlrPathAttributes><loc:openlrLowestFrcToNextLRPoint>frc3</loc:openlrLowestFrcToNextLRPoint><loc:openlrDistanceToNextLRPoint>${dnp}</loc:openlrDistanceToNextLRPoint></loc:openlrPathAttributes>` : ''
  }</loc:${tag}>`
}

export function v3OpenlrLine(lrps: string, po = 72, no = 72, role = 'firstDirection'): string {
  return `<loc:openlrLinear><loc:${role}>${lrps}<loc:openlrOffsets><loc:openlrPositiveOffset>${po}</loc:openlrPositiveOffset><loc:openlrNegativeOffset>${no}</loc:openlrNegativeOffset></loc:openlrOffsets></loc:${role}></loc:openlrLinear>`
}

/** Polyline from 50.0/8.0 eastwards (~1 km), 5 significant decimals. */
export const LINE_E = '50.00001 8.00003 50.00011 8.00702 50.00002 8.01404'
export const LINE_W = '50.00002 8.01404 50.00011 8.00702 50.00001 8.00003'
/** OpenLR that covers LINE_E: first LRP ~72 m west of its start, last ~72 m east of its end. */
export const OLR_E = v3OpenlrLine(v3Lrp(50, 7.999, 1150) + v3Lrp(50, 8.015, undefined, true))

export const gml = (posList: string) => `<loc:gmlLineString srsName="EPSG:4326"><loc:posList>${posList}</loc:posList></loc:gmlLineString>`
const lane = (n: number) =>
  `<loc:supplementaryPositionalDescription><loc:carriageway><loc:carriageway>mainCarriageway</loc:carriageway><loc:lane><loc:laneNumber>${n}</loc:laneNumber></loc:lane></loc:carriageway></loc:supplementaryPositionalDescription>`
const alertC = (inner: string) =>
  `<loc:alertCLinear xsi:type="loc:AlertCMethod4Linear"><loc:alertCLocationCountryCode>D</loc:alertCLocationCountryCode><loc:alertCLocationTableNumber>1</loc:alertCLocationTableNumber><loc:alertCLocationTableVersion>1.0</loc:alertCLocationTableVersion><loc:alertCDirection>${inner}</loc:alertCDirection></loc:alertCLinear>`

/**
 * v3 feed meant to reach 5★ wherever a file can show it: a planned roadworks situation (works +
 * lane speed limit, lane numbers, width, schedule, vehicle classes) and a planned closure caused by
 * construction works.
 */
export const V3_RICH = v3Doc(
  v3Situation(
    'R-1',
    v3Record('R-1-W', lane(1) + gml(LINE_E) + OLR_E, {
      periods: true,
      before: `<sit:impact><sit:numberOfLanesRestricted>1</sit:numberOfLanesRestricted><sit:originalNumberOfLanes>2</sit:originalNumberOfLanes><sit:residualRoadWidth>3.25</sit:residualRoadWidth></sit:impact><sit:forVehiclesWithCharacteristicsOf><vehicleType>lorry</vehicleType></sit:forVehiclesWithCharacteristicsOf>`,
      after: `<sit:roadMaintenanceType>roadworks</sit:roadMaintenanceType>`,
    }),
    v3Record('R-1-S', lane(1) + gml(LINE_E) + OLR_E, {
      type: 'SpeedManagement',
      periods: true,
      after: `<sit:complianceOption>mandatory</sit:complianceOption><sit:speedManagementType>speedRestrictionInOperation</sit:speedManagementType><sit:temporarySpeedLimit>60</sit:temporarySpeedLimit>`,
    }),
  ),
  v3Situation(
    'R-2',
    v3Record('R-2-W', gml(LINE_E) + OLR_E, { type: 'ConstructionWorks', created: '2026-05-01T00:00:00Z', after: `<sit:constructionWorkType>constructionWork</sit:constructionWorkType>` }),
    v3Record('R-2-C', gml(LINE_E) + OLR_E, {
      type: 'RoadOrCarriagewayOrLaneManagement',
      created: '2026-05-01T00:00:00Z',
      after: `<sit:complianceOption>mandatory</sit:complianceOption><sit:roadOrCarriagewayOrLaneManagementType>roadClosed</sit:roadOrCarriagewayOrLaneManagementType>`,
    }),
  ),
)

/** One planned roadworks situation per direction variant (see the RTTI direction sub-criterion). */
export const V3_DIRECTIONS = v3Doc(
  v3Situation('D-FWD', v3Record('D-FWD-R', gml(LINE_E) + OLR_E)),
  v3Situation('D-BWD', v3Record('D-BWD-R', gml(LINE_W) + OLR_E)),
  // ~72 m polyline near the end of a long OpenLR line: a "nearer end" rule would read it backwards.
  v3Situation('D-SHORT', v3Record('D-SHORT-R', gml('50.00001 8.01301 50.00002 8.01404') + v3OpenlrLine(v3Lrp(50, 8.0, 1150) + v3Lrp(50, 8.015, undefined, true), 935, 72))),
  v3Situation('D-FAR', v3Record('D-FAR-R', gml(LINE_E) + v3OpenlrLine(v3Lrp(50.05, 7.999, 1150) + v3Lrp(50.05, 8.015, undefined, true)))),
  v3Situation(
    'D-REL-CODE',
    v3Record(
      'D-REL-CODE-R',
      gml(LINE_E) +
        `<loc:linearWithinLinearElement><loc:directionRelativeOnLinearSection>aligned</loc:directionRelativeOnLinearSection><loc:linearElement xsi:type="loc:LinearElementByCode"><loc:linearElementIdentifier>B 9</loc:linearElementIdentifier></loc:linearElement></loc:linearWithinLinearElement>`,
    ),
  ),
  v3Situation(
    'D-REL-LS',
    v3Record(
      'D-REL-LS-R',
      gml(LINE_E) +
        `<loc:linearWithinLinearElement><loc:directionRelativeOnLinearSection>aligned</loc:directionRelativeOnLinearSection><loc:linearElement xsi:type="loc:LinearElementByLineString"><loc:gmlLineString><loc:posList>${LINE_E}</loc:posList></loc:gmlLineString></loc:linearElement></loc:linearWithinLinearElement>`,
    ),
  ),
  v3Situation('D-ALERTC', v3Record('D-ALERTC-R', gml(LINE_E) + alertC('<loc:alertCDirectionCoded>positive</loc:alertCDirectionCoded>'))),
  v3Situation(
    'D-DISAGREE',
    v3Record('D-DISAGREE-R', gml(LINE_E) + OLR_E + alertC('<loc:alertCDirectionCoded>positive</loc:alertCDirectionCoded><loc:alertCAffectedDirection>both</loc:alertCAffectedDirection>')),
  ),
  v3Situation('D-POINT', v3Record('D-POINT-R', `<loc:pointByCoordinates><loc:pointCoordinates><loc:latitude>50.00012</loc:latitude><loc:longitude>8.00034</loc:longitude></loc:pointCoordinates></loc:pointByCoordinates>`, { locType: 'PointLocation' })),
)

/** v2 roadworks with every lane restricted but no closure record (RTTI-TERM-01). */
export const V2_ALL_LANES = v2Doc(
  v2Situation(
    'T-1',
    v2Record('T-1-W', `<linearExtension><linearExtended><gmlLineString><posList>${LINE_A}</posList></gmlLineString></linearExtended></linearExtension>`, `
        <impact><numberOfLanesRestricted>2</numberOfLanesRestricted><originalNumberOfLanes>2</originalNumberOfLanes></impact>`),
  ),
)

/** v2 urgent roadworks (unplanned). */
export const V2_URGENT = v2Doc(
  v2Situation(
    'U-1',
    v2Record('U-1-W', `<linearExtension><linearExtended><gmlLineString><posList>${LINE_A}</posList></gmlLineString></linearExtended></linearExtension>`, `
        <urgentRoadworks>true</urgentRoadworks>`),
  ),
)

/** A v2 `linearElement` of type LinearElementByPoints with referents S, M1…, E at the given points. */
export function v2LinearElementByPoints(points: Array<[number, number]>, shuffle = false): string {
  const ref = (id: string, [lat, lon]: [number, number]) =>
    `<referentIdentifier>${id}</referentIdentifier><referentType>referenceMarker</referentType><pointCoordinates><latitude>${lat}</latitude><longitude>${lon}</longitude></pointCoordinates>`
  const mids = points.slice(1, -1).map((p, i) => `<intermediatePointOnLinearElement index="${i + 1}"><referent>${ref(`M${i + 1}`, p)}</referent></intermediatePointOnLinearElement>`)
  if (shuffle) mids.reverse()
  return `<linearElement xsi:type="LinearElementByPoints"><roadName><values><value>Teststraße</value></values></roadName>
              <startPointOfLinearElement>${ref('S', points[0]!)}</startPointOfLinearElement>${mids.join('')}
              <endPointOfLinearElement>${ref('E', points[points.length - 1]!)}</endPointOfLinearElement>
            </linearElement>`
}

/** A v2 `linearWithinLinearElement` with a LinearElementByPoints (DE-style), `fromPoint`/`toPoint` as given. */
export function v2ByPoints(points: Array<[number, number]>, range = '', shuffle = false): string {
  return `
          <linearExtension><extendedLinear><additonalLinearWithinLinearElement><methodName>ByPoints</methodName>
            <linearWithinLinearElement>${v2LinearElementByPoints(points, shuffle)}${range}</linearWithinLinearElement>
          </additonalLinearWithinLinearElement></extendedLinear></linearExtension>`
}

/** Five points 0.0009° (about 100 m) apart, running south along 9.5° E. */
export const BYPOINTS_SOUTH: Array<[number, number]> = [52.01, 52.0091, 52.0082, 52.0073, 52.0064].map((lat) => [lat, 9.5])

export const fromTo = (from: string, to: string) => `
              <fromPoint xsi:type="DistanceFromLinearElementStart"><distanceAlong>${from}</distanceAlong></fromPoint>
              <toPoint xsi:type="DistanceFromLinearElementStart"><distanceAlong>${to}</distanceAlong></toPoint>`

/** DE-style records: ByPoints plus OpenLR, ByPoints alone (uncut, percentage, referent), OpenLR alone. */
export const V2_BYPOINTS = v2Doc(
  v2Situation(
    'BP-1',
    v2Record(
      'BP-1-R',
      v2ByPoints(BYPOINTS_SOUTH, fromTo('0.0', '150.0'), true).replace(
        '</extendedLinear>',
        `</extendedLinear>${v2OpenlrLine(`<openlrLocationReferencePoint><openlrCoordinate><latitude>52.01</latitude><longitude>9.5</longitude></openlrCoordinate><openlrPathAttributes><openlrDistanceToNextLRPoint>400</openlrDistanceToNextLRPoint></openlrPathAttributes></openlrLocationReferencePoint><openlrLastLocationReferencePoint><openlrCoordinate><latitude>52.0064</latitude><longitude>9.5</longitude></openlrCoordinate></openlrLastLocationReferencePoint>`, 0, 250).replace(/<\/?linearExtension>/g, '')}`,
      ),
    ),
    v2Record('BP-2-R', v2ByPoints(BYPOINTS_SOUTH)),
    v2Record(
      'BP-3-R',
      v2ByPoints(
        BYPOINTS_SOUTH,
        `<fromPoint xsi:type="PercentageDistanceAlongLinearElement"><percentageDistanceAlong>50</percentageDistanceAlong></fromPoint>
              <toPoint xsi:type="DistanceFromLinearElementReferent"><distanceAlong>50</distanceAlong><fromReferent><referentIdentifier>M1</referentIdentifier></fromReferent><towardsReferent><referentIdentifier>S</referentIdentifier></towardsReferent></toPoint>`,
      ),
    ),
    v2Record(
      'BP-4-R',
      v2OpenlrLine(
        `<openlrLocationReferencePoint><openlrCoordinate><latitude>52.01</latitude><longitude>9.5</longitude></openlrCoordinate><openlrPathAttributes><openlrDistanceToNextLRPoint>800</openlrDistanceToNextLRPoint></openlrPathAttributes></openlrLocationReferencePoint><openlrLastLocationReferencePoint><openlrCoordinate><latitude>52.0064</latitude><longitude>9.5</longitude></openlrCoordinate></openlrLastLocationReferencePoint>`,
        200,
        200,
      ),
    ),
  ),
)

const POINT_45 = `
          <pointByCoordinates><pointCoordinates><latitude>45.50003</latitude><longitude>16.00701</longitude></pointCoordinates></pointByCoordinates>`

/**
 * Records whose only line is OpenLR, next to a point (pointCoordinates). OLR-003/004 compare the
 * OpenLR with the point, never with the straight line the map draws through the OpenLR itself.
 */
export const V2_OPENLR_POINTS = v2Doc(
  v2Situation('OP-OK', v2Record('OP-OK-R', POINT_45 + v2OpenlrLine(v2Lrp(45.5, 15.999, 1150) + v2Lrp(45.5, 16.015, undefined, true)))),
  v2Situation('OP-SWAP', v2Record('OP-SWAP-R', POINT_45 + v2OpenlrLine(v2Lrp(15.999, 45.5, 1150) + v2Lrp(16.015, 45.5, undefined, true)))),
  // About 33 km north of the point; the OpenLR path is at most 15 km long.
  v2Situation('OP-FAR', v2Record('OP-FAR-R', POINT_45 + v2OpenlrLine(v2Lrp(45.8, 15.999, 1150) + v2Lrp(45.8, 16.015, undefined, true)))),
)

/** Records drawn approximately (LOC-002) or not at all (LOC-001), each for another reason. */
export const V2_LOCATION_KINDS = v2Doc(
  v2Situation('K-PT', v2Record('K-PT-R', POINT_45)),
  v2Situation('K-ZERO', v2Record('K-ZERO-R', `<linearExtension><linearExtended><gmlLineString><posList>45.5 16.0 45.5 16.0</posList></gmlLineString></linearExtended></linearExtension>`)),
  v2Situation(
    'K-OLRPT',
    v2Record(
      'K-OLRPT-R',
      `<pointExtension><openlrExtendedPoint><openlrPointLocationReference><openlrPointAlongLine><openlrPositiveOffset>300</openlrPositiveOffset>${v2Lrp(45.6, 16.096, 900)}${v2Lrp(45.6, 16.108, undefined, true)}</openlrPointAlongLine></openlrPointLocationReference></openlrExtendedPoint></pointExtension>`,
    ),
  ),
  v2Situation('K-AREA', v2Record('K-AREA-R', `<areaExtension><openlrAreaLocationReference><openlrCircleLocationReference><openlrRadius>500</openlrRadius></openlrCircleLocationReference></openlrAreaLocationReference></areaExtension>`)),
  v2Situation('K-PROJ', v2Record('K-PROJ-R', v2OpenlrLine(v2Lrp(5432100, 612345, 1150) + v2Lrp(5432100, 613500, undefined, true)))),
  // Projected metres instead of degrees: decoded, but nothing to draw.
  v2Situation('K-BPPROJ', v2Record('K-BPPROJ-R', v2ByPoints([[5432100, 612345], [5432200, 612345]]))),
  // A point 150 m along a LinearElementByPoints: not a line.
  v2Situation(
    'K-PAL',
    v2Record(
      'K-PAL-R',
      `<pointAlongLinearElement>${v2LinearElementByPoints(BYPOINTS_SOUTH)}<distanceAlongLinearElement xsi:type="DistanceFromLinearElementStart"><distanceAlong>150</distanceAlong></distanceAlongLinearElement></pointAlongLinearElement>`,
    ),
  ),
)

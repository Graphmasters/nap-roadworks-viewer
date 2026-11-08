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

function v2Works(id: string, lane: string, ext: string | undefined, posList: string, from = '2026-05-01T00:00:00+02:00', to = '2026-07-01T00:00:00+02:00') {
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

function v2Closure(id: string, cause: string, posList: string, from = '2026-05-01T00:00:00+02:00', to = '2026-07-01T00:00:00+02:00') {
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

const LINE_A = '53.500000 10.000000 53.501000 10.002000 53.502000 10.004000'
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

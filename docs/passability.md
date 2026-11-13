# Passability and contradictions

From the checks, the lane status and the links between records, the viewer derives one
classification and one routing action per record. The reasons are listed, so the classification can
be checked rather than believed.

## Classes and routing actions

| Class | Meaning | Routing action |
|---|---|---|
| **passable** | All driving lanes open, or only stopping/parking restrictions (a stopping ban is not a driving ban) | do not block |
| **restricted** | Some lanes closed, or a partial closure | do not block |
| **closed** | A full closure, confirmed or not contradicted by the lane status, or every lane of one direction closed | block (manual review if the closure is only inferred from the lane status) |
| **conditional** | Closed or restricted, but only during the record's validity periods (schedules) | manual review / do not block |
| **conflicting** | The closure contradicts its own or its cause's lane status (see below) | manual review |
| **unknown** | No closure claim and no lane status, or unknown lane codes | do not block |

The Passability filter in the record list selects records by class. The **Record** tab lists the
reasons for the selected record.

## Contradictions

Some records contradict themselves or each other. The viewer flags two patterns.

### DQ-RW-001: closure that contradicts its cause

A record claims a full closure (`roadClosed`, `carriagewayClosures`), but the record it names as its
cause (`managedCause`) only describes a stopping or parking prohibition: extended lane codes such as
`H` or `P` (see [Lanes](matching-lanes.md#lanes)), no closed lane. The steps:

1. Resolve the `managedCause` links inside the situation. Missing (`REF-001`) and cyclic (`REF-002`)
   references are reported separately.
2. Read the lane evidence of the closure, or of its cause when the closure has none. When
   `laneStatusCoded` and `extendedLaneStatusCoded` disagree, the more restrictive reading wins.
   Unknown codes never count as open lanes.
3. Skip the finding when the validity periods do not overlap.
4. If other records in the situation report a closure for the *same section* (their drawn lines
   overlap within 30 m) at an overlapping time, say so: the case needs review rather than correction.
   A straight line through OpenLR points cuts corners, so this test is less reliable for it.

#### Example: closed or not?

From [extended-lane-status-v2.xml](examples/extended-lane-status-v2.xml): a closure record reports
`roadClosed` and names a works record as its cause.

<!-- example: extended-lane-status-v2.xml -->
```xml
<cause xsi:type="ManagedCause">
  <managedCause targetClass="SituationRecord" id="EX-3-W" version="1"/>
</cause>
```

<!-- example: extended-lane-status-v2.xml -->
```xml
<complianceOption>mandatory</complianceOption>
<roadOrCarriagewayOrLaneManagementType>roadClosed</roadOrCarriagewayOrLaneManagementType>
```

The cause's lane status keeps both lanes open; the extended code adds a no-stopping zone (`H`) on
each side:

<!-- example: extended-lane-status-v2.xml -->
```xml
<laneStatusCoded>u1o</laneStatusCoded>
<extendedLaneStatusCoded>Hu1oH</extendedLaneStatusCoded>
```

Both cannot be true at the same time. The viewer flags a possible incorrect road closure
(`DQ-RW-001`), classifies the closure as **conflicting** and recommends **manual review**; only the
publisher can tell what is really happening on site. The works record itself is *passable*: a
stopping ban is not a driving ban.

### DQ-RW-002: closure with open lanes in both directions

A record reports a full closure, but its own or its cause's lane status keeps lanes open in both
directions. A lane status that closes every lane of one direction is read as a one-direction closure
instead, and not flagged.

### What a finding means

A finding never claims the road is passable. It recommends a manual review and not blocking the road in
routing on this record alone. Each finding lists its evidence (the XML path and raw value of each
record involved) and its assumptions, for example that the lane status follows the alphabet of the
German roadworks profile. A flagged contradiction calls for review; it proves no error.

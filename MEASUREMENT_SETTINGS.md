# Activity and Measurement Settings

Master Data includes activity and UOM settings. Add named options or toggle active
status; duplicate names are rejected without case sensitivity. At least one
option must remain active. Defaults include boxes, bottles, tablets, capsules,
sachets, carton, kg, g, mg; and Dispensing, Bottling, Tableting, Packing, Blending,
Fermentation, Drying. Custom UOMs represent counted units.

Both calendar activity creation and the sidebar plan form include activity type,
quantity, UOM, optional mg per counted unit, and live equivalent kg. Counted units
require whole quantities. Direct mass quantities may be fractional. Missing unit
weight means unspecified equivalent, never an assumed zero or package conversion.

Formula: quantity * mg per unit / 1,000,000. Thus 100,000 tablets * 332 mg = 33.2 kg.
For boxes/bottles, enter total net weight per selected box/bottle. No packaging
ratios, density conversions, production loss allowance or gross/tare weight is
inferred. kg/g/mg use direct mass conversion and ignore any prior per-unit weight.

Each plan line snapshots UOM, activity label and unit weight, plus computed kg.
Retiring a setting does not rewrite history. Calendar titles/previews/details,
board records and report queues display the saved information, falling back to
product UOM only for older sample records. Dragging preserves measurement fields.

These changes run in the existing browser-state demo. Settings survive navigation
and team switches within the session, but reset on reload. Prisma includes future
MeasurementUnit/ActivityType records and decimal snapshot fields; no migration or
database write has been run. Live settings writes must require
`scheduler.master.manage`, and live record creation must revalidate active options
and recompute the equivalent server-side under the existing team/action guard.

Verification: 20 unit tests pass, production build passes, Prisma schema validates.
Browser verified tablet inputs yielding 33.2 kg, saved calendar labels/preview,
and creation of a custom UOM. Calculation tests cover direct mass units, unknown
package weights, invalid quantities and weights, and measurement snapshots.

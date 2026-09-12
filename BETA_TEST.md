# Fresh-entry beta check

Date: 2026-09-12

The app now opens in Admin with no products, work centres, machines, units,
processes, calendars, planned activities, production entries, actuals or WIP.
Only the starter Administrator and standard measurement/activity options remain.
Historical sample fixtures are retained for automated tests, not loaded as app records.

Browser checks used newly entered data, not the old fixtures:

- Created Beta Tableting, Beta Unit, Beta Planner and Beta Production.
- Assigned explicit planner and production access without project teams.
- Added BETA-001 / Beta Vitamin Tablet with tablets as its UOM.
- Added Beta Room and Beta Tablet Press, capacity 100,000 tablets per shift,
  setup time 30 minutes.
- Searched the product by code and created a 100,000-tablet plan.
- Verified 332 mg per tablet produces a 33.2 kg equivalent batch.
- Moved the plan from 12 September to 13 September in List using keyboard controls.
- Verified print contents: Unit: Beta Unit, product name and 100,000 tablets only.
- Verified Production cannot edit planner fields or move the plan.
- Saved production details with the configured machine, capacity and setup time.
- Completed production with 95,000 tablets final yield; verified 95.0% actual/planned
  and -5,000-tablet variance, with completed fields locked.
- Found and fixed completed activities remaining in the open-plan queue.
  Browser retest showed zero open plan lines after completion.

Automated regression suite: 59 tests pass, covering auth, access, measurements,
conflicts, admin deletion, print/PDF, production flow, actuals and empty setup.

Limitations: browser data remains in memory and resets on reload. This is a beta
preview, not a persistent multi-user production deployment. Core authentication
and database integration remain fail-closed pending implementation. This check
does not constitute exhaustive testing of every flow or dependency security review.

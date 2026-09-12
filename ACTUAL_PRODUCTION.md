# Actual Production Reporting

Reports now includes one cumulative actual-production record per plan line. Production personas can record or replace the total; planners and administrators can view it within their permitted team. Saving an edited total replaces the earlier total, rather than adding it again. Schedule completion is not inferred from actual output.

Each record includes production date, actual quantity, optional deviation description and corrective action, editor and update time. A checked deviation requires a description. Quantity variance is calculated separately; a quantity difference is not automatically a declared deviation.

Actual / planned = actual quantity / planned quantity * 100. Variance = actual - planned. Missing actuals remain "Not reported"; a saved zero is 0%. Overproduction can exceed 100%. Units are never combined into a cross-product aggregate.

The first report snapshots the planned quantity and UOM. Subsequent edits retain that baseline, so later planning changes do not silently rewrite performance. Actual totals must be entered in that UOM. A future rebaseline workflow should require explicit approval and retain history.

This follows the existing in-memory demo storage: navigating tabs retains records, reloading clears them. Production deployment still requires database persistence, server-side dashboard permission and team checks, and an append-only revision trail. The displayed last editor/time is not a complete audit history.

# Bio Tree Scheduler Data Model

All major records use UUID identifiers and include room for future external Bio Tree OS references.

## Core Entities

Customer stores demand references.

Product represents finished or intermediate products.

Production Order represents a demand item that needs production.

Production Plan is a planner-level weekly or daily plan.

Plan Line is one planned production activity before detailed scheduling.

Work Centre is a logical production area such as Fermentation, Spray Drying, Blending, Filling, or Packing.

Machine is schedulable equipment belonging to a work centre.

Employee is an optional person or team assignment.

Operation Template is a reusable operation step for later routing logic.

Schedule Entry is the executable calendar item with work centre, machine, start, end, and status.

Batch is an optional manufacturing batch reference.

Material is a raw material or packaging material reference, without full inventory behavior in the MVP.

Schedule Change Log records changes for auditability.

## Status Values

Production Plan: Draft, Proposed, Accepted, Archived.

Plan Line: Unscheduled, Partially Scheduled, Fully Scheduled.

Schedule Entry: Draft, Confirmed, In Progress, Completed, Blocked, Cancelled.

Production Order: Draft, Released, In Production, Completed, Cancelled.

## Validation Rules

- Quantities must be positive.
- Dates and time ranges are required where the workflow depends on them.
- Schedule entry end time must be later than start time.
- Confirmed schedule entries must warn on machine overlap.
- Cancelled, blocked, and delayed records should capture a reason.

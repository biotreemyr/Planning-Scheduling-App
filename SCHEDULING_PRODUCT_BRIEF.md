# Bio Tree Scheduling Product Brief

The MVP exists to help planners and production users move from high-level production plans to executable schedules without introducing advanced optimization too early.

## Two Scheduling Layers

Production Planning answers what should be produced, roughly when, in what quantity, for which customer or order, and with what priority.

Detailed Production Scheduling answers which work centre, machine, start time, end time, status, and optional people are assigned to execute the work.

## MVP Scheduling Rules

- Manual scheduling is the source of truth.
- The system may warn about conflicts but must not silently move confirmed work.
- Detailed scheduling must support edit, duplicate, cancel, and status change workflows.
- Machine double-booking checks apply when a schedule entry has a machine and a confirmed time range.
- A plan line may remain unscheduled, partially scheduled, or fully scheduled.
- Capture reason codes for cancelled, blocked, or delayed work.
- Keep optimization behind a future adapter until real pilot rules are known.

## Included Scope

- Master data for customers, products, work centres, machines, and employees.
- Production orders and planner-level production plans.
- Plan lines by date, product, quantity, priority, order reference, and remarks.
- Conversion of plan lines into detailed schedule entries.
- Calendar or timeline-style scheduling by work centre and machine.
- Conflict warnings for machine overlaps.
- Basic reports for unscheduled lines, weekly load, conflicts, and completion.

## Deferred Scope

Full inventory, procurement, accounting, costing, HR, advanced MRP, multi-factory scheduling, IoT telemetry, and solver-driven rescheduling are intentionally deferred.

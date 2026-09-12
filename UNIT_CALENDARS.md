# Unit Calendars and Production Flow

## Current UI

Configuration sections use an add/edit form above a saved-item list with explicit Edit and Delete actions. Units have process checkboxes; assigning a process creates its unit calendar, preserving existing calendar IDs and names. Removing unit processes or deleting configuration is rejected while referenced by people/grants, machines, calendars, teams or plan/production/WIP records. Machine deletion is blocked for any historical booking; inactive status remains available. Current-user deletion and removal of the last administrator are prohibited. These checks run in the demo state layer and must be ported to transactional backend commands.

The User selector is in the top-right corner. Admin opens Configuration, Products and Measurements. In demo mode, non-admin users get an explicit Open administrator preview action rather than a blank configuration area. This is not a live privilege escalation mechanism; the Core workspace still fails closed.

Unit and process checkboxes sit directly above the calendar. All selects only authorised process calendars in that unit; no ticks shows no activities. New activities require a specific selected process. Updates, actuals and WIP preserve each record's calendar identity even while several calendars are visible. The incoming WIP inbox is now collapsed under Reports, not above the planner.

Products are added under Admin / Products with a unique product code, product name and UOM. Planning dropdowns search active products by name or code and require selection of a matching record. The stored product ID remains separate from the displayed label.

## Access model

This replaces the old department/team selector in the demo. A calendar belongs to exactly one unit and process. Admin can define units, processes, calendars, process-associated project teams, people, roles and memberships. One calendar per unit/process pair is allowed. Calendar unit/process identity is immutable to avoid silently moving existing records; its name can be edited.

Everyone needs unit membership. Production users additionally need membership of a team associated with the calendar process. Planners need an explicit calendar grant as well as unit membership. Administrators manage configuration but only see calendars in their assigned units. Unknown or unassigned calendar records fail closed. Print/PDF, reports, incoming WIP and activity dialogs use the selected authorised calendar's records.

Destination names are routing metadata, not permission to read the receiving calendar. Transfers can target a different process, including another unit, only when a production recipient is assigned. A receiving user sees the transferred product, quantity, UOM, order and handoff notes, not the source calendar's other scheduling data.

## Machines

Machines belong to one unit and can support multiple processes. Admin configures name, code, capacity and basis, setup minutes, work centre and active state. Booked machines cannot be moved out of their unit or removed from a booked process. Setup is reserved immediately before each confirmed/in-progress booking. Exact end/setup-start boundaries are permitted. Historical bookings currently use the latest configured setup duration; snapshotting machine settings belongs in the persistent backend.

## Completion

Production uses End production on an activity, enters final yield in its planning UOM, and chooses a receiving process or final output. This atomically updates the local activity, completes non-cancelled bookings, records actual output and creates at most one WIP transfer. Zero output is permitted without a transfer. Completion is final in this MVP, with plan quantity and yield locked afterwards. Existing deviation details are retained. Final reporting uses the plan quantity at completion.

The receiving process's Incoming WIP section shows an awaiting-receipt count and handoff details. Production acknowledges receipt; a permitted planner can add that received WIP to the receiving plan once, with a chosen date. This is an in-app inbox, not an email/push notification. Yield percentage is output/planned quantity, not a mass-balance yield against material inputs. Partial transfers, unit conversion across process steps, quality-release approval, reversals and multiple destinations are not implemented.

## PDF and print

Select Month, Week or Day and a date, then use Download calendar PDF. The export includes all records in the selected calendar/date range, independent of search and priority filters. Month output uses a seven-column calendar; week and day output use dated detail bands. Long days continue onto extra pages. PDF output uses jsPDF's standard Latin font. The printer button also offers a print stylesheet for browsers with print support.

## Deployment boundary

Admin now uses one compact add/edit-above-list layout for units, processes, people, machines, products, work centres and measurements. Separate calendar and project-team editors are removed. Unit process selections maintain internal calendar IDs. Production people can have explicit processIds; when present these take precedence over legacy team memberships (including an empty list, which grants no process access). Existing team-only records retain their previous restrictions until edited. Planner grants remain explicit unit/process-calendar assignments.

Deleting unused units/processes cleans dependent calendar and access links in the proposed directory before validation. Machines and planning/production/WIP history still block deletion atomically. In-use measurement names and calculation units cannot be renamed or deleted; they can be made inactive. Product UOM changes are blocked when planning/production history exists.

All directory changes, records and transfers remain in memory and reset on reload. Demo persona selection is for preview only, not authentication or a security boundary. The existing live Core page remains fail-closed and never exposes this demo for a verified live session.

Before production: migrate legacy lines/bookings to explicit calendar IDs; persist unit/process/team memberships and planner grants; bind people to verified Core user IDs; enforce the same calendar policy server-side for reads, writes and exports; reserve machines transactionally across calendars; complete/transfer in a database transaction with a unique source activity completion; audit configuration and yield changes. WIP receipt and planning must be idempotent in the database, not only in client state. An outbox/event channel will be needed for cross-session notifications.

Existing Prisma models remain scaffolding and need a reviewed migration for this new access model. Do not deploy using legacy team-only guards. Dependency audit still flags existing Next.js/PostCSS, Prisma and TOAST UI dependency paths; review them before deployment rather than applying unrelated force upgrades.

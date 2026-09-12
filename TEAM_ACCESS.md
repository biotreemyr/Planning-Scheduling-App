# Department and Project Team Access

Calendar creation uses `scheduler.plan.create`; moving a planned activity uses
`scheduler.plan.edit` plus the same team scope when connected. Dragging changes
only PlanLine.plannedDate, never a confirmed machine booking. The local demo
supports Add activity, double-click date creation, drag/drop and hover/focus
previews. Browser-state changes still reset when the page reloads.

Each project team belongs to one department. A user may belong to several teams;
department membership alone never grants access to sibling teams. Existing action
permissions still determine what an assigned user can do. Planner/production labels
in the local preview are illustrative, not authorization grants.

Local demo: use Demo access preview to try sample memberships. Aida sees two
manufacturing teams; Lim sees Fermentation only; Kumar sees Sachet only; Mei sees
Pilot Projects only. Calendar, planner, schedule, reports, and status counts use
the selected assigned team. New lines/entries inherit that team. Switching teams
keeps browser-state records but resets forms. Master data remains shared reference
data. Unassigned records are excluded from team views.

Live security: the app still fails closed in Core mode. The demo ships sample
records in browser assets and is not private storage. Never place real records
in demo data. The identity preview must never be used as a live login selector.

The Core adapter must resolve fresh scheduler teamIds from trusted active team
assignments (including active departments/teams). Never accept memberships from
the browser. requireTeamPermission and withTeamPermission require both app/action
permission and explicit membership, returning a teamId query scope. Every future
repository read, report, export, detail lookup and mutation must apply that scope
before fetching/returning data. Updating a record uses both record ID and team ID;
creating uses the validated team ID and checks linked plan/order ownership. Never
fetch all teams and filter on the client. Admin roles have no implicit team bypass.

Prisma defines Department/ProjectTeam and nullable teamId on existing records for
future migration. Backfill ownership explicitly before enabling live reads; null
does not mean public. No database migration was run in this client-state MVP.

Shared machine availability must be checked across teams server-side, returning
only a generic reserved/unavailable message for another team's booking. The demo
checks this on schedule creation and status changes. No foreign project names or notes should
be returned in availability errors. Core connection, persistent repositories and
actual assignment administration remain required for live multi-user operation.

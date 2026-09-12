# Unified Planner Workflow

Planner Board is the activity entry point in both Calendar and Board mode.
Select an activity to open Part 1 (planning) and Part 2 (production) together.
Multiple machine bookings per activity are supported, including existing bookings.

Local preview responsibilities:
- Aida/Mei: create and move activities; update planned date, quantity, priority and
  planning remarks. Production bookings are visible but read-only.
- Lim/Kumar: view planning; add/update machine, time, status and production notes
  for assigned-team activities. Planning fields and dragging are disabled.
- Administrator: configure machines, capacities, UOMs and activity types in Master
  Data. No implicit planning/production editing privilege is granted.

Capacity is configured centrally with a numeric value and explicit basis, such as
kg per batch or tablets per hour. It is displayed read-only in production details.
No comparison or throughput calculation is made between incompatible units/bases.
Machine reservation conflicts block confirmed overlapping saves with a generic
message; another team's activity details are not exposed.

Core integration must grant planner roles scheduler.plan.create/edit and production
roles scheduler.schedule.create/edit/approve/cancel as appropriate, plus view and
team assignments. Machine/configuration writes require scheduler.master.manage.
Separate protected server actions must whitelist planning vs production fields,
derive linked product/team IDs, validate references and apply withTeamPermission.
The local preview enforces these responsibilities in controls and mutation handlers;
it is not a replacement for the pending Core and persistent backend connection.

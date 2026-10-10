# Bio Tree Core Connection

Status: Core sign-in is connected and the scheduling workspace is served to
signed-in Core users. A Clerk session from Bio Tree Core is read on every
request, app access and permissions are resolved from Core's database, and every
save is reviewed on the server against the saver's Core permissions and recorded
in an audit table.

## Registration in Core

| Field | Value |
| --- | --- |
| App name | Production Scheduling |
| App key | `scheduler` (stable) |
| App URL | `https://scheduler.biotreegroup.com.my` |
| Icon | `scheduler` |
| Status | `active` |
| Tile description | Production plans, machine schedules, and work centre load |
| Roles | Viewer, Production, Planner, Manager, Scheduler Admin (seeded in Core) |
| Initial access | Assigned by the Core administrator, per user |
| Legacy login | None; this app has no sign-in screen of its own |

## Permission Contract

Core owns these keys; this app follows. They are seeded in the dashboard repo by
`migrations/0003_seed_default_roles_and_permissions.sql` and `0007_scheduler_review_approve_permissions.sql`,
and mirrored in `src/lib/auth/permissions.ts`. Renaming one here denies everyone
holding it, silently, so change Core first.

| Key | Protected operation |
| --- | --- |
| `scheduler.planning.view` | Read the planning board |
| `scheduler.schedule.view` | Read the schedule board |
| `scheduler.planning.create` | Add a plan line |
| `scheduler.planning.edit` | Move or edit a plan line |
| `scheduler.schedule.edit` | Create, duplicate and edit entries, and ordinary status changes |
| `scheduler.schedule.submit` | Send a schedule forward for review |
| `scheduler.schedule.review` | Review a submitted schedule or return it |
| `scheduler.schedule.cancel` | Cancel, including via status selection |
| `scheduler.schedule.approve` | Confirm, including creating a confirmed entry |
| `scheduler.reports.view` | Read reports |
| `scheduler.master_data.manage` | Create/manage products, work centres, machines, employees |

Core has no separate schedule-create key, so creating and editing an entry are
one grant (`scheduler.schedule.edit`). Split them again only once Core defines
the key. Opening the workspace requires at least one of the two board reads.

Core's existing scheduler roles already carry these: Viewer and Production get
board reads, Planner adds planning create/edit and reports, Manager adds editing,
and Scheduler Admin holds every `scheduler.*` key. Only Core permissions
authorize actions. App Admin has no wildcard bypass across other apps.

## Implemented Boundary

`src/middleware.ts` runs `clerkMiddleware` so Core's Clerk session is attached to
every request. It deliberately does not call `auth.protect()`: this app owns no
sign-in screen, so the page redirects unauthenticated visitors to Core itself and
can explain a refusal. Without Clerk keys the request passes through
unauthenticated and the guards deny it.

`src/lib/auth/coreDirectory.ts` reads Core's identity and permission tables over
a second, read-only pool, the same arrangement Courier Tracker uses
(`courier-tracker/services/bioTreeCore.js`). It never writes to Core. Access is
the union of an active `user_app_roles` assignment and direct
`user_app_permissions` grants, because Core's dashboard shows the tile for
either; Super Admin holds every permission in an active app. A resolved identity
is cached for `BIO_TREE_CORE_CACHE_TTL_MS` (30s), so deactivating someone in Core
takes effect within that window.

`src/lib/auth/guards.ts` exposes `requireLogin`, `getCurrentBioTreeUser`,
`requireAppAccess`, `requirePermission`, `requireAnyPermission` and
`requireTeamPermission`. Missing, inactive, non-employed, unassigned users and
mismatched Clerk IDs are denied. A Clerk or Core failure is `unavailable`, which
denies the request; authorization never falls back to a demo identity.

Core has no team model, so `teamIds` is always undefined and every
`requireTeamPermission` call fails closed. See `TEAM_ACCESS.md`.

The root page is dynamic and checks permission on the server in Core mode.
Unauthenticated sessions redirect to Core's sign-in with a `redirect_url` back to
this app, built from the configured `SCHEDULER_APP_URL` rather than the request
Host header, so a forged host cannot turn Core's sign-in into an open redirect.
Denied users see access denied; connection failures show unavailable. Authorized
users see the workspace (see Workspace in Core Mode).

Local `next dev` still supports the browser-state demo with
`SCHEDULER_AUTH_MODE="demo"`. Production defaults to Core and rejects explicit
demo mode. Demo data is sample data, is included in client assets, and is not
confidential or persistent. Never put real records in `seed.ts`.

## Deployment requirement: shared cookie domain

A Clerk session is carried by a cookie, so this app only sees it if the browser
sends that cookie to this app's origin. Core registers the scheduler as
`http://192.168.1.20:8092`, a bare LAN IP over plain HTTP — a different site to
Core, so the session never arrives and every request bounces back to sign-in.
Clerk cannot send a production session cookie to an IP address.

The scheduler must be served over HTTPS from the same registrable domain as Core,
for example `https://scheduler.biotreegroup.com.my`. Then set `apps.app_url` in
Core (see the dashboard repo's `migrations/0008_activate_scheduler_app.sql`) and
`SCHEDULER_APP_URL` here to that same value, and add the origin to the Clerk
instance's allowed redirect origins so `redirect_url` is honoured.

Locally, a Clerk development session cookie is set on `localhost` and ignores the
port, so Core on `:3000` and the scheduler on `:3001` share it. Open the app at
`http://localhost:3001`, not `127.0.0.1`, or the cookie is missed.

## Workspace in Core Mode

The root page loads the PostgreSQL workspace for a user holding a board read and
renders it with that user's Core identity. The demo person picker is replaced by
"Signed in as <name>"; Core has no unit model yet, so every signed-in user sees
every unit. What they may change comes only from Core permission keys
(`src/lib/auth/capabilities.ts`):

| Core key | In the workspace |
| --- | --- |
| `scheduler.planning.create` | Add activities and orders, plan received WIP |
| `scheduler.planning.edit` | Move and edit activities, assign machines |
| `scheduler.schedule.edit` | Record bookings, results and WIP handovers, assign machines |
| `scheduler.schedule.approve` | Set a booking to Confirmed |
| `scheduler.schedule.cancel` | Set a booking to Cancelled |
| `scheduler.master_data.manage` | Admin: units, people, products, machines, measurements, sample data |
| `scheduler.reports.view` | Reports tab |

The browser saves the whole workspace, so `PUT /api/workspace` trusts nothing it
says about itself. In Core mode it requires the verified Clerk/Core user, an
`Origin` equal to `SCHEDULER_APP_URL`, and the page's write token. Inside the save
transaction it compares the stored snapshot with the new one
(`src/lib/auth/workspaceAccess.ts`) and refuses the whole save if any change
needs a permission the user lacks. Each accepted save writes a
`SchedulerAuditEvent` row with the Core user ID, Clerk ID, name, new revision and
a summary of what changed.

Loading sample data creates confirmed bookings, so it needs
`scheduler.schedule.approve` as well as master data; in Core today only Super
Admin holds approve.

Core's **Production** role currently has only board reads, so production staff
cannot record results until Core grants that role `scheduler.schedule.edit`.

## Work Remaining

1. Move Core and this app to live Clerk keys together — Core currently runs on
   test keys.
2. Reads are not yet scoped: anyone with a board read receives the whole
   workspace, including reports data, in the page. Scope by unit or team once
   Core has a model for it, and serve reports only under `scheduler.reports.view`.
3. Record names in plan and booking `changedBy` fields from the server rather than
   the browser; the audit table is the trustworthy record meanwhile.
4. Give Core a team model, or drop `requireTeamPermission` — it currently denies
   everyone because Core returns no team assignments.
5. Grant Core's Production role `scheduler.schedule.edit` if production staff
   should record results.
6. Assign named users their scheduler roles in Core. Verify real sign-in,
   sign-out, direct URLs, inactive users, revocation, cross-app isolation,
   read-only users, tampered mutation requests, and Core outages end to end.

No real Core accounts, role assignments, or dashboard records were changed.

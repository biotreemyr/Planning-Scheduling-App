# Bio Tree Core Connection

Status: integration foundation implemented; live Clerk/Core connection is pending.
The supplied handoff is the integration specification. The requested scope is
preparing this app to link to dashboard login later, not registering apps or users
in a live dashboard now.

## Registration Draft

| Field | Value |
| --- | --- |
| App name | Bio Tree Production Scheduling |
| App key | `scheduler` (stable) |
| App URL | Deployment URL pending; local preview is http://localhost:3001 |
| Icon | CalendarDays |
| Status | Activate after connection acceptance tests pass |
| Sort order | Dashboard owner to assign |
| Tile description | Production plans, machine schedules, and work centre load |
| Roles | Viewer, User, Manager, App Admin |
| Initial access | Named users to be assigned by the Core administrator |
| App administrators | Named users to be assigned by the Core administrator |
| Legacy login | No existing username/password system; no migration required |

## Permission Contract

| Key | Protected operation |
| --- | --- |
| `scheduler.board.view` | Read planning and schedule boards |
| `scheduler.plan.create` | Add a plan line |
| `scheduler.schedule.create` | Create or duplicate a schedule entry |
| `scheduler.schedule.edit` | Edit entries and ordinary status changes |
| `scheduler.schedule.cancel` | Cancel, including via status selection |
| `scheduler.schedule.approve` | Confirm, including creating a confirmed entry |
| `scheduler.reports.view` | Read reports |
| `scheduler.master.manage` | Create/manage products, work centres, machines, employees |

Suggested Core assignments: Viewer receives board/report reads; User also receives
plan creation and schedule creation/editing; Manager also receives confirmation
and cancellation; App Admin also receives master-data management. These are
registration suggestions, not local role-based grants. Only Core permissions
authorize actions. App Admin has no wildcard bypass and cannot administer other apps.
No export permission exists until an export workflow exists.

## Implemented Boundary

`src/lib/auth/guards.ts` exposes `requireLogin`, `getCurrentBioTreeUser`,
`requireAppAccess`, and `requirePermission`. Its adapter must resolve a verified
Clerk session and load the matching Core profile with fresh employment, app status,
assignment, and permissions. Missing/inactive/unassigned users and mismatched
Clerk IDs are denied. Adapter failures never fall back to demo access.

`src/lib/auth/permissions.ts` supplies the app key, stable permission constants,
and `can` for future UI visibility. `actions.ts` provides an authorization wrapper
for future server operations. These modules do not implement a Core API protocol;
the handoff provides no endpoint, credentials, or response schema.

The root page is dynamic and checks permission on the server in Core mode.
Unauthenticated sessions redirect to the configured trusted sign-in URL; denied
users see access denied; connection failures show unavailable. Until the adapter
is installed Core mode always shows unavailable. Even after adapter installation,
authorized users see connection pending until the protected data workspace exists.

Local `next dev` defaults to the existing browser-state demo. Production defaults
to Core and rejects explicit demo mode. Demo data is sample data, is included in
client assets, and is not confidential or persistent. Never put real records in
`seed.ts`. The demo's client changes are not protected server mutations.

## Connection Work Remaining

1. Obtain the Core deployment URL, actual user/access API or shared server module,
   authentication mechanism, and response contract. Supply the dashboard's Clerk
   instance and supported domain/satellite configuration. Do not invent endpoints
   or treat a redirect/query-string user ID as a verified session.
2. Install/configure the matching Clerk server SDK and middleware. Implement the
   two adapter methods, validate the Core response, and use server-only secrets.
   Configure `BIO_TREE_CORE_SIGN_IN_URL` using the agreed dashboard return flow.
3. Add persistent repositories and server actions/routes. Protect every read and
   mutation with its mapped permission, validate inputs, and then perform work.
   Creating a Confirmed/Cancelled entry requires both create and approve/cancel;
   edits that change status must also check the destination status permission.
   Never trust the browser's selected permission or actor identity.
4. Record app-specific mutations in a persistent audit log within the data
   transaction, using the Core user ID and verified Clerk ID, action, entity ID,
   timestamp, and before/after values. Browser `changedBy` and Employee.role are
   not identity or access sources. Read reports separately under report permission.
5. Replace SchedulerDemo with the protected data workspace; pass only needed
   permission hints to controls and recheck access on every server request.
6. Register the tile/roles/keys and named user assignments in Core. Verify real
   sign-in, sign-out, direct URLs, inactive users, revocation, cross-app isolation,
   read-only users, tampered mutation requests, and Core outages end to end.

No real Core accounts, role assignments, or dashboard records were changed.

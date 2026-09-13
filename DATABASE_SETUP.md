# PostgreSQL persistence: local pilot

## What is connected

The localhost workspace now loads from PostgreSQL and saves changes automatically.
Directory configuration, products, work centres, machines, measurement settings,
plans, bookings, actuals, deviations and WIP are saved together. No sample records
are inserted after initialisation. The starter administrator is created only when
the workspace does not exist.

The first implementation uses a versioned JSONB aggregate in SchedulerWorkspace,
managed through Prisma. This preserves the current evolving data model and makes
multi-record production completion atomic. The older relational tables are still
scaffolding, not a second source of truth. Normalized per-entity APIs and verified
user authorization are required before shared deployment or larger scale use.

Schema version 1 is explicitly validated. Unsupported future versions fail closed
rather than resetting data. Each accepted save increments a revision and retains
the previous snapshot in SchedulerWorkspaceRevision in the same transaction.
Concurrent stale writes return HTTP 409; they never overwrite newer data. Retrying
a save after a dropped response is idempotent. There is no silent merge.

The UI shows Saved to PostgreSQL only after acknowledgement. Keep a tab open if
saving fails. Retry transient failures. For a conflict or server restart, download
the unsaved JSON before reloading and reconcile manually; there is no automatic
restore/import UI. Closing or refreshing while unsaved triggers a browser warning.

## Local setup

Requirements: Node.js 22+, PostgreSQL 16+, and pg_dump/psql/pg_restore on PATH.
Create an empty database and set DATABASE_URL in the ignored .env file. Do not
commit credentials. For localhost only, set SCHEDULER_AUTH_MODE=demo and
SCHEDULER_PERSISTENCE=local.

    npm ci
    npm run db:generate
    npm run db:migrate
    npm run dev -- --port 3001

The dev server binds to 127.0.0.1. Database UI access is allowed only with a
loopback Host in development mode. Writes additionally require a matching Origin
and a server-generated session token. Client-supplied persona selection is NOT
authentication. Production/Core mode cannot access this persistence endpoint.
Do not proxy this local development server onto a public or shared network.

## Backups and recovery

Before the first write of each UTC day, the local server creates a pg_dump custom
archive in .backups, or SCHEDULER_BACKUP_DIR. Failed backups block saves and are
reported in the UI. Dumps use temporary files and atomic rename; the directory
is private and new dump files use mode 0600. Previous revisions provide additional
same-database recovery history. Neither mechanism is a substitute for off-device
backups. Configure encrypted off-device copies/PITR with the hosting provider
before a live pilot. Files and revision history are retained, not auto-pruned.

Take an additional backup before every deployment/migration:

    npm run db:backup

For recovery, create a NEW empty database, set RESTORE_DATABASE_URL to it, then:

    npm run db:restore -- /absolute/path/to/backup.dump

The restore script refuses the active database and any non-empty destination.
Verify recovered records, then deliberately update DATABASE_URL and restart.
Never run prisma migrate reset or db push --accept-data-loss on pilot data.

## Deploying updates

1. Test changes against the separate test database.
2. Take a fresh backup and verify restore capability.
3. Review migration SQL; use additive/compatible migrations first.
4. Run prisma migrate deploy and prisma generate, then build/restart.
5. Check saved records and save status after restart. Reload existing clients
   after saving or exporting pending edits, because session tokens rotate.

GitHub pushes contain code and migration files only, not the database or backups.
Migrations are not automatically run by the app or during build.

## Verification performed

Used separate databases for pilot, integration tests and a restore check. Tested
configuration round trips with a second database client, atomic plan/booking/
actual/WIP persistence, revision conflicts, duplicate retries, invalid input,
schema-version rejection and local-only access controls. Browser-created test
unit survived reload. A dump was restored to a separate empty database and its
saved revision/unit verified. Existing tests continue to use fixtures, not pilot
records.

## Remaining live-pilot prerequisites

Connect a verified Clerk/Core session and server-side unit/process permissions;
replace the demo selector with the real current user; create authenticated,
scoped APIs; select managed PostgreSQL hosting with encrypted off-site backups
and monitoring; resolve dependency audit findings; test user concurrency and
recovery in staging. This local implementation is not yet a live multi-user
production system.

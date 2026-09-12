# Bio Tree Scheduler Architecture

The application is organized as a modular Next.js TypeScript app with a PostgreSQL-ready data model.

## Application Layers

- `src/app`: Next.js routes and global application shell.
- `src/components`: presentation components for planner, schedule, master data, reports, and shared UI.
- `src/lib/domain`: TypeScript domain types and status definitions.
- `src/lib/services`: scheduling, conflict detection, report calculations, and future optimization adapters.
- `src/lib/seed.ts`: realistic sample data for the first local MVP experience.
- `prisma/schema.prisma`: PostgreSQL target schema for the database-backed version.

## Business Logic Boundary

UI components can hold short-lived screen state, but conflict checks, reporting summaries, and status calculations live in services so they can later move behind API routes or server actions without changing the UI model.

## Data Strategy

The first implementation uses local seeded data in the browser so the planner workflow can be tested immediately. The Prisma schema establishes the target database structure and names. The next backend phase should add migrations, repositories, and server actions using the same domain language.

## Dashboard Identity Boundary

The scheduler uses the stable `scheduler` app key and is prepared for Bio Tree
Core-owned Clerk identity and action permissions. Server-only adapters and guards
live in `src/lib/auth`. The root route separates the local sample-data demo from
Core access; production fails closed until the connection is configured. See
`DASHBOARD_INTEGRATION.md` for permission keys, registration fields, and the
remaining protected persistence and audit work. Employee roles are operational
data, not authorization roles.

## Optimization Adapter

Optimization should be introduced only through an adapter that receives plan lines, schedule entries, work centres, machines, and constraints, then returns recommendations. It must not overwrite confirmed manual schedules without user approval.

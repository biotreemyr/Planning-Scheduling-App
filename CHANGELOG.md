# Changelog

What changed in each version of the Bio Tree Production Scheduler. Everyone can read this in the app under **What's new**.
How versions are numbered and released: see [VERSIONING.md](VERSIONING.md).

Write entries for the people who use the app: what they can now do, or what works differently. Newest version first.
Format, rules and an example: [VERSIONING.md, Writing a CHANGELOG entry](VERSIONING.md#writing-a-changelog-entry).

## [Unreleased]

### Security
- **Access** now follows exactly what is ticked in Bio Tree Core. Until now everyone who could open the scheduler could also edit, submit, review, cancel and approve the detailed schedule, and see Reports, whatever Core said. People keep only what Core grants them.
- **Audit trail** is shown only to people with "View audit trails" in Core, and its Download Excel only with "Print audit trails".

## [1.2.0] - 2026-10-15

### Added
- **Machines from Master Data**: the scheduler's machines are QA's Production Equipment from Master Data, shown everywhere as Equipment ID and name (for example "CFM/02 · Automatic Capsule Filling Machine"). In Admin → Machines, machines are chosen from that list and given a process; their ID, name and active status follow Master Data.
- **Several machines on one activity**: a planned activity can book more than one machine, so bottle filling books the counting, capping, sealing and labelling machines together. Each machine is checked for double-booking.

### Changed
- **Admin → Machines** no longer takes a typed machine name or code. New equipment is added in Master Data first, then chosen here.
- **Machine list**: the 10 sample machines are replaced by the 14 confirmed production machines. Bookings already made moved to the matching real machine.

## [1.1.1] - 2026-10-14

### Changed
- **New orders** no longer offer customers and products switched off for production in Master Data (for example an accounting-only customer). Existing orders keep theirs.

## [1.1.0] - 2026-10-14

### Changed
- **What's new** is laid out like the Audit trail: one table of changes with coloured types, a search box, and Type and Version filters.
- **What's new** and the **Audit trail** show changes in smaller type, scroll with the page, and split long lists into pages (25, 50 or 100 per page).

## [1.0.1] - 2026-10-14

### Fixed
- **Job order planning** and the **activity window** always fit on the screen and scroll inside, so the Save button can be reached without dragging the window up.

## [1.0.0] - 2026-10-14

First live version. Planning, orders and production records start from here; earlier test data has been cleared.

### Added
- **Sign-in through Bio Tree Core.** What each person can see and do follows their Bio Tree role.
- **Planner Board** with Calendar (month, week, day) and List views. Drag an activity to another day, or stretch it over several days. Choose which processes to show, and show production, non-production or both.
- **Production Planning** for a job order: plans its whole process route at once, with batch number and machine bookings. Warns when processes are out of order or a machine is double-booked.
- **Orders** for customer POs, with several products per PO, customers and products from Bio Tree Master Data, job orders per batch, and progress by process and batch. Print a summary or one order in detail.
- **R&D, Trial & Pilot** tab for non-production work: its own numbering (navy number box), optional customer ID, and its own product list.
- **Production updates**: record quantities, progress and completion for each activity, and hand work in progress (WIP) on to the next process.
- **QA/QC** testing and release of each batch.
- **Admin**: units and their process route order, processes, machines, products, R&D products, work centres and measurements.
- **Reports** and an **Audit trail** of who changed what and when.
- Print, PDF and Excel downloads of the plan. Dates are shown as DD/MM/YYYY.

# Changelog

What changed in each version of the Bio Tree Production Scheduler. Everyone can read this in the app under **What's new**.
How versions are numbered and released: see [VERSIONING.md](VERSIONING.md).

Write entries for the people who use the app: what they can now do, or what works differently. Newest version first.
Format, rules and an example: [VERSIONING.md, Writing a CHANGELOG entry](VERSIONING.md#writing-a-changelog-entry).

## [Unreleased]

### Added
- **Capsule fill check** shows a batch's average net fill (filled capsule less the empty shell) in bold red when it is further from the unit weight on the PO than QA's tolerance, in Progress, the activity route and the capsulation update. QA sets the tolerance under QA/QC → Yield limits; until then it is ±5%. Often it means a weight was keyed in wrongly.
- **Planning in the past** asks for a reason when a plan date is set before today, with quick picks such as "Keying in past production records". The reason is kept with the activity, shows when pointing at its planned cells, and appears in the audit trail.
- **Edit planning and Activity workspace** windows have a Maximise button (or double-click the title bar) to fill the screen, and Restore to go back.

### Changed
- **Completed activities** can now be moved to another plan date on the Planner Board and in Edit planning, so past production can be keyed in on the day it was planned. Their quantity, machine and results stay as recorded.
- **Edit planning** opens wider, with each heading on one line and long machine names on two lines at most.
- **Activity workspace** route table keeps its headings and the Plan and Process columns in view while scrolling, has wider columns, and shows its sideways scrollbar at the bottom of the window instead of the bottom of the table.

## [1.8.2] - 2026-10-19

### Changed
- **What each person's browser receives** now follows their Bio Tree rights. Without an Orders right, the page no longer gets the customer list, customer names, SO numbers, PO received dates, PO and job order remarks, or how a PO was closed; without a Testing or Release right it also no longer gets testing results and releases. Planning keeps PO numbers, products, quantities, wanted dates, job orders, batch numbers and every production result and yield. Saving from such a page leaves what it did not receive exactly as it was.
- **Plan job order**: several processes can now be planned on the same day. Changing a process's date only moves the later processes that would then come before it; processes already on the same day or later keep their dates. Before, every later process was moved again, one working day apart, each time a date changed.

## [1.8.1] - 2026-10-18

### Fixed
- **Signing in** works again: after v1.8.0, every signed-in page showed a server error. Nothing was saved or lost while it was down.

## [1.8.0] - 2026-10-17
Fixes from the 17/10/2026 security and workflow review.

### Added
- **Testing and Release lists** show each batch's final yield against QA's limits, say when no limits are set, and flag processes that came out outside them.
- **Job orders** show the kilograms planned for dispensing against the order's total weight, with the overage (or shortfall) as a %. More than 1% over is shown as a warning.
- **Late activities** show in red: an open activity whose planned day has passed is red in the order's Progress grid (marked "Late") and has a red edge in the Planner list, with a warning in the process-flow warnings.

### Changed
- **Production route** lets a batch be blended before or after Granulation (Granulation stays optional, Blending stays required, once per batch). The process-flow warnings, step yields and the activity window follow the planned days for those two. Other processes keep the order set in Admin.
- **Job orders** for a capsule, tablet or sachet PO offer only capsules, tablets or sachets as the batch quantity unit. Existing job orders keep the unit they have.
- **Production update** can start or complete a process only after the work in progress handed over to it from the process before is received. The handover shows in the activity window with an **Acknowledge receipt** button, so who took over the material is recorded. Handovers already received are unchanged; ones still waiting must be received before their next process starts.
- **Machine bookings** that are confirmed can be moved to another machine or time only by someone who can approve bookings. When anyone else moves the activity, its confirmed bookings move with it and go back to Draft, to be confirmed again. Deleting a booking that is past Draft needs the right to cancel bookings.

### Fixed
- **Machine conflicts** now include a draft, confirmed or in-progress booking that overlaps a completed one on the same machine (before, completed bookings were skipped, so such a double booking showed 0 conflicts).
- **Who did it** (added by, tested by, released by, batch number by and the like) is always the person signed in when the record is saved. Names already on records are unchanged.
- **Job orders** are now counted against the PO in the PO's own unit, whatever unit their batch quantity is in. For example, job orders kept in capsules for a PO in boxes count by their boxes, so "in job orders" and "still to release" are right and a job order that would take the PO over its quantity is refused. A PO already over shows how much over it is.
- **Reports** show the "Updated by" time, and Incoming WIP the "Sent by" time, as DD/MM/YYYY like everywhere else (it showed month first on some computers).
- **Testing, release and production results** can only be recorded by people with that right, also when they are saved together with another change, or come with a newly added job order or activity. Before, someone with only Orders edit or Planning rights could slip them in that way. Existing records are unchanged.

## [1.7.0] - 2026-10-16

### Added
- **Yield** now shows each process's yield as a % of theoretical (what it made against what the batch formula gives at that process, as in the batch record), with the step yield beside it to show where a loss happened. Shown in Progress, the activity route and the production update.
- **Capsulation update** has an optional empty shell weight (mg each) when filled capsules are weighed, with the ACG cellulose shell averages per size to pick from. The step yield is then worked out by powder (weighed less the shells), so overfill is not counted as a loss, and the average net fill shows against the unit weight on the PO. The last shell weight used for the product is offered again.

### Changed
- **Yield limits** set by QA now apply to the % of theoretical, not the step yield. A deviation note is needed when a process comes out outside them. No limits had been set yet.

## [1.6.0] - 2026-10-16

### Added
- **Step yield** at every process: what the process made against what the process before it handed over, converted to its own unit (kg to capsules or tablets by the unit weight, to blisters or bottles by the units per pack, to boxes by the units per box). It shows with one decimal in the order's Progress grid and in the activity window's production route; hover to see how it was worked out.
- **Final yield** for each batch: the last process's good output, back in capsules or tablets, against the batch quantity. A shared batch shows it for each PO.
- **Yield limits** under QA/QC: QA sets the acceptable range for each process and for the final yield. Results within range show green, near a limit amber, outside red.
- **Deviation note**: when a process's step yield comes out outside QA's limits, production adds a deviation note as they complete or correct it. The note is kept with the production result.
- **Planner warning** when a batch's yield can't be worked out because the unit weight, units per pack or units per box is missing, shown as soon as the batch is planned.

## [1.5.0] - 2026-10-16

### Added
- **Print summary** can also **Download Excel**: the same orders as a spreadsheet, with a title, what the list covers, filters on every column, and dates as DD/MM/YYYY.

### Changed
- **Print summary** window is laid out step by step: tick the orders to include (each with its count), pick the period (This month, Last month, Last 3 months, This year, All dates or your own dates), see how many orders and pages you will get, then Print or Download Excel.
- **Printed and Excel order lists** number their rows 1, 2, 3 instead of showing the order numbers, and say which orders and period they cover.

## [1.4.1] - 2026-10-16

### Changed
- **Order view tabs** are smaller rounded buttons in bold, the same size as the table's text; the selected tab is dark blue so it stands out. **Columns** and **Print summary** use the same text size.
- **Print summary** opens its choices in a pop-up window instead of above the list.

## [1.4.0] - 2026-10-16

### Added
- **Order views**: tabs above the Orders and the R&D, Trial & Pilot lists show All, Not scheduled, Scheduled, In production, Completed or Closed orders, each with its count. Hover over a tab to see what it shows. The page opens on All, then remembers each person's last tab on their computer.
- **Print summary options**: before printing, choose which kinds of orders and the PO received period to print. It shows how many orders and about how many pages you will get.

### Changed
- **Orders** and **R&D, Trial & Pilot** list the newest order first, 50 to a page. Click the # heading to switch to oldest first. Order numbers do not change.
- The **Status** column no longer has its own filter: the view tabs replace it.

## [1.3.0] - 2026-10-15

### Added
- **Shared batches**: one job order can be made for up to 5 POs of the same dosage form. Edit the job order and add the other POs, each with its share of the batch and its own packing (pack size and type, packs, boxes, packing job order number). Dispensing to coating are planned once; filling and packing are planned for each PO.
- **Short yield on a shared batch**: when compression or capsulation makes less than planned, the PO due first keeps its full share and the next PO takes what is left. Planning sees each PO's adjusted share and about how many packs it fills.
- **Same formula check**: when POs with different FG codes share a batch, QA confirms they are the same formula under QA/QC before the batch can be planned.
- **Release by batch or by PO**: QA releases a batch to all its POs at once or one PO at a time. For each PO, QA records the quantity to the PO and anything else the output went to (retention sample, stability study, customer sample...), with a note.
- **Ready to close**: once QA has released every batch for a PO, it appears under Ready to close in Orders (with a count on the Orders tab) for the planner to close. Closing above or below the ordered quantity asks for a reason, and the PO then shows, for example, "Closed · 2,006 of 2,000 (+6)".
- **Audit trail** records shared batches, QA's formula confirmation, each release and PO closing.

## [1.2.1] - 2026-10-15

### Fixed
- **R&D, Trial & Pilot orders** can be saved when their number matches a production order's number. Each kind counts from 1, but saving the first R&D order beside production order 1 was refused.

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

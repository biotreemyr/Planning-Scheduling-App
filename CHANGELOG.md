# Changelog

What changed in each version of the Bio Tree Production Scheduler. Everyone can read this in the app under **What's new**.
How versions are numbered and released: see [VERSIONING.md](VERSIONING.md).

Write entries for the people who use the app: what they can now do, or what works differently. Newest version first.
Format, rules and an example: [VERSIONING.md, Writing a CHANGELOG entry](VERSIONING.md#writing-a-changelog-entry).

## [Unreleased]

### Changed
- **Production Planning: a job order shared by several POs** now plans Filling and Packing once, for the whole batch, like the other processes. The row says which POs it is for ("for PWL005271, PWL005177 (whole batch)"), and its quantity is every PO's packs or boxes added up. QA's release then fills in each PO's quantity from what was packed, split by the job order's per-PO figures, earliest delivery first. Batches already planned per PO, and POs packed in different units (bottles and blisters), keep one row per PO.

### Added
- **Reports · Overview**: Reports now opens on an Overview of the unit's production for a month, quarter or year: key figures (activities planned and completed, late activities, overdue POs, open and released batches, stages outside QA's yield limits, machine use, overtime days) and charts of activities by week and by process, yield by process against QA's limits, machine use, POs due by status, open batches by status and working, off and overtime days. Late activities are listed under the charts, newest first. The existing reports are now under **Actuals & WIP** and **Schedule load** beneath Reports in the menu.

## [1.14.1] - 2026-10-22

### Fixed
- **Planner Board · List**: an activity that started last month and is still running now shows at the top of the month, marked "Started 23/09/2026", and runs down to its last day. Before, its card was missing and only blank space showed (JO-00010 Capsulation was missing from October). Dragging it moves it by the days it is dragged.

## [1.14.0] - 2026-10-22

### Added
- **Off days**: planning now skips each unit's weekly off days (Saturday and Sunday unless Admin ticks them in **Setup · Units · Working days**) and the company's public holidays from Circulo, which QA keeps there. The calendar and list grey off days and say why ("Off", "Closed", the holiday's name). A process over several days counts only its working days ("4 working days · 1 off, skipped"), and the next process starts on the next working day.
- **Planner Board · Off days**: planners, production managers and Admin can open an off day for overtime, or close a working day (a shutdown, say), with the reason. The Production Planning window also lists the off days in a plan, with **Work this day** to open one there. Each change, with who made it and why, goes into the audit trail. Existing plans stay as they are.

## [1.13.0] - 2026-10-21

### Added
- **Production Planning: "More than 1 day"** under each process's date. Tick it for a process that runs over several days and an end date appears; untick it and the process takes one day again. The machine is booked until the end date, and the next process moves to the working day after it if it would otherwise start earlier. Edit job order planning shows the tick and end date too.

## [1.12.0] - 2026-10-21

### Changed
- **Job orders may add up to more than the PO**, to allow for process waste, QC and retain samples, stability samples and the like. Saving asks for the reason first (type it, or pick one) and shows how much more is planned (e.g. "PWL005178: job orders 2,776 boxes, 276 (11.0%) more than the 2,500 ordered"). The reason, with who gave it and when, is kept on the PO, shows beside the job orders and goes into the audit trail. Planning more again later needs a new reason.

## [1.11.0] - 2026-10-21

### Changed
- **Production update · Correct** now lets production correct a completed process's dates and actual quantity even after the next process has received the output. The handover then carries the corrected quantity. Where the output went and its unit still stay as they were.
- **Correcting completed production needs a reason**: changing a completed process's start or completed date, its actual quantity, or its planned date (in Edit job order planning, or by dragging it on the plan) asks for the reason first. The reason, with who corrected it and when, shows on the activity and in the audit trail.

## [1.10.1] - 2026-10-19

### Fixed
- **Orders · Progress and Job orders** now also scroll sideways inside their own box. They stretched to the width of the whole orders list instead, so only the list scrolled.

## [1.10.0] - 2026-10-19

### Changed
- **Setup** replaces the Admin tab and holds only what the scheduler itself needs: Units, Processes, Machines and UOMs. Products and machines' names come from Master Data, and people's access from Bio Tree Core.
- **Reports** shows machine bookings and scheduled hours by process (Dispensing, Blending…) in place of the old work centre rooms.
- **Orders · Progress and Job orders** scroll left to right and up and down inside their own box, with the headings and the first column (process, job order) kept in view.

### Removed
- **Admin → Products** (finished goods, R&D products, work centres): products come from Master Data, and R&D products are added from the R&D order form. Existing products and orders are unchanged.
- **Admin → Measurements → Activity types**: activities are named after their process. The UOM list moves to Setup.

### Fixed
- **Orders · Progress** yield, step and fill notes (such as "Fill 719 mg · target 720 (−0.1%)") now wrap inside their cell instead of running into the next batch's.

## [1.9.0] - 2026-10-19

### Added
- **Capsule fill check** shows a batch's average net fill (filled capsule less the empty shell) in bold red when it is further from the unit weight on the PO than QA's tolerance, in Progress, the activity route and the capsulation update. QA sets the tolerance under QA/QC → Yield limits; until then it is ±5%. Often it means a weight was keyed in wrongly.
- **Planning in the past** asks for a reason when a plan date is set before today, with quick picks such as "Keying in past production records". The reason is kept with the activity, shows when pointing at its planned cells, and appears in the audit trail.
- **Production can change plan dates** on the Planner Board (drag an activity or its last day), always giving a reason, with quick picks such as "Machine breakdown" or "Material not ready". Quantities, adding or removing processes and Edit planning stay with planners. The reason shows to the planner on the activity and in the audit trail.
- **Edit planning and Activity workspace** windows have a Maximise button (or double-click the title bar) to fill the screen, and Restore to go back.

### Changed
- **QA/QC Testing and Release lists** now work like the Orders list: rows are numbered 1, 2, 3 down the list, the newest batch is on top, every heading sorts (each person's choice is remembered), searches and filters sit under the headings, long lists page at 50 or 100, and a Remarks column comes last. Columns are wider so each cell takes one line, two at most, and the table scrolls inside its box. The next step for a batch (Pass, Failed, Under investigation; Release or Reject) is chosen from a drop-down at the end of its row. Print opens a window to choose the batches by status and date, then print them or download them in Excel, numbered 1, 2, 3.
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

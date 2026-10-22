# Planner Board: Calendar and List views, tally and function audit (22/10/2026)

App: BTP Planning & Scheduling (scheduler.biotreegroup.com.my), v1.14.0 (live since 22/10/2026 00:06).

Question: do the Calendar view and the List view show the same activities, and do they behave the
same way?

How it was checked: nothing was keyed into live. The code of both views was read side by side
(`PlanningCalendar.tsx`, `PlanningList.tsx` and the print, PDF and Excel builders). For the tally,
live was copied (revision 378) into a private scratch database, the Planner Board was opened on that
copy with all processes and both order types ticked, and each view's activities were counted month by
month against the database. The copy was deleted afterwards.

Status column: open until fixed; record the PR when done.

## Tally (live copy, revision 378, 46 activities)

"In the database" counts every activity on at least one day of the month. The Calendar's month grid
also shows the last days of the month before and the first days of the month after, so its count runs
higher and is not compared directly. Its "+N more" links hide some boxes on busy days; those
activities are still there, one click away.

| Month | In the database (start in month + carried in) | List view cards | Match? |
|---|---|---|---|
| September 2026 | 12 (12 + 0) | 12 | Yes |
| October 2026 | 33 (32 + 1) | 32 | **No: 1 missing** |
| November 2026 | 2 (2 + 0) | 2 | Yes |

The missing activity is **Capsulation, JO-00010 (BioActiv Methylcobalamin 9bp x 10's, batch
B2609003), 23/09/2026 to 05/10/2026, still open.** The Calendar shows it across 28/09 to 05/10. In the
October List view its Capsulation cells for 01/10 to 05/10 are blank: the space is held, but there is
no card. See L1.

## Findings

| # | Severity | Finding | Evidence | Fix | Status |
|---|---|---|---|---|---|
| L1 | High | The List view drops an activity that started in an earlier month. A card is drawn only in the row of its start date, and the List shows one month, so an activity carried in from the month before has no card. Its later days show as empty space. On live, JO-00010 Capsulation (open, 23/09 to 05/10) cannot be seen or opened from the October List. | `PlanningList.tsx`: cards come from `line.plannedDate === day`; the carried-in days get only blank `plan-span-slot`s. Tally above. | Draw the card on the month's first day for an activity that started before it, marked "from 23/09". | Open |
| L2 | Medium | Prints, PDFs and Excel place a multi-day activity on its start day only, with no end date. JO-00011 Filling (02/11 to 04/11) prints on 02/11 only. JO-00010 Capsulation doesn't appear in the October print at all. The screen views show the whole span. | `CalendarPrint.tsx`, `calendarPdf.ts`, `calendarExcel.ts`, `calendarPrint.ts`: all filter `line.plannedDate === day` or `dates.includes(line.plannedDate)`; none read `endDate`. | Print "21/10 to 26/10" on the activity and repeat it (or "continued") on its later days; add an End date column to the Excel schedule sheet. | Open |
| L3 | Medium | Prints, PDFs and Excel shade Saturday and Sunday as fixed weekends. They ignore v1.14.0's working days: public holidays, closed days and Saturdays opened for overtime print like normal days, and the "Off", holiday and "Overtime" labels are missing. The screen views follow the unit's working days. | `CalendarPrint.tsx` (`index > 4`, `[0, 6].includes(getDay())`), `calendarPdf.ts` line 111, `calendarExcel.ts` line 87. | Pass the unit's working calendar to the print builders and use `dayStatus` for shading and labels, as the screen does. | Open |
| L4 | Medium | Overdue work shows in the List, not the Calendar. The List gives an open activity whose last day has passed a red left edge; the Calendar has no such cue. JO-00010 Capsulation has been overdue since 05/10, and the Calendar shows it like any other box. Because of L1, the October List doesn't show it either. | `PlanningList.tsx` adds class `late` when `lineEnd(line) < today` and not completed; `PlanningCalendar.tsx` has no equivalent. | Give overdue boxes the same red edge on the Calendar, and explain it in the legend (the legend has no "Late" entry today). | Open |
| L5 | Low | Week view: Saturday and Sunday headers are marked off, but the "Off" text is squeezed to nothing and the day columns aren't greyed. Month view and the List show both. | Seen on the copy: the `.day-label` in the week header measures 0 px wide; the grey cell style only covers the month grid (`toastui-calendar-daygrid-cell`). | Let the week header label wrap or sit below the date, and grey the week and day columns of off days. | Open |
| L6 | Low | An activity left on an off day is not flagged. JO-00007 Packing is planned on Saturday 24/10 (planned before v1.14.0) and is still open. Both views show it on a greyed day with no warning. New plans and moves can't land there, but existing ones stay silently. | Live copy: one open activity on a Saturday. | Add a process-flow warning, "Planned on an off day", or list such activities in the Off days window, so the planner opens the day or moves the work. | Open |
| L7 | Low | The List's "+" button in a process column says "Add Capsulation activity on …", but it opens Production Planning for the date only. The process clicked isn't used. The Calendar's day click opens the same window, which is right, since planning goes job order by job order. | `PlanningList.tsx` calls `onCreate(day, calendar.id)`; `PlanningCalendar.tsx` `openCreate(value)` ignores the second argument. | Word the button "Plan on 22/10/2026", or pass the process so the window ticks it first. | Open |
| L8 | Low | The List only moves an activity within the month shown (keyboard and drag). Moving it into another month means using the Calendar, or "Edit job order planning". | `PlanningList.tsx` `finish()` requires `dates.includes(target.date)`. | Acceptable; mention it in the List's move help text. | Open |

## Where the two views agree

Checked in code and on the copy; no action needed.

- **What is shown.** Both views take the same activities: same unit, same ticked processes, same Production and Non-production ticks, and the same search, priority and status filters. Prints in both use the full, unfiltered list for the period.
- **What a box says.** Order number badge and tab colour, R&D/trial/pilot badge, High and Urgent marks, process-flow ⚠, completed ✓, product, batch number, job order number and this process's quantity (the actual once completed). The Calendar adds the process name; in the List the column gives it.
- **Off days (v1.14.0).** Both grey and label weekly off days, public holidays, closed days and overtime days from the same working calendar.
- **Moving.** Both go through the same `moveActivity` path with the same rules:
  - Only people who may plan (or production with a reason) can move.
  - A completed process asks for a correction reason.
  - Open work can't be dropped on an off day.
  - A multi-day activity keeps its length.
  - An activity can't change process: the Calendar has no process columns, and the List refuses other columns.
- **Stretching.** Both set the last day through the same `resizeActivity`: the Calendar by the box's right edge, the List by the card's bottom edge.
- **Opening.** Clicking a box or card opens the same activity panel. Clicking a day, or "+", opens the same Production Planning window.
- **Busy days.** The Calendar folds extra boxes into "+N more"; the List shows every card. Nothing is lost either way.

## Suggested order

L1 first: it hides real, open work from the List today. Then L2 and L3 together, since both sit in
the print builders, then L4. L5 to L8 are small.

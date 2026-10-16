# Bio Tree UI/UX Handoff

Date: 2026-09-12 · Updated 2026-10-16 with the list, view tab, pop-up window and print/export patterns proven in the Production Scheduler (see [Workstation Patterns](#workstation-patterns)).

## Purpose

Use this handoff when another Bio Tree app, module, portal, or prototype needs to follow the same visual feel and interaction standard as the current Bio Tree OS work.

The Bio Tree product experience has two related layers:

1. **Brand Experience Layer**: public-facing, editorial, warm science, premium B2B wellness.
2. **Operations Workstation Layer**: internal manufacturing OS, SOP-driven, dense, practical, traceability-focused.

Both layers should feel like Bio Tree, but they should not look identical. The brand layer earns trust and interest. The operations layer helps staff complete controlled work safely and quickly.

## Core Feeling

Bio Tree should feel:

- science-led
- warm
- precise
- calm
- premium but not flashy
- human, not cold
- operationally serious
- documentation-aware
- compliance-ready without overclaiming

Avoid:

- generic admin dashboards
- cute wellness branding
- overused leaf, capsule, molecule, test tube, microscope, and factory imagery
- loud gradients and decorative effects
- exaggerated compliance or certification claims
- landing pages that feel unrelated to the real operational product

## Brand Experience Layer

Use this layer for:

- public website
- client-facing product innovation pages
- brand story pages
- commercial presentation microsites
- product development landing pages

### Brand Position

Bio Tree Biotechnology is a science-led functional wellness innovation and manufacturing partner helping wellness brands turn better ideas into better products.

### Brand Story

Use this transformation language as a recurring narrative:

```text
Seed -> Sprout -> Fermentation -> Product -> Consumer
```

This story explains Bio Tree's role: turning a promising wellness idea into a credible, manufacturable, documented product that consumers can trust.

### Brand Visual Direction

| Element | Direction |
| --- | --- |
| Mood | Warm science, premium calm, human innovation |
| Layout | Editorial sections, generous rhythm, confident whitespace |
| Shapes | Soft arcs, organic paths, subtle transformation motifs |
| Cards | Rounded, soft, spacious; avoid rigid report-like grids |
| Imagery | Product creators, collaboration, sampling, retail readiness, daily routines |
| Illustration | Abstract product-and-human outcome scenes if real imagery is unavailable |
| Motion | Slow, meaningful transitions that suggest transformation |

### Brand Colors

Use these as the starting palette:

| Token | Use | Value |
| --- | --- | --- |
| `paper` | Page background | `#f8f4ea` |
| `paper-soft` | Soft surfaces | `#fffaf0` |
| `cream` | Warm section background | `#efe7d8` |
| `sage` | Wellness support color | `#dbe9d3` |
| `sage-soft` | Light wellness tint | `#eef5e9` |
| `forest` | Primary brand color | `#123f32` |
| `forest-soft` | Secondary green | `#28634f` |
| `navy` | Trust/contrast moments | `#071927` |
| `navy-soft` | Secondary dark surface | `#102d3b` |
| `gold` | Accent, warmth, section labels | `#b99552` |
| `gold-soft` | Light accent surface | `#ead8aa` |
| `ink` | Primary text | `#14241f` |
| `muted` | Secondary text | `#5c6d63` |

Use forest, paper, sage, navy, and gold together. Do not let the product become a one-color green app.

### Brand Typography

- Use a clean modern sans-serif as the default.
- Current implementation uses `Inter`.
- Use generous line-height for body copy.
- Do not use negative letter spacing.
- Use display-scale typography only for true hero or editorial moments.
- Keep operational headings smaller and tighter than brand-page headings.

### Brand Copy Tone

Write like a senior product development partner:

- clear
- calm
- specific
- collaborative
- commercially aware
- scientifically serious without being stiff

Prefer:

- "Let's explore your product idea"
- "Shape a credible wellness product"
- "From idea to launch-ready product"
- "Science, format, quality, and manufacturing in one path"

Avoid:

- "Submit inquiry"
- "Contact sales"
- "Revolutionary"
- "Guaranteed compliant"
- unsupported certification, scale, or performance claims

## Operations Workstation Layer

Use this layer for:

- Bio Tree OS
- inventory
- receiving
- stock movement
- purchasing
- planning
- QA/QC
- production
- document control
- audit and approval workflows

### Product Feel

The operations app is a manufacturing operating system, not a marketing site.

It should feel:

- mobile-first for shopfloor work
- compact and fast
- dense but readable
- status-heavy
- document-aware
- audit-ready
- designed for repeated daily use

### Workstation Layout

Desktop/tablet workstation pages should use:

```text
Left module sidebar
Top global search / tools / user context
Workspace header with breadcrumb, title, status, and actions
Filters directly above table or workflow content
Main SOP work area
Focused detail window, drawer, split view, or detail page
```

Mobile shopfloor pages should use:

```text
Top header
Search or scan action
Compact KPI/status cards
Task cards or detail rows
Bottom tab navigation where appropriate
Fixed bottom action area for the primary workflow step
```

### Operations Colors

The operations layer may use the brand palette, but with more restraint:

| Use | Direction |
| --- | --- |
| Page background | Cool light gray or warm off-white |
| Primary actions | Bio Tree teal/forest |
| Success/released | Soft green with clear text |
| Quarantine/hold | Soft amber |
| Rejected/expired | Soft red |
| Draft/review | Soft blue or violet |
| Borders | Light neutral dividers |
| Text | High-contrast dark ink |

Status colors must never be the only indicator. Pair color with text and, where useful, an icon or dot.

### Standard Operations Components

Reuse or recreate these components across apps:

- `WorkstationSidebar`
- `WorkstationTopBar`
- `RecordWorkspaceHeader`
- `OperationalFilterBar`
- `OperationalDataTable`
- `StatusChip`
- `KpiStrip`
- `DetailFieldRows`
- `RecordList`
- `ModuleCardGrid`
- `BottomTabBar`
- `SectionPanel`
- `ApprovalPanel`
- `AuditTrailTimeline`
- `AttachmentCard`
- `CertificateCard`

If another app is not using the same codebase, copy the behavior and proportions rather than copying implementation details blindly.

## Table Standard

Use this standard for Inventory Bank, Receiving, Purchasing, Planning, QA/QC queues, Customer Projects, and any operational list.

### Required Behavior

| Behavior | Standard |
| --- | --- |
| Search | Search across real user lookup fields such as code, item, GRN, PO, batch, supplier, certificate |
| Filters | Use dropdown filters, not click-to-cycle chips |
| Sorting | Table headers should be clickable where sorting is meaningful |
| Dates | Display operational dates as `DD/MM/YYYY` (with a time: `DD/MM/YYYY HH:MM`), in numbers, everywhere: screens, prints, PDFs and Excel |
| Row detail | Open details in a focused window, drawer, split view, or page |
| Actions | Use explicit buttons such as Upload COA, View COA, Print, Reprint, Export, Preview, Sign & submit |
| Restricted fields | Hide restricted fields from UI, API, export, print, PDF, and download |

### Column Discipline

Main tables should show decision-making fields only. Move secondary details into the detail view.

Inventory Bank example:

- Show: Code, Item, Type, Form, On-hand, Batches, Halal, Status, Updated.
- Move to detail: full specs, supplier certificates, documents, approvals, audit history.

Receiving example:

- Show: GRN, PO, Item Code, Description, Supplier, Quantity, UOM, Batch/Lot, Expiry, COA, QC, Status, Label.
- Move to detail: received by, production batch, long remarks, next action notes.

## Forms And Workflow Screens

Forms should feel controlled and operational, not like generic web forms.

Use:

- visible labels
- grouped sections
- one primary action
- Save draft where the workflow is long
- Preview before critical submit
- clear disabled states
- inline validation near the relevant field
- audit banner before critical actions

Critical submit actions should show:

- requesting user
- role
- timestamp
- action consequence
- record status impact
- whether an e-signature or approval is required

## Compliance-Readiness Rules

Do not say the app is 21 CFR Part 11 compliant just because the screen exists.

Use:

- compliance-ready
- audit-trailed
- e-signature-ready
- controlled workflow
- validation required before production compliance claim

Critical records must support:

- unique user identity
- RBAC
- audit trail
- before/after values where applicable
- reason for change
- approval workflow
- electronic signature records where applicable
- record locking after approval
- correction/version workflow instead of silent editing

Never silently delete approved or critical operational records. Use void, cancel, obsolete, supersede, or correct with audit history.

## Security And Permission UX

Restricted data includes:

- formula details
- approved formula changes
- raw material cost
- supplier pricing
- internal extract cost
- product costing
- margin
- customer pricing
- GL/accounting mapping
- audit logs

Commercial users may track customer projects and quotation status, but must not automatically see restricted formulation, costing, margin, or supplier pricing.

If a role cannot see a field in the UI, the same field must be excluded from:

- API response
- table export
- PDF export
- print view
- downloaded report
- notification payload where applicable

## Workstation Patterns

Patterns built and confirmed with users in the Production Scheduler (versions 1.4 to 1.5, October 2026). Use them in every operations app so lists, choices and printouts work the same everywhere. Where this section is more specific than the rules above, follow this section.

### Type Scale

One scale across a screen. Mixing sizes inside one control or window is what makes it look disorganised.

| Use | Size | Weight |
| --- | --- | --- |
| Page title | 22–26px | 700 |
| Pop-up window title | 18px | 700 |
| Section heading inside a window or panel | 13px | 700 |
| Table text, tabs, toolbar buttons, chips, form inputs | **13px** | 400 (tabs and chips 600–700) |
| Hints, field labels, captions | 12px | 400–600, muted colour |
| Count badges | 11–12px | 700 |

Toolbar buttons (Columns, Print summary, Clear filters) use the table's text size, not a larger button size.

### Colour Tokens (operations layer)

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#1f2528` | Text |
| `--muted` | `#667078` | Hints, labels, secondary text |
| `--line` | `#d8dedb` | Borders, dividers |
| `--bg` | `#f6f7f4` | Page background |
| `--panel` / `--panel-soft` | `#ffffff` / `#f0f4f7` | Cards, windows / soft fills, summary cards |
| `--blue` / `--blue-soft` | `#28679e` / `#e7f0f8` | **Selected** tab or chip (solid blue, white text) / hover |
| `--green` / `--green-soft` | `#24785f` / `#e4f3ed` | Primary action, done, released |
| `--amber` / `--amber-soft` | `#9b6517` / `#fff1d7` | Waiting, warnings, "needs attention" |
| `--red` / `--red-soft` | `#b13a32` / `#fbe5e2` | Failed, rejected, destructive |

The selected state must be clearly darker than the rest (solid `--blue` with white text), never just a lighter tint.

### Lists

- **Newest first.** Operational lists open with the most recent record at the top, so nobody scrolls to the bottom as the list grows. Record numbers never change; only the order does.
- **The sort arrow shows the current direction** (↓ newest first, ↑ oldest first). One click flips it; a hover tip says so ("Newest first, click for oldest first").
- **Paging:** 50 rows per page by default, 100 as an option. Below the table: "Showing 1–50 of 132", Rows per page, Previous / Page x of y / Next. The pager is hidden while everything fits on one page. Changing a filter or tab goes back to page 1.
- **The page scrolls, not the table.** No fixed-height scroll box around a long list; only wide tables scroll sideways.
- **Downloads and prints take every matching row**, not just the page on screen.

### View Tabs

Above a list, tabs split it by stage, e.g. **All · Not scheduled · Scheduled · In production · Completed · Closed**.

- Rounded pill buttons at the table's text size, **bold**, 6px apart, each with a count badge.
- Selected tab: solid `--blue`, white text. Hover: `--blue-soft`. Smooth 150ms colour transition.
- **Every tab describes itself on hover** (e.g. "Orders with production under way").
- Counts follow the other filters (month, searches), so the count always matches what the tab shows.
- Opens on **All**; after that each person's **last tab is remembered** (per list, per computer, in browser storage).
- Tabs replace a status dropdown filter: do not offer both.
- Compact on desktop (about 30px high); on touch screens give tabs and chips the 44px minimum target from [Interaction Rules](#interaction-rules).

### Pop-up Windows for Choices

Use a pop-up window (modal dialog), not a panel that pushes the page down, whenever an action needs choices first (print, export, release, confirm). Lay it out as one top-to-bottom flow:

1. **Header:** the action as the title ("Print summary"), one line saying what the window does, and a ✕ close button.
2. **Steps**, each a section with a 13px bold heading and a divider below:
   - Multiple choices as **toggle chips** (pills with a ✓ and a count), plus **Select all / Clear all**.
   - Common values as **quick picks** (This month, Last month, Last 3 months, This year, All dates, Custom). Show the extra fields (From/To dates) **only for Custom**; otherwise show the range the pick means in a muted line.
3. **Summary card:** what will happen, in numbers, before the person commits: "**23** orders · about 2 printed pages", or "No orders match these choices".
4. **Footer:** **Cancel** on the left; the secondary action (Download Excel) and the **primary action** (Print) on the right, primary last. Disable the actions while there is nothing to act on.

Cancel, ✕ and Esc all close the window and leave the page as it was. Close the window before printing starts.

### Printing and Exporting

- **Choose before printing.** A print or export never dumps everything by default: the person picks which records and which period, and sees the count first. A list that grows for years must not print hundreds of pages by accident.
- **Number rows 1, 2, 3** in the printed or exported order. Record numbers are shown only as their own column, if at all.
- **Say what it covers:** the header of every printout and the second line of every Excel file states the selection and period ("Scheduled, In production · PO received 01/10/2026 – 31/10/2026 · 23 orders · printed 16/10/2026 20:30").
- **Excel layout:** row 1 the title (bold, 14pt); row 2 what it covers and when it was downloaded; row 4 the column headings (bold, frozen, with filters on every column). Numbers stay numbers (with `#,##0` formats) and dates stay dates (`dd/mm/yyyy`) so people can sort and add up. Page setup: landscape, fit to one page wide, headings repeated on every printed page. File name: what it is plus the date, e.g. `customer-orders-2026-10-16.xlsx`.
- **Excel and print show the same columns and wording as the screen**, including statuses like "Closed · 2,006 of 2,000 (+6)".

### Labels People Recognise

- Show records by the identifier staff use plus the name: equipment as **"CFM/02 · Automatic Capsule Filling Machine"**, customers as "305-P0001 · POWERLIFE (M) SDN. BHD.".
- Name tabs, buttons and fields by what people do or see, not by how the system stores it ("Ready to close", "Release to PWL005273", "Other use (sample, stability…)").
- When something differs from what was expected, say it plainly with the number: "−388 bottles against the order", "231 bottles not accounted for", and ask for a reason only when it matters.

## Interaction Rules

- Minimum interactive target: `44px` by `44px`.
- Buttons must have visible hover, focus, pressed, disabled, and loading states.
- Icon-only buttons need accessible labels and tooltips where meaning is not obvious.
- Use one consistent icon family, preferably Lucide when available.
- Avoid emoji as structural icons.
- Provide keyboard focus states.
- Preserve filter/search state when opening and closing details.
- Back behavior must be predictable.
- Modals/drawers must have a clear close action.
- Do not rely on hover-only interactions.

## Responsive Rules

- Start mobile-first for shopfloor workflows.
- Expand to desktop workstation layouts for admin/review workflows.
- Avoid horizontal scrolling on mobile except for intentionally scrollable data tables with a clear fallback.
- Keep fixed headers and bottom action bars from covering content.
- Use stable sizes for tables, buttons, cards, and counters so dynamic content does not shift the layout.
- Test common breakpoints: `375px`, `768px`, `1024px`, `1440px`.

## Accessibility Rules

- Body text should be at least `16px` for normal reading contexts.
- Maintain at least `4.5:1` contrast for normal text.
- Do not use color alone to communicate status.
- Keep heading hierarchy logical.
- Form fields need labels.
- Errors should explain the cause and how to fix it.
- Respect reduced-motion preferences.
- Support keyboard navigation for tables, buttons, tabs, filters, and dialogs.

## Motion Rules

Motion should support meaning, not decoration.

Use:

- `150ms` to `300ms` for micro-interactions
- transform and opacity for animation
- subtle entrance or state transitions
- reduced-motion fallbacks

Avoid:

- slow decorative animation
- animated layout width/height that causes jank
- motion that blocks input
- motion that hides important operational state

## Documentation And Review Gates

Every new Bio Tree app or module should provide:

- workflow purpose
- target user roles
- source SOP or approved plan
- UI screenshots
- permission review
- restricted-field review
- browser QA notes
- UAT/beta-test notes
- verification command results

Reference files:

- `docs/design/v2-ui-standards.md`
- `docs/reference/ui/workstation-shell.md`
- `docs/reference/ui/table-patterns.md`
- `docs/design/ui-review-checklist.md`
- `docs/codex/PERMISSION_MATRIX.csv`
- `docs/codex/WORKFLOW_STATE_MACHINE.md`

## Quick Checklist For Other Apps

Before another app says it follows Bio Tree UI/UX, confirm:

- It uses the warm science brand palette or the operations workstation palette intentionally.
- It does not look like a generic admin dashboard.
- It uses controlled status chips consistently.
- Its tables have dropdown filters and sortable headers.
- Its detail screens preserve context and do not dump unrelated bottom content.
- It protects restricted fields across UI, API, exports, PDFs, print, and downloads.
- It uses compliance-readiness language accurately.
- It has visible audit and approval expectations for critical records.
- It works on mobile and desktop.
- It passes visual review and beta/UAT review for the workflow.

## Copy/Paste Prompt For Other Apps

```text
Use the Bio Tree UI/UX handoff as the source of truth.

The app should feel like Bio Tree: warm science, calm precision, premium but practical, and operationally serious.

For public or client-facing surfaces, use the Brand Experience Layer: editorial layout, forest/sage/ivory/navy/gold palette, transformation story of Seed -> Sprout -> Fermentation -> Product -> Consumer, clear B2B wellness copy, and no unsupported compliance or certification claims.

For internal workflow surfaces, use the Operations Workstation Layer: SOP-driven screens, compact workstation shell, module sidebar, top search, dropdown filters, sortable tables, status chips, focused detail windows, audit-ready critical actions, and mobile-first shopfloor equivalents.

Do not create generic dashboards. Do not expose restricted fields. Do not claim 21 CFR Part 11 compliance; use compliance-ready/e-signature-ready language unless validation and controlled operation are complete.
```

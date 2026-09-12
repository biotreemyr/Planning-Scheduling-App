# Bio Tree Production Scheduling MVP Project Constitution

This scheduler is a standalone MVP for Bio Tree that must remain ready for future Bio Tree OS integration. It should validate the real production planning workflow before expanding into optimization or full ERP behavior.

## Technical Direction

- Use Next.js and TypeScript.
- Use PostgreSQL as the target database.
- Use one consistent database layer across scheduler modules.
- Keep business logic in services, not in UI components.
- Keep routes thin and reusable components focused on presentation.
- Use environment variables for configuration.
- Use UUIDs for major business records.
- Do not hard-code production data.
- Keep future Bio Tree OS integration in mind through stable IDs and external reference fields.

## Shared Business Language

Use direct manufacturing terms: Customer, Product, Production Order, Production Plan, Plan Line, Schedule Entry, Machine, Work Centre, Employee, Batch, Material, Purchase Order, and Sales Order.

Avoid inventing alternate names for the same business concept.

## Modularity Rule

Planning, detailed scheduling, master data, reports, and future optimization must have clear boundaries. A change inside one area should not require unrelated changes elsewhere.

## UI Direction

The app is an operational tool. It should open directly into useful scheduling work, with dense but readable tables, calendars, filters, tabs, segmented controls, and restrained status colors. It should not use a marketing landing page.

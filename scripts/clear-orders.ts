// One-off: start trial input afresh. Removes every PO, job order, activity, machine booking,
// production result and WIP handover; Admin set-up, products and customers stay.
// Dry run by default; pass --apply to save. Take a backup first (npm run db:backup).
//   npx vite-node --config vitest.config.ts scripts/clear-orders.ts [--apply]
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { workspaceRepository } from "@/lib/persistence/repository";
import { parseWorkspace } from "@/lib/domain/workspace";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
const repository = workspaceRepository(db);
try {
  const { revision, snapshot } = await repository.load();
  const { data } = snapshot;
  const removed = { orders: data.orders.length, jobOrders: data.jobOrders.length, lines: data.lines.length, entries: data.entries.length, actuals: data.actuals.length, transfers: data.transfers.length };
  const next = parseWorkspace({ ...snapshot, data: { ...data, orders: [], jobOrders: [], lines: [], entries: [], actuals: [], transfers: [] } });
  console.log(`Revision ${revision}. Removing`, removed, "keeping", { customers: data.customers.length, products: snapshot.products.length, machines: snapshot.machines.length, units: snapshot.directory.units.map((unit) => unit.name) });
  if (!apply) { console.log("Dry run: nothing saved. Re-run with --apply."); process.exit(0); }
  const saved = await repository.save(next, revision, `clear-orders-${randomUUID()}`, {
    actor: { name: "Data migration" },
    review: () => ({ denied: [], summary: [`Cleared trial and sample orders for a fresh start: ${removed.orders} POs, ${removed.jobOrders} job orders, ${removed.lines} activities, ${removed.entries} machine bookings, ${removed.actuals} production results, ${removed.transfers} WIP handovers`] })
  });
  console.log(`Saved as revision ${saved}.`);
} finally {
  await db.$disconnect();
}

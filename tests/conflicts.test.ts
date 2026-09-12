import { describe, expect, it } from "vitest";
import { findMachineConflicts } from "@/lib/services/conflicts";
import type { Machine, Product, ScheduleEntry } from "@/lib/domain/types";

const machines: Machine[] = [
  { id: "machine-1", code: "M1", name: "Machine 1", workCentreId: "wc-1", active: "Active" }
];

const products: Product[] = [
  {
    id: "product-1",
    sku: "P1",
    name: "Product 1",
    uom: "kg",
    productType: "Finished Good",
    active: "Active"
  }
];

describe("findMachineConflicts", () => {
  it("reserves setup time before each booking without conflicting at an exact boundary", () => {
    const first: ScheduleEntry = { id: "a", productId: "product-1", workCentreId: "wc-1", machineId: "machine-1", startAt: "2026-09-15T08:00", endAt: "2026-09-15T10:00", status: "Confirmed" };
    const second: ScheduleEntry = { ...first, id: "b", startAt: "2026-09-15T10:15", endAt: "2026-09-15T12:00" };
    expect(findMachineConflicts([first, second], [{ ...machines[0], setupMinutes: 30 }], products)).toHaveLength(1);
    expect(findMachineConflicts([first, second], [{ ...machines[0], setupMinutes: 15 }], products)).toHaveLength(0);
  });
  it("flags overlapping confirmed entries on the same machine", () => {
    const entries: ScheduleEntry[] = [
      {
        id: "entry-1",
        productId: "product-1",
        workCentreId: "wc-1",
        machineId: "machine-1",
        startAt: "2026-09-15T08:00",
        endAt: "2026-09-15T10:00",
        status: "Confirmed"
      },
      {
        id: "entry-2",
        productId: "product-1",
        workCentreId: "wc-1",
        machineId: "machine-1",
        startAt: "2026-09-15T09:30",
        endAt: "2026-09-15T11:00",
        status: "Confirmed"
      }
    ];

    expect(findMachineConflicts(entries, machines, products)).toHaveLength(1);
  });

  it("ignores cancelled entries", () => {
    const entries: ScheduleEntry[] = [
      {
        id: "entry-1",
        productId: "product-1",
        workCentreId: "wc-1",
        machineId: "machine-1",
        startAt: "2026-09-15T08:00",
        endAt: "2026-09-15T10:00",
        status: "Confirmed"
      },
      {
        id: "entry-2",
        productId: "product-1",
        workCentreId: "wc-1",
        machineId: "machine-1",
        startAt: "2026-09-15T09:30",
        endAt: "2026-09-15T11:00",
        status: "Cancelled"
      }
    ];

    expect(findMachineConflicts(entries, machines, products)).toHaveLength(0);
  });
});

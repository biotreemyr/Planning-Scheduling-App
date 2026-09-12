import { expect, it } from "vitest";
import { getUnscheduledPlanLines } from "../src/lib/services/reports";
import type { PlanLine } from "../src/lib/domain/types";

it("excludes completed activities from the open-plan queue", () => {
  const line: PlanLine = { id: "beta", planId: "plan", productId: "product", quantity: 100000, plannedDate: "2026-09-13", priority: "Normal", status: "Partially Scheduled" };
  expect(getUnscheduledPlanLines([line, { ...line, id: "complete", completedAt: "2026-09-13T16:00:00Z" }])).toEqual([line]);
});

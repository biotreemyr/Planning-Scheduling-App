import type { SchedulerData } from "@/lib/domain/types";

export const seedData: SchedulerData = {
  customers: [
    { id: "cust-greenmart", code: "GM", name: "GreenMart", active: "Active" },
    { id: "cust-wellnesshub", code: "WH", name: "Wellness Hub", active: "Active" }
  ],
  products: [
    {
      id: "prod-black-soy",
      sku: "BT-BS-001",
      name: "Black Soybean Fermented Powder",
      uom: "kg",
      productType: "Finished Good",
      active: "Active"
    },
    {
      id: "prod-enzyme",
      sku: "BT-ENZ-010",
      name: "Enzyme Blend Sachet",
      uom: "carton",
      productType: "Finished Good",
      active: "Active"
    },
    {
      id: "prod-intermediate",
      sku: "BT-INT-003",
      name: "Fermented Intermediate Base",
      uom: "kg",
      productType: "Intermediate",
      active: "Active"
    }
  ],
  workCentres: [
    { id: "wc-fermentation", code: "FERM", name: "Fermentation", active: "Active" },
    { id: "wc-spray", code: "SPRAY", name: "Spray Drying", active: "Active" },
    { id: "wc-blend", code: "BLEND", name: "Powder Blending", active: "Active" },
    { id: "wc-fill", code: "FILL", name: "Sachet Filling", active: "Active" },
    { id: "wc-pack", code: "PACK", name: "Packing", active: "Active" }
  ],
  machines: [
    {
      id: "mach-fermenter-a",
      code: "F-A",
      name: "Fermenter A",
      workCentreId: "wc-fermentation",
      capacityNotes: "Standard tank",
      active: "Active"
    },
    {
      id: "mach-spray-1",
      code: "SD-1",
      name: "Spray Dryer 1",
      workCentreId: "wc-spray",
      capacityNotes: "Main dryer",
      active: "Active"
    },
    {
      id: "mach-blender-2",
      code: "BL-2",
      name: "Ribbon Blender 2",
      workCentreId: "wc-blend",
      active: "Active"
    },
    {
      id: "mach-filler-1",
      code: "SF-1",
      name: "Sachet Filler 1",
      workCentreId: "wc-fill",
      active: "Active"
    },
    {
      id: "mach-pack-line",
      code: "PK-1",
      name: "Packing Line 1",
      workCentreId: "wc-pack",
      active: "Active"
    }
  ],
  employees: [
    { id: "emp-aida", name: "Aida", role: "Planner", active: "Active" },
    { id: "emp-lim", name: "Lim", role: "Production Supervisor", active: "Active" },
    { id: "emp-kumar", name: "Kumar", role: "Operator", active: "Active" }
  ],
  productionOrders: [
    {
      id: "po-1007",
      orderNo: "PO-1007",
      customerId: "cust-greenmart",
      productId: "prod-black-soy",
      quantity: 1200,
      dueDate: "2026-09-18",
      priority: "High",
      status: "Released"
    },
    {
      id: "po-1008",
      orderNo: "PO-1008",
      customerId: "cust-wellnesshub",
      productId: "prod-enzyme",
      quantity: 500,
      dueDate: "2026-09-19",
      priority: "Normal",
      status: "Released"
    }
  ],
  productionPlan: {
    id: "plan-week-38",
    planName: "Week 38 Production Plan",
    dateRangeStart: "2026-09-14",
    dateRangeEnd: "2026-09-18",
    status: "Draft",
    ownerName: "Angeline"
  },
  planLines: [
    {
      id: "line-fermentation",
      planId: "plan-week-38",
      productionOrderId: "po-1007",
      productId: "prod-intermediate",
      quantity: 1200,
      plannedDate: "2026-09-14",
      priority: "High",
      status: "Fully Scheduled",
      orderReference: "PO-1007",
      notes: "Start fermentation batch for black soybean powder."
    },
    {
      id: "line-spray",
      planId: "plan-week-38",
      productionOrderId: "po-1007",
      productId: "prod-black-soy",
      quantity: 900,
      plannedDate: "2026-09-15",
      priority: "High",
      status: "Partially Scheduled",
      orderReference: "PO-1007",
      notes: "Spray dry first release quantity."
    },
    {
      id: "line-blend",
      planId: "plan-week-38",
      productionOrderId: "po-1008",
      productId: "prod-enzyme",
      quantity: 500,
      plannedDate: "2026-09-16",
      priority: "Normal",
      status: "Unscheduled",
      orderReference: "PO-1008",
      notes: "Blend and hold for sachet filling."
    }
  ],
  scheduleEntries: [
    {
      id: "sched-fermentation-a",
      planLineId: "line-fermentation",
      productionOrderId: "po-1007",
      productId: "prod-intermediate",
      workCentreId: "wc-fermentation",
      machineId: "mach-fermenter-a",
      startAt: "2026-09-14T08:00",
      endAt: "2026-09-14T16:00",
      status: "Confirmed",
      notes: "Main fermentation run.",
      changedBy: "Aida"
    },
    {
      id: "sched-spray-main",
      planLineId: "line-spray",
      productionOrderId: "po-1007",
      productId: "prod-black-soy",
      workCentreId: "wc-spray",
      machineId: "mach-spray-1",
      startAt: "2026-09-15T09:00",
      endAt: "2026-09-15T13:00",
      status: "Confirmed",
      notes: "First drying slot.",
      changedBy: "Lim"
    },
    {
      id: "sched-spray-overlap",
      planLineId: "line-spray",
      productionOrderId: "po-1007",
      productId: "prod-black-soy",
      workCentreId: "wc-spray",
      machineId: "mach-spray-1",
      startAt: "2026-09-15T12:30",
      endAt: "2026-09-15T15:30",
      status: "Confirmed",
      notes: "Intentional overlap to prove conflict warnings.",
      changedBy: "Lim"
    }
  ]
};

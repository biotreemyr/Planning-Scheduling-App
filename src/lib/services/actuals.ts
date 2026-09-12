export type ProductionActual = {
  calendarId?: string;
  planLineId: string;
  teamId: string;
  actualQuantity: number;
  plannedQuantity: number;
  uom: string;
  productionDate: string;
  hasDeviation: boolean;
  deviation: string;
  correctiveAction: string;
  updatedBy: string;
  updatedAt: string;
};

export function productionPerformance(planned: number, actual?: number) {
  if (actual === undefined || !Number.isFinite(actual) || actual < 0 || !Number.isFinite(planned) || planned <= 0) {
    return { ratio: null, variance: null };
  }
  return { ratio: actual / planned * 100, variance: actual - planned };
}

export function validateActual(actual: Pick<ProductionActual, "actualQuantity" | "productionDate" | "hasDeviation" | "deviation">) {
  const errors: string[] = [];
  if (!Number.isFinite(actual.actualQuantity) || actual.actualQuantity < 0) errors.push("Actual quantity must be zero or greater.");
  const date = new Date(`${actual.productionDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(actual.productionDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== actual.productionDate) errors.push("Enter a valid production date.");
  if (actual.hasDeviation && !actual.deviation.trim()) errors.push("Enter the deviation details.");
  return errors;
}

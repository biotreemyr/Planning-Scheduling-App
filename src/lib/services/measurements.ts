export type Measurement = { uom: string; activityType: string; unitWeightMg?: number; batchSizeKg?: number };
export function batchKilograms(quantity: number, uom: string, unitWeightMg?: number): number | undefined {
  if (!Number.isFinite(quantity) || quantity <= 0) return undefined;
  const factor = ({ kg: 1, g: 0.001, mg: 0.000001 } as Record<string, number>)[uom];
  const kg = factor ? quantity * factor : unitWeightMg && Number.isFinite(unitWeightMg) && unitWeightMg > 0 ? quantity * unitWeightMg / 1_000_000 : undefined;
  return kg !== undefined && Number.isFinite(kg) ? Number(kg.toPrecision(12)) : undefined;
}
export function readMeasurement(data: FormData): Measurement {
  const uom = String(data.get("uom") ?? "");
  const weight = Number(data.get("unitWeightMg"));
  const unitWeightMg = ["kg", "g", "mg"].includes(uom) || !weight ? undefined : weight;
  return { uom, activityType: String(data.get("activityType") ?? ""), unitWeightMg,
    batchSizeKg: batchKilograms(Number(data.get("quantity")), uom, unitWeightMg) };
}

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

const MG: Record<string, number> = { kg: 1_000_000, g: 1_000, mg: 1 };
const ML: Record<string, number> = { L: 1_000, mL: 1 };
export const isWeight = (uom: string) => uom in MG;
export const isVolume = (uom: string) => uom in ML;
// The size one unit is given in for a measured quantity: mg for a weight, mL for a volume.
export const unitSizeUom = (uom: string) => isWeight(uom) ? "mg" : isVolume(uom) ? "mL" : undefined;
// How many tablets, capsules or doses a weighed or measured quantity is, from the size of one:
// 23.975 kg at 350 mg each is 68,500; 2.5 L at 5 mL each is 500.
export function countFromWeight(quantity: number, uom: string, unitSize: number): number | undefined {
  const per = MG[uom] ?? ML[uom];
  if (per === undefined || !(unitSize > 0) || !Number.isFinite(quantity) || quantity < 0) return undefined;
  return Math.round(Number((quantity * per / unitSize).toPrecision(12)));
}

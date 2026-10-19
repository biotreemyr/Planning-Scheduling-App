import type { StageYield } from "@/lib/services/yields";

/**
 * A capsule batch's average net fill against the unit weight on the PO, under its yield. Further
 * from target than QA's fill tolerance, it shows in bold red: often a weight keyed in wrongly.
 */
export function FillNote({ powder }: { powder: NonNullable<StageYield["powder"]> }) {
  if (!powder.targetMg) return null;
  const diff = powder.diff ?? 0;
  const shown = Math.abs(diff) < 0.05 ? "on target" : `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}%`;
  return <small className={`yield-step${powder.out ? " fill-out" : ""}`}
    title={`Average net fill per capsule (filled weight less the empty shell) against the unit weight on the PO.${powder.out ? ` More than ±${powder.tolerance}% from target: check the filled capsule and shell weights keyed in.` : ` Within ±${powder.tolerance}%.`}`}>
    Fill {powder.fillMg.toLocaleString("en-MY", { maximumFractionDigits: 1 })} mg · target {powder.targetMg.toLocaleString()} ({shown})</small>;
}

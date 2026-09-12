"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { PlanLine, Product } from "@/lib/domain/types";
import { productionPerformance, validateActual, type ProductionActual } from "@/lib/services/actuals";

export type ActualInput = Pick<ProductionActual, "planLineId" | "actualQuantity" | "productionDate" | "hasDeviation" | "deviation" | "correctiveAction">;
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 6 });

export function ProductionActuals({ lines, products, actuals, editable, onSave }: {
  lines: PlanLine[]; products: Product[]; actuals: ProductionActual[]; editable: boolean;
  onSave: (input: ActualInput) => string[];
}) {
  const [selectedId, setSelectedId] = useState("");
  const [deviationsOnly, setDeviationsOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = lines.find((line) => line.id === selectedId);
  const rows = lines.filter((line) => !deviationsOnly || actuals.some((actual) => actual.planLineId === line.id && actual.hasDeviation));
  return <section className="actuals-report">
    <div className="panel-title"><h2>Actual production & deviations</h2><label className="actuals-filter"><input type="checkbox" checked={deviationsOnly} onChange={(event) => setDeviationsOnly(event.target.checked)} /> Deviations only</label></div>
    {notice ? <p role="status">{notice}</p> : null}
    {selected && editable ? <ActualForm key={selected.id} line={selected} actual={actuals.find((item) => item.planLineId === selected.id)} uom={selected.uom ?? products.find((product) => product.id === selected.productId)?.uom ?? ""} productName={products.find((product) => product.id === selected.productId)?.name ?? "Activity"} onClose={() => setSelectedId("")} onSave={(input) => { const errors = onSave(input); if (!errors.length) { setSelectedId(""); setNotice("Actual production saved."); } return errors; }} /> : null}
    <div className="actuals-table-scroll"><table>
      <thead><tr><th>Activity</th><th>Planned at reporting</th><th>Actual total</th><th>Variance</th><th>Actual / planned</th><th>Deviation report</th>{editable ? <th>Action</th> : null}</tr></thead>
      <tbody>{rows.map((line) => {
        const actual = actuals.find((item) => item.planLineId === line.id);
        const planned = actual?.plannedQuantity ?? line.quantity;
        const uom = actual?.uom ?? line.uom ?? products.find((product) => product.id === line.productId)?.uom;
        const performance = productionPerformance(planned, actual?.actualQuantity);
        return <tr key={line.id}>
          <td><strong>{products.find((product) => product.id === line.productId)?.name}</strong><div>{line.activityType ?? "Production"} · {line.plannedDate}</div>{line.orderReference ? <div>{line.orderReference}</div> : null}</td>
          <td>{number(planned)} {uom}</td><td>{actual ? <>{number(actual.actualQuantity)} {uom}<div>{actual.productionDate}</div></> : "Not reported"}</td>
          <td>{performance.variance === null ? "Not reported" : `${performance.variance > 0 ? "+" : ""}${number(performance.variance)} ${uom}`}</td>
          <td>{performance.ratio === null ? "Not reported" : `${performance.ratio.toFixed(1)}%`}</td>
          <td>{actual?.hasDeviation ? <><strong>Deviation recorded</strong><p>{actual.deviation}</p>{actual.correctiveAction ? <p>Corrective action: {actual.correctiveAction}</p> : null}</> : actual ? "None reported" : "Not reported"}{actual ? <small>Updated by {actual.updatedBy} · {new Date(actual.updatedAt).toLocaleString()}</small> : null}</td>
          {editable ? <td>{line.completedAt ? "Final yield recorded" : <button type="button" className="calendar-button" onClick={() => { setSelectedId(line.id); setNotice(""); }}><Pencil size={16} />{actual ? "Edit actual" : "Record actual"}</button>}</td> : null}
        </tr>;
      })}</tbody>
    </table></div>
    {!rows.length ? <p>{deviationsOnly ? "No deviations reported." : "No activities in this team plan."}</p> : null}
  </section>;
}

function ActualForm({ line, actual, uom, productName, onClose, onSave }: {
  line: PlanLine; actual?: ProductionActual; uom: string; productName: string;
  onClose: () => void; onSave: (input: ActualInput) => string[];
}) {
  const [quantity, setQuantity] = useState(actual ? String(actual.actualQuantity) : "");
  const [hasDeviation, setHasDeviation] = useState(actual?.hasDeviation ?? false);
  const [errors, setErrors] = useState<string[]>([]);
  const planned = actual?.plannedQuantity ?? line.quantity;
  const performance = productionPerformance(planned, quantity.trim() ? Number(quantity) : undefined);
  return <form className="actual-entry form-panel" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input: ActualInput = { planLineId: line.id, actualQuantity: quantity.trim() ? Number(quantity) : NaN, productionDate: String(data.get("productionDate")), hasDeviation, deviation: hasDeviation ? String(data.get("deviation") ?? "").trim() : "", correctiveAction: hasDeviation ? String(data.get("correctiveAction") ?? "").trim() : "" };
    const validation = validateActual(input);
    setErrors(validation.length ? validation : onSave(input));
  }}>
    <div className="panel-title"><h3>{productName}</h3><button type="button" className="icon-button" aria-label="Close actual entry" title="Close actual entry" onClick={onClose}><X size={18} /></button></div>
    <div className="actual-entry-fields"><label>Production date<input type="date" name="productionDate" required defaultValue={actual?.productionDate ?? line.plannedDate} /></label><label>Cumulative actual quantity ({actual?.uom ?? uom})<input type="number" min="0" step="any" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label></div>
    <output aria-live="polite">Planned: {number(planned)} {actual?.uom ?? uom} · Actual / planned: {performance.ratio === null ? "Not reported" : `${performance.ratio.toFixed(1)}%`}</output>
    <label className="actuals-filter"><input type="checkbox" checked={hasDeviation} onChange={(event) => setHasDeviation(event.target.checked)} /> Deviation occurred</label>
    {hasDeviation ? <><label>Deviation details<textarea name="deviation" required defaultValue={actual?.deviation} /></label><label>Corrective action<textarea name="correctiveAction" defaultValue={actual?.correctiveAction} /></label></> : null}
    {errors.map((error) => <p key={error} role="alert">{error}</p>)}
    <button type="submit" className="primary-button">Save actual production</button>
  </form>;
}

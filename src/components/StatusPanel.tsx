"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, PackageCheck, Printer, Search, XCircle } from "lucide-react";
import type { PlanLine, Product } from "@/lib/domain/types";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import { batchYield, formatYield, limitText, type YieldLimits, type YieldRange } from "@/lib/services/yields";
import { OTHER_USES, finalOutputFor, formulaPending, jobParts, needsFormulaCheck, releaseFor, type ReleaseEntry } from "@/lib/services/sharedJobs";
import { finalOutput, finishedOn, packingNumber, releaseQueue, testingQueue, testResult, type JobOrder, type TestResult } from "@/lib/services/jobOrders";
import type { PurchaseOrder } from "@/lib/services/orders";
import { formatDate, formatDateTime } from "@/lib/services/dates";

export type StatusSection = "testing" | "release" | "yield";
export type StatusAccess = { viewTesting: boolean; passTesting: boolean; printTesting: boolean; viewRelease: boolean; release: boolean; printRelease: boolean };

const day = (value?: string) => formatDate(value);
const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });

/**
 * Status: finished batches through testing and release. Testing lists each job order with final
 * output not yet passed; Pass moves it to Release. Release lists passed batches with the release
 * quantity (the final output, which can be changed); Release completes it. Only pending work shows.
 */
export function StatusPanel({ jobOrders, orders, products, lines, transfers, directory, access, section: chosen, onSection, onTest, onRelease, onReject, onConfirmFormula, yieldLimits, onYieldLimits }: {
  // QA's acceptable step and final yield ranges, set under QA/QC.
  yieldLimits: YieldLimits; onYieldLimits: (limits: YieldLimits) => string[];
  jobOrders: JobOrder[]; orders: PurchaseOrder[]; products: Product[]; lines: PlanLine[]; transfers: { sourceLineId: string }[]; directory: CalendarDirectory;
  access: StatusAccess;
  // The section picked under QA/QC in the sidebar.
  section: StatusSection; onSection?: (section: StatusSection) => void;
  onTest: (jobId: string, result: TestResult) => string[];
  // QA releases a batch to its POs: all at once, or one PO at a time, each reconciled.
  onRelease: (jobId: string, entries: ReleaseEntry[]) => string[];
  onReject: (jobId: string) => string[];
  // QA confirms that POs with different FG codes sharing a batch are the same formula.
  onConfirmFormula: (jobId: string) => string[];
}) {
  // A section the person may not see falls back to the one they may.
  const section: StatusSection = chosen === "yield" && access.viewRelease ? "yield" : chosen === "release" ? access.viewRelease ? "release" : "testing" : access.viewTesting ? "testing" : "release";
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [releasing, setReleasing] = useState<string | null>(null);
  const toConfirm = jobOrders.filter((job) => formulaPending(job, orders) && !job.releasedAt && !job.rejectedAt);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [printing, setPrinting] = useState(0);
  useEffect(() => { if (printing) window.print(); }, [printing]);
  // The batch's final yield against QA's limits, and whether any process came out outside them,
  // so testing and release see it without opening the order. No limits set says so.
  const yieldOf = (job: JobOrder) => {
    const result = batchYield(job, job.orderId, lines, orders, directory, yieldLimits);
    return { final: result.final, outside: result.stages.filter((stage) => stage.tone === "out").length };
  };
  const yieldText = (job: JobOrder) => { const { final, outside } = yieldOf(job); return `${formatYield(final?.percent)}${final?.tone === "out" ? " outside limits" : ""}${outside ? ` · ${outside} process${outside === 1 ? "" : "es"} outside` : ""}`; };
  const finalYieldCell = (job: JobOrder) => {
    const { final, outside } = yieldOf(job);
    if (!final) return <span className="route-muted">-</span>;
    return <><small className={`yield-chip yield-${final.tone}`} title={final.working ?? final.missing}>{formatYield(final.percent)}{final.tone === "out" ? " · outside limits" : ""}</small>
      {!final.limit ? <small className="route-muted">No QA limits set</small> : null}
      {outside ? <small className="yield-chip yield-out">{outside} process{outside === 1 ? "" : "es"} outside limits</small> : null}</>;
  };
  const testing = testingQueue(jobOrders, lines, transfers);
  const release = releaseQueue(jobOrders);
  const rows = section === "testing" ? testing : release;
  const canPrint = section === "testing" ? access.printTesting : access.printRelease;
  const details = (job: JobOrder) => {
    const order = orders.find((item) => item.id === job.orderId);
    const output = finalOutput(job.id, lines, transfers)[0];
    return { order, product: products.find((item) => item.id === order?.productId)?.name ?? "Unknown product", output };
  };
  const report = (errors: string[], text: string) => setMessage(errors.length ? { text: errors.join(" "), error: true } : { text, error: false });
  if (!access.viewTesting && !access.viewRelease) return null;
  if (section === "yield") return <YieldLimitsPanel directory={directory} limits={yieldLimits} editable={access.release} onSave={onYieldLimits} />;

  return <section className="workspace-panel status-panel">
    <div className="panel-title">
      <h2>{section === "testing" ? "Testing" : "Release"} <span className="badge neutral">{rows.length} pending</span></h2>
      {onSection && access.viewTesting && access.viewRelease ? <div className="view-switch status-mobile-switch" aria-label="QA/QC section">
        <button type="button" aria-pressed={section === "testing"} onClick={() => onSection("testing")}>Testing</button>
        <button type="button" aria-pressed={section === "release"} onClick={() => onSection("release")}>Release</button>
      </div> : null}
      {canPrint ? <button type="button" className="calendar-button" onClick={() => setPrinting((value) => value + 1)}><Printer size={16} />Print {section} list</button> : null}
    </div>
    <p className="orders-help">{section === "testing" ? "Finished batches, from production's final output, waiting for testing. Pass and Failed both send a batch to Release, where QA releases or rejects it. A batch under investigation stays here until it is passed or failed." : "Batches QC has finished with. Passed batches: the release quantity is the final output; change it if needed, then release. Failed batches: reject them."}</p>
    {message ? <p role={message.error ? "alert" : "status"} className={message.error ? undefined : "calendar-notice"}>{message.text}</p> : null}
    {section === "release" && toConfirm.length ? <section className="formula-check" aria-labelledby="formula-check-title">
      <h3 id="formula-check-title">Same formula to confirm <span className="badge warning">{toConfirm.length}</span></h3>
      <p className="route-muted">These batches are made once for POs with different FG codes. Confirm they are the same formula before production plans them.</p>
      <ul>{toConfirm.map((job) => <li key={job.id}>
        <span><strong>{job.number}</strong>{jobParts(job).map((part) => { const order = orders.find((item) => item.id === part.orderId); const product = products.find((item) => item.id === order?.productId);
          return <small key={part.orderId}>{order?.poNumber ?? "PO"} · {product?.sku ?? ""} {product?.name ?? "Unknown product"}{order?.customerName ? ` · ${order.customerName}` : ""}</small>; })}</span>
        {access.release ? <button type="button" className="primary-button" onClick={() => report(onConfirmFormula(job.id), `${job.number}: same formula confirmed. Production can plan it now.`)}><CheckCircle2 size={16} />Confirm same formula</button> : null}
      </li>)}</ul>
    </section> : null}
    <div className="orders-table-scroll" tabIndex={0} role="region" aria-label={`${section === "testing" ? "Testing" : "Release"} list`}>
      <table className="job-order-table status-table">
        <thead><tr>
          <th scope="col">PJO no.</th><th scope="col">Product</th><th scope="col">Batch no.</th><th scope="col">Job order no.</th><th scope="col">PO</th>
          <th scope="col" className="numeric">Final output</th><th scope="col" className="numeric">Final yield</th>
          {section === "testing" ? <><th scope="col">Finished</th><th scope="col">Status</th></> : <><th scope="col">Testing result</th><th scope="col" className="numeric">Release quantity</th></>}
          <th scope="col"><span className="admin-sr-only">Action</span></th>
        </tr></thead>
        <tbody>
          {!rows.length ? <tr><td colSpan={10} className="empty-state">{section === "testing" ? "No batches waiting for testing." : "No batches waiting for release."}</td></tr> : null}
          {rows.map((job) => {
            const { order, product, output } = details(job);
            const typed = quantities[job.id] ?? (output ? String(output.quantity) : "");
            return <tr key={job.id}>
              <th scope="row"><strong>{packingNumber(job)}</strong></th>
              <td>{product}</td>
              <td>{job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Not keyed in</span>}</td>
              <td>{job.number}</td>
              <td>{order?.poNumber ?? "-"}{order?.customerName ? <small>{order.customerName}</small> : null}</td>
              <td className="numeric">{output ? `${amount(output.quantity)} ${output.uom}` : "-"}</td>
              <td className="numeric">{finalYieldCell(job)}</td>
              {section === "testing" ? <><td>{day(finishedOn(job, lines, transfers))}</td>
                <td>{testResult(job) === "Under investigation" ? <><span className="badge warning">Under investigation</span><small>since {day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></> : <span className="badge neutral">Awaiting testing</span>}</td></> : <>
                <td>{testResult(job) === "Failed" ? <span className="badge danger">Failed testing</span> : <span className="badge success">Passed</span>}<small>{day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></td>
                <td className="numeric">{testResult(job) === "Failed" ? <span className="route-muted">Not for release</span> : (() => {
                  const parts = jobParts(job), done = parts.filter((part) => releaseFor(job, part.orderId)).length;
                  return parts.length > 1 || done ? <span>{done} of {parts.length} POs released</span> : <span className="route-muted">Not released</span>;
                })()}</td>
              </>}
              <td>{section === "testing"
                ? access.passTesting ? <span className="status-actions">
                  <button type="button" className="primary-button" onClick={() => report(onTest(job.id, "Passed"), `${packingNumber(job)} passed testing and moved to Release.`)}><CheckCircle2 size={16} />Pass</button>
                  <button type="button" className="calendar-button danger-button" onClick={() => { if (window.confirm(`Mark ${packingNumber(job)} as failed testing? It goes to Release for QA to reject.`)) report(onTest(job.id, "Failed"), `${packingNumber(job)} failed testing and moved to Release, for QA to reject.`); }}><XCircle size={16} />Failed</button>
                  {testResult(job) !== "Under investigation" ? <button type="button" className="calendar-button" onClick={() => report(onTest(job.id, "Under investigation"), `${packingNumber(job)} is under investigation. Pass or fail it when the result is known.`)}><Search size={16} />Under investigation</button> : null}
                </span> : null
                : access.release && testResult(job) === "Failed" ? <button type="button" className="calendar-button danger-button" onClick={() => { if (window.confirm(`Reject ${packingNumber(job)}? It failed testing and will be closed as rejected.`)) report(onReject(job.id), `${packingNumber(job)} rejected.`); }}><XCircle size={16} />Rejected</button>
                : access.release ? <button type="button" className={releasing === job.id ? "calendar-button" : "primary-button"} aria-expanded={releasing === job.id} onClick={() => setReleasing(releasing === job.id ? null : job.id)}>
                  <PackageCheck size={16} />{releasing === job.id ? "Close" : "Release"}</button> : null}</td>
            </tr>;
          }).flatMap((row, index) => {
            const job = rows[index];
            return releasing === job.id && section === "release" && testResult(job) !== "Failed" ? [row, <tr key={`${job.id}-release`} className="release-panel-row"><td colSpan={9}>
              <ReleasePanel job={job} orders={orders} lines={lines} transfers={transfers} directory={directory} formulaWaiting={formulaPending(job, orders)}
                onRelease={(entries, text) => { const errors = onRelease(job.id, entries); report(errors, text); if (!errors.length && entries.length === jobParts(job).filter((part) => !releaseFor(job, part.orderId)).length) setReleasing(null); return errors; }} />
            </td></tr>] : [row];
          })}
        </tbody>
      </table>
    </div>
    {printing && typeof document !== "undefined" ? createPortal(<section className="calendar-print-sheet print-orders" aria-hidden="true">
      <header><h1>{section === "testing" ? "Testing" : "Release"} list</h1><p>{rows.length} batch{rows.length === 1 ? "" : "es"} pending · printed {formatDateTime(new Date())}</p></header>
      <table className="print-orders-table">
        <thead><tr><th>PJO no.</th><th>Product</th><th>Batch no.</th><th>Job order no.</th><th>PO</th><th>Final output</th><th>Final yield</th>{section === "testing" ? <><th>Finished</th><th>Status</th></> : <><th>Passed testing</th><th>Release quantity</th></>}</tr></thead>
        <tbody>{rows.map((job) => { const { order, product, output } = details(job); return <tr key={job.id}>
          <td>{packingNumber(job)}</td><td>{product}</td><td>{job.batchNumber ?? ""}</td><td>{job.number}</td><td>{order?.poNumber ?? ""}</td><td>{output ? `${amount(output.quantity)} ${output.uom}` : ""}</td><td>{yieldText(job)}</td>
          {section === "testing" ? <><td>{day(finishedOn(job, lines, transfers))}</td><td>{testResult(job) ?? "Awaiting testing"}</td></> : <><td>{day(job.testedAt)}</td><td>{quantities[job.id] ?? (output ? amount(output.quantity) : "")} {output?.uom ?? ""}</td></>}
        </tr>; })}</tbody>
      </table>
    </section>, document.body) : null}
  </section>;
}

type UseDraft = { key: string; quantity: string; note: string };
type PartDraft = { quantity: string; uses: UseDraft[] };

/**
 * Releasing a passed batch to its POs, each reconciled: what was packed for the PO, how much goes to
 * the PO, and anything else it went to (retention sample, stability study...), with the balance
 * left unaccounted. QA releases one PO at a time, or the whole batch at once.
 */
function ReleasePanel({ job, orders, lines, transfers, directory, formulaWaiting, onRelease }: {
  job: JobOrder; orders: PurchaseOrder[]; lines: PlanLine[]; transfers: { sourceLineId: string }[]; directory: CalendarDirectory; formulaWaiting: boolean;
  onRelease: (entries: ReleaseEntry[], text: string) => string[];
}) {
  const parts = jobParts(job);
  // What was packed for the PO, in the PO's own unit (boxes) when production finished in it.
  const packedFor = (orderId: string) => { const outputs = finalOutputFor(job, orderId, lines, transfers, directory); return outputs.find((output) => output.uom === orders.find((order) => order.id === orderId)?.uom) ?? outputs.at(-1); };
  const [drafts, setDrafts] = useState<Record<string, PartDraft>>(() => Object.fromEntries(parts.map((part) => [part.orderId, { quantity: String(packedFor(part.orderId)?.quantity ?? ""), uses: [] }])));
  const open = parts.filter((part) => !releaseFor(job, part.orderId));
  const set = (orderId: string, change: Partial<PartDraft>) => setDrafts((current) => ({ ...current, [orderId]: { ...current[orderId], ...change } }));
  const entryFor = (orderId: string): ReleaseEntry => {
    const draft = drafts[orderId];
    const uom = packedFor(orderId)?.uom ?? job.releaseUom ?? orders.find((order) => order.id === orderId)?.uom ?? "";
    return { orderId, quantity: draft.quantity.trim() === "" ? NaN : Number(draft.quantity), uom, otherUses: draft.uses.filter((use) => use.quantity.trim() || use.note.trim()).map((use) => ({ quantity: Number(use.quantity), note: use.note })) };
  };
  const poOf = (orderId: string) => orders.find((order) => order.id === orderId);
  return <div className="release-panel">
    {formulaWaiting ? <p role="alert">QA has not yet confirmed that the POs sharing {job.number} are the same formula. Confirm it above first.</p> : null}
    <datalist id={`release-uses-${job.id}`}>{OTHER_USES.map((use) => <option key={use} value={use} />)}</datalist>
    {parts.map((part) => {
      const order = poOf(part.orderId);
      const released = releaseFor(job, part.orderId);
      const packed = packedFor(part.orderId);
      if (released) return <section key={part.orderId} className="release-part done">
        <h4>{order?.poNumber ?? "PO"}{order?.customerName ? ` · ${order.customerName}` : ""} <span className="badge success">Released</span></h4>
        <p>{amount(released.quantity)} {released.uom} to the PO{released.otherUses?.map((use) => ` · ${amount(use.quantity)} ${use.note}`).join("")}<small> · {day(released.releasedAt)}{released.releasedBy ? ` · ${released.releasedBy}` : ""}</small></p>
      </section>;
      const draft = drafts[part.orderId];
      const uom = packed?.uom ?? order?.uom ?? "";
      const accounted = (Number(draft.quantity) || 0) + draft.uses.reduce((sum, use) => sum + (Number(use.quantity) || 0), 0);
      const balance = packed ? Number((packed.quantity - accounted).toPrecision(12)) : 0;
      return <section key={part.orderId} className="release-part">
        <h4>{order?.poNumber ?? "PO"}{order?.customerName ? ` · ${order.customerName}` : ""}<small>{part.packingNumber} · ordered {amount(order?.quantity ?? 0)} {order?.uom ?? ""}</small></h4>
        <div className="release-figures">
          <span>Packed <strong>{packed ? `${amount(packed.quantity)} ${packed.uom}` : "not recorded"}</strong></span>
          <label>To the PO<span className="status-release-qty"><input type="number" min="0" step="any" value={draft.quantity} onChange={(event) => set(part.orderId, { quantity: event.target.value })} /> {uom}</span></label>
        </div>
        {draft.uses.map((use) => <div key={use.key} className="release-use">
          <input type="number" min="0" step="any" aria-label="Quantity" placeholder="Qty" value={use.quantity} onChange={(event) => set(part.orderId, { uses: draft.uses.map((item) => item.key === use.key ? { ...item, quantity: event.target.value } : item) })} />
          <input list={`release-uses-${job.id}`} aria-label="Went to" placeholder="Went to, e.g. Retention sample" maxLength={200} value={use.note} onChange={(event) => set(part.orderId, { uses: draft.uses.map((item) => item.key === use.key ? { ...item, note: event.target.value } : item) })} />
          <button type="button" className="icon-button" aria-label="Remove this use" title="Remove" onClick={() => set(part.orderId, { uses: draft.uses.filter((item) => item.key !== use.key) })}><XCircle size={15} /></button>
        </div>)}
        <div className="release-actions">
          <button type="button" className="calendar-button" onClick={() => set(part.orderId, { uses: [...draft.uses, { key: crypto.randomUUID(), quantity: "", note: "" }] })}>+ Other use (sample, stability…)</button>
          {packed ? <span className={balance ? "order-warning" : "route-muted"}>{balance ? `${amount(Math.abs(balance))} ${packed.uom} ${balance > 0 ? "not accounted for" : "more than packed"}` : "All packed output accounted for"}</span> : null}
          <button type="button" className="primary-button" disabled={formulaWaiting} onClick={() => onRelease([entryFor(part.orderId)], `${job.number} released to ${order?.poNumber ?? "the PO"}.`)}><PackageCheck size={16} />Release to {order?.poNumber ?? "PO"}</button>
        </div>
      </section>;
    })}
    {open.length > 1 ? <div className="release-actions release-all"><button type="button" className="primary-button" disabled={formulaWaiting} onClick={() => onRelease(open.map((part) => entryFor(part.orderId)), `${job.number} released to ${open.length} POs.`)}><PackageCheck size={16} />Release whole batch ({open.length} POs)</button></div> : null}
  </div>;
}

/**
 * QA's acceptable yield ranges: for each process (its % of theoretical) and for the batch's final
 * yield. Results within range show green, near a limit amber, outside red; production gives a
 * deviation note when a process comes out outside. A blank minimum or maximum means no limit on that side.
 */
function YieldLimitsPanel({ directory, limits, editable, onSave }: { directory: CalendarDirectory; limits: YieldLimits; editable: boolean; onSave: (limits: YieldLimits) => string[] }) {
  // Processes in the unit's route order, each once.
  const processes = [...new Map(directory.calendars.map((calendar) => [calendar.processId, directory.processes.find((item) => item.id === calendar.processId)])).values()].filter((item): item is NonNullable<typeof item> => !!item);
  const text = (value?: number) => value === undefined ? "" : String(value);
  const [draft, setDraft] = useState<Record<string, { min: string; max: string }>>(() => ({
    ...Object.fromEntries(processes.map((process) => [process.id, { min: text(limits.byProcess[process.id]?.min), max: text(limits.byProcess[process.id]?.max) }])),
    final: { min: text(limits.final?.min), max: text(limits.final?.max) }
  }));
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const read = (value: string) => value.trim() === "" ? undefined : Number(value);
  const range = (key: string): YieldRange => ({ ...(read(draft[key].min) !== undefined ? { min: read(draft[key].min) } : {}), ...(read(draft[key].max) !== undefined ? { max: read(draft[key].max) } : {}) });
  const row = (key: string, label: string, hint: string) => <tr key={key}>
    <th scope="row">{label}<small>{hint}</small></th>
    {(["min", "max"] as const).map((side) => <td key={side} className="numeric"><span className="yield-limit-input"><input type="number" min="0" max="200" step="0.1" disabled={!editable} aria-label={`${label} ${side === "min" ? "minimum" : "maximum"} %`}
      value={draft[key][side]} placeholder="No limit" onChange={(event) => setDraft({ ...draft, [key]: { ...draft[key], [side]: event.target.value } })} />%</span></td>)}
    <td>{limitText(range(key)) || <span className="route-muted">No limits</span>}</td>
  </tr>;
  return <section className="workspace-panel yield-limits">
    <div className="panel-title"><h2>Yield limits</h2></div>
    <p className="orders-help">The acceptable yield at each process, as a % of theoretical (what it made against what the batch formula gives at that process with no loss, as in the batch record), and for the batch's final yield. Results within range show green, within reach of a limit amber, outside red. When a process comes out outside its range, production adds a deviation note as they save it. The step yield (against what the process before handed over) is shown beside it to find where a loss happened; it has no limits.</p>
    {message ? <p role={message.error ? "alert" : "status"} className={message.error ? undefined : "calendar-notice"}>{message.text}</p> : null}
    <div className="orders-table-scroll" role="region" aria-label="Yield limits">
      <table className="orders-table yield-limits-table">
        <thead><tr><th scope="col">Process</th><th scope="col" className="numeric">Minimum</th><th scope="col" className="numeric">Maximum</th><th scope="col">Acceptable range</th></tr></thead>
        <tbody>
          {processes.map((process) => row(process.id, process.name, "% of theoretical"))}
          <tr className="yield-limits-final-gap"><td colSpan={4} /></tr>
          {row("final", "Final yield", "Last stage's good output ÷ batch quantity")}
        </tbody>
      </table>
    </div>
    {editable ? <div className="yield-limits-actions"><button type="button" className="primary-button" onClick={() => {
      const keys = [...processes.map((process) => process.id), "final"];
      for (const key of keys) {
        const { min, max } = range(key);
        const name = key === "final" ? "Final yield" : processes.find((process) => process.id === key)?.name ?? "A process";
        if ([min, max].some((value) => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 200))) { setMessage({ text: `${name}: limits are percentages from 0 to 200.`, error: true }); return; }
        if (min !== undefined && max !== undefined && min > max) { setMessage({ text: `${name}: the minimum is above the maximum.`, error: true }); return; }
      }
      const next: YieldLimits = { byProcess: Object.fromEntries(processes.map((process) => [process.id, range(process.id)]).filter(([, value]) => Object.keys(value as object).length)), ...(Object.keys(range("final")).length ? { final: range("final") } : {}) };
      const errors = onSave(next);
      setMessage(errors.length ? { text: errors.join(" "), error: true } : { text: "Yield limits saved. Results across the scheduler follow them now.", error: false });
    }}>Save yield limits</button></div> : <p className="route-muted">Only QA can change these limits.</p>}
  </section>;
}

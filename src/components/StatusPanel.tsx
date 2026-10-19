"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, PackageCheck, Printer, Search, X, XCircle } from "lucide-react";
import { usePager } from "./Pager";
import { DateFilterPicker } from "./DateFilterPicker";
import { matchesDateFilter } from "@/lib/services/dateFilter";
import type { PlanLine, Product } from "@/lib/domain/types";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import { DEFAULT_FILL_TOLERANCE, batchYield, formatYield, limitText, type YieldLimits, type YieldRange } from "@/lib/services/yields";
import { OTHER_USES, finalOutputFor, formulaPending, jobParts, needsFormulaCheck, releaseFor, type ReleaseEntry } from "@/lib/services/sharedJobs";
import { finalOutput, finishedOn, packingNumber, releaseQueue, testingQueue, testResult, type JobOrder, type TestResult } from "@/lib/services/jobOrders";
import type { PurchaseOrder } from "@/lib/services/orders";
import { formatDate, formatDateTime } from "@/lib/services/dates";

export type StatusSection = "testing" | "release" | "yield";
export type StatusAccess = { viewTesting: boolean; passTesting: boolean; printTesting: boolean; viewRelease: boolean; release: boolean; printRelease: boolean };

const day = (value?: string) => formatDate(value);
// A column of the testing and release lists: how it sorts, filters and shows.
type StatusColumn = { key: string; label: string; numeric?: boolean; sort: (job: JobOrder) => string | number; cell: (job: JobOrder) => ReactNode;
  filter?: { kind: "text"; text: (job: JobOrder) => string } | { kind: "date"; date: (job: JobOrder) => string | undefined } | { kind: "select"; options: string[]; value: (job: JobOrder) => string } };
type Sort = { key: string; ascending: boolean };
// Each person's sort for each list, remembered on this computer.
const sortStorage = (section: StatusSection) => `scheduler.${section}Sort`;
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
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Newest first by default: the latest finished (testing) or tested (release) batch on top.
  const [sort, setSort] = useState<Sort>({ key: "number", ascending: false });
  useEffect(() => {
    setFilters({});
    try { const saved = JSON.parse(localStorage.getItem(sortStorage(chosen)) ?? "null"); setSort(saved && typeof saved.key === "string" ? { key: saved.key, ascending: !!saved.ascending } : { key: "number", ascending: false }); } catch { setSort({ key: "number", ascending: false }); }
  }, [chosen]);
  const chooseSort = (next: Sort) => { setSort(next); try { localStorage.setItem(sortStorage(section), JSON.stringify(next)); } catch { /* not remembered */ } };
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
  // The day a batch joined the list: finished (testing) or tested (release). Numbers run oldest = 1.
  const listedOn = (job: JobOrder) => (section === "testing" ? finishedOn(job, lines, transfers) : job.testedAt) ?? "";
  const numbers = new Map([...rows].sort((a, b) => listedOn(a).localeCompare(listedOn(b)) || a.number.localeCompare(b.number)).map((job, index) => [job.id, index + 1]));
  const statusOf = (job: JobOrder) => section === "testing" ? testResult(job) === "Under investigation" ? "Under investigation" : "Awaiting testing" : testResult(job) === "Failed" ? "Failed testing" : "Passed";
  const columns: StatusColumn[] = [
    { key: "number", label: "#", sort: (job) => numbers.get(job.id) ?? 0, cell: (job) => numbers.get(job.id) },
    { key: "date", label: section === "testing" ? "Finished" : "Tested", sort: listedOn, cell: (job) => day(listedOn(job)) || <span className="route-muted">-</span>, filter: { kind: "date", date: (job) => listedOn(job) || undefined } },
    { key: "pjo", label: "PJO no.", sort: (job) => packingNumber(job), cell: (job) => <strong>{packingNumber(job)}</strong>, filter: { kind: "text", text: (job) => packingNumber(job) } },
    { key: "product", label: "Product", sort: (job) => details(job).product, cell: (job) => details(job).product, filter: { kind: "text", text: (job) => details(job).product } },
    { key: "batch", label: "Batch no.", sort: (job) => job.batchNumber ?? "", cell: (job) => job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Not keyed in</span>, filter: { kind: "text", text: (job) => job.batchNumber ?? "" } },
    { key: "job", label: "Job order no.", sort: (job) => job.number, cell: (job) => job.number, filter: { kind: "text", text: (job) => job.number } },
    { key: "po", label: "PO", sort: (job) => details(job).order?.poNumber ?? "", cell: (job) => { const { order } = details(job); return <>{order?.poNumber ?? "-"}{order?.customerName ? <small>{order.customerName}</small> : null}</>; }, filter: { kind: "text", text: (job) => { const { order } = details(job); return `${order?.poNumber ?? ""} ${order?.customerName ?? ""}`; } } },
    { key: "output", label: "Final output", numeric: true, sort: (job) => details(job).output?.quantity ?? -1, cell: (job) => { const { output } = details(job); return output ? `${amount(output.quantity)} ${output.uom}` : "-"; } },
    { key: "yield", label: "Final yield", numeric: true, sort: (job) => yieldOf(job).final?.percent ?? -1, cell: finalYieldCell },
    { key: "status", label: section === "testing" ? "Status" : "Testing result", sort: statusOf, filter: { kind: "select", options: section === "testing" ? ["Awaiting testing", "Under investigation"] : ["Passed", "Failed testing"], value: statusOf },
      cell: (job) => section === "testing"
        ? testResult(job) === "Under investigation" ? <><span className="badge warning">Under investigation</span><small>since {day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></> : <span className="badge neutral">Awaiting testing</span>
        : <>{testResult(job) === "Failed" ? <span className="badge danger">Failed testing</span> : <span className="badge success">Passed</span>}<small>{day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></> },
    ...(section === "release" ? [{ key: "released", label: "Release quantity", numeric: true, sort: (job: JobOrder) => jobParts(job).filter((part) => releaseFor(job, part.orderId)).length,
      cell: (job: JobOrder) => testResult(job) === "Failed" ? <span className="route-muted">Not for release</span> : (() => {
        const parts = jobParts(job), done = parts.filter((part) => releaseFor(job, part.orderId)).length;
        return parts.length > 1 || done ? <span>{done} of {parts.length} POs released</span> : <span className="route-muted">Not released</span>;
      })() }] : [])
  ];
  const sorter = columns.find((column) => column.key === sort.key) ?? columns[0];
  const filtering = Object.values(filters).some((value) => value.trim());
  const table = rows.filter((job) => columns.every((column) => {
    const value = filters[column.key]?.trim().toLowerCase();
    if (!value || !column.filter) return true;
    if (column.filter.kind === "date") return matchesDateFilter(column.filter.date(job), value);
    return column.filter.kind === "text" ? column.filter.text(job).toLowerCase().includes(value) : column.filter.value(job).toLowerCase() === value;
  }) && (!filters.remarks?.trim() || (job.notes ?? "").toLowerCase().includes(filters.remarks.trim().toLowerCase()))).sort((a, b) => {
    const x = sorter.sort(a), y = sorter.sort(b);
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (result || (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0)) * (sort.ascending ? 1 : -1);
  });
  const { rows: page, pager } = usePager(table, `${section}|${JSON.stringify(filters)}|${sort.key}|${sort.ascending}`, [50, 100]);
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
    <div className="orders-table-scroll status-table-scroll" tabIndex={0} role="region" aria-label={`${section === "testing" ? "Testing" : "Release"} list`}>
      <table className="orders-table status-table">
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.ascending ? ArrowUp : ArrowDown;
              return <th scope="col" key={column.key} data-col={column.key} className={column.numeric ? "numeric" : undefined} aria-sort={active ? sort.ascending ? "ascending" : "descending" : "none"}>
                <button type="button" className="table-sort" title={column.key === "number" ? active && !sort.ascending ? "Newest first, click for oldest first" : "Oldest first, click for newest first" : `Sort by ${column.label.toLowerCase()}`}
                  onClick={() => chooseSort({ key: column.key, ascending: active ? !sort.ascending : column.key !== "number" && column.key !== "date" })}>{column.label}<Icon size={13} /></button>
              </th>;
            })}
            <th scope="col" data-col="action"><span className="admin-sr-only">Action</span></th>
            <th scope="col" data-col="remarks">Remarks</th>
          </tr>
          <tr className="orders-filter-row">
            {columns.map((column) => <th scope="col" key={column.key} data-col={column.key}>
              {column.filter?.kind === "text" ? <input type="search" aria-label={`Search ${column.label}`} placeholder="Search" value={filters[column.key] ?? ""} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })} /> : null}
              {column.filter?.kind === "date" ? (() => { const date = column.filter.date; return <DateFilterPicker label={column.label} value={filters[column.key] ?? ""} dates={rows.map((job) => date(job))} onChange={(value) => setFilters({ ...filters, [column.key]: value })} />; })() : null}
              {column.filter?.kind === "select" ? <select aria-label={`Filter ${column.label}`} value={filters[column.key] ?? ""} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })}><option value="">All</option>{column.filter.options.map((option) => <option key={option}>{option}</option>)}</select> : null}
            </th>)}
            <th scope="col" data-col="action">{filtering ? <button type="button" className="calendar-button" onClick={() => setFilters({})}><X size={14} />Clear</button> : null}</th>
            <th scope="col" data-col="remarks"><input type="search" aria-label="Search remarks" placeholder="Search" value={filters.remarks ?? ""} onChange={(event) => setFilters({ ...filters, remarks: event.target.value })} /></th>
          </tr>
        </thead>
        <tbody>
          {!table.length ? <tr><td colSpan={columns.length + 2} className="empty-state">{rows.length ? "No batches match these filters." : section === "testing" ? "No batches waiting for testing." : "No batches waiting for release."}</td></tr> : null}
          {page.map((job) => <Fragment key={job.id}>
            <tr>
              {columns.map((column) => <td key={column.key} data-col={column.key} className={column.numeric ? "numeric" : undefined}>{column.cell(job)}</td>)}
              <td data-col="action">{section === "testing"
                ? access.passTesting ? <span className="status-actions">
                  <button type="button" className="primary-button" onClick={() => report(onTest(job.id, "Passed"), `${packingNumber(job)} passed testing and moved to Release.`)}><CheckCircle2 size={16} />Pass</button>
                  <button type="button" className="calendar-button danger-button" onClick={() => { if (window.confirm(`Mark ${packingNumber(job)} as failed testing? It goes to Release for QA to reject.`)) report(onTest(job.id, "Failed"), `${packingNumber(job)} failed testing and moved to Release, for QA to reject.`); }}><XCircle size={16} />Failed</button>
                  {testResult(job) !== "Under investigation" ? <button type="button" className="calendar-button" onClick={() => report(onTest(job.id, "Under investigation"), `${packingNumber(job)} is under investigation. Pass or fail it when the result is known.`)}><Search size={16} />Under investigation</button> : null}
                </span> : null
                : access.release && testResult(job) === "Failed" ? <button type="button" className="calendar-button danger-button" onClick={() => { if (window.confirm(`Reject ${packingNumber(job)}? It failed testing and will be closed as rejected.`)) report(onReject(job.id), `${packingNumber(job)} rejected.`); }}><XCircle size={16} />Rejected</button>
                : access.release ? <button type="button" className={releasing === job.id ? "calendar-button" : "primary-button"} aria-expanded={releasing === job.id} onClick={() => setReleasing(releasing === job.id ? null : job.id)}>
                  <PackageCheck size={16} />{releasing === job.id ? "Close" : "Release"}</button> : null}</td>
              <td data-col="remarks">{job.notes ? <span className="cell-clamp" title={job.notes}>{job.notes}</span> : <span className="route-muted">-</span>}</td>
            </tr>
            {releasing === job.id && section === "release" && testResult(job) !== "Failed" ? <tr className="release-panel-row"><td colSpan={columns.length + 2}>
              <ReleasePanel job={job} orders={orders} lines={lines} transfers={transfers} directory={directory} formulaWaiting={formulaPending(job, orders)}
                onRelease={(entries, text) => { const errors = onRelease(job.id, entries); report(errors, text); if (!errors.length && entries.length === jobParts(job).filter((part) => !releaseFor(job, part.orderId)).length) setReleasing(null); return errors; }} />
            </td></tr> : null}
          </Fragment>)}
        </tbody>
      </table>
    </div>
    {pager}
    {printing && typeof document !== "undefined" ? createPortal(<section className="calendar-print-sheet print-orders" aria-hidden="true">
      <header><h1>{section === "testing" ? "Testing" : "Release"} list</h1><p>{table.length} batch{table.length === 1 ? "" : "es"} pending{filtering ? " (filtered)" : ""} · printed {formatDateTime(new Date())}</p></header>
      <table className="print-orders-table">
        <thead><tr><th>#</th><th>PJO no.</th><th>Product</th><th>Batch no.</th><th>Job order no.</th><th>PO</th><th>Final output</th><th>Final yield</th>{section === "testing" ? <><th>Finished</th><th>Status</th></> : <><th>Passed testing</th><th>Release quantity</th></>}<th>Remarks</th></tr></thead>
        <tbody>{table.map((job, index) => { const { order, product, output } = details(job); return <tr key={job.id}>
          <td>{index + 1}</td><td>{packingNumber(job)}</td><td>{product}</td><td>{job.batchNumber ?? ""}</td><td>{job.number}</td><td>{order?.poNumber ?? ""}</td><td>{output ? `${amount(output.quantity)} ${output.uom}` : ""}</td><td>{yieldText(job)}</td>
          {section === "testing" ? <><td>{day(finishedOn(job, lines, transfers))}</td><td>{testResult(job) ?? "Awaiting testing"}</td></> : <><td>{day(job.testedAt)}</td><td>{quantities[job.id] ?? (output ? amount(output.quantity) : "")} {output?.uom ?? ""}</td></>}
          <td>{job.notes ?? ""}</td>
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
  const [fill, setFill] = useState(text(limits.fillTolerance));
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
    <p className="orders-help">The acceptable yield at each process, as a % of theoretical (what it made against what the batch formula gives at that process with no loss, as in the batch record), and for the batch's final yield. Results within range show green, within reach of a limit amber, outside red. When a process comes out outside its range, production adds a deviation note as they save it. The step yield (against what the process before handed over) is shown beside it to find where a loss happened; it has no limits. Capsules weighed with their empty shell also show their average net fill, in bold red when it is further from target than the tolerance below.</p>
    {message ? <p role={message.error ? "alert" : "status"} className={message.error ? undefined : "calendar-notice"}>{message.text}</p> : null}
    <div className="orders-table-scroll" role="region" aria-label="Yield limits">
      <table className="orders-table yield-limits-table">
        <thead><tr><th scope="col">Process</th><th scope="col" className="numeric">Minimum</th><th scope="col" className="numeric">Maximum</th><th scope="col">Acceptable range</th></tr></thead>
        <tbody>
          {processes.map((process) => row(process.id, process.name, "% of theoretical"))}
          <tr className="yield-limits-final-gap"><td colSpan={4} /></tr>
          {row("final", "Final yield", "Last stage's good output ÷ batch quantity")}
          <tr className="yield-limits-final-gap"><td colSpan={4} /></tr>
          <tr><th scope="row">Capsule fill weight<small>Average net fill (filled capsule less the empty shell) against the unit weight on the PO</small></th>
            <td className="numeric" colSpan={2}><span className="yield-limit-input">± <input type="number" min="0.1" max="50" step="0.1" disabled={!editable} aria-label="Capsule fill weight tolerance %" value={fill} placeholder={String(DEFAULT_FILL_TOLERANCE)} onChange={(event) => setFill(event.target.value)} />%</span></td>
            <td>{fill.trim() ? `Within ±${Number(fill)}% of target` : <span className="route-muted">±{DEFAULT_FILL_TOLERANCE}% until set</span>}. Beyond it shows in bold red.</td></tr>
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
      const tolerance = read(fill);
      if (tolerance !== undefined && (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 50)) { setMessage({ text: "Capsule fill weight: the tolerance is a percentage above 0, up to 50.", error: true }); return; }
      const next: YieldLimits = { byProcess: Object.fromEntries(processes.map((process) => [process.id, range(process.id)]).filter(([, value]) => Object.keys(value as object).length)), ...(Object.keys(range("final")).length ? { final: range("final") } : {}), ...(tolerance !== undefined ? { fillTolerance: tolerance } : {}) };
      const errors = onSave(next);
      setMessage(errors.length ? { text: errors.join(" "), error: true } : { text: "Yield limits saved. Results across the scheduler follow them now.", error: false });
    }}>Save yield limits</button></div> : <p className="route-muted">Only QA can change these limits.</p>}
  </section>;
}

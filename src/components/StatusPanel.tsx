"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, PackageCheck, Printer, Search, XCircle } from "lucide-react";
import type { PlanLine, Product } from "@/lib/domain/types";
import { finalOutput, finishedOn, packingNumber, releaseQueue, testingQueue, testResult, type JobOrder, type TestResult } from "@/lib/services/jobOrders";
import type { PurchaseOrder } from "@/lib/services/orders";

export type StatusSection = "testing" | "release";
export type StatusAccess = { viewTesting: boolean; passTesting: boolean; printTesting: boolean; viewRelease: boolean; release: boolean; printRelease: boolean };

const day = (value?: string) => value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });

/**
 * Status: finished batches through testing and release. Testing lists each job order with final
 * output not yet passed; Pass moves it to Release. Release lists passed batches with the release
 * quantity (the final output, which can be changed); Release completes it. Only pending work shows.
 */
export function StatusPanel({ jobOrders, orders, products, lines, transfers, access, section: chosen, onSection, onTest, onRelease, onReject }: {
  jobOrders: JobOrder[]; orders: PurchaseOrder[]; products: Product[]; lines: PlanLine[]; transfers: { sourceLineId: string }[];
  access: StatusAccess;
  // The section picked under QA/QC in the sidebar.
  section: StatusSection; onSection?: (section: StatusSection) => void;
  onTest: (jobId: string, result: TestResult) => string[];
  onRelease: (jobId: string, quantity: number, uom: string) => string[];
  onReject: (jobId: string) => string[];
}) {
  // A section the person may not see falls back to the one they may.
  const section: StatusSection = chosen === "release" ? access.viewRelease ? "release" : "testing" : access.viewTesting ? "testing" : "release";
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [printing, setPrinting] = useState(0);
  useEffect(() => { if (printing) window.print(); }, [printing]);
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
    <div className="orders-table-scroll" tabIndex={0} role="region" aria-label={`${section === "testing" ? "Testing" : "Release"} list`}>
      <table className="job-order-table status-table">
        <thead><tr>
          <th scope="col">PJO no.</th><th scope="col">Product</th><th scope="col">Batch no.</th><th scope="col">Job order no.</th><th scope="col">PO</th>
          <th scope="col" className="numeric">Final output</th>
          {section === "testing" ? <><th scope="col">Finished</th><th scope="col">Status</th></> : <><th scope="col">Testing result</th><th scope="col" className="numeric">Release quantity</th></>}
          <th scope="col"><span className="admin-sr-only">Action</span></th>
        </tr></thead>
        <tbody>
          {!rows.length ? <tr><td colSpan={9} className="empty-state">{section === "testing" ? "No batches waiting for testing." : "No batches waiting for release."}</td></tr> : null}
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
              {section === "testing" ? <><td>{day(finishedOn(job, lines, transfers))}</td>
                <td>{testResult(job) === "Under investigation" ? <><span className="badge warning">Under investigation</span><small>since {day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></> : <span className="badge neutral">Awaiting testing</span>}</td></> : <>
                <td>{testResult(job) === "Failed" ? <span className="badge danger">Failed testing</span> : <span className="badge success">Passed</span>}<small>{day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></td>
                <td className="numeric">{testResult(job) === "Failed" ? <span className="route-muted">Not for release</span> : <><span className="status-release-qty"><input type="number" min="0" step="any" aria-label={`Release quantity for ${packingNumber(job)}`} disabled={!access.release} value={typed}
                  onChange={(event) => setQuantities({ ...quantities, [job.id]: event.target.value })} /> {output?.uom ?? ""}</span>
                  {output && typed !== "" && Number(typed) !== output.quantity ? <small className="order-warning">Final output is {amount(output.quantity)}</small> : null}</>}</td>
              </>}
              <td>{section === "testing"
                ? access.passTesting ? <span className="status-actions">
                  <button type="button" className="primary-button" onClick={() => report(onTest(job.id, "Passed"), `${packingNumber(job)} passed testing and moved to Release.`)}><CheckCircle2 size={16} />Pass</button>
                  <button type="button" className="calendar-button danger-button" onClick={() => { if (window.confirm(`Mark ${packingNumber(job)} as failed testing? It goes to Release for QA to reject.`)) report(onTest(job.id, "Failed"), `${packingNumber(job)} failed testing and moved to Release, for QA to reject.`); }}><XCircle size={16} />Failed</button>
                  {testResult(job) !== "Under investigation" ? <button type="button" className="calendar-button" onClick={() => report(onTest(job.id, "Under investigation"), `${packingNumber(job)} is under investigation. Pass or fail it when the result is known.`)}><Search size={16} />Under investigation</button> : null}
                </span> : null
                : access.release && testResult(job) === "Failed" ? <button type="button" className="calendar-button danger-button" onClick={() => { if (window.confirm(`Reject ${packingNumber(job)}? It failed testing and will be closed as rejected.`)) report(onReject(job.id), `${packingNumber(job)} rejected.`); }}><XCircle size={16} />Rejected</button>
                : access.release ? <button type="button" className="primary-button" onClick={() => {
                  if (typed.trim() === "") { report(["Enter the release quantity."], ""); return; }
                  report(onRelease(job.id, Number(typed), output?.uom ?? job.releaseUom ?? ""), `${packingNumber(job)} released: ${amount(Number(typed))} ${output?.uom ?? ""}.`);
                }}><PackageCheck size={16} />Release</button> : null}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    {printing && typeof document !== "undefined" ? createPortal(<section className="calendar-print-sheet print-orders" aria-hidden="true">
      <header><h1>{section === "testing" ? "Testing" : "Release"} list</h1><p>{rows.length} batch{rows.length === 1 ? "" : "es"} pending · printed {new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></header>
      <table className="print-orders-table">
        <thead><tr><th>PJO no.</th><th>Product</th><th>Batch no.</th><th>Job order no.</th><th>PO</th><th>Final output</th>{section === "testing" ? <><th>Finished</th><th>Status</th></> : <><th>Passed testing</th><th>Release quantity</th></>}</tr></thead>
        <tbody>{rows.map((job) => { const { order, product, output } = details(job); return <tr key={job.id}>
          <td>{packingNumber(job)}</td><td>{product}</td><td>{job.batchNumber ?? ""}</td><td>{job.number}</td><td>{order?.poNumber ?? ""}</td><td>{output ? `${amount(output.quantity)} ${output.uom}` : ""}</td>
          {section === "testing" ? <><td>{day(finishedOn(job, lines, transfers))}</td><td>{testResult(job) ?? "Awaiting testing"}</td></> : <><td>{day(job.testedAt)}</td><td>{quantities[job.id] ?? (output ? amount(output.quantity) : "")} {output?.uom ?? ""}</td></>}
        </tr>; })}</tbody>
      </table>
    </section>, document.body) : null}
  </section>;
}

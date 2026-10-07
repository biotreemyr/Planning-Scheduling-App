"use client";
import { useEffect, useState } from "react";
import { FileSpreadsheet, RotateCw, X } from "lucide-react";
import type { HistoryEntry, HistoryKind } from "@/lib/services/history";

type Row = { key: string; at: string; by: string; kind: HistoryKind; po: string; job: string; batch: string; product: string; text: string };
const KINDS: HistoryKind[] = ["PO", "Customer", "Job order", "Planning", "Production", "Transfer", "Machine booking", "Setup"];
const when = (iso: string) => iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") : "-";

/**
 * Every transaction since the scheduler started, newest first: when, who, what kind, the PO, job
 * order and batch it concerns, and what changed. Search by any of them to trace one batch.
 */
export function HistoryPanel({ refreshKey }: { refreshKey: string }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [month, setMonth] = useState("");
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    fetch("/api/history", { cache: "no-store" }).then(async (result) => {
      const body = await result.json();
      if (cancelled) return;
      if (!result.ok) { setError(body.error ?? "The history could not be loaded."); return; }
      setEntries(body.entries);
    }).catch(() => { if (!cancelled) setError("The history could not be loaded. Check the connection and try again."); });
    return () => { cancelled = true; };
  }, [loads, refreshKey]);

  const rows: Row[] = (entries ?? []).flatMap((entry) => entry.changes.map((change, index) => ({
    key: `${entry.revision}-${index}`, at: entry.at, by: entry.by, kind: change.kind, po: change.po ?? "", job: change.job ?? "", batch: change.batch ?? "", product: change.product ?? "", text: change.text
  })));
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((row) => (!kind || row.kind === kind) && (!month || row.at.slice(0, 7) === month)
    && words.every((word) => `${row.po} ${row.job} ${row.batch} ${row.product} ${row.text} ${row.by}`.toLowerCase().includes(word)));
  const filtering = !!(query || kind || month);

  async function download() {
    const excel = await import("exceljs");
    const ExcelJS = (excel as unknown as { default?: typeof excel }).default ?? excel;
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Transactions", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Date & time", key: "at", width: 18 }, { header: "By", key: "by", width: 18 }, { header: "Type", key: "kind", width: 14 },
      { header: "PO number", key: "po", width: 18 }, { header: "Job order", key: "job", width: 14 }, { header: "Batch no.", key: "batch", width: 14 },
      { header: "Product", key: "product", width: 32 }, { header: "Change", key: "text", width: 80 }
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of shown) sheet.addRow({ ...row, at: row.at ? new Date(row.at) : "" }).getCell("at").numFmt = "dd-mm-yyyy hh:mm";
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
    sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" };
    const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `scheduler-history-${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="workspace-panel history-panel">
    <div className="panel-title"><h2>Transaction history <span className="badge neutral">{rows.length}</span></h2>
      <div className="calendar-navigation">
        <button type="button" className="calendar-button" onClick={() => setLoads((value) => value + 1)}><RotateCw size={15} />Refresh</button>
        <button type="button" className="calendar-button" disabled={!shown.length} onClick={() => void download()}><FileSpreadsheet size={15} />Download Excel</button>
      </div>
    </div>
    <p className="orders-help">Every change saved in the scheduler, newest first. Search a PO, job order or batch number to trace it from order to production.</p>
    <div className="orders-toolbar">
      <label className="planning-search">Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="PO, job order, batch number, product or person" /></label>
      <label>Type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">All types</option>{KINDS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
      {filtering ? <button type="button" className="calendar-button" onClick={() => { setQuery(""); setKind(""); setMonth(""); }}><X size={15} />Clear</button> : null}
      <span className="result-count" aria-live="polite">{shown.length} of {rows.length} changes</span>
    </div>
    {error ? <p role="alert">{error}</p> : null}
    {!entries && !error ? <p role="status">Loading history…</p> : null}
    {entries ? <div className="orders-table-scroll" tabIndex={0} role="region" aria-label="Transaction history">
      <table className="orders-table history-table">
        <thead><tr><th scope="col">Date &amp; time</th><th scope="col">By</th><th scope="col">Type</th><th scope="col">PO number</th><th scope="col">Job order</th><th scope="col">Batch no.</th><th scope="col">Change</th></tr></thead>
        <tbody>
          {!shown.length ? <tr><td colSpan={7} className="empty-state">{rows.length ? "No changes match these filters." : "No changes saved yet."}</td></tr> : null}
          {shown.map((row) => <tr key={row.key}>
            <td className="history-when">{when(row.at)}</td><td>{row.by}</td><td><span className="badge neutral">{row.kind}</span></td>
            <td>{row.po ? <button type="button" className="history-link" onClick={() => setQuery(row.po)}>{row.po}</button> : "-"}</td>
            <td>{row.job ? <button type="button" className="history-link" onClick={() => setQuery(row.job)}>{row.job}</button> : "-"}</td>
            <td>{row.batch ? <button type="button" className="history-link" onClick={() => setQuery(row.batch)}>{row.batch}</button> : "-"}</td>
            <td>{row.text}</td>
          </tr>)}
        </tbody>
      </table>
    </div> : null}
  </section>;
}

"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Columns3, Plus, Printer, Trash2, X } from "lucide-react";
import { nextBatchLabel, type NewBatch } from "@/lib/services/planChanges";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import { localDateKey } from "@/lib/services/calendarPrint";
import { nextOrderNumber, nextPoItem, poItem, poItems, poLabel, orderBatchMatrix, orderColor, orderInMonth, orderNumbers, orderProcessRows, orderProgress, validateOrder, type BatchCell, type MonthBasis, type OrderProcessRow, type OrderProgress, type OrderStatus, type PurchaseOrder } from "@/lib/services/orders";
import { ProductSelect } from "./ProductSelect";
import { useUoms } from "./MeasurementSettings";
import { OrderBadge } from "./OrderBadge";
import { PRODUCT_FORMATS, inferFormat, routeLabel, type FlowWarning, type ProductFormat } from "@/lib/services/processRules";

const displayDate = (value: string) => value.split("-").reverse().join("-");
const statuses: OrderStatus[] = ["Not scheduled", "Scheduled", "In production", "Completed"];
const statusBadge: Record<OrderStatus, string> = { "Not scheduled": "neutral", Scheduled: "info", "In production": "warning", Completed: "success" };

export function OrdersPanel({ orders, lines, products, directory, visibleCalendarIds, editable, userName, onSave, onAdd, onDelete, flow = [], canAddBatch = false, onAddBatch }: {
  orders: PurchaseOrder[]; lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[]; flow?: FlowWarning[];
  canAddBatch?: boolean; onAddBatch?: (orderId: string, batch: NewBatch) => string[];
  editable: boolean; userName: string; onSave: (order: PurchaseOrder) => string[]; onAdd: (items: PurchaseOrder[]) => string[]; onDelete: (id: string) => string[];
}) {
  const customers = [...new Set(orders.map((order) => order.customerName?.trim()).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  return <section className="orders-layout">
    {editable ? <NewOrderForm orders={orders} products={products} customers={customers} userName={userName} onAdd={onAdd} /> : null}
    <OrdersTable orders={orders} lines={lines} products={products} directory={directory} visibleCalendarIds={visibleCalendarIds} editable={editable} customers={customers} onSave={onSave} onDelete={onDelete} flow={flow} canAddBatch={canAddBatch && !!onAddBatch} onAddBatch={onAddBatch ?? (() => [])} />
  </section>;
}

type DraftItem = { key: string; productId: string; uom: string; format: ProductFormat | "" };
const draftItem = (): DraftItem => ({ key: crypto.randomUUID(), productId: "", uom: "", format: "" });

// One PO keyed in once: customer and PO number, then as many product line items as it lists.
// Typing an existing PO number of the same customer adds further items to that PO.
function NewOrderForm({ orders, products, customers, userName, onAdd }: { orders: PurchaseOrder[]; products: Product[]; customers: string[]; userName: string; onAdd: (items: PurchaseOrder[]) => string[] }) {
  const uoms = useUoms();
  const [items, setItems] = useState<DraftItem[]>(() => [draftItem()]);
  const [poNumber, setPoNumber] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const existing = poNumber.trim() ? poItems(poNumber, orders) : [];
  const firstItem = nextPoItem(poNumber, orders);
  const update = (key: string, change: Partial<DraftItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  const formatOf = (item: DraftItem) => item.format || inferFormat(products.find((product) => product.id === item.productId));
  return <form key={version} className="workspace-panel orders-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const createdAt = new Date().toISOString();
    let number = nextOrderNumber(orders);
    const built: PurchaseOrder[] = items.map((item, index) => ({
      id: `order-${crypto.randomUUID()}`, number: number++, item: firstItem + index, format: formatOf(item),
      customerName: String(data.get("customer")).trim(), poNumber: poNumber.trim(), productId: item.productId,
      quantity: Number(data.get(`quantity-${item.key}`)), uom: item.uom || (products.find((product) => product.id === item.productId)?.uom ?? ""),
      expectedDates: {}, createdAt, createdBy: userName
    }));
    const result = onAdd(built);
    setErrors(result);
    if (!result.length) {
      const range = built.length === 1 ? `order ${built[0].number}` : `orders ${built[0].number}-${built.at(-1)!.number}`;
      setNotice(`${built[0].poNumber} for ${built[0].customerName}: ${built.length} item${built.length === 1 ? "" : "s"} added as ${range}.`);
      setItems([draftItem()]); setPoNumber(""); setVersion((value) => value + 1);
    }
  }}>
    <h2>New order</h2>
    <label>Customer name<input name="customer" required maxLength={120} list="order-customers" placeholder="Type or choose a customer" defaultValue={existing[0]?.customerName} key={existing[0]?.id ?? "new"} /></label>
    <datalist id="order-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
    <label>PO number<input name="po" required maxLength={60} placeholder="e.g. PO-2610-140" value={poNumber} onChange={(event) => setPoNumber(event.target.value)} /></label>
    {existing.length ? <p className="orders-help" role="status">{existing[0].poNumber} already has {existing.length} item{existing.length === 1 ? "" : "s"}{existing[0].customerName ? ` for ${existing[0].customerName}` : ""}. These are added as item {firstItem}{items.length > 1 ? ` to ${firstItem + items.length - 1}` : ""}.</p> : null}
    <fieldset className="order-items">
      <legend>Line items <span className="badge neutral">{items.length}</span></legend>
      {items.map((item, index) => {
        const productUom = products.find((product) => product.id === item.productId)?.uom ?? "";
        const format = formatOf(item);
        return <div className="order-item" key={item.key} role="group" aria-label={`Item ${firstItem + index}`}>
          <div className="order-item-head"><strong>Item {firstItem + index}</strong>
            {items.length > 1 ? <button type="button" className="icon-button" aria-label={`Remove item ${firstItem + index}`} title="Remove this item" onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}><Trash2 size={15} /></button> : null}
          </div>
          <ProductSelect products={products} name={`product-${item.key}`} value={item.productId} onChange={(id) => update(item.key, { productId: id, uom: "", format: "" })} />
          <label title={routeLabel(format)}>Format<select value={format} onChange={(event) => update(item.key, { format: event.target.value as ProductFormat })}>{PRODUCT_FORMATS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <div className="quantity-fields"><label>Quantity<input name={`quantity-${item.key}`} type="number" min="1" step="any" required /></label>
            <label>UOM<select value={item.uom || productUom} onChange={(event) => update(item.key, { uom: event.target.value })} required>{!productUom && !item.uom ? <option value="">Select</option> : null}{[...new Set([productUom, ...uoms.filter((unit) => unit.active).map((unit) => unit.name)].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
          <small className="route-muted">Route: {routeLabel(format)}</small>
        </div>;
      })}
      <button type="button" className="calendar-button" onClick={() => setItems((current) => [...current, draftItem()])}><Plus size={16} />Add another product</button>
    </fieldset>
    <button type="submit" className="primary-button"><Plus size={17} />{items.length > 1 ? `Add PO with ${items.length} items` : "Add order"}</button>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {notice && !errors.length ? <p role="status">{notice}</p> : null}
    <p className="orders-help">Each product on the PO becomes its own numbered order with its own colour, route and batches. Link plan activities to an item when you add or open them on the Planner Board.</p>
  </form>;
}

type Row = { order: PurchaseOrder; number: number; rows: OrderProcessRow[]; product?: Product; progress: OrderProgress; format: ProductFormat; warnings: FlowWarning[] };
type Column = {
  key: string; label: string; numeric?: boolean; required?: boolean;
  sort: (row: Row) => string | number; cell: (row: Row) => ReactNode;
  filter?: { kind: "text"; text: (row: Row) => string } | { kind: "select"; options: string[]; value: (row: Row) => string };
};
const COLUMN_STORAGE = "scheduler.orderColumns";

function OrdersTable({ orders, lines, products, directory, visibleCalendarIds, editable, customers, onSave, onDelete, flow, canAddBatch, onAddBatch }: {
  flow: FlowWarning[]; canAddBatch: boolean; onAddBatch: (orderId: string, batch: NewBatch) => string[];
  orders: PurchaseOrder[]; lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[];
  editable: boolean; customers: string[]; onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const today = localDateKey(new Date());
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; ascending: boolean }>({ key: "number", ascending: true });
  const [month, setMonth] = useState("");
  const [basis, setBasis] = useState<MonthBasis>("scheduled");
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // What the print sheet shows: the filtered order list, or one order in depth.
  const [print, setPrint] = useState<{ orderId?: string; request: number }>({ request: 0 });
  useEffect(() => { if (print.request) window.print(); }, [print.request]);
  // Column choice is a per-viewer convenience; storage may be unavailable.
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE) ?? "[]"); if (Array.isArray(saved)) setHidden(saved.filter((key) => typeof key === "string")); } catch { /* keep defaults */ } }, []);
  function toggleColumn(key: string) {
    const next = hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key];
    setHidden(next);
    try { localStorage.setItem(COLUMN_STORAGE, JSON.stringify(next)); } catch { /* not persisted */ }
  }
  const columns: Column[] = [
    { key: "number", label: "#", required: true, sort: (row) => row.number, cell: (row) => <span className="order-number-cell" style={{ "--order-color": orderColor(row.number) } as React.CSSProperties}><OrderBadge number={row.number} poNumber={row.order.poNumber} /></span> },
    { key: "customer", label: "Customer", sort: (row) => row.order.customerName ?? "", cell: (row) => row.order.customerName || <span className="route-muted">Not set</span>, filter: { kind: "text", text: (row) => row.order.customerName ?? "" } },
    { key: "po", label: "PO number", required: true, sort: (row) => `${row.order.poNumber}#${String(poItem(row.order)).padStart(4, "0")}`, cell: (row) => <><strong>{row.order.poNumber}</strong>{poItems(row.order.poNumber, orders).length > 1 ? <small>Item {poItem(row.order)} of {poItems(row.order.poNumber, orders).length}</small> : null}</>, filter: { kind: "text", text: (row) => row.order.poNumber } },
    { key: "product", label: "Product", sort: (row) => row.product?.name ?? "", cell: (row) => row.product?.name ?? "Unknown product", filter: { kind: "text", text: (row) => `${row.product?.name ?? ""} ${row.product?.sku ?? ""}` } },
    { key: "format", label: "Format", sort: (row) => row.format, cell: (row) => <span title={routeLabel(row.format)}>{row.format}</span>, filter: { kind: "select", options: [...PRODUCT_FORMATS], value: (row) => row.format } },
    { key: "quantity", label: "Order qty", numeric: true, sort: (row) => row.order.quantity, cell: (row) => `${row.order.quantity.toLocaleString()} ${row.order.uom}` },
    { key: "progress", label: "Progress", sort: (row) => row.progress.batchCount ? row.progress.batchesFinished / row.progress.batchCount : -1, cell: (row) => <>
      <div className="order-steps" role="img" aria-label={row.rows.map((item) => `${item.processName} ${Math.round(item.completedCount / item.lineCount * 100)}%`).join(", ")}>
        {row.rows.map((item) => <i key={item.calendar.id} title={`${item.processName}: ${item.completedCount} of ${item.lineCount} days complete`} style={{ "--filled": `${item.completedCount / item.lineCount * 100}%` } as React.CSSProperties} />)}
      </div>
      <small>{progressText(row.progress)}</small></> },
    { key: "finished", label: "Finished", numeric: true, sort: (row) => row.progress.percent, cell: (row) => row.progress.finishedQuantity ? <>{row.progress.finishedQuantity.toLocaleString()}<small>{row.progress.percent}% of order</small></> : "-" },
    { key: "expected", label: "Expected completion", sort: (row) => row.progress.expectedDate ?? "9999", cell: (row) => <>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : <span className="route-muted">Not set</span>}{row.progress.overdue ? <span className="badge danger">Overdue</span> : null}</> },
    { key: "status", label: "Status", sort: (row) => statuses.indexOf(row.progress.status), cell: (row) => <><span className={`badge ${statusBadge[row.progress.status]}`}>{row.progress.status}</span>{row.warnings.length ? <span className="badge danger order-warn-badge" title={row.warnings.map((warning) => warning.message).join("\n")}>⚠ {row.warnings.length}</span> : null}</>, filter: { kind: "select", options: statuses, value: (row) => row.progress.status } }
  ];
  const shown = columns.filter((column) => column.required || !hidden.includes(column.key));
  const numbers = orderNumbers(orders);
  const all: Row[] = orders.map((order) => {
    const rows = orderProcessRows(order, lines, directory).filter((row) => visibleCalendarIds.includes(row.calendar.id));
    const product = products.find((item) => item.id === order.productId);
    return { order, number: numbers.get(order.id)!, rows, product, progress: orderProgress(order, rows, today, lines), format: order.format ?? inferFormat(product), warnings: flow.filter((warning) => warning.orderId === order.id) };
  });
  const sorter = columns.find((column) => column.key === sort.key) ?? columns[0];
  const table = all.filter((row) => orderInMonth(row.order, row.rows, row.progress, month, basis) && columns.every((column) => {
    const value = filters[column.key]?.trim().toLowerCase();
    if (!value || !column.filter) return true;
    return column.filter.kind === "text" ? column.filter.text(row).toLowerCase().includes(value) : column.filter.value(row).toLowerCase() === value;
  })).sort((a, b) => {
    const x = sorter.sort(a), y = sorter.sort(b);
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (result || a.order.poNumber.localeCompare(b.order.poNumber)) * (sort.ascending ? 1 : -1);
  });
  const filtering = !!month || Object.values(filters).some((value) => value.trim());
  return <div className="workspace-panel orders-list">
    <div className="panel-title"><h2>Customer orders <span className="badge neutral">{orders.length}</span></h2></div>
    <div className="orders-toolbar">
      <fieldset className="orders-month"><legend>Month</legend>
        <select aria-label="Month based on" value={basis} onChange={(event) => setBasis(event.target.value as MonthBasis)}>
          <option value="scheduled">Scheduled in</option><option value="expected">Expected completion in</option><option value="created">Order created in</option>
        </select>
        <input type="month" aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </fieldset>
      <details className="orders-columns">
        <summary className="calendar-button"><Columns3 size={16} />Columns</summary>
        <div role="group" aria-label="Columns to show">{columns.map((column) => <label key={column.key}><input type="checkbox" disabled={column.required} checked={column.required || !hidden.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}</div>
      </details>
      {filtering ? <button type="button" className="calendar-button" onClick={() => { setFilters({}); setMonth(""); }}><X size={16} />Clear filters</button> : null}
      <button type="button" className="calendar-button" onClick={() => setPrint((current) => ({ request: current.request + 1 }))} title="Print the orders shown, or save as PDF"><Printer size={16} />Print summary</button>
      <span className="result-count" aria-live="polite">{table.length} of {orders.length} orders</span>
    </div>
    <div className="orders-table-scroll" tabIndex={0} role="region" aria-label="Customer orders">
      <table className="orders-table">
        <thead>
          <tr>
            <th scope="col" className="order-toggle-column"><span className="admin-sr-only">Details</span></th>
            {shown.map((column) => {
              const active = sort.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.ascending ? ArrowUp : ArrowDown;
              return <th scope="col" key={column.key} data-col={column.key} className={column.numeric ? "numeric" : undefined} aria-sort={active ? sort.ascending ? "ascending" : "descending" : "none"}>
                <button type="button" className="table-sort" onClick={() => setSort({ key: column.key, ascending: active ? !sort.ascending : true })}>{column.label}<Icon size={13} /></button>
              </th>;
            })}
          </tr>
          <tr className="orders-filter-row">
            <th scope="col"><span className="admin-sr-only">Filters</span></th>
            {shown.map((column) => <th scope="col" key={column.key} data-col={column.key}>
              {column.filter?.kind === "text" ? <input type="search" aria-label={`Search ${column.label}`} placeholder="Search" value={filters[column.key] ?? ""} list={column.key === "customer" ? "order-filter-customers" : undefined} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })} /> : null}
              {column.filter?.kind === "select" ? <select aria-label={`Filter ${column.label}`} value={filters[column.key] ?? ""} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })}><option value="">All</option>{column.filter.options.map((option) => <option key={option}>{option}</option>)}</select> : null}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {!table.length ? <tr><td colSpan={shown.length + 1} className="empty-state">{orders.length ? "No orders match these filters." : "No orders yet. Add a customer, PO number and quantity to start."}</td></tr> : null}
          {table.map((row) => {
            const open = expanded === row.order.id;
            return <Fragment key={row.order.id}>
              <tr className={open ? "order-row open" : "order-row"} style={{ "--order-color": orderColor(row.number) } as React.CSSProperties} onClick={() => setExpanded(open ? null : row.order.id)}>
                <td><button type="button" className="icon-button order-toggle" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${row.order.poNumber} details`} onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : row.order.id); }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                {shown.map((column) => <td key={column.key} data-col={column.key} className={column.numeric ? "numeric" : undefined}>{column.cell(row)}</td>)}
              </tr>
              {open ? <tr className="order-detail-row"><td colSpan={shown.length + 1}><OrderDetail canAddBatch={canAddBatch} onAddBatch={onAddBatch} onPrint={() => setPrint((current) => ({ orderId: row.order.id, request: current.request + 1 }))} order={row.order} format={row.format} warnings={row.warnings} rows={row.rows} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} linked={lines.some((line) => line.productionOrderId === row.order.id)} editable={editable} customers={customers} onSave={onSave} onDelete={(id) => { const result = onDelete(id); if (!result.length) setExpanded(null); return result; }} /></td></tr> : null}
            </Fragment>;
          })}
        </tbody>
      </table>
      <datalist id="order-filter-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
    <OrdersPrint orders={orders} rows={print.orderId ? all.filter((row) => row.order.id === print.orderId) : table} detail={!!print.orderId} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} filtered={table.length !== orders.length} />
  </div>;
}

const progressText = (progress: OrderProgress) => !progress.processCount ? "Not scheduled" : progress.status === "Completed" ? `All ${progress.batchCount} batch${progress.batchCount === 1 ? "" : "es"} finished`
  : `${progress.batchesFinished}/${progress.batchCount} batches finished${progress.nextStep ? ` · ${progress.nextStep.batch} at ${progress.nextStep.processName}` : ""}`;

// Print sheet for the Orders tab: the order list as shown, or one order with its batch grid.
function OrdersPrint({ rows, orders, detail, lines, directory, visibleCalendarIds, filtered }: { rows: Row[]; orders: PurchaseOrder[]; detail: boolean; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; filtered: boolean }) {
  if (typeof document === "undefined") return null;
  const printed = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return createPortal(<section className="calendar-print-sheet print-orders" aria-hidden="true">
    {detail && rows[0] ? <OrderPrintDetail row={rows[0]} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} printed={printed} /> : <>
      <header><h1>Customer orders</h1><p>{rows.length} order{rows.length === 1 ? "" : "s"}{filtered ? " (filtered)" : ""} · printed {printed}</p></header>
      <table className="print-orders-table">
        <thead><tr><th>#</th><th>Customer</th><th>PO number</th><th>Product</th><th>Format</th><th>Order qty</th><th>Progress</th><th>Finished</th><th>Expected completion</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.order.id}>
          <td>{row.number}</td><td>{row.order.customerName ?? ""}</td><td>{poLabel(row.order, orders)}</td><td>{row.product?.name ?? "Unknown product"}</td><td>{row.format}</td>
          <td>{row.order.quantity.toLocaleString()} {row.order.uom}</td><td>{progressText(row.progress)}</td>
          <td>{row.progress.finishedQuantity ? `${row.progress.finishedQuantity.toLocaleString()} (${row.progress.percent}%)` : "-"}</td>
          <td>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : "Not set"}{row.progress.overdue ? " · Overdue" : ""}</td>
          <td>{row.progress.status}{row.warnings.length ? ` · ${row.warnings.length} warning${row.warnings.length === 1 ? "" : "s"}` : ""}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </section>, document.body);
}

function OrderPrintDetail({ row, lines, directory, visibleCalendarIds, printed }: { row: Row; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; printed: string }) {
  const matrix = orderBatchMatrix(row.order, lines, directory, localDateKey(new Date()), visibleCalendarIds);
  const cellText = (cell?: BatchCell) => {
    if (!cell) return "-";
    const dates = cell.firstDate === cell.lastDate ? shortDate(cell.firstDate) : `${shortDate(cell.firstDate)} – ${shortDate(cell.lastDate)}`;
    const status = cell.daysDone === cell.days ? "Done" : cell.late ? "Late" : cell.daysDone ? `In progress ${cell.daysDone}/${cell.days}` : "Planned";
    return <>{dates} · {status}{cell.daysDone ? <><br />{cell.completed.toLocaleString()} made</> : null}</>;
  };
  return <>
    <header><h1>Order {row.number} · {row.order.poNumber}{row.order.item ? ` item ${row.order.item}` : ""}</h1><p>{row.order.customerName ?? ""} · {row.product?.name ?? "Unknown product"} · {row.order.quantity.toLocaleString()} {row.order.uom} · printed {printed}</p></header>
    <p className="print-order-facts">Format: {row.format} ({routeLabel(row.format)}) · Status: {row.progress.status} · {progressText(row.progress)} · Expected completion: {row.progress.expectedDate ? displayDate(row.progress.expectedDate) : "Not set"}{row.progress.overdue ? " (overdue)" : ""}</p>
    {row.warnings.length ? <ul className="print-order-warnings">{row.warnings.map((warning) => <li key={warning.message}>Warning: {warning.message}</li>)}</ul> : null}
    {matrix.rows.length ? <table className="print-orders-table">
      <thead><tr><th>Process</th>{matrix.batches.map((batch) => <th key={batch.key}>{batch.label}<br />{batch.kg !== undefined ? `${batch.kg.toLocaleString("en-MY", { maximumFractionDigits: 2 })} kg · ` : ""}{batch.quantity.toLocaleString()} {batch.uom}</th>)}<th>Summary</th><th>Expected</th></tr></thead>
      <tbody>{matrix.rows.map((process) => <tr key={process.calendar.id}>
        <th>{process.processName}</th>
        {matrix.batches.map((batch) => <td key={batch.key}>{cellText(process.cells[batch.key])}</td>)}
        <td>{process.completed.toLocaleString()} / {process.planned.toLocaleString()} ({process.planned ? Math.min(100, Math.round(process.completed / process.planned * 100)) : 0}%)</td>
        <td>{row.order.expectedDates[process.calendar.id] ? displayDate(row.order.expectedDates[process.calendar.id]) : "-"}</td>
      </tr>)}</tbody>
    </table> : <p>No production has been scheduled against this PO yet.</p>}
  </>;
}

const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function BatchSize({ kg, quantity, uom }: { kg?: number; quantity: number; uom: string }) {
  const mass = ["kg", "g", "mg"].includes(uom);
  if (kg === undefined) return <small>{quantity.toLocaleString()} {uom}</small>;
  return <><small className="batch-kg">{kg.toLocaleString("en-MY", { maximumFractionDigits: 2 })} kg</small>{mass ? null : <small>≈ {quantity.toLocaleString()} {uom}</small>}</>;
}

// One batch's days in one process: dates plus where it stands.
function BatchStatus({ cell, uom }: { cell?: BatchCell; uom: string }) {
  if (!cell) return <span className="route-muted">Not planned</span>;
  const dates = cell.firstDate === cell.lastDate ? shortDate(cell.firstDate) : `${shortDate(cell.firstDate)} – ${shortDate(cell.lastDate)}`;
  const status = cell.daysDone === cell.days ? ["Done", "success"] : cell.late ? ["Late", "danger"] : cell.daysDone ? ["In progress", "warning"] : ["Planned", "neutral"];
  return <div className="batch-cell">
    <span className="batch-dates">{dates}</span>
    <span className={`badge ${status[1]}`}>{status[0]}{cell.days > 1 && cell.daysDone && cell.daysDone < cell.days ? ` ${cell.daysDone}/${cell.days}` : ""}</span>
    {cell.daysDone ? <small>{cell.completed.toLocaleString()} {uom} made</small> : null}
  </div>;
}

function OrderDetail({ order, format, warnings, rows, lines, directory, visibleCalendarIds, linked, editable, customers, onSave, onDelete, canAddBatch, onAddBatch, onPrint }: {
  format: ProductFormat; warnings: FlowWarning[];
  canAddBatch: boolean; onAddBatch: (orderId: string, batch: NewBatch) => string[]; onPrint: () => void;
  order: PurchaseOrder; rows: OrderProcessRow[]; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; linked: boolean; editable: boolean; customers: string[];
  onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const units = new Set(rows.map((row) => row.unitName));
  const matrix = orderBatchMatrix(order, lines, directory, localDateKey(new Date()), visibleCalendarIds);
  const [adding, setAdding] = useState(false);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const lastDate = rows.reduce((latest, row) => row.lastDate > latest ? row.lastDate : latest, "");
  const remaining = Math.max(0, order.quantity - matrix.total.quantity);
  const addButton = canAddBatch ? <button type="button" className="calendar-button order-add-batch" onClick={() => { setAdding(true); setBatchErrors([]); }} title={`Create activities for ${routeLabel(format)}`}><Plus size={15} />Add batch</button> : null;
  return <div className="order-detail">
    <div className="order-detail-head">
      <p className="route-format">Format: <strong>{format}</strong> · {routeLabel(format)}</p>
      <button type="button" className="calendar-button" onClick={onPrint}><Printer size={15} />Print this order</button>
    </div>
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    {rows.length ? <div className="order-batch-scroll"><table className="order-batch-table">
      <thead>
        <tr><th scope="col" rowSpan={2} className="order-batch-process">Process</th><th scope="colgroup" colSpan={matrix.batches.length + 1 + (canAddBatch ? 1 : 0)}>Planned quantity</th><th scope="col" rowSpan={2}>Expected completion</th></tr>
        <tr>
          {matrix.batches.map((batch) => <th scope="col" key={batch.key} className="order-batch-col"><strong>{batch.label}</strong><BatchSize kg={batch.kg} quantity={batch.quantity} uom={batch.uom} /></th>)}
          {canAddBatch ? <th scope="col" className="order-batch-add">{addButton}</th> : null}
          <th scope="col" className="order-batch-summary"><strong>Summary</strong><BatchSize kg={matrix.total.kg} quantity={matrix.total.quantity} uom={order.uom} />{matrix.total.quantity > order.quantity ? <small className="order-warning">More than the {order.quantity.toLocaleString()} ordered</small> : null}</th>
        </tr>
      </thead>
      <tbody>{matrix.rows.map((row) => {
        const lastDate = rows.find((item) => item.calendar.id === row.calendar.id)?.lastDate ?? "";
        const percent = row.planned ? Math.min(100, Math.round(row.completed / row.planned * 100)) : 0;
        return <tr key={row.calendar.id}>
          <th scope="row" className="order-batch-process">{row.processName}{units.size > 1 ? <small>{rows.find((item) => item.calendar.id === row.calendar.id)?.unitName}</small> : null}</th>
          {matrix.batches.map((batch) => <td key={batch.key} className="order-batch-col"><BatchStatus cell={row.cells[batch.key]} uom={batch.uom} /></td>)}
          {canAddBatch ? <td className="order-batch-add" /> : null}
          <td className="order-batch-summary">
            <div className="batch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${row.processName} ${percent}% complete`}><span style={{ width: `${percent}%` }} /></div>
            <small>{row.completed.toLocaleString()} / {row.planned.toLocaleString()} {order.uom} · {percent}%</small>
          </td>
          <td><input type="date" aria-label={`Expected completion for ${row.processName}`} disabled={!editable} value={order.expectedDates[row.calendar.id] ?? ""}
            onChange={(event) => {
              const expectedDates = { ...order.expectedDates };
              if (event.target.value) expectedDates[row.calendar.id] = event.target.value; else delete expectedDates[row.calendar.id];
              setErrors(onSave({ ...order, expectedDates })); setSaved(false);
            }} />{order.expectedDates[row.calendar.id] && order.expectedDates[row.calendar.id] < lastDate ? <small className="order-warning">Before last scheduled day</small> : null}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="order-empty">No production has been scheduled against this PO yet. {addButton}</p>}
    {adding ? <form className="order-batch-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const result = onAddBatch(order.id, { label: String(data.get("label")), quantity: Number(data.get("quantity")), startDate: String(data.get("start")) });
      setBatchErrors(result);
      if (!result.length) setAdding(false);
    }}>
      <h3>Add batch</h3>
      <p>Creates one activity per process ({routeLabel(format)}), one working day each, starting on the date you choose. Drag them in the planner to adjust.</p>
      <p>Ordered {order.quantity.toLocaleString()} {order.uom} · already in batches {matrix.total.quantity.toLocaleString()} · {remaining ? `${remaining.toLocaleString()} still to plan` : "fully planned"}.</p>
      <label>Batch name<input name="label" required defaultValue={nextBatchLabel(order, lines)} /></label>
      <label>Quantity ({order.uom})<input name="quantity" type="number" min="1" step="any" required defaultValue={remaining || matrix.batches.at(-1)?.quantity || ""} /></label>
      <label>Start date<input name="start" type="date" required defaultValue={lastDate || localDateKey(new Date())} /></label>
      <button type="submit" className="primary-button"><Plus size={16} />Create batch</button>
      <button type="button" className="calendar-button" onClick={() => setAdding(false)}>Cancel</button>
      {batchErrors.map((error) => <p role="alert" key={error}>{error}</p>)}
    </form> : null}
    {editable ? <form className="order-edit" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const result = onSave({ ...order, customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), quantity: Number(data.get("quantity")), format: String(data.get("format")) as ProductFormat });
      setErrors(result); setSaved(!result.length);
    }}>
      <label>Customer name<input name="customer" required defaultValue={order.customerName} list={`customers-${order.id}`} /></label>
      <datalist id={`customers-${order.id}`}>{customers.map((name) => <option key={name} value={name} />)}</datalist>
      <label>PO number<input name="po" required defaultValue={order.poNumber} /></label>
      <label>Format<select name="format" defaultValue={format}>{PRODUCT_FORMATS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Quantity ({order.uom})<input name="quantity" type="number" min="1" step="any" required defaultValue={order.quantity} /></label>
      <button type="submit" className="calendar-button">Save order</button>
      {confirming ? <><span>Delete {order.poNumber}?</span><button type="button" className="calendar-button" onClick={() => { setErrors(onDelete(order.id)); setConfirming(false); }}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => setConfirming(false)}>Cancel</button></>
        : <button type="button" className="icon-button danger" title={linked ? "Unlink its activities before deleting" : `Delete ${order.poNumber}`} aria-label={`Delete ${order.poNumber}`} onClick={() => setConfirming(true)}><Trash2 size={16} /></button>}
    </form> : null}
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {saved && !errors.length ? <p role="status">Order saved.</p> : null}
  </div>;
}

"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Columns3, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Customer, PlanLine, Product } from "@/lib/domain/types";
import { type ManualJob, finalOutput, jobsFor, linesForJob, processQuantity, type JobOrder } from "@/lib/services/jobOrders";
import { localDateKey } from "@/lib/services/calendarPrint";
import { nextOrderNumber, nextPoItem, poItem, poItems, poLabel, orderBatchMatrix, orderColor, orderInMonth, orderNumbers, orderProcessRows, orderProgress, validateOrder, type BatchCell, type MonthBasis, type OrderProcessRow, type OrderProgress, type OrderStatus, type PurchaseOrder } from "@/lib/services/orders";
import { ProductSelect } from "./ProductSelect";
import { useUoms } from "./MeasurementSettings";
import { OrderBadge } from "./OrderBadge";
import { PRODUCT_FORMATS, ROUTES, inferFormat, routeLabel, stepLabel, type FlowWarning, type ProductFormat } from "@/lib/services/processRules";

const displayDate = (value: string) => value.split("-").reverse().join("-");
const statuses: OrderStatus[] = ["Not scheduled", "Scheduled", "In production", "Completed"];
const statusBadge: Record<OrderStatus, string> = { "Not scheduled": "neutral", Scheduled: "info", "In production": "warning", Completed: "success" };

export type JobActions = {
  canCreate: boolean;
  // Job order numbers are keyed in; a PO item takes as many job orders as it has batches.
  onCreate: (job: ManualJob) => string[];
  onUpdate: (job: JobOrder) => string[];
  onDelete: (id: string) => string[];
};

export function OrdersPanel({ orders, customers = [], jobOrders = [], jobActions, transfers = [], lines, products, directory, visibleCalendarIds, editable, userName, onSave, onAdd, onDelete, flow = [] }: {
  orders: PurchaseOrder[]; customers?: Customer[]; jobOrders?: JobOrder[]; jobActions?: JobActions;
  // WIP handovers, to tell final output from output sent on to another process.
  transfers?: { sourceLineId: string }[];
  lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[]; flow?: FlowWarning[];
  editable: boolean; userName: string; onSave: (order: PurchaseOrder) => string[]; onAdd: (items: PurchaseOrder[], customer: Customer) => string[]; onDelete: (id: string) => string[];
}) {
  const customerNames = [...new Set(orders.map((order) => order.customerName?.trim()).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  // New order opens in a pop-up from the orders header, so the page shows just the orders.
  const dialog = useRef<HTMLDialogElement>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [added, setAdded] = useState("");
  const newOrderButton = editable ? <button type="button" className="primary-button" onClick={() => { setFormVersion((value) => value + 1); setAdded(""); dialog.current?.showModal(); }}><Plus size={17} />New order</button> : null;
  return <section className="orders-layout">
    {editable ? <dialog ref={dialog} className="activity-dialog order-dialog" aria-labelledby="new-order-title">
      <NewOrderForm key={formVersion} orders={orders} customers={customers} products={products} units={directory.units} userName={userName} onAdd={onAdd}
        onClose={() => dialog.current?.close()} onDone={(message) => { setAdded(message); dialog.current?.close(); }} />
    </dialog> : null}
    {added ? <p role="status" className="calendar-notice">{added}</p> : null}
    <OrdersTable action={newOrderButton} orders={orders} customerRecords={customers} jobOrders={jobOrders} transfers={transfers} jobActions={jobActions} lines={lines} products={products} directory={directory} visibleCalendarIds={visibleCalendarIds} editable={editable} customers={customerNames} onSave={onSave} onDelete={onDelete} flow={flow} />
  </section>;
}

type DraftItem = { key: string; productId: string; uom: string; format: ProductFormat | "" };
const draftItem = (): DraftItem => ({ key: crypto.randomUUID(), productId: "", uom: "", format: "" });

// One PO keyed in once: customer and PO number, then as many product line items as it lists.
// Typing an existing PO number of the same customer adds further items to that PO.
function NewOrderForm({ orders, products, customers, units, userName, onAdd, onClose, onDone }: {
  orders: PurchaseOrder[]; products: Product[]; customers: Customer[]; units: CalendarDirectory["units"]; userName: string; onAdd: (items: PurchaseOrder[], customer: Customer) => string[];
  onClose: () => void; onDone: (message: string) => void;
}) {
  const uoms = useUoms();
  const [items, setItems] = useState<DraftItem[]>(() => [draftItem()]);
  const [poNumber, setPoNumber] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  // A known customer ID fills in its name; a new one is added to the customer list with this PO.
  const known = customers.find((item) => item.code.trim().toLowerCase() === customerCode.trim().toLowerCase() && customerCode.trim());
  const [errors, setErrors] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const existing = poNumber.trim() ? poItems(poNumber, orders) : [];
  const firstItem = nextPoItem(poNumber, orders);
  const update = (key: string, change: Partial<DraftItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  const formatOf = (item: DraftItem) => item.format || inferFormat(products.find((product) => product.id === item.productId));
  return <form key={version} className="form-panel orders-form" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const createdAt = new Date().toISOString();
    let number = nextOrderNumber(orders);
    const customer: Customer = known ?? { id: `customer-${crypto.randomUUID()}`, code: customerCode.trim(), name: customerName.trim(), active: "Active" };
    const built: PurchaseOrder[] = items.map((item, index) => ({
      id: `order-${crypto.randomUUID()}`, number: number++, item: firstItem + index, format: formatOf(item), ...(units.length === 1 ? { unitId: units[0].id } : {}),
      customerId: customer.id, customerName: customer.name, poNumber: poNumber.trim(), productId: item.productId,
      quantity: Number(data.get(`quantity-${item.key}`)), uom: item.uom || (products.find((product) => product.id === item.productId)?.uom ?? ""),
      expectedDates: {}, ...(deliveryDate ? { deliveryDate } : {}), createdAt, createdBy: userName
    }));
    const result = onAdd(built, customer);
    setErrors(result);
    if (!result.length) {
      const range = built.length === 1 ? `order ${built[0].number}` : `orders ${built[0].number}-${built.at(-1)!.number}`;
      onDone(`${built[0].poNumber} for ${built[0].customerName}: ${built.length} item${built.length === 1 ? "" : "s"} added as ${range}. Open it in the list to key in its job orders.`);
      setItems([draftItem()]); setPoNumber(""); setDeliveryDate(""); setCustomerCode(""); setCustomerName(""); setVersion((value) => value + 1);
    }
  }}>
    <div className="panel-title"><h2 id="new-order-title">New order</h2><button className="icon-button" type="button" aria-label="Close new order" title="Close" onClick={onClose}><X size={18} /></button></div>
    <label>Customer ID<input name="customerId" required maxLength={40} list="order-customers" placeholder="Type or choose, e.g. C0012" value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} /></label>
    <datalist id="order-customers">{customers.filter((item) => item.active === "Active").map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</datalist>
    <label>Customer name<input name="customer" required maxLength={120} placeholder={known ? "" : "New customer's name"} readOnly={!!known} value={known ? known.name : customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
    <label>PO number<input name="po" required maxLength={60} placeholder="e.g. PO-2610-140" value={poNumber} onChange={(event) => {
      setPoNumber(event.target.value);
      // An existing PO keeps its customer.
      const owner = poItems(event.target.value, orders).find((item) => item.customerId);
      const record = customers.find((item) => item.id === owner?.customerId);
      if (record && !customerCode.trim()) setCustomerCode(record.code);
    }} /></label>
    <label>Expected customer delivery<input name="deliveryDate" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
    {customerCode.trim() && !known ? <p className="orders-help" role="status">New customer ID {customerCode.trim()}: it is added to the customer list with this PO.</p> : null}
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
          <label title={routeLabel(format)}>Dosage form<select value={format} onChange={(event) => update(item.key, { format: event.target.value as ProductFormat })}>{PRODUCT_FORMATS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <div className="quantity-fields"><label>Quantity<input name={`quantity-${item.key}`} type="number" min="1" step="any" required /></label>
            <label>UOM<select value={item.uom || productUom} onChange={(event) => update(item.key, { uom: event.target.value })} required>{!productUom && !item.uom ? <option value="">Select</option> : null}{[...new Set([productUom, ...uoms.filter((unit) => unit.active).map((unit) => unit.name)].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
          <small className="route-muted">Route: {routeLabel(format)}</small>
        </div>;
      })}
      <button type="button" className="calendar-button" onClick={() => setItems((current) => [...current, draftItem()])}><Plus size={16} />Add another product</button>
    </fieldset>
    <button type="submit" className="primary-button"><Plus size={17} />{items.length > 1 ? `Add PO with ${items.length} items` : "Add order"}</button>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    <p className="orders-help">Each product becomes its own numbered order. After saving, open it in the list to key in its job orders, one per batch.</p>
  </form>;
}

type Row = { order: PurchaseOrder; number: number; rows: OrderProcessRow[]; product?: Product; progress: OrderProgress; format: ProductFormat; warnings: FlowWarning[] };
type Column = {
  key: string; label: string; numeric?: boolean; required?: boolean;
  sort: (row: Row) => string | number; cell: (row: Row) => ReactNode;
  filter?: { kind: "text"; text: (row: Row) => string } | { kind: "select"; options: string[]; value: (row: Row) => string };
};
const COLUMN_STORAGE = "scheduler.orderColumns";

function OrdersTable({ action, orders, customerRecords, jobOrders, transfers, jobActions, lines, products, directory, visibleCalendarIds, editable, customers, onSave, onDelete, flow }: {
  customerRecords: Customer[]; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; jobActions?: JobActions; action?: ReactNode;
  flow: FlowWarning[];
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
    { key: "customer", label: "Customer", sort: (row) => row.order.customerName ?? "", cell: (row) => { const record = customerRecords.find((item) => item.id === row.order.customerId); return row.order.customerName ? <>{row.order.customerName}{record ? <small>ID {record.code}</small> : null}</> : <span className="route-muted">Not set</span>; }, filter: { kind: "text", text: (row) => `${row.order.customerName ?? ""} ${customerRecords.find((item) => item.id === row.order.customerId)?.code ?? ""}` } },
    { key: "po", label: "PO number", required: true, sort: (row) => `${row.order.poNumber}#${String(poItem(row.order)).padStart(4, "0")}`, cell: (row) => <><strong>{row.order.poNumber}</strong>{poItems(row.order.poNumber, orders).length > 1 ? <small>Item {poItem(row.order)} of {poItems(row.order.poNumber, orders).length}</small> : null}</>, filter: { kind: "text", text: (row) => row.order.poNumber } },
    { key: "product", label: "Product", sort: (row) => row.product?.name ?? "", cell: (row) => row.product?.name ?? "Unknown product", filter: { kind: "text", text: (row) => `${row.product?.name ?? ""} ${row.product?.sku ?? ""}` } },
    { key: "format", label: "Dosage form", sort: (row) => row.format, cell: (row) => <span title={routeLabel(row.format)}>{row.format}</span>, filter: { kind: "select", options: [...PRODUCT_FORMATS], value: (row) => row.format } },
    { key: "quantity", label: "Order qty", numeric: true, sort: (row) => row.order.quantity, cell: (row) => `${row.order.quantity.toLocaleString()} ${row.order.uom}` },
    { key: "progress", label: "Progress", sort: (row) => row.progress.batchCount ? row.progress.batchesFinished / row.progress.batchCount : -1, cell: (row) => <>
      <div className="order-steps" role="img" aria-label={row.rows.map((item) => `${item.processName} ${Math.round(item.completedCount / item.lineCount * 100)}%`).join(", ")}>
        {row.rows.map((item) => <i key={item.calendar.id} title={`${item.processName}: ${item.completedCount} of ${item.lineCount} days complete`} style={{ "--filled": `${item.completedCount / item.lineCount * 100}%` } as React.CSSProperties} />)}
      </div>
      <small>{progressText(row.progress)}</small></> },
    { key: "finished", label: "Finished", numeric: true, sort: (row) => row.progress.percent, cell: (row) => row.progress.finishedQuantity ? <>{row.progress.finishedQuantity.toLocaleString()}<small>{row.progress.percent}% of order</small></> : "-" },
    { key: "expected", label: "Expected delivery", sort: (row) => row.progress.expectedDate ?? "9999", cell: (row) => <>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : <span className="route-muted">Not set</span>}{row.progress.overdue ? <span className="badge danger">Overdue</span> : null}</> },
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
    <div className="panel-title"><h2>Customer orders <span className="badge neutral">{orders.length}</span></h2>{action}</div>
    <div className="orders-toolbar">
      <fieldset className="orders-month"><legend>Month</legend>
        <select aria-label="Month based on" value={basis} onChange={(event) => setBasis(event.target.value as MonthBasis)}>
          <option value="scheduled">Scheduled in</option><option value="expected">Expected delivery in</option><option value="created">Order created in</option>
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
              {open ? <tr className="order-detail-row"><td colSpan={shown.length + 1}><OrderDetail jobOrders={jobOrders} transfers={transfers} jobActions={jobActions} product={row.product} onPrint={() => setPrint((current) => ({ orderId: row.order.id, request: current.request + 1 }))} order={row.order} format={row.format} warnings={row.warnings} rows={row.rows} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} linked={lines.some((line) => line.productionOrderId === row.order.id)} editable={editable} customers={customers} onSave={onSave} onDelete={(id) => { const result = onDelete(id); if (!result.length) setExpanded(null); return result; }} /></td></tr> : null}
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
        <thead><tr><th>#</th><th>Customer</th><th>PO number</th><th>Product</th><th>Dosage form</th><th>Order qty</th><th>Progress</th><th>Finished</th><th>Expected delivery</th><th>Status</th></tr></thead>
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
  const cellText = (cell: BatchCell | undefined, uom: string) => {
    if (!cell) return "-";
    const dates = cell.firstDate === cell.lastDate ? shortDate(cell.firstDate) : `${shortDate(cell.firstDate)} – ${shortDate(cell.lastDate)}`;
    const status = cell.daysDone === cell.days ? "Done" : cell.late ? "Late" : cell.daysDone ? `In progress ${cell.daysDone}/${cell.days}` : "Planned";
    return <>{dates} · {status}{cell.daysDone ? <><br />{cell.completed.toLocaleString()} {uom} made</> : null}</>;
  };
  return <>
    <header><h1>Order {row.number} · {row.order.poNumber}{row.order.item ? ` item ${row.order.item}` : ""}</h1><p>{row.order.customerName ?? ""} · {row.product?.name ?? "Unknown product"} · {row.order.quantity.toLocaleString()} {row.order.uom} · printed {printed}</p></header>
    <p className="print-order-facts">Dosage form: {row.format} ({routeLabel(row.format)}) · Status: {row.progress.status} · {progressText(row.progress)} · Expected delivery: {row.progress.expectedDate ? displayDate(row.progress.expectedDate) : "Not set"}{row.progress.overdue ? " (overdue)" : ""}</p>
    {row.warnings.length ? <ul className="print-order-warnings">{row.warnings.map((warning) => <li key={warning.message}>Warning: {warning.message}</li>)}</ul> : null}
    {matrix.rows.length ? <table className="print-orders-table">
      <thead><tr><th>Process</th>{matrix.batches.map((batch) => <th key={batch.key}>{batch.label}<br />{batch.kg !== undefined ? `${batch.kg.toLocaleString("en-MY", { maximumFractionDigits: 2 })} kg · ` : ""}{batch.quantity.toLocaleString()} {batch.uom}</th>)}<th>Summary</th></tr></thead>
      <tbody>{matrix.rows.map((process) => <tr key={process.calendar.id}>
        <th>{process.processName}</th>
        {matrix.batches.map((batch) => <td key={batch.key}>{cellText(process.cells[batch.key], process.uom)}</td>)}
        <td>{process.completed.toLocaleString()} / {process.planned.toLocaleString()} {process.uom} ({process.planned ? Math.min(100, Math.round(process.completed / process.planned * 100)) : 0}%)</td>
      </tr>)}</tbody>
    </table> : <p>No production has been scheduled against this PO yet.</p>}
  </>;
}

// The PO item's job orders: one per batch, each keyed in with its own number and the quantity
// every process makes. Planning them happens on the Planner Board.
const FILL_UOMS = ["blisters", "bottles", "sachets"];
const COUNT_UOMS = ["tablets", "capsules"];
function JobOrders({ order, product, format, jobOrders, transfers, lines, actions }: { order: PurchaseOrder; product?: Product; format: ProductFormat; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; lines: PlanLine[]; actions: JobActions }) {
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [addVersion, setAddVersion] = useState(0);
  const jobs = jobsFor(order.id, jobOrders);
  const released = jobs.filter((job) => job.uom === order.uom).reduce((sum, job) => sum + job.quantity, 0);
  const remaining = Math.max(0, Number((order.quantity - released).toPrecision(12)));
  const allowable = product?.batchQuantity;
  const report = (result: string[], success: string) => { setErrors(result); setNotice(result.length ? "" : success); return !result.length; };
  // Kilograms for a quantity, from the product's batch size when the quantity is in the PO's unit.
  const kgFor = (quantity: number, uom: string) => product?.batchSizeKg && product.batchQuantity && uom === order.uom ? Number((product.batchSizeKg * quantity / product.batchQuantity).toPrecision(6)) : undefined;
  const number = (value: FormDataEntryValue | null) => { const text = String(value ?? "").trim(); return text ? Number(text) : undefined; };
  const options = (list: string[], current?: string) => [...new Set([current ?? "", ...list].filter(Boolean))];
  // Which processes of this dosage form use each figure, so the form says where it goes.
  const route = format === "Other" ? [] : ROUTES[format];
  const countSteps = route.filter((step) => step === "tableting" || step === "coating" || step === "capsulation").map(stepLabel).join(", ");
  // The fields shared by adding and editing.
  function readJob(data: FormData) {
    const quantity = Number(data.get("quantity")), uom = String(data.get("uom") ?? order.uom);
    const packQuantity = number(data.get("packQuantity")), packUom = String(data.get("packUom") ?? "").trim();
    const size = number(data.get("batchSize")), sizeUom = String(data.get("batchSizeUom") ?? "kg");
    return { number: String(data.get("number") ?? "").trim(), quantity, uom, batchSizeKg: sizeUom === "kg" ? size : undefined, batchVolumeL: sizeUom === "L" ? size : undefined,
      packQuantity, packUom: packUom || undefined, boxQuantity: number(data.get("boxQuantity")) };
  }
  const fields = (job?: JobOrder) => <>
    <fieldset className="job-measure job-number"><legend>Job order no.</legend><input name="number" required maxLength={60} autoComplete="off" aria-label="Job order no." placeholder="e.g. JO0010" defaultValue={job?.number} /></fieldset>
    <fieldset className="job-measure"><legend title="Batch size, for Dispensing">Batch size<span> · Dispensing</span></legend>
      <input name="batchSize" type="number" min="0" step="any" aria-label="Batch size" defaultValue={job?.batchSizeKg ?? job?.batchVolumeL} placeholder={!job && product?.batchSizeKg ? "From the product if blank" : "e.g. 41.5"} />
      <select name="batchSizeUom" aria-label="Batch size UOM" defaultValue={job?.batchVolumeL ? "L" : "kg"}><option>kg</option><option>L</option></select></fieldset>
    <fieldset className="job-measure"><legend title={`Batch quantity, for ${countSteps || "production"}`}>Batch quantity<span> · {countSteps || "Production"}</span></legend>
      <input name="quantity" type="number" min="0" step="any" required aria-label="Batch quantity" defaultValue={job ? job.quantity : remaining ? Math.min(remaining, allowable ?? remaining) : undefined} />
      <select name="uom" aria-label="Batch quantity UOM" defaultValue={job?.uom ?? order.uom}>{options([order.uom, ...COUNT_UOMS], job?.uom).map((name) => <option key={name}>{name}</option>)}</select></fieldset>
    <fieldset className="job-measure"><legend title="Pack quantity, for Filling">Pack quantity<span> · Filling</span></legend>
      <input name="packQuantity" type="number" min="0" step="any" aria-label="Pack quantity" defaultValue={job?.packQuantity} />
      <select name="packUom" aria-label="Pack quantity UOM" defaultValue={job?.packUom ?? (format === "Sachet" ? "sachets" : "bottles")}>{options(FILL_UOMS, job?.packUom).map((name) => <option key={name}>{name}</option>)}</select></fieldset>
    <fieldset className="job-measure"><legend title="Total pack quantity, for Packing">Total packs<span> · Packing</span></legend>
      <input name="boxQuantity" type="number" min="0" step="any" aria-label="Total pack quantity in boxes" defaultValue={job?.boxQuantity} /><span className="job-measure-unit">boxes</span></fieldset>
  </>;
  const measure = (value?: { quantity: number; uom: string }) => value ? `${value.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} ${value.uom}` : <span className="route-muted">Not keyed in</span>;
  return <section className="job-orders" aria-label={`Job orders for ${order.poNumber}`}>
    <div className="order-detail-head"><h3>Job orders <span className="badge neutral">{jobs.length}</span></h3>
      <span className="route-muted">{released.toLocaleString()} of {order.quantity.toLocaleString()} {order.uom} in job orders{remaining ? ` · ${remaining.toLocaleString()} still to release` : ""}{allowable ? ` · allowable batch ${allowable.toLocaleString()} ${order.uom}` : ""}</span></div>
    {jobs.length ? <div className="order-batch-scroll"><table className="job-order-table">
      <thead><tr><th scope="col">Job order no.</th><th scope="col" className="numeric">Batch size<small>Dispensing</small></th><th scope="col" className="numeric">Batch quantity<small>{countSteps || "Production"}</small></th><th scope="col" className="numeric">Pack quantity<small>Filling</small></th><th scope="col" className="numeric">Total packs<small>Packing</small></th><th scope="col" className="numeric">Final output<small>Produced</small></th><th scope="col">Batch number</th><th scope="col">Planning</th><th scope="col"><span className="admin-sr-only">Actions</span></th></tr></thead>
      <tbody>{jobs.map((job) => {
        const planned = linesForJob(job.id, lines).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
        const done = planned.length > 0 && planned.every((line) => line.completedAt);
        if (editing === job.id) return <tr key={job.id} className="job-order-editing"><td colSpan={9}>
          <form className="job-order-edit" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            // The batch number is keyed in on the Planner Board; editing here keeps it.
            const read = readJob(data);
            const { batchSizeKg: _k, batchVolumeL: _l, packQuantity: _pq, packUom: _pu, packSize: _ps, boxQuantity: _b, ...rest } = job;
            const next: JobOrder = { ...rest, number: read.number, quantity: read.quantity, uom: read.uom,
              ...(read.batchSizeKg ? { batchSizeKg: read.batchSizeKg } : {}), ...(read.batchVolumeL ? { batchVolumeL: read.batchVolumeL } : {}), ...(read.packQuantity ? { packQuantity: read.packQuantity } : {}),
              ...(read.packUom ? { packUom: read.packUom } : {}), ...(read.boxQuantity ? { boxQuantity: read.boxQuantity } : {}) };
            if (report(actions.onUpdate(next), `${next.number.trim()} saved.${planned.some((line) => !line.completedAt) ? " Its planned activities now carry the new quantities." : ""}`)) setEditing(null);
          }}>
            {fields(job)}
            <div className="job-order-buttons"><button type="submit" className="primary-button">Save</button>
              <button type="button" className="calendar-button" onClick={() => { setEditing(null); setErrors([]); }}>Cancel</button></div>
            {planned.length ? <small className="route-muted">Saving also updates its {planned.length} planned activit{planned.length === 1 ? "y" : "ies"} (completed ones stay as they are).</small> : null}
          </form>
        </td></tr>;
        return <tr key={job.id}>
          <th scope="row"><strong>{job.number}</strong><small>Batch {job.sequence} of PO item</small></th>
          <td className="numeric">{measure(processQuantity(job, "dispensing"))}</td>
          <td className="numeric">{measure(processQuantity(job, "tableting"))}</td>
          <td className="numeric">{measure(processQuantity(job, "filling"))}</td>
          <td className="numeric">{measure(processQuantity(job, "packing"))}</td>
          <td className="numeric">{(() => {
            const made = finalOutput(job.id, lines, transfers);
            if (!made.length) return <span className="route-muted">-</span>;
            const target = processQuantity(job, "packing");
            return made.map((item) => <span key={item.uom} className="job-output">{item.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {item.uom}
              {target && item.uom === target.uom ? <small>{Math.round(item.quantity / target.quantity * 100)}% of {target.quantity.toLocaleString()}</small> : null}</span>);
          })()}</td>
          <td>{job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Keyed in on the Planner Board</span>}</td>
          <td>{planned.length ? <><span className={`badge ${done ? "success" : "info"}`}>{done ? "Done" : "Planned"}</span> <small>{shortDate(planned[0].plannedDate)} – {shortDate(planned.at(-1)!.plannedDate)} · {planned.length} activit{planned.length === 1 ? "y" : "ies"}</small></>
            : <><span className="badge neutral">Not planned</span><small>Plan it on the Planner Board</small></>}</td>
          <td><span className="job-actions">
            {actions.canCreate ? <button type="button" className="icon-button" title={`Edit ${job.number}`} aria-label={`Edit ${job.number}`} onClick={() => { setEditing(job.id); setErrors([]); setNotice(""); }}><Pencil size={15} /></button> : null}
            {!planned.length && actions.canCreate ? <button type="button" className="icon-button danger" title={`Remove ${job.number}`} aria-label={`Remove ${job.number}`} onClick={() => report(actions.onDelete(job.id), `${job.number} removed.`)}><Trash2 size={15} /></button> : null}
          </span></td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="order-empty">No job orders yet. Key in one for each batch of this PO item.</p>}
    {actions.canCreate ? <form key={addVersion} className="job-order-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const read = readJob(data);
      const batchSizeKg = read.batchSizeKg ?? (read.batchVolumeL ? undefined : kgFor(read.quantity, read.uom));
      if (report(actions.onCreate({ ...read, orderId: order.id, batchSizeKg }), `Job order ${read.number} added to ${order.poNumber}. Plan it on the Planner Board.`)) setAddVersion((value) => value + 1);
    }}>
      {fields()}
      <div className="job-order-buttons"><button type="submit" className="primary-button"><Plus size={16} />Add job order</button></div>
    </form> : null}
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {notice && !errors.length ? <p role="status">{notice}</p> : null}
  </section>;
}

const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

function BatchSize({ kg, quantity, uom }: { kg?: number; quantity: number; uom: string }) {
  const mass = ["kg", "g", "mg"].includes(uom);
  if (kg === undefined) return <small>{quantity.toLocaleString()} {uom}</small>;
  return <><small className="batch-kg">{kg.toLocaleString("en-MY", { maximumFractionDigits: 2 })} kg</small>{mass || !quantity ? null : <small>≈ {quantity.toLocaleString()} {uom}</small>}</>;
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

function OrderDetail({ order, product, jobOrders, transfers, jobActions, format, warnings, rows, lines, directory, visibleCalendarIds, linked, editable, customers, onSave, onDelete, onPrint }: {
  product?: Product; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; jobActions?: JobActions;
  format: ProductFormat; warnings: FlowWarning[];
  onPrint: () => void;
  order: PurchaseOrder; rows: OrderProcessRow[]; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; linked: boolean; editable: boolean; customers: string[];
  onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const units = new Set(rows.map((row) => row.unitName));
  const matrix = orderBatchMatrix(order, lines, directory, localDateKey(new Date()), visibleCalendarIds);
  const lastDate = rows.reduce((latest, row) => row.lastDate > latest ? row.lastDate : latest, "");
  return <div className="order-detail">
    <div className="order-detail-head">
      <p className="route-format">Dosage form: <strong>{format}</strong> · {routeLabel(format)}</p>
      <button type="button" className="calendar-button" onClick={onPrint}><Printer size={15} />Print this order</button>
    </div>
    {order.deliveryDate && lastDate > order.deliveryDate ? <p className="order-warning" role="alert">Production is scheduled until {displayDate(lastDate)}, after the expected customer delivery on {displayDate(order.deliveryDate)}.</p> : null}
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    {rows.length ? <div className="order-batch-scroll"><table className="order-batch-table">
      <thead>
        <tr><th scope="col" rowSpan={2} className="order-batch-process">Process</th><th scope="colgroup" colSpan={matrix.batches.length + 1}>Planned quantity</th></tr>
        <tr>
          {matrix.batches.map((batch) => <th scope="col" key={batch.key} className="order-batch-col"><strong>{batch.label}</strong><BatchSize kg={batch.kg} quantity={batch.quantity} uom={batch.uom} /></th>)}
          <th scope="col" className="order-batch-summary"><strong>Summary</strong><BatchSize kg={matrix.total.kg} quantity={matrix.total.quantity} uom={order.uom} />{matrix.total.quantity > order.quantity ? <small className="order-warning">More than the {order.quantity.toLocaleString()} ordered</small> : null}</th>
        </tr>
      </thead>
      <tbody>{matrix.rows.map((row) => {
        const percent = row.planned ? Math.min(100, Math.round(row.completed / row.planned * 100)) : 0;
        return <tr key={row.calendar.id}>
          <th scope="row" className="order-batch-process">{row.processName}{units.size > 1 ? <small>{rows.find((item) => item.calendar.id === row.calendar.id)?.unitName}</small> : null}</th>
          {matrix.batches.map((batch) => <td key={batch.key} className="order-batch-col"><BatchStatus cell={row.cells[batch.key]} uom={row.uom} /></td>)}
          <td className="order-batch-summary">
            <div className="batch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${row.processName} ${percent}% complete`}><span style={{ width: `${percent}%` }} /></div>
            <small>{row.completed.toLocaleString()} / {row.planned.toLocaleString()} {row.uom} · {percent}%</small>
          </td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="order-empty">No production has been scheduled against this PO yet. Create its job orders below, then plan each one.</p>}
    {jobActions ? <JobOrders order={order} product={product} format={format} jobOrders={jobOrders} transfers={transfers} lines={lines} actions={jobActions} /> : null}
    {editable ? <form className="order-edit" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const delivery = String(data.get("deliveryDate") ?? "");
      const { deliveryDate: _d, ...rest } = order;
      const result = onSave({ ...rest, ...(delivery ? { deliveryDate: delivery } : {}), customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), quantity: Number(data.get("quantity")), format: String(data.get("format")) as ProductFormat });
      setErrors(result); setSaved(!result.length);
    }}>
      <label>Customer name<input name="customer" required defaultValue={order.customerName} list={`customers-${order.id}`} /></label>
      <datalist id={`customers-${order.id}`}>{customers.map((name) => <option key={name} value={name} />)}</datalist>
      <label>PO number<input name="po" required defaultValue={order.poNumber} /></label>
      <label>Expected customer delivery<input name="deliveryDate" type="date" defaultValue={order.deliveryDate ?? ""} /></label>
      <label>Dosage form<select name="format" defaultValue={format}>{PRODUCT_FORMATS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Quantity ({order.uom})<input name="quantity" type="number" min="1" step="any" required defaultValue={order.quantity} /></label>
      <button type="submit" className="calendar-button">Save order</button>
      {confirming ? <><span>Delete {order.poNumber}?</span><button type="button" className="calendar-button" onClick={() => { setErrors(onDelete(order.id)); setConfirming(false); }}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => setConfirming(false)}>Cancel</button></>
        : <button type="button" className="icon-button danger" title={linked ? "Unlink its activities before deleting" : `Delete ${order.poNumber}`} aria-label={`Delete ${order.poNumber}`} onClick={() => setConfirming(true)}><Trash2 size={16} /></button>}
    </form> : null}
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {saved && !errors.length ? <p role="status">Order saved.</p> : null}
  </div>;
}

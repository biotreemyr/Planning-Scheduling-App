"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Columns3, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Customer, PlanLine, Product } from "@/lib/domain/types";
import { type ManualJob, batchStatus, defaultPackingNumber, orderStatusSummary, jobsFor, linesForJob, packingNumber, processQuantity, type JobOrder } from "@/lib/services/jobOrders";
import { localDateKey } from "@/lib/services/calendarPrint";
import { type OrderBatchMatrix, nextOrderNumber, nextPoItem, poItem, poItems, poLabel, orderBatchMatrix, orderColor, orderInMonth, orderNumbers, orderProcessRows, orderProgress, validateOrder, type BatchCell, type MonthBasis, type OrderProcessRow, type OrderProgress, type OrderStatus, type PurchaseOrder } from "@/lib/services/orders";
import { RecordPicker, type PickerColumn } from "./RecordPicker";
import { customerFor, productFor, type OrderCatalog } from "@/lib/services/masterData";
import { useUoms } from "./MeasurementSettings";
import { OrderBadge } from "./OrderBadge";
import { PRODUCT_FORMATS, inferFormat, type FlowWarning, type ProductFormat } from "@/lib/services/processRules";
import { unitRoute, unitRouteLabel } from "@/lib/services/processSetup";
import { formatDate, formatDateTime } from "@/lib/services/dates";

const displayDate = (value: string) => formatDate(value.slice(0, 10));
const statuses: OrderStatus[] = ["Not scheduled", "Scheduled", "In production", "Completed"];
const statusBadge: Record<OrderStatus, string> = { "Not scheduled": "neutral", Scheduled: "info", "In production": "warning", Completed: "success" };

export type JobActions = {
  // Create adds job orders; edit changes or removes them (Core's orders create and edit tasks).
  canCreate: boolean; canEdit: boolean;
  // Job order numbers are keyed in; a PO item takes as many job orders as it has batches.
  onCreate: (job: ManualJob) => string[];
  onUpdate: (job: JobOrder) => string[];
  onDelete: (id: string) => string[];
};

export function OrdersPanel({ orders, customers = [], jobOrders = [], jobActions, transfers = [], lines, products, catalog, directory, visibleCalendarIds, creatable, editable, printable = true, userName, onSave, onAdd, onDelete, flow = [] }: {
  orders: PurchaseOrder[]; customers?: Customer[]; jobOrders?: JobOrder[]; jobActions?: JobActions;
  // WIP handovers, to tell final output from output sent on to another process.
  transfers?: { sourceLineId: string }[];
  lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[]; flow?: FlowWarning[];
  // Master Data's finished goods for new orders; without it the form offers the scheduler's own products.
  catalog?: OrderCatalog;
  // creatable: may key in new POs; editable: may change or delete them; printable: may print.
  creatable?: boolean; editable: boolean; printable?: boolean; userName: string; onSave: (order: PurchaseOrder) => string[]; onAdd: (items: PurchaseOrder[], customer: Customer, taken?: Product[]) => string[]; onDelete: (id: string) => string[];
}) {
  const customerNames = [...new Set(orders.map((order) => order.customerName?.trim()).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  // New order opens in a pop-up from the orders header, so the page shows just the orders.
  const dialog = useRef<HTMLDialogElement>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [added, setAdded] = useState("");
  const canAdd = creatable ?? editable;
  const newOrderButton = canAdd ? <button type="button" className="primary-button" onClick={() => { setFormVersion((value) => value + 1); setAdded(""); dialog.current?.showModal(); }}><Plus size={17} />New order</button> : null;
  return <section className="orders-layout">
    {canAdd ? <dialog ref={dialog} className="activity-dialog order-dialog" aria-labelledby="new-order-title">
      <NewOrderForm key={formVersion} orders={orders} customers={customers} products={products} catalog={catalog} units={directory.units} directory={directory} userName={userName} onAdd={onAdd}
        onClose={() => dialog.current?.close()} onDone={(message) => { setAdded(message); dialog.current?.close(); }} />
    </dialog> : null}
    {added ? <p role="status" className="calendar-notice">{added}</p> : null}
    <OrdersTable action={newOrderButton} printable={printable} orders={orders} customerRecords={customers} jobOrders={jobOrders} transfers={transfers} jobActions={jobActions} lines={lines} products={products} directory={directory} visibleCalendarIds={visibleCalendarIds} editable={editable} customers={customerNames} onSave={onSave} onDelete={onDelete} flow={flow} />
  </section>;
}

type DraftItem = { key: string; productId: string; uom: string; format: ProductFormat | "" };
const productColumns: PickerColumn<Product>[] = [
  { key: "code", label: "Item code", value: (product) => product.sku, filter: true },
  { key: "name", label: "Item name", value: (product) => product.name, filter: true },
  { key: "uom", label: "UOM", value: (product) => product.uom }
];
const customerColumns: PickerColumn<Customer>[] = [
  { key: "code", label: "Customer ID", value: (customer) => customer.code, filter: true },
  { key: "name", label: "Customer name", value: (customer) => customer.name, filter: true }
];
const draftItem = (): DraftItem => ({ key: crypto.randomUUID(), productId: "", uom: "", format: "" });

// One PO keyed in once: customer and PO number, then as many product line items as it lists.
// Typing an existing PO number of the same customer adds further items to that PO.
function NewOrderForm({ orders, products, catalog, customers, units, directory, userName, onAdd, onClose, onDone }: {
  directory: CalendarDirectory; catalog?: OrderCatalog;
  orders: PurchaseOrder[]; products: Product[]; customers: Customer[]; units: CalendarDirectory["units"]; userName: string; onAdd: (items: PurchaseOrder[], customer: Customer, taken?: Product[]) => string[];
  onClose: () => void; onDone: (message: string) => void;
}) {
  const uoms = useUoms();
  // With Master Data, only its finished goods and customers are offered, each as the scheduler record it becomes.
  const fromMasterData = catalog?.status === "ok";
  const choices = catalog?.status === "ok" ? catalog.products.map((master) => productFor(master, products)) : products;
  const customerChoices = catalog?.status === "ok" ? catalog.customers.map((master) => customerFor(master, customers)) : customers.filter((item) => item.active === "Active");
  const [items, setItems] = useState<DraftItem[]>(() => [draftItem()]);
  const [poNumber, setPoNumber] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  // Bumped when the PO number fills in the customer, so the picker shows it.
  const [customerPickerVersion, setCustomerPickerVersion] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => localDateKey(new Date()));
  // A known customer ID fills in its name. Without Master Data, a new one is added to the customer list with this PO.
  const known = (fromMasterData ? customerChoices : customers).find((item) => item.code.trim().toLowerCase() === customerCode.trim().toLowerCase() && customerCode.trim());
  const [errors, setErrors] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const existing = poNumber.trim() ? poItems(poNumber, orders) : [];
  const firstItem = nextPoItem(poNumber, orders);
  const update = (key: string, change: Partial<DraftItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  const formatOf = (item: DraftItem) => item.format || inferFormat(choices.find((product) => product.id === item.productId));
  return <form key={version} className="form-panel orders-form" onSubmit={(event) => {
    event.preventDefault();
    if (fromMasterData && !known) { setErrors([`Customer ID ${customerCode.trim()} is not in Master Data. Choose a customer from the list.`]); return; }
    const data = new FormData(event.currentTarget);
    const createdAt = new Date().toISOString();
    let number = nextOrderNumber(orders);
    const customer: Customer = known ?? { id: `customer-${crypto.randomUUID()}`, code: customerCode.trim(), name: customerName.trim(), active: "Active" };
    const built: PurchaseOrder[] = items.map((item, index) => ({
      id: `order-${crypto.randomUUID()}`, number: number++, item: firstItem + index, format: formatOf(item), ...(units.length === 1 ? { unitId: units[0].id } : {}),
      customerId: customer.id, customerName: customer.name, poNumber: poNumber.trim(), productId: item.productId,
      quantity: Number(data.get(`quantity-${item.key}`)), uom: item.uom || (choices.find((product) => product.id === item.productId)?.uom ?? ""),
      expectedDates: {}, receivedDate, ...(deliveryDate ? { deliveryDate } : {}), createdAt, createdBy: userName
    }));
    const result = onAdd(built, customer, choices.filter((product) => product.masterDataId && built.some((order) => order.productId === product.id)));
    setErrors(result);
    if (!result.length) {
      const range = built.length === 1 ? `order ${built[0].number}` : `orders ${built[0].number}-${built.at(-1)!.number}`;
      onDone(`${built[0].poNumber} for ${built[0].customerName}: ${built.length} item${built.length === 1 ? "" : "s"} added as ${range}. Open it in the list to key in its job orders.`);
      setItems([draftItem()]); setPoNumber(""); setDeliveryDate(""); setReceivedDate(localDateKey(new Date())); setCustomerCode(""); setCustomerName(""); setVersion((value) => value + 1);
    }
  }}>
    <div className="panel-title"><h2 id="new-order-title">New order</h2><button className="icon-button" type="button" aria-label="Close new order" title="Close" onClick={onClose}><X size={18} /></button></div>
    {fromMasterData
      ? <RecordPicker key={customerPickerVersion} label="Customer ID" name="customerId" noun="customer" records={customerChoices} columns={customerColumns} display={(item) => item.code}
          value={known?.id} placeholder="Type or choose, e.g. 305-P0001" onText={setCustomerCode} />
      : <><label>Customer ID<input name="customerId" required maxLength={40} list="order-customers" placeholder="Type or choose, e.g. C0012" value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} /></label>
        <datalist id="order-customers">{customerChoices.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</datalist></>}
    <label>Customer name<input name="customer" required maxLength={120} placeholder={fromMasterData ? "Filled in from Master Data" : known ? "" : "New customer's name"} readOnly={!!known || fromMasterData} value={known ? known.name : fromMasterData ? "" : customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
    <label>PO number<input name="po" required maxLength={60} placeholder="e.g. PO-2610-140" value={poNumber} onChange={(event) => {
      setPoNumber(event.target.value);
      // An existing PO keeps its customer.
      const owner = poItems(event.target.value, orders).find((item) => item.customerId);
      const record = customers.find((item) => item.id === owner?.customerId);
      if (record && !customerCode.trim()) { setCustomerCode(record.code); setCustomerPickerVersion((value) => value + 1); }
    }} /></label>
    <label>PO received date<input name="receivedDate" type="date" required max={localDateKey(new Date())} value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></label>
    <label>Expected customer delivery<input name="deliveryDate" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
    {customerCode.trim() && !known ? <p className="orders-help" role="status">{fromMasterData ? `Customer ID ${customerCode.trim()} is not in Master Data's customer list. Customers are added in SQL Account and imported into Master Data.` : `New customer ID ${customerCode.trim()}: it is added to the customer list with this PO.`}</p> : null}
    {catalog?.status === "unavailable" ? <p className="orders-help" role="status">Bio Tree Master Data could not be reached, so the products listed are the scheduler&apos;s own. Reload to try again.</p> : null}
    {existing.length ? <p className="orders-help" role="status">{existing[0].poNumber} already has {existing.length} item{existing.length === 1 ? "" : "s"}{existing[0].customerName ? ` for ${existing[0].customerName}` : ""}. These are added as item {firstItem}{items.length > 1 ? ` to ${firstItem + items.length - 1}` : ""}.</p> : null}
    <fieldset className="order-items">
      <legend>Line items <span className="badge neutral">{items.length}</span></legend>
      {items.map((item, index) => {
        const productUom = choices.find((product) => product.id === item.productId)?.uom ?? "";
        const format = formatOf(item);
        return <div className="order-item" key={item.key} role="group" aria-label={`Item ${firstItem + index}`}>
          <div className="order-item-head"><strong>Item {firstItem + index}</strong>
            {items.length > 1 ? <button type="button" className="icon-button" aria-label={`Remove item ${firstItem + index}`} title="Remove this item" onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}><Trash2 size={15} /></button> : null}
          </div>
          <RecordPicker label="Product" name={`product-${item.key}`} noun="product" records={choices.filter((product) => product.active === "Active")} columns={productColumns}
            display={(product) => `${product.sku} - ${product.name}`} placeholder="Search item code or name" value={item.productId} onChange={(id) => update(item.key, { productId: id, uom: "", format: "" })} />
          <label title={unitRouteLabel(directory, units[0]?.id, format)}>Dosage form<select value={format} onChange={(event) => update(item.key, { format: event.target.value as ProductFormat })}>{PRODUCT_FORMATS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <div className="quantity-fields"><label>Quantity<input name={`quantity-${item.key}`} type="number" min="1" step="any" required /></label>
            <label>UOM<select value={item.uom || productUom} onChange={(event) => update(item.key, { uom: event.target.value })} required>{!productUom && !item.uom ? <option value="">Select</option> : null}{[...new Set([productUom, ...uoms.filter((unit) => unit.active).map((unit) => unit.name)].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
          <small className="route-muted">Route: {unitRouteLabel(directory, units[0]?.id, format)}</small>
        </div>;
      })}
      <button type="button" className="calendar-button" onClick={() => setItems((current) => [...current, draftItem()])}><Plus size={16} />Add another product</button>
    </fieldset>
    <button type="submit" className="primary-button"><Plus size={17} />{items.length > 1 ? `Add PO with ${items.length} items` : "Add order"}</button>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    <p className="orders-help">Each product becomes its own numbered order. After saving, open it in the list to key in its job orders, one per batch.</p>
  </form>;
}

type Row = { order: PurchaseOrder; number: number; rows: OrderProcessRow[]; product?: Product; progress: OrderProgress; format: ProductFormat; warnings: FlowWarning[]; status: ReturnType<typeof orderStatusSummary> };
type Column = {
  key: string; label: string; numeric?: boolean; required?: boolean;
  sort: (row: Row) => string | number; cell: (row: Row) => ReactNode;
  filter?: { kind: "text"; text: (row: Row) => string } | { kind: "select"; options: string[]; value: (row: Row) => string } | { kind: "date"; date: (row: Row) => string | undefined };
};
const COLUMN_STORAGE = "scheduler.orderColumns";

// A date column's filter offers the years, months and days its rows actually have, so one choice
// narrows to any of them. Values are "y:2026", "m:2026-10", "d:2026-10-09", or "none" for no date.
function dateFilterOptions(dates: (string | undefined)[]) {
  const known = [...new Set(dates.filter((date): date is string => !!date))].sort().reverse();
  const month = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleString("en-GB", { month: "short", year: "numeric" });
  return {
    years: [...new Set(known.map((date) => date.slice(0, 4)))],
    months: [...new Set(known.map((date) => date.slice(0, 7)))].map((key) => ({ key, label: month(key) })),
    days: known,
    missing: dates.some((date) => !date)
  };
}
const matchesDate = (date: string | undefined, choice: string) => choice === "none" ? !date : !!date && date.startsWith(choice.slice(2));

function OrdersTable({ action, printable, orders, customerRecords, jobOrders, transfers, jobActions, lines, products, directory, visibleCalendarIds, editable, customers, onSave, onDelete, flow }: {
  customerRecords: Customer[]; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; jobActions?: JobActions; action?: ReactNode;
  flow: FlowWarning[];
  orders: PurchaseOrder[]; lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[];
  editable: boolean; printable: boolean; customers: string[]; onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
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
    { key: "received", label: "PO received", sort: (row) => row.order.receivedDate ?? "", cell: (row) => row.order.receivedDate ? displayDate(row.order.receivedDate) : <span className="route-muted">Not set</span>, filter: { kind: "date", date: (row) => row.order.receivedDate } },
    { key: "customer", label: "Customer", sort: (row) => row.order.customerName ?? "", cell: (row) => { const record = customerRecords.find((item) => item.id === row.order.customerId); return row.order.customerName ? <>{row.order.customerName}{record ? <small>ID {record.code}</small> : null}</> : <span className="route-muted">Not set</span>; }, filter: { kind: "text", text: (row) => `${row.order.customerName ?? ""} ${customerRecords.find((item) => item.id === row.order.customerId)?.code ?? ""}` } },
    { key: "po", label: "PO number", required: true, sort: (row) => `${row.order.poNumber}#${String(poItem(row.order)).padStart(4, "0")}`, cell: (row) => <><strong>{row.order.poNumber}</strong>{poItems(row.order.poNumber, orders).length > 1 ? <small>Item {poItem(row.order)} of {poItems(row.order.poNumber, orders).length}</small> : null}</>, filter: { kind: "text", text: (row) => row.order.poNumber } },
    { key: "product", label: "Product", sort: (row) => row.product?.name ?? "", cell: (row) => row.product?.name ?? "Unknown product", filter: { kind: "text", text: (row) => `${row.product?.name ?? ""} ${row.product?.sku ?? ""}` } },
    { key: "format", label: "Dosage form", sort: (row) => row.format, cell: (row) => <span title={unitRouteLabel(directory, row.order.unitId ?? directory.units[0]?.id, row.format)}>{row.format}</span>, filter: { kind: "select", options: [...PRODUCT_FORMATS], value: (row) => row.format } },
    { key: "quantity", label: "Order qty", numeric: true, sort: (row) => row.order.quantity, cell: (row) => `${row.order.quantity.toLocaleString()} ${row.order.uom}` },
    { key: "progress", label: "Progress", sort: (row) => row.progress.batchCount ? row.progress.batchesFinished / row.progress.batchCount : -1, cell: (row) => <>
      <div className="order-steps" role="img" aria-label={row.rows.map((item) => `${item.processName} ${Math.round(item.completedCount / item.lineCount * 100)}%`).join(", ")}>
        {row.rows.map((item) => <i key={item.calendar.id} title={`${item.processName}: ${item.completedCount} of ${item.lineCount} days complete`} style={{ "--filled": `${item.completedCount / item.lineCount * 100}%` } as React.CSSProperties} />)}
      </div>
      <small>{progressText(row.progress)}</small></> },
    { key: "finished", label: "Finished", numeric: true, sort: (row) => row.progress.percent, cell: (row) => row.progress.finishedQuantity ? <>{row.progress.finishedQuantity.toLocaleString()}<small>{row.progress.percent}% of order</small></> : "-" },
    { key: "release", label: "Testing / release", sort: (row) => row.status.jobs ? row.status.released / row.status.jobs : -1, cell: (row) => statusText(row.status) },
    { key: "expected", label: "Expected delivery", sort: (row) => row.progress.expectedDate ?? "9999", cell: (row) => <>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : <span className="route-muted">Not set</span>}{row.progress.overdue ? <span className="badge danger">Overdue</span> : null}</> },
    { key: "status", label: "Status", sort: (row) => statuses.indexOf(row.progress.status), cell: (row) => <><span className={`badge ${statusBadge[row.progress.status]}`}>{row.progress.status}</span>{row.warnings.length ? <span className="badge danger order-warn-badge" title={row.warnings.map((warning) => warning.message).join("\n")}>⚠ {row.warnings.length}</span> : null}</>, filter: { kind: "select", options: statuses, value: (row) => row.progress.status } }
  ];
  const shown = columns.filter((column) => column.required || !hidden.includes(column.key));
  const numbers = orderNumbers(orders);
  const all: Row[] = orders.map((order) => {
    const rows = orderProcessRows(order, lines, directory).filter((row) => visibleCalendarIds.includes(row.calendar.id));
    const product = products.find((item) => item.id === order.productId);
    return { order, number: numbers.get(order.id)!, rows, product, progress: orderProgress(order, rows, today, lines), format: order.format ?? inferFormat(product), warnings: flow.filter((warning) => warning.orderId === order.id), status: orderStatusSummary(order.id, jobOrders, lines, transfers) };
  });
  const sorter = columns.find((column) => column.key === sort.key) ?? columns[0];
  const table = all.filter((row) => orderInMonth(row.order, row.rows, row.progress, month, basis) && columns.every((column) => {
    const value = filters[column.key]?.trim().toLowerCase();
    if (!value || !column.filter) return true;
    if (column.filter.kind === "date") return matchesDate(column.filter.date(row), value);
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
          <option value="scheduled">Scheduled in</option><option value="expected">Expected delivery in</option><option value="received">PO received in</option><option value="created">Order created in</option>
        </select>
        <input type="month" aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </fieldset>
      <details className="orders-columns">
        <summary className="calendar-button"><Columns3 size={16} />Columns</summary>
        <div role="group" aria-label="Columns to show">{columns.map((column) => <label key={column.key}><input type="checkbox" disabled={column.required} checked={column.required || !hidden.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}</div>
      </details>
      {filtering ? <button type="button" className="calendar-button" onClick={() => { setFilters({}); setMonth(""); }}><X size={16} />Clear filters</button> : null}
      {printable ? <button type="button" className="calendar-button" onClick={() => setPrint((current) => ({ request: current.request + 1 }))} title="Print the orders shown, or save as PDF"><Printer size={16} />Print summary</button> : null}
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
              {column.filter?.kind === "date" ? (() => { const date = column.filter.date; const options = dateFilterOptions(all.map((row) => date(row))); return <select className="date-filter" aria-label={`Filter ${column.label} by year, month or date`} value={filters[column.key] ?? ""} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })}>
                <option value="">All</option>
                {options.years.length ? <optgroup label="Year">{options.years.map((year) => <option key={year} value={`y:${year}`}>{year}</option>)}</optgroup> : null}
                {options.months.length ? <optgroup label="Month">{options.months.map((month) => <option key={month.key} value={`m:${month.key}`}>{month.label}</option>)}</optgroup> : null}
                {options.days.length ? <optgroup label="Date">{options.days.map((day) => <option key={day} value={`d:${day}`}>{displayDate(day)}</option>)}</optgroup> : null}
                {options.missing ? <option value="none">Not set</option> : null}
              </select>; })() : null}
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
              {open ? <tr className="order-detail-row"><td colSpan={shown.length + 1}><OrderDetail printable={printable} jobOrders={jobOrders} transfers={transfers} jobActions={jobActions} product={row.product} onPrint={() => setPrint((current) => ({ orderId: row.order.id, request: current.request + 1 }))} order={row.order} format={row.format} warnings={row.warnings} rows={row.rows} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} linked={lines.some((line) => line.productionOrderId === row.order.id)} editable={editable} customers={customers} onSave={onSave} onDelete={(id) => { const result = onDelete(id); if (!result.length) setExpanded(null); return result; }} /></td></tr> : null}
            </Fragment>;
          })}
        </tbody>
      </table>
      <datalist id="order-filter-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
    <OrdersPrint orders={orders} rows={print.orderId ? all.filter((row) => row.order.id === print.orderId) : table} detail={!!print.orderId} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} filtered={table.length !== orders.length} />
  </div>;
}

// "1 awaiting testing · 2/3 passed · 2/3 released · 8,200 boxes released", or "-" before anything is finished.
function statusText(status: Row["status"]) {
  if (!status.jobs || (!status.awaitingTesting && !status.passed && !status.failed && !status.investigating)) return <span className="route-muted">-</span>;
  return <>{status.awaitingTesting ? <span className="badge warning">{status.awaitingTesting} awaiting testing</span> : null}
    {status.investigating ? <span className="badge warning">{status.investigating} under investigation</span> : null}
    {status.failed ? <span className="badge danger">{status.failed} failed</span> : null}
    <small>{status.passed}/{status.jobs} passed · {status.released}/{status.jobs} released{status.rejected ? ` · ${status.rejected} rejected` : ""}</small>
    {status.releasedQuantity.map((item) => <small key={item.uom}>{item.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {item.uom} released</small>)}</>;
}
const statusPrint = (status: Row["status"]) => !status.jobs || (!status.awaitingTesting && !status.passed && !status.failed && !status.investigating) ? "-"
  : [status.awaitingTesting ? `${status.awaitingTesting} awaiting testing` : "", status.investigating ? `${status.investigating} under investigation` : "", status.failed ? `${status.failed} failed` : "", `${status.passed}/${status.jobs} passed`, `${status.released}/${status.jobs} released`, ...status.releasedQuantity.map((item) => `${item.quantity.toLocaleString()} ${item.uom} released`)].filter(Boolean).join(" · ");

const progressText = (progress: OrderProgress) => !progress.processCount ? "Not scheduled" : progress.status === "Completed" ? `All ${progress.batchCount} batch${progress.batchCount === 1 ? "" : "es"} finished`
  : `${progress.batchesFinished}/${progress.batchCount} batches finished${progress.nextStep ? ` · ${progress.nextStep.batch} at ${progress.nextStep.processName}` : ""}`;

// Print sheet for the Orders tab: the order list as shown, or one order with its batch grid.
function OrdersPrint({ rows, orders, detail, lines, directory, visibleCalendarIds, filtered }: { rows: Row[]; orders: PurchaseOrder[]; detail: boolean; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; filtered: boolean }) {
  if (typeof document === "undefined") return null;
  const printed = formatDateTime(new Date());
  return createPortal(<section className="calendar-print-sheet print-orders" aria-hidden="true">
    {detail && rows[0] ? <OrderPrintDetail row={rows[0]} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} printed={printed} /> : <>
      <header><h1>Customer orders</h1><p>{rows.length} order{rows.length === 1 ? "" : "s"}{filtered ? " (filtered)" : ""} · printed {printed}</p></header>
      <table className="print-orders-table">
        <thead><tr><th>#</th><th>Customer</th><th>PO number</th><th>PO received</th><th>Product</th><th>Dosage form</th><th>Order qty</th><th>Progress</th><th>Finished</th><th>Testing / release</th><th>Expected delivery</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.order.id}>
          <td>{row.number}</td><td>{row.order.customerName ?? ""}</td><td>{poLabel(row.order, orders)}</td><td>{row.order.receivedDate ? displayDate(row.order.receivedDate) : ""}</td><td>{row.product?.name ?? "Unknown product"}</td><td>{row.format}</td>
          <td>{row.order.quantity.toLocaleString()} {row.order.uom}</td><td>{progressText(row.progress)}</td>
          <td>{row.progress.finishedQuantity ? `${row.progress.finishedQuantity.toLocaleString()} (${row.progress.percent}%)` : "-"}</td>
          <td>{statusPrint(row.status)}</td>
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
    <p className="print-order-facts">PO received: {row.order.receivedDate ? displayDate(row.order.receivedDate) : "Not set"} · Status: {row.progress.status} · {progressText(row.progress)} · Expected delivery: {row.progress.expectedDate ? displayDate(row.progress.expectedDate) : "Not set"}{row.progress.overdue ? " (overdue)" : ""}</p>
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
function JobOrders({ order, product, format, jobOrders, transfers, lines, actions, directory }: { directory: CalendarDirectory; order: PurchaseOrder; product?: Product; format: ProductFormat; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; lines: PlanLine[]; actions: JobActions }) {
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
  // The processes that plan with the batch quantity, from the unit's route in Admin.
  const countSteps = unitRoute(directory, order.unitId ?? directory.units[0]?.id, format).filter((entry) => entry.settings.planned === "batchQuantity").map((entry) => entry.name).join(", ");
  // The fields shared by adding and editing.
  function readJob(data: FormData) {
    const quantity = Number(data.get("quantity")), uom = String(data.get("uom") ?? order.uom);
    const packQuantity = number(data.get("packQuantity")), packUom = String(data.get("packUom") ?? "").trim();
    const size = number(data.get("batchSize")), sizeUom = String(data.get("batchSizeUom") ?? "kg");
    return { number: String(data.get("number") ?? "").trim(), quantity, uom, batchSizeKg: sizeUom === "kg" ? size : undefined, batchVolumeL: sizeUom === "L" ? size : undefined,
      packQuantity, packUom: packUom || undefined, boxQuantity: number(data.get("boxQuantity")), packingNumber: String(data.get("packingNumber") ?? "").trim() || undefined };
  }
  const fields = (job?: JobOrder) => <>
    <fieldset className="job-measure job-number"><legend>Job order no.</legend><input name="number" required maxLength={60} autoComplete="off" aria-label="Job order no." placeholder="e.g. JO0010" defaultValue={job?.number} /></fieldset>
    <fieldset className="job-measure"><legend title="Batch size, for Dispensing">Batch size<span> · Dispensing</span></legend>
      <input name="batchSize" type="number" min="0" step="any" aria-label="Batch size" defaultValue={job?.batchSizeKg ?? job?.batchVolumeL} placeholder={!job && product?.batchSizeKg ? "From the product if blank" : "e.g. 41.5"} />
      <select name="batchSizeUom" aria-label="Batch size UOM" defaultValue={job?.batchVolumeL ? "L" : "kg"}><option>kg</option><option>L</option></select></fieldset>
    <fieldset className="job-measure"><legend title={`Batch quantity, for ${countSteps || "production"}`}>Batch quantity<span> · {countSteps || "Production"}</span></legend>
      <input name="quantity" type="number" min="0" step="any" required aria-label="Batch quantity" defaultValue={job ? job.quantity : remaining ? Math.min(remaining, allowable ?? remaining) : undefined} />
      <select name="uom" aria-label="Batch quantity UOM" defaultValue={job?.uom ?? order.uom}>{options([order.uom, ...COUNT_UOMS], job?.uom).map((name) => <option key={name}>{name}</option>)}</select></fieldset>
    <fieldset className="job-measure job-number"><legend title="Packing job order number; follows the job order number with PJO in front unless keyed in">Packing JO no.<span> · Packing</span></legend>
      <input name="packingNumber" maxLength={60} autoComplete="off" aria-label="Packing job order no." defaultValue={job?.packingNumber} placeholder={job ? defaultPackingNumber(job.number) : "PJO + job order no."} /></fieldset>
    <fieldset className="job-measure"><legend title="Pack quantity, for Filling">Pack quantity<span> · Filling</span></legend>
      <input name="packQuantity" type="number" min="0" step="any" aria-label="Pack quantity" defaultValue={job?.packQuantity} />
      <select name="packUom" aria-label="Pack quantity UOM" defaultValue={job?.packUom ?? (format === "Sachet" ? "sachets" : "bottles")}>{options(FILL_UOMS, job?.packUom).map((name) => <option key={name}>{name}</option>)}</select></fieldset>
    <fieldset className="job-measure"><legend title="Total pack quantity, for Packing">Total packs<span> · Packing</span></legend>
      <input name="boxQuantity" type="number" min="0" step="any" aria-label="Total pack quantity in boxes" defaultValue={job?.boxQuantity} /><span className="job-measure-unit">boxes</span></fieldset>
  </>;
  const measure = (value?: { quantity: number; uom: string }) => value ? `${value.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} ${value.uom}` : <span className="route-muted">Not keyed in</span>;
  return <section className="job-orders" aria-label={`Job orders for ${order.poNumber}`}>
    <details className="order-section">
    <summary className="order-section-summary"><h3>Job orders <span className="badge neutral">{jobs.length}</span></h3>
      <span className="route-muted">{released.toLocaleString()} of {order.quantity.toLocaleString()} {order.uom} in job orders{remaining ? ` · ${remaining.toLocaleString()} still to release` : ""}{allowable ? ` · allowable batch ${allowable.toLocaleString()} ${order.uom}` : ""}</span></summary>
    {jobs.length ? <div className="order-batch-scroll"><table className="job-order-table">
      <thead><tr><th scope="col">Job order no.</th><th scope="col" className="numeric">Batch size<small>Dispensing</small></th><th scope="col" className="numeric">Batch quantity<small>{countSteps || "Production"}</small></th><th scope="col">PJO no.<small>Packing</small></th><th scope="col" className="numeric">Pack quantity<small>Filling</small></th><th scope="col" className="numeric">Total packs<small>Packing</small></th><th scope="col">Batch number</th><th scope="col"><span className="admin-sr-only">Actions</span></th></tr></thead>
      <tbody>{jobs.map((job) => {
        const planned = linesForJob(job.id, lines).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
        if (editing === job.id) return <tr key={job.id} className="job-order-editing"><td colSpan={8}>
          <form className="job-order-edit" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            // The batch number is keyed in on the Planner Board; editing here keeps it.
            const read = readJob(data);
            const { batchSizeKg: _k, batchVolumeL: _l, packQuantity: _pq, packUom: _pu, packSize: _ps, boxQuantity: _b, packingNumber: _pn, ...rest } = job;
            const next: JobOrder = { ...rest, number: read.number, quantity: read.quantity, uom: read.uom,
              ...(read.batchSizeKg ? { batchSizeKg: read.batchSizeKg } : {}), ...(read.batchVolumeL ? { batchVolumeL: read.batchVolumeL } : {}), ...(read.packQuantity ? { packQuantity: read.packQuantity } : {}),
              ...(read.packUom ? { packUom: read.packUom } : {}), ...(read.boxQuantity ? { boxQuantity: read.boxQuantity } : {}), ...(read.packingNumber ? { packingNumber: read.packingNumber } : {}) };
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
          <td>{packingNumber(job)}</td>
          <td className="numeric">{measure(processQuantity(job, "filling"))}</td>
          <td className="numeric">{measure(processQuantity(job, "packing"))}</td>
          <td>{job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Keyed in on the Planner Board</span>}</td>
          <td><span className="job-actions">
            {actions.canEdit ? <button type="button" className="icon-button" title={`Edit ${job.number}`} aria-label={`Edit ${job.number}`} onClick={() => { setEditing(job.id); setErrors([]); setNotice(""); }}><Pencil size={15} /></button> : null}
            {!planned.length && actions.canEdit ? <button type="button" className="icon-button danger" title={`Remove ${job.number}`} aria-label={`Remove ${job.number}`} onClick={() => report(actions.onDelete(job.id), `${job.number} removed.`)}><Trash2 size={15} /></button> : null}
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
    </details>
  </section>;
}

const shortDate = (value: string) => formatDate(value.slice(0, 10));

// The order's summary as its flow, one column per job order and the stages down the side:
// Planning (job order, planned quantity, batch number), Production (one row per process: days,
// status and actual quantity), QC testing (result) and QA release (released, released quantity).
function OrderFlow({ order, jobOrders, lines, transfers, matrix }: { order: PurchaseOrder; jobOrders: JobOrder[]; lines: PlanLine[]; transfers: { sourceLineId: string }[]; matrix: OrderBatchMatrix }) {
  const jobs = jobsFor(order.id, jobOrders);
  const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });
  const day = (value?: string) => value ? shortDate(value.slice(0, 10)) : "";
  if (!jobs.length) return <p className="order-empty">No job orders yet. Key them in under Job orders, then plan them on the Planner Board.</p>;
  const stage = (label: string) => <tr className="order-flow-stage"><th scope="rowgroup" colSpan={jobs.length + 2}>{label}</th></tr>;
  const row = (label: string, cell: (job: JobOrder) => ReactNode, total?: ReactNode, shade?: (job: JobOrder) => "done" | "planned" | "") => <tr><th scope="row" className="order-batch-process">{label}</th>
    {jobs.map((job) => { const tone = shade?.(job); return <td key={job.id} className={`order-batch-col${tone ? ` order-flow-${tone}` : ""}`}>{cell(job)}</td>; })}<td className="order-batch-summary">{total}</td></tr>;
  const states = new Map(jobs.map((job) => [job.id, batchStatus(job, lines, transfers)]));
  // Planned quantity in boxes (the job order's total packs), else its batch quantity.
  const plannedBoxes = (job: JobOrder) => processQuantity(job, "packing") ?? { quantity: job.quantity, uom: job.uom };
  const plannedUoms = [...new Set(jobs.map((job) => plannedBoxes(job).uom))];
  const plannedTotal = <small>{plannedUoms.map((uom) => `${amount(jobs.filter((job) => plannedBoxes(job).uom === uom).reduce((sum, job) => sum + plannedBoxes(job).quantity, 0))} ${uom}`).join(" · ")}{plannedUoms.length === 1 && plannedUoms[0] === order.uom ? ` of ${amount(order.quantity)} ordered` : ""}</small>;
  const released = jobs.filter((job) => job.releasedAt && job.releaseUom);
  const releasedUoms = [...new Set(released.map((job) => job.releaseUom!))];
  return <div className="order-batch-scroll"><table className="order-batch-table order-flow-grid">
    <thead><tr><th scope="col" className="order-batch-process">Job order</th>{jobs.map((job) => <th scope="col" key={job.id} className="order-batch-col"><strong>{job.number}</strong></th>)}<th scope="col" className="order-batch-summary">Total</th></tr></thead>
    <tbody>
      {stage("Planning")}
      {row("Planned quantity", (job) => { const planned = plannedBoxes(job); return `${amount(planned.quantity)} ${planned.uom}`; }, plannedTotal)}
      {row("Batch number", (job) => job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Not keyed in</span>)}
      {stage("Production")}
      {matrix.rows.length ? matrix.rows.map((process) => {
        const percent = process.planned ? Math.min(100, Math.round(process.completed / process.planned * 100)) : 0;
        // No status words: the cell's colour says it (green done, light yellow planned, white not planned).
        const cellView = (job: JobOrder) => {
          const cell = process.cells[job.number];
          if (!cell) return null;
          const dates = cell.firstDate === cell.lastDate ? shortDate(cell.firstDate) : `${shortDate(cell.firstDate)} – ${shortDate(cell.lastDate)}`;
          return <><span className="batch-dates">{dates}</span>{cell.daysDone ? <small>{cell.completed.toLocaleString()} {process.uom} made</small> : null}</>;
        };
        return <Fragment key={process.calendar.id}>{row(process.processName, cellView,
          <><div className="batch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${process.processName} ${percent}% complete`}><span style={{ width: `${percent}%` }} /></div>
            <small>{process.completed.toLocaleString()} / {process.planned.toLocaleString()} {process.uom} · {percent}%</small></>,
          (job) => { const cell = process.cells[job.number]; return !cell ? "" : cell.days > 0 && cell.daysDone === cell.days ? "done" : "planned"; })}</Fragment>;
      }) : row("Processes", () => null)}
      {stage("QC testing")}
      {row("Result", (job) => {
        const state = states.get(job.id);
        if (state === "Awaiting release" || state === "Released") return <><span className="badge success">Passed</span><small>{day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></>;
        if (state === "Failed testing" || state === "Rejected") return <><span className="badge danger">Failed</span><small>{day(job.testedAt)}{job.testedBy ? ` · ${job.testedBy}` : ""}</small></>;
        if (state === "Under investigation") return <><span className="badge warning">Under investigation</span><small>since {day(job.testedAt)}</small></>;
        if (state === "Awaiting testing") return <span className="badge warning">Awaiting testing</span>;
        return <span className="route-muted">-</span>;
      }, <small>{jobs.filter((job) => job.testedAt && (job.testResult ?? "Passed") === "Passed").length}/{jobs.length} passed</small>)}
      {stage("QA release")}
      {row("Released", (job) => {
        const state = states.get(job.id);
        if (state === "Released") return <><span className="badge success">Released</span><small>{day(job.releasedAt)}{job.releasedBy ? ` · ${job.releasedBy}` : ""}</small></>;
        if (state === "Rejected") return <><span className="badge danger">Rejected</span><small>{day(job.rejectedAt)}{job.rejectedBy ? ` · ${job.rejectedBy}` : ""}</small></>;
        if (state === "Awaiting release") return <span className="badge info">Awaiting release</span>;
        if (state === "Failed testing") return <span className="badge warning">Awaiting QA rejection</span>;
        return <span className="route-muted">-</span>;
      }, <small>{released.length}/{jobs.length} released</small>)}
      {row("Released quantity", (job) => job.releasedAt ? `${amount(job.releaseQuantity ?? 0)} ${job.releaseUom ?? ""}` : <span className="route-muted">-</span>,
        releasedUoms.length ? <small>{releasedUoms.map((uom) => `${amount(released.filter((job) => job.releaseUom === uom).reduce((sum, job) => sum + (job.releaseQuantity ?? 0), 0))} ${uom}`).join(" · ")}</small> : null)}
    </tbody>
  </table></div>;
}

function OrderDetail({ printable, order, product, jobOrders, transfers, jobActions, format, warnings, rows, lines, directory, visibleCalendarIds, linked, editable, customers, onSave, onDelete, onPrint }: {
  product?: Product; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; jobActions?: JobActions;
  format: ProductFormat; warnings: FlowWarning[];
  onPrint: () => void;
  order: PurchaseOrder; rows: OrderProcessRow[]; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; linked: boolean; editable: boolean; printable: boolean; customers: string[];
  onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const matrix = orderBatchMatrix(order, lines, directory, localDateKey(new Date()), visibleCalendarIds);
  const lastDate = rows.reduce((latest, row) => row.lastDate > latest ? row.lastDate : latest, "");
  return <div className="order-detail">
    <div className="order-detail-head">
      {printable ? <button type="button" className="calendar-button" onClick={onPrint}><Printer size={15} />Print this order</button> : null}
    </div>
    {order.deliveryDate && lastDate > order.deliveryDate ? <p className="order-warning" role="alert">Production is scheduled until {displayDate(lastDate)}, after the expected customer delivery on {displayDate(order.deliveryDate)}.</p> : null}
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    <details className="order-section">
      <summary className="order-section-summary"><h3>Progress</h3><span className="route-muted">Planning · Production · QC testing · QA release</span></summary>
      <OrderFlow order={order} jobOrders={jobOrders} lines={lines} transfers={transfers} matrix={matrix} />
    </details>
    {jobActions ? <JobOrders directory={directory} order={order} product={product} format={format} jobOrders={jobOrders} transfers={transfers} lines={lines} actions={jobActions} /> : null}
    {editable ? <form className="order-edit" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const delivery = String(data.get("deliveryDate") ?? ""), received = String(data.get("receivedDate") ?? "");
      const { deliveryDate: _d, receivedDate: _r, ...rest } = order;
      const result = onSave({ ...rest, ...(delivery ? { deliveryDate: delivery } : {}), ...(received ? { receivedDate: received } : {}), customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), quantity: Number(data.get("quantity")), format: String(data.get("format")) as ProductFormat });
      setErrors(result); setSaved(!result.length);
    }}>
      <label>Customer name<input name="customer" required defaultValue={order.customerName} list={`customers-${order.id}`} /></label>
      <datalist id={`customers-${order.id}`}>{customers.map((name) => <option key={name} value={name} />)}</datalist>
      <label>PO number<input name="po" required defaultValue={order.poNumber} /></label>
      <label>PO received date<input name="receivedDate" type="date" max={localDateKey(new Date())} defaultValue={order.receivedDate ?? ""} /></label>
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

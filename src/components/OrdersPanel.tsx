"use client";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import { localDateKey } from "@/lib/services/calendarPrint";
import { orderProcessRows, orderProgress, validateOrder, type OrderProcessRow, type OrderStatus, type PurchaseOrder } from "@/lib/services/orders";
import { ProductSelect } from "./ProductSelect";
import { useUoms } from "./MeasurementSettings";

const displayDate = (value: string) => value.split("-").reverse().join("-");
const statuses: OrderStatus[] = ["Not scheduled", "Scheduled", "In production", "Completed"];
const statusBadge: Record<OrderStatus, string> = { "Not scheduled": "neutral", Scheduled: "info", "In production": "warning", Completed: "success" };

export function OrdersPanel({ orders, lines, products, directory, visibleCalendarIds, editable, userName, onSave, onDelete }: {
  orders: PurchaseOrder[]; lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[];
  editable: boolean; userName: string; onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const uoms = useUoms();
  const [productId, setProductId] = useState("");
  const [uom, setUom] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const today = localDateKey(new Date());
  const productUom = products.find((item) => item.id === productId)?.uom ?? "";
  const customers = [...new Set(orders.map((order) => order.customerName?.trim()).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  const rowsFor = (order: PurchaseOrder) => orderProcessRows(order, lines, directory).filter((row) => visibleCalendarIds.includes(row.calendar.id));
  const table = orders.map((order) => {
    const rows = rowsFor(order);
    return { order, rows, product: products.find((item) => item.id === order.productId), progress: orderProgress(order, rows, today, lines) };
  }).filter(({ order, product, progress }) =>
    (!customerFilter || order.customerName === customerFilter) && (!statusFilter || progress.status === statusFilter) &&
    `${order.customerName ?? ""} ${order.poNumber} ${product?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (a.order.customerName ?? "").localeCompare(b.order.customerName ?? "") || a.order.poNumber.localeCompare(b.order.poNumber));

  return <section className="orders-layout">
    {editable ? <form key={version} className="workspace-panel orders-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const order: PurchaseOrder = { id: `order-${crypto.randomUUID()}`, customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), productId,
        quantity: Number(data.get("quantity")), uom: uom || productUom, expectedDates: {}, createdAt: new Date().toISOString(), createdBy: userName };
      const result = validateOrder(order, orders, products);
      if (!result.length) result.push(...onSave(order));
      setErrors(result);
      if (!result.length) { setNotice(`${order.poNumber} added for ${order.customerName}.`); setProductId(""); setUom(""); setVersion((value) => value + 1); }
    }}>
      <h2>New order</h2>
      <label>Customer name<input name="customer" required maxLength={120} list="order-customers" placeholder="Type or choose a customer" /></label>
      <datalist id="order-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
      <label>PO number<input name="po" required maxLength={60} placeholder="e.g. PO-2610-140" /></label>
      <ProductSelect products={products} value={productId} onChange={(id) => { setProductId(id); setUom(""); }} />
      <div className="quantity-fields"><label>Quantity<input name="quantity" type="number" min="1" step="any" required /></label>
        <label>UOM<select value={uom || productUom} onChange={(event) => setUom(event.target.value)} required>{!productUom && !uom ? <option value="">Select</option> : null}{[...new Set([productUom, ...uoms.filter((item) => item.active).map((item) => item.name)].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
      <button type="submit" className="primary-button"><Plus size={17} />Add order</button>
      {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
      {notice && !errors.length ? <p role="status">{notice}</p> : null}
      <p className="orders-help">Link plan activities to a PO when you add or open them on the Planner Board. Each scheduled process then appears under the order.</p>
    </form> : null}
    <div className="workspace-panel orders-list">
      <div className="panel-title"><h2>Customer orders <span className="badge neutral">{orders.length}</span></h2></div>
      <div className="operational-filters">
        <label className="planning-search">Search<span className="search-control"><Search size={16} /><input type="search" placeholder="Customer, PO or product" value={query} onChange={(event) => setQuery(event.target.value)} /></span></label>
        <label>Customer<select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}><option value="">All customers</option>{customers.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <span className="result-count" aria-live="polite">{table.length} of {orders.length} orders</span>
      </div>
      <div className="orders-table-scroll">
        <table className="orders-table">
          <thead><tr>
            <th scope="col"><span className="admin-sr-only">Details</span></th><th scope="col">Customer</th><th scope="col">PO number</th><th scope="col">Product</th>
            <th scope="col" className="numeric">Order qty</th><th scope="col">Progress</th><th scope="col" className="numeric">Finished</th><th scope="col">Expected completion</th><th scope="col">Status</th>
          </tr></thead>
          <tbody>
            {!table.length ? <tr><td colSpan={9} className="empty-state">{orders.length ? "No orders match these filters." : "No orders yet. Add a customer, PO number and quantity to start."}</td></tr> : null}
            {table.map(({ order, rows, product, progress }) => {
              const open = expanded === order.id;
              return <Fragment key={order.id}>
                <tr className={open ? "order-row open" : "order-row"} onClick={() => setExpanded(open ? null : order.id)}>
                  <td><button type="button" className="icon-button order-toggle" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${order.poNumber} details`} onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : order.id); }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                  <td>{order.customerName || <span className="route-muted">Not set</span>}</td>
                  <th scope="row">{order.poNumber}</th>
                  <td>{product?.name ?? "Unknown product"}</td>
                  <td className="numeric">{order.quantity.toLocaleString()} {order.uom}</td>
                  <td><div className="order-steps" role="img" aria-label={rows.map((row) => `${row.processName} ${Math.round(row.completedCount / row.lineCount * 100)}%`).join(", ")}>
                    {rows.map((row) => <i key={row.calendar.id} title={`${row.processName}: ${row.completedCount} of ${row.lineCount} days complete`} style={{ "--filled": `${row.completedCount / row.lineCount * 100}%` } as React.CSSProperties} />)}
                  </div><small>{!progress.processCount ? "Not scheduled" : progress.status === "Completed" ? `All ${progress.batchCount} batch${progress.batchCount === 1 ? "" : "es"} finished`
                    : `${progress.batchesFinished}/${progress.batchCount} batches finished${progress.nextStep ? ` · ${progress.nextStep.batch} at ${progress.nextStep.processName}` : ""}`}</small></td>
                  <td className="numeric">{progress.finishedQuantity ? <>{progress.finishedQuantity.toLocaleString()}<small>{progress.percent}% of order</small></> : "-"}</td>
                  <td>{progress.expectedDate ? displayDate(progress.expectedDate) : <span className="route-muted">Not set</span>}{progress.overdue ? <span className="badge danger">Overdue</span> : null}</td>
                  <td><span className={`badge ${statusBadge[progress.status]}`}>{progress.status}</span></td>
                </tr>
                {open ? <tr className="order-detail-row"><td colSpan={9}><OrderDetail order={order} rows={rows} linked={lines.some((line) => line.productionOrderId === order.id)} editable={editable} customers={customers} onSave={onSave} onDelete={(id) => { const result = onDelete(id); if (!result.length) setExpanded(null); return result; }} /></td></tr> : null}
              </Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  </section>;
}

function OrderDetail({ order, rows, linked, editable, customers, onSave, onDelete }: {
  order: PurchaseOrder; rows: OrderProcessRow[]; linked: boolean; editable: boolean; customers: string[];
  onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const units = new Set(rows.map((row) => row.unitName));
  return <div className="order-detail">
    {rows.length ? <table className="order-process-table">
      <thead><tr><th scope="col">Process</th><th scope="col">Scheduled</th><th scope="col">Planned quantity</th><th scope="col">Completed</th><th scope="col">Expected completion</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.calendar.id}>
        <th scope="row">{row.processName}{units.size > 1 ? <small>{row.unitName}</small> : null}</th>
        <td>{row.firstDate === row.lastDate ? displayDate(row.firstDate) : `${displayDate(row.firstDate)} to ${displayDate(row.lastDate)}`}</td>
        <td>{row.plannedQuantity.toLocaleString()} {order.uom}</td>
        <td>{row.completedCount ? `${row.completedQuantity.toLocaleString()} ${order.uom} (${row.completedCount}/${row.lineCount} days)` : "-"}</td>
        <td><input type="date" aria-label={`Expected completion for ${row.processName}`} disabled={!editable} value={order.expectedDates[row.calendar.id] ?? ""}
          onChange={(event) => {
            const expectedDates = { ...order.expectedDates };
            if (event.target.value) expectedDates[row.calendar.id] = event.target.value; else delete expectedDates[row.calendar.id];
            setErrors(onSave({ ...order, expectedDates })); setSaved(false);
          }} />{order.expectedDates[row.calendar.id] && order.expectedDates[row.calendar.id] < row.lastDate ? <small className="order-warning">Before last scheduled day</small> : null}</td>
      </tr>)}</tbody>
    </table> : <p>No production has been scheduled against this PO yet.</p>}
    {editable ? <form className="order-edit" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const result = onSave({ ...order, customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), quantity: Number(data.get("quantity")) });
      setErrors(result); setSaved(!result.length);
    }}>
      <label>Customer name<input name="customer" required defaultValue={order.customerName} list={`customers-${order.id}`} /></label>
      <datalist id={`customers-${order.id}`}>{customers.map((name) => <option key={name} value={name} />)}</datalist>
      <label>PO number<input name="po" required defaultValue={order.poNumber} /></label>
      <label>Quantity ({order.uom})<input name="quantity" type="number" min="1" step="any" required defaultValue={order.quantity} /></label>
      <button type="submit" className="calendar-button">Save order</button>
      {confirming ? <><span>Delete {order.poNumber}?</span><button type="button" className="calendar-button" onClick={() => { setErrors(onDelete(order.id)); setConfirming(false); }}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => setConfirming(false)}>Cancel</button></>
        : <button type="button" className="icon-button danger" title={linked ? "Unlink its activities before deleting" : `Delete ${order.poNumber}`} aria-label={`Delete ${order.poNumber}`} onClick={() => setConfirming(true)}><Trash2 size={16} /></button>}
    </form> : null}
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {saved && !errors.length ? <p role="status">Order saved.</p> : null}
  </div>;
}

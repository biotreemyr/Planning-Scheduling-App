"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Columns3, Plus, Trash2, X } from "lucide-react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { PlanLine, Product } from "@/lib/domain/types";
import { localDateKey } from "@/lib/services/calendarPrint";
import { nextOrderNumber, orderBatchMatrix, orderColor, orderInMonth, orderNumbers, orderProcessRows, orderProgress, validateOrder, type BatchCell, type MonthBasis, type OrderProcessRow, type OrderProgress, type OrderStatus, type PurchaseOrder } from "@/lib/services/orders";
import { ProductSelect } from "./ProductSelect";
import { useUoms } from "./MeasurementSettings";
import { OrderBadge } from "./OrderBadge";

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
  const [version, setVersion] = useState(0);
  const productUom = products.find((item) => item.id === productId)?.uom ?? "";
  const customers = [...new Set(orders.map((order) => order.customerName?.trim()).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  return <section className="orders-layout">
    {editable ? <form key={version} className="workspace-panel orders-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const order: PurchaseOrder = { id: `order-${crypto.randomUUID()}`, number: nextOrderNumber(orders), customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), productId,
        quantity: Number(data.get("quantity")), uom: uom || productUom, expectedDates: {}, createdAt: new Date().toISOString(), createdBy: userName };
      const result = validateOrder(order, orders, products);
      if (!result.length) result.push(...onSave(order));
      setErrors(result);
      if (!result.length) { setNotice(`Order ${order.number} (${order.poNumber}) added for ${order.customerName}.`); setProductId(""); setUom(""); setVersion((value) => value + 1); }
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
    <OrdersTable orders={orders} lines={lines} products={products} directory={directory} visibleCalendarIds={visibleCalendarIds} editable={editable} customers={customers} onSave={onSave} onDelete={onDelete} />
  </section>;
}

type Row = { order: PurchaseOrder; number: number; rows: OrderProcessRow[]; product?: Product; progress: OrderProgress };
type Column = {
  key: string; label: string; numeric?: boolean; required?: boolean;
  sort: (row: Row) => string | number; cell: (row: Row) => ReactNode;
  filter?: { kind: "text"; text: (row: Row) => string } | { kind: "select"; options: string[]; value: (row: Row) => string };
};
const COLUMN_STORAGE = "scheduler.orderColumns";

function OrdersTable({ orders, lines, products, directory, visibleCalendarIds, editable, customers, onSave, onDelete }: {
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
    { key: "po", label: "PO number", required: true, sort: (row) => row.order.poNumber, cell: (row) => <strong>{row.order.poNumber}</strong>, filter: { kind: "text", text: (row) => row.order.poNumber } },
    { key: "product", label: "Product", sort: (row) => row.product?.name ?? "", cell: (row) => row.product?.name ?? "Unknown product", filter: { kind: "text", text: (row) => `${row.product?.name ?? ""} ${row.product?.sku ?? ""}` } },
    { key: "quantity", label: "Order qty", numeric: true, sort: (row) => row.order.quantity, cell: (row) => `${row.order.quantity.toLocaleString()} ${row.order.uom}` },
    { key: "progress", label: "Progress", sort: (row) => row.progress.batchCount ? row.progress.batchesFinished / row.progress.batchCount : -1, cell: (row) => <>
      <div className="order-steps" role="img" aria-label={row.rows.map((item) => `${item.processName} ${Math.round(item.completedCount / item.lineCount * 100)}%`).join(", ")}>
        {row.rows.map((item) => <i key={item.calendar.id} title={`${item.processName}: ${item.completedCount} of ${item.lineCount} days complete`} style={{ "--filled": `${item.completedCount / item.lineCount * 100}%` } as React.CSSProperties} />)}
      </div>
      <small>{!row.progress.processCount ? "Not scheduled" : row.progress.status === "Completed" ? `All ${row.progress.batchCount} batch${row.progress.batchCount === 1 ? "" : "es"} finished`
        : `${row.progress.batchesFinished}/${row.progress.batchCount} batches finished${row.progress.nextStep ? ` · ${row.progress.nextStep.batch} at ${row.progress.nextStep.processName}` : ""}`}</small></> },
    { key: "finished", label: "Finished", numeric: true, sort: (row) => row.progress.percent, cell: (row) => row.progress.finishedQuantity ? <>{row.progress.finishedQuantity.toLocaleString()}<small>{row.progress.percent}% of order</small></> : "-" },
    { key: "expected", label: "Expected completion", sort: (row) => row.progress.expectedDate ?? "9999", cell: (row) => <>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : <span className="route-muted">Not set</span>}{row.progress.overdue ? <span className="badge danger">Overdue</span> : null}</> },
    { key: "status", label: "Status", sort: (row) => statuses.indexOf(row.progress.status), cell: (row) => <span className={`badge ${statusBadge[row.progress.status]}`}>{row.progress.status}</span>, filter: { kind: "select", options: statuses, value: (row) => row.progress.status } }
  ];
  const shown = columns.filter((column) => column.required || !hidden.includes(column.key));
  const numbers = orderNumbers(orders);
  const all: Row[] = orders.map((order) => {
    const rows = orderProcessRows(order, lines, directory).filter((row) => visibleCalendarIds.includes(row.calendar.id));
    return { order, number: numbers.get(order.id)!, rows, product: products.find((item) => item.id === order.productId), progress: orderProgress(order, rows, today, lines) };
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
              {open ? <tr className="order-detail-row"><td colSpan={shown.length + 1}><OrderDetail order={row.order} rows={row.rows} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} linked={lines.some((line) => line.productionOrderId === row.order.id)} editable={editable} customers={customers} onSave={onSave} onDelete={(id) => { const result = onDelete(id); if (!result.length) setExpanded(null); return result; }} /></td></tr> : null}
            </Fragment>;
          })}
        </tbody>
      </table>
      <datalist id="order-filter-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
  </div>;
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
    <span>{dates}</span>
    <span className={`badge ${status[1]}`}>{status[0]}{cell.days > 1 && cell.daysDone && cell.daysDone < cell.days ? ` ${cell.daysDone}/${cell.days}` : ""}</span>
    {cell.daysDone ? <small>{cell.completed.toLocaleString()} {uom} made</small> : null}
  </div>;
}

function OrderDetail({ order, rows, lines, directory, visibleCalendarIds, linked, editable, customers, onSave, onDelete }: {
  order: PurchaseOrder; rows: OrderProcessRow[]; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; linked: boolean; editable: boolean; customers: string[];
  onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const units = new Set(rows.map((row) => row.unitName));
  const matrix = orderBatchMatrix(order, lines, directory, localDateKey(new Date()), visibleCalendarIds);
  return <div className="order-detail">
    {rows.length ? <div className="order-batch-scroll"><table className="order-batch-table">
      <thead>
        <tr><th scope="col" rowSpan={2}>Process</th><th scope="colgroup" colSpan={matrix.batches.length + 1}>Planned quantity</th><th scope="col" rowSpan={2}>Expected completion</th></tr>
        <tr>
          {matrix.batches.map((batch) => <th scope="col" key={batch.key}><strong>{batch.label}</strong><BatchSize kg={batch.kg} quantity={batch.quantity} uom={batch.uom} /></th>)}
          <th scope="col" className="order-batch-summary"><strong>Summary</strong><BatchSize kg={matrix.total.kg} quantity={matrix.total.quantity} uom={order.uom} /></th>
        </tr>
      </thead>
      <tbody>{matrix.rows.map((row) => {
        const lastDate = rows.find((item) => item.calendar.id === row.calendar.id)?.lastDate ?? "";
        const percent = row.planned ? Math.min(100, Math.round(row.completed / row.planned * 100)) : 0;
        return <tr key={row.calendar.id}>
          <th scope="row">{row.processName}{units.size > 1 ? <small>{rows.find((item) => item.calendar.id === row.calendar.id)?.unitName}</small> : null}</th>
          {matrix.batches.map((batch) => <td key={batch.key}><BatchStatus cell={row.cells[batch.key]} uom={batch.uom} /></td>)}
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
    </table></div> : <p>No production has been scheduled against this PO yet.</p>}
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

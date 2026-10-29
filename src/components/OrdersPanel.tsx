"use client";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Columns3, FileSpreadsheet, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import type { CalendarDirectory } from "@/lib/domain/calendarAccess";
import type { Customer, PlanLine, Product } from "@/lib/domain/types";
import { type ManualJob, batchStatus, defaultPackingNumber, orderStatusSummary, jobsFor, linesForJob, packingNumber, processQuantity, type JobOrder } from "@/lib/services/jobOrders";
import { MAX_POS_PER_JOB, shortYield, closedSummary, formulaPending, jobForOrder, jobParts, jobsServing, orderViewLines, orderedInJobs, partFor, readyToClose, releaseFor, releasedToOrder, type JobShare } from "@/lib/services/sharedJobs";
import { localDateKey } from "@/lib/services/calendarPrint";
import { formatKg, lastOrderWeights, orderKg, orderWeightKind, type OrderBatchMatrix, nextOrderNumber, nextPoItem, poItem, poItems, poLabel, orderBatchMatrix, orderColor, orderInMonth, orderNumbers, orderProcessRows, orderProgress, validateOrder, isNonProduction, nextRndCode, ORDER_CATEGORIES, type OrderCategory, type BatchCell, type MonthBasis, type OrderProcessRow, type OrderProgress, type OrderStatus, type PurchaseOrder } from "@/lib/services/orders";
import { RecordPicker, type PickerColumn } from "./RecordPicker";
import { usePager } from "./Pager";
import { ordersWorkbook } from "@/lib/services/ordersExcel";
import { PRINT_PERIODS, periodRange, type PrintPeriod } from "@/lib/services/printPeriods";
import { batchYield, formatYield, limitText, type YieldTone } from "@/lib/services/yields";
import { FillNote } from "./FillNote";
import { useYieldLimits } from "./YieldLimitsContext";
import { useDateCheck } from "./DateCheck";
import { Who } from "./Who";
import { batchUnits, fullPacks, isCounted, jobTotals, lastPackSize, leftOver } from "@/lib/services/jobQuantities";
import { DateFilterPicker } from "./DateFilterPicker";
import { matchesDateFilter } from "@/lib/services/dateFilter";
import { customerFor, productFor, type OrderCatalog } from "@/lib/services/masterData";
import { useUoms } from "./MeasurementSettings";
import { OrderBadge } from "./OrderBadge";
import { PRODUCT_FORMATS, inferFormat, type FlowWarning, type ProductFormat } from "@/lib/services/processRules";
import { calendarSettings, unitRoute, unitRouteLabel } from "@/lib/services/processSetup";
import { formatDate, formatDateTime } from "@/lib/services/dates";

const displayDate = (value: string) => formatDate(value.slice(0, 10));
const statuses: OrderStatus[] = ["Not scheduled", "Scheduled", "In production", "Completed"];
const statusBadge: Record<OrderStatus, string> = { "Not scheduled": "neutral", Scheduled: "info", "In production": "warning", Completed: "success" };

export type JobActions = {
  // Create adds job orders; edit changes or removes them (Core's orders create and edit tasks).
  canCreate: boolean; canEdit: boolean;
  // Job order numbers are keyed in; a PO item takes as many job orders as it has batches.
  // Planning more than a PO (process waste, samples) needs a reason: overPlan lists the POs a save
  // would take over their quantity, and the reason goes with the save.
  overPlan: (job: ManualJob | JobOrder) => { poNumber: string; total: number; ordered: number; over: number; uom: string }[];
  onCreate: (job: ManualJob, overPlanReason?: string) => string[];
  onUpdate: (job: JobOrder, overPlanReason?: string) => string[];
  onDelete: (id: string) => string[];
};

export function OrdersPanel({ orders, customers = [], jobOrders = [], jobActions, transfers = [], lines, products, catalog, directory, visibleCalendarIds, creatable, editable, printable = true, userName, onSave, onAdd, onDelete, onClose, flow = [], nonProduction = false }: {
  // Planning closes a PO once QA has released and reconciled every batch for it.
  onClose?: (orderId: string, quantity: number, uom: string, note: string) => string[];
  // nonProduction: the R&D, trial and pilot batch tab, which lists only those orders; Orders lists the rest.
  nonProduction?: boolean;
  orders: PurchaseOrder[]; customers?: Customer[]; jobOrders?: JobOrder[]; jobActions?: JobActions;
  // WIP handovers, to tell final output from output sent on to another process.
  transfers?: { sourceLineId: string }[];
  lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[]; flow?: FlowWarning[];
  // Master Data's finished goods for new orders; without it the form offers the scheduler's own products.
  catalog?: OrderCatalog;
  // creatable: may key in new POs; editable: may change or delete them; printable: may print.
  creatable?: boolean; editable: boolean; printable?: boolean; userName: string; onSave: (order: PurchaseOrder) => string[]; onAdd: (items: PurchaseOrder[], customer: Customer, taken?: Product[]) => string[]; onDelete: (id: string) => string[];
}) {
  const listed = orders.filter((order) => isNonProduction(order) === nonProduction);
  // A batch shared by several POs counts its common processes for each of them.
  const viewLines = orderViewLines(lines, jobOrders, directory);
  const customerNames = [...new Set(listed.map((order) => order.customerName?.trim()).filter((name): name is string => !!name))].sort((a, b) => a.localeCompare(b));
  // New order opens in a pop-up from the orders header, so the page shows just the orders.
  const dialog = useRef<HTMLDialogElement>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [added, setAdded] = useState("");
  const canAdd = creatable ?? editable;
  const newOrderButton = canAdd ? <button type="button" className="primary-button" onClick={() => { setFormVersion((value) => value + 1); setAdded(""); dialog.current?.showModal(); }}><Plus size={17} />New order</button> : null;
  return <section className="orders-layout">
    {canAdd ? <dialog ref={dialog} className="activity-dialog order-dialog" aria-labelledby="new-order-title">
      <NewOrderForm key={formVersion} nonProduction={nonProduction} orders={orders} customers={customers} products={products} catalog={catalog} units={directory.units} directory={directory} userName={userName} onAdd={onAdd}
        onClose={() => dialog.current?.close()} onDone={(message) => { setAdded(message); dialog.current?.close(); }} />
    </dialog> : null}
    {added ? <p role="status" className="calendar-notice">{added}</p> : null}
    {editable && onClose ? <ReadyToClose orders={listed} jobOrders={jobOrders} onClose={onClose} /> : null}
    <OrdersTable nonProduction={nonProduction} action={newOrderButton} printable={printable} orders={listed} customerRecords={customers} jobOrders={jobOrders} transfers={transfers} jobActions={jobActions} lines={viewLines} products={products} directory={directory} visibleCalendarIds={visibleCalendarIds} editable={editable} customers={customerNames} onSave={onSave} onDelete={onDelete} flow={flow} />
  </section>;
}

// R&D, trial and pilot orders name their fields for internal work rather than a customer PO.
const orderWords = (nonProduction: boolean) => nonProduction
  ? { po: "Document number", so: "Reference", received: "Received date", delivery: "Expected completion" }
  : { po: "PO number", so: "SO number", received: "PO received date", delivery: "Expected customer delivery" };

// productName: an R&D, trial or pilot item keys in its product; a name not on the R&D product list adds it there.
type DraftItem = { key: string; productId: string; productName?: string; uom: string; format: ProductFormat | ""; quantity: string; unitWeightMg: string; unitsPerPack: string };
const productColumns: PickerColumn<Product>[] = [
  { key: "code", label: "Item code", value: (product) => product.sku, filter: true },
  { key: "name", label: "Item name", value: (product) => product.name, filter: true },
  { key: "uom", label: "UOM", value: (product) => product.uom }
];
const customerColumns: PickerColumn<Customer>[] = [
  { key: "code", label: "Customer ID", value: (customer) => customer.code, filter: true },
  { key: "name", label: "Customer name", value: (customer) => customer.name, filter: true }
];
const draftItem = (): DraftItem => ({ key: crypto.randomUUID(), productId: "", uom: "", format: "", quantity: "", unitWeightMg: "", unitsPerPack: "" });
const positive = (value: string) => Number(value) > 0 ? Number(value) : undefined;
// The weights an order line saves: only those its unit needs, and only when keyed in.
function draftWeights(item: DraftItem, uom: string): Pick<PurchaseOrder, "unitWeightMg" | "unitsPerPack"> {
  const kind = orderWeightKind(uom);
  const unitWeightMg = kind === "single" || kind === "pack" ? positive(item.unitWeightMg) : undefined;
  const unitsPerPack = kind === "pack" ? positive(item.unitsPerPack) : undefined;
  return { ...(unitWeightMg ? { unitWeightMg } : {}), ...(unitsPerPack ? { unitsPerPack: Math.round(unitsPerPack) } : {}) };
}

// One PO keyed in once: customer and PO number, then as many product line items as it lists.
// Typing an existing PO number of the same customer adds further items to that PO.
function NewOrderForm({ nonProduction, orders, products, catalog, customers, units, directory, userName, onAdd, onClose, onDone }: {
  directory: CalendarDirectory; catalog?: OrderCatalog; nonProduction: boolean;
  orders: PurchaseOrder[]; products: Product[]; customers: Customer[]; units: CalendarDirectory["units"]; userName: string; onAdd: (items: PurchaseOrder[], customer: Customer, taken?: Product[]) => string[];
  onClose: () => void; onDone: (message: string) => void;
}) {
  const uoms = useUoms();
  const checkDates = useDateCheck();
  // With Master Data, only its finished goods and customers are offered, each as the scheduler record it becomes.
  // R&D, trial and pilot orders use their own product list (Admin, R&D products) and any customer, not Master Data.
  const fromMasterData = !nonProduction && catalog?.status === "ok";
  const choices = nonProduction ? products.filter((product) => product.rnd) : catalog?.status === "ok" ? catalog.products.map((master) => productFor(master, products)) : products.filter((product) => !product.rnd);
  const customerChoices = fromMasterData && catalog?.status === "ok" ? catalog.customers.map((master) => customerFor(master, customers)) : customers.filter((item) => item.active === "Active");
  const [items, setItems] = useState<DraftItem[]>(() => [draftItem()]);
  const [poNumber, setPoNumber] = useState("");
  const [category, setCategory] = useState<OrderCategory>("R&D");
  const [soNumber, setSoNumber] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  // Bumped when the PO number fills in the customer, so the picker shows it.
  const [customerPickerVersion, setCustomerPickerVersion] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(() => localDateKey(new Date()));
  // A known customer ID fills in its name. Without Master Data, a new one is added to the customer list with this PO.
  const known = (fromMasterData ? customerChoices : customers).find((item) => item.code.trim().toLowerCase() === customerCode.trim().toLowerCase() && customerCode.trim());
  // Without a customer ID, a name that matches a customer on the list is still linked to it.
  const knownByName = nonProduction && !customerCode.trim() ? customers.find((item) => item.name.trim().toLowerCase() === customerName.trim().toLowerCase() && customerName.trim()) : undefined;
  const words = orderWords(nonProduction);
  const [errors, setErrors] = useState<string[]>([]);
  const [version, setVersion] = useState(0);
  const existing = poNumber.trim() ? poItems(poNumber, orders) : [];
  const firstItem = nextPoItem(poNumber, orders);
  const update = (key: string, change: Partial<DraftItem>) => setItems((current) => current.map((item) => item.key === key ? { ...item, ...change } : item));
  const formatOf = (item: DraftItem) => item.format || inferFormat(choices.find((product) => product.id === item.productId));
  const uomOf = (item: DraftItem) => item.uom || (choices.find((product) => product.id === item.productId)?.uom ?? "");
  // Choosing a product pre-fills the weights from its last order, as its defaults.
  const chooseProduct = (key: string, productId: string) => {
    const last = productId ? lastOrderWeights(productId, orders) : {};
    update(key, { productId, uom: "", format: "", unitWeightMg: last.unitWeightMg ? String(last.unitWeightMg) : "", unitsPerPack: last.unitsPerPack ? String(last.unitsPerPack) : "" });
  };
  return <form key={version} className="form-panel orders-form" onSubmit={(event) => {
    event.preventDefault();
    if (fromMasterData && !known) { setErrors([`Customer ID ${customerCode.trim()} is not in Master Data. Choose a customer from the list.`]); return; }
    checkDates([{ label: words.received, value: receivedDate, rule: "today" }, { label: words.delivery, value: deliveryDate, rule: "delivery", after: { label: `the ${words.received.toLowerCase()}`, value: receivedDate } }], () => {
    const createdAt = new Date().toISOString();
    let number = nextOrderNumber(orders, nonProduction);
    // A customer with no ID is not added to the customer list; the order keeps just the name.
    const customer: Customer = known ?? knownByName ?? { id: customerCode.trim() ? `customer-${crypto.randomUUID()}` : "", code: customerCode.trim(), name: customerName.trim(), active: "Active" };
    // An R&D product keyed in that is not on the list yet is added to it, with the next RND code.
    const added: Product[] = [];
    const productOf = (item: DraftItem) => {
      if (item.productId || !nonProduction || !item.productName?.trim()) return item.productId;
      const name = item.productName.trim();
      const again = added.find((product) => product.name.toLowerCase() === name.toLowerCase());
      if (again) return again.id;
      const product: Product = { id: `product-${crypto.randomUUID()}`, sku: nextRndCode([...products, ...added]), name, uom: item.uom, productType: "Finished Good", active: "Active", rnd: true };
      added.push(product);
      return product.id;
    };
    const built: PurchaseOrder[] = items.map((item, index) => ({
      id: `order-${crypto.randomUUID()}`, number: number++, item: firstItem + index, format: formatOf(item), ...(units.length === 1 ? { unitId: units[0].id } : {}),
      customerId: customer.id, customerName: customer.name, poNumber: poNumber.trim(), ...(soNumber.trim() ? { soNumber: soNumber.trim() } : {}), productId: productOf(item),
      quantity: Number(item.quantity), uom: uomOf(item), ...draftWeights(item, uomOf(item)),
      expectedDates: {}, receivedDate, ...(deliveryDate ? { deliveryDate } : {}), ...(nonProduction ? { category } : {}), createdAt, createdBy: userName
    }));
    const result = onAdd(built, customer, [...choices.filter((product) => product.masterDataId && built.some((order) => order.productId === product.id)), ...added]);
    setErrors(result);
    if (!result.length) {
      const range = built.length === 1 ? `order ${built[0].number}` : `orders ${built[0].number}-${built.at(-1)!.number}`;
      onDone(`${built[0].poNumber} for ${built[0].customerName}: ${built.length} item${built.length === 1 ? "" : "s"} added as ${range}. Open it in the list to key in its job orders.`);
      setItems([draftItem()]); setPoNumber(""); setSoNumber(""); setDeliveryDate(""); setReceivedDate(localDateKey(new Date())); setCustomerCode(""); setCustomerName(""); setVersion((value) => value + 1);
    }
    });
  }}>
    <div className="panel-title"><h2 id="new-order-title">{nonProduction ? "New R&D, trial or pilot order" : "New order"}</h2><button className="icon-button" type="button" aria-label="Close new order" title="Close" onClick={onClose}><X size={18} /></button></div>
    {nonProduction ? <label>Type<select name="category" value={category} onChange={(event) => setCategory(event.target.value as OrderCategory)}>{ORDER_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
    {nonProduction ? <><label>Customer ID<input name="customerId" maxLength={40} list="order-customers" placeholder="Optional" value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} /></label>
        <datalist id="order-customers">{customerChoices.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</datalist>
        <label>Customer name<input name="customer" required maxLength={120} list="order-customer-names" placeholder="Choose or type, e.g. Internal" readOnly={!!known} value={known ? known.name : customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>
        <datalist id="order-customer-names">{[...new Set([...customerChoices.map((item) => item.name), ...orders.map((item) => item.customerName ?? "")].filter(Boolean))].map((name) => <option key={name} value={name} />)}</datalist></>
    : fromMasterData
      ? <RecordPicker key={customerPickerVersion} label="Customer ID" name="customerId" noun="customer" records={customerChoices} columns={customerColumns} display={(item) => item.code}
          value={known?.id} placeholder="Type or choose, e.g. 305-P0001" onText={setCustomerCode} />
      : <><label>Customer ID<input name="customerId" required maxLength={40} list="order-customers" placeholder="Type or choose, e.g. C0012" value={customerCode} onChange={(event) => setCustomerCode(event.target.value)} /></label>
        <datalist id="order-customers">{customerChoices.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</datalist></>}
    {nonProduction ? null : <label>Customer name<input name="customer" required maxLength={120} placeholder={fromMasterData ? "Filled in from Master Data" : known ? "" : "New customer's name"} readOnly={!!known || fromMasterData} value={known ? known.name : fromMasterData ? "" : customerName} onChange={(event) => setCustomerName(event.target.value)} /></label>}
    <label>{words.po}<input name="po" required maxLength={60} placeholder={nonProduction ? "e.g. RND-2610-01" : "e.g. PO-2610-140"} value={poNumber} onChange={(event) => {
      setPoNumber(event.target.value);
      // An existing PO keeps its customer.
      const owner = poItems(event.target.value, orders).find((item) => item.customerId);
      // So does its SO number, when the PO already has one.
      const so = poItems(event.target.value, orders).find((item) => item.soNumber)?.soNumber;
      if (so && !soNumber.trim()) setSoNumber(so);
      const record = customers.find((item) => item.id === owner?.customerId);
      if (record && !customerCode.trim()) { setCustomerCode(record.code); setCustomerPickerVersion((value) => value + 1); }
    }} /></label>
    <label>{words.so}<input name="so" maxLength={60} placeholder={nonProduction ? "Optional" : "Optional, e.g. SO2608004"} value={soNumber} onChange={(event) => setSoNumber(event.target.value)} /></label>
    <label>{words.received}<input name="receivedDate" type="date" required max={localDateKey(new Date())} value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} /></label>
    <label>{words.delivery}<input name="deliveryDate" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
    {customerCode.trim() && !known ? <p className="orders-help" role="status">{fromMasterData ? `Customer ID ${customerCode.trim()} is not in Master Data's customer list. Customers are added in SQL Account and imported into Master Data.` : `New customer ID ${customerCode.trim()}: it is added to the customer list with this PO.`}</p> : null}
    {!nonProduction && catalog?.status === "unavailable" ? <p className="orders-help" role="status">Bio Tree Master Data could not be reached, so the products listed are the scheduler&apos;s own. Reload to try again.</p> : null}
    {existing.length ? <p className="orders-help" role="status">{existing[0].poNumber} already has {existing.length} item{existing.length === 1 ? "" : "s"}{existing[0].customerName ? ` for ${existing[0].customerName}` : ""}. These are added as item {firstItem}{items.length > 1 ? ` to ${firstItem + items.length - 1}` : ""}.</p> : null}
    <fieldset className="order-items">
      <legend>Line items <span className="badge neutral">{items.length}</span></legend>
      {nonProduction ? <datalist id="rnd-products">{choices.filter((product) => product.active === "Active").map((product) => <option key={product.id} value={product.name}>{product.sku}</option>)}</datalist> : null}
      {items.map((item, index) => {
        const productUom = choices.find((product) => product.id === item.productId)?.uom ?? "";
        const format = formatOf(item);
        return <div className="order-item" key={item.key} role="group" aria-label={`Item ${firstItem + index}`}>
          <div className="order-item-head"><strong>Item {firstItem + index}</strong>
            {items.length > 1 ? <button type="button" className="icon-button" aria-label={`Remove item ${firstItem + index}`} title="Remove this item" onClick={() => setItems((current) => current.filter((other) => other.key !== item.key))}><Trash2 size={15} /></button> : null}
          </div>
          {nonProduction ? <><label>Product<input name={`product-${item.key}`} required maxLength={120} list="rnd-products" placeholder="Choose or type a product name" value={item.productName ?? ""} onChange={(event) => {
            const name = event.target.value;
            const match = choices.find((product) => product.active === "Active" && (product.name.toLowerCase() === name.trim().toLowerCase() || `${product.sku} - ${product.name}`.toLowerCase() === name.trim().toLowerCase()));
            update(item.key, { productName: match ? match.name : name, productId: match?.id ?? "", ...(match && match.id !== item.productId ? { uom: "" } : {}) });
          }} /></label>
            {item.productName?.trim() && !item.productId ? <small className="route-muted">New: added to the R&amp;D product list</small> : null}</>
          : <RecordPicker label="Product" name={`product-${item.key}`} noun="product" records={choices.filter((product) => product.active === "Active")} columns={productColumns}
            display={(product) => `${product.sku} - ${product.name}`} placeholder="Search item code or name" value={item.productId} onChange={(id) => chooseProduct(item.key, id)} />}
          <label title={unitRouteLabel(directory, units[0]?.id, format)}>Dosage form<select value={format} onChange={(event) => update(item.key, { format: event.target.value as ProductFormat })}>{PRODUCT_FORMATS.map((option) => <option key={option}>{option}</option>)}</select></label>
          <div className="quantity-fields"><label>Quantity<input name={`quantity-${item.key}`} type="number" min="1" step="any" required value={item.quantity} onChange={(event) => update(item.key, { quantity: event.target.value })} /></label>
            <label>UOM<select value={item.uom || productUom} onChange={(event) => update(item.key, { uom: event.target.value })} required>{!productUom && !item.uom ? <option value="">Select</option> : null}{[...new Set([productUom, ...uoms.filter((unit) => unit.active).map((unit) => unit.name)].filter(Boolean))].map((name) => <option key={name}>{name}</option>)}</select></label></div>
          <OrderWeightFields uom={uomOf(item)} quantity={item.quantity} unitWeightMg={item.unitWeightMg} unitsPerPack={item.unitsPerPack} names={item.key}
            onChange={(change) => update(item.key, change)} remembered={(() => { const last = lastOrderWeights(item.productId, orders); return !!last.unitWeightMg && String(last.unitWeightMg) === item.unitWeightMg && String(last.unitsPerPack ?? "") === (orderWeightKind(uomOf(item)) === "pack" ? item.unitsPerPack : String(last.unitsPerPack ?? "")); })()} />
          <small className="route-muted">Route: {unitRouteLabel(directory, units[0]?.id, format)}</small>
        </div>;
      })}
      <button type="button" className="calendar-button" onClick={() => setItems((current) => [...current, draftItem()])}><Plus size={16} />Add another product</button>
    </fieldset>
    <button type="submit" className="primary-button"><Plus size={17} />{items.length > 1 ? nonProduction ? `Add ${items.length} items` : `Add PO with ${items.length} items` : "Add order"}</button>
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    <p className="orders-help">Each product becomes its own numbered order. After saving, open it in the list to key in its job orders, one per batch.</p>
  </form>;
}

// Unit weight and, for packs, units per pack, with the order's total kg worked out as they are keyed in.
function OrderWeightFields({ uom, quantity, unitWeightMg, unitsPerPack, names, onChange, remembered }: {
  uom: string; quantity: string; unitWeightMg: string; unitsPerPack: string; names: string; remembered?: boolean;
  onChange: (change: { unitWeightMg?: string; unitsPerPack?: string }) => void;
}) {
  const kind = orderWeightKind(uom);
  if (!uom) return null;
  const kg = orderKg({ quantity: Number(quantity), uom, unitWeightMg: positive(unitWeightMg), unitsPerPack: positive(unitsPerPack) });
  const one = uom.replace(/(x|ch|sh)es$/i, "$1").replace(/s$/i, "") || "unit";
  return <div className="order-weight">
    {kind === "single" || kind === "pack" ? <label>Unit weight (mg)<input name={`unitWeightMg-${names}`} type="number" min="0" step="any" placeholder="e.g. 332" title="One tablet, capsule or sachet, in mg (a 2.5 g sachet is 2500)" value={unitWeightMg} onChange={(event) => onChange({ unitWeightMg: event.target.value })} /></label> : null}
    {kind === "pack" ? <label>Units per {one}<input name={`unitsPerPack-${names}`} type="number" min="1" step="1" placeholder="e.g. 90" title={`Tablets, capsules or sachets in one ${one}`} value={unitsPerPack} onChange={(event) => onChange({ unitsPerPack: event.target.value })} /></label> : null}
    <p className="order-weight-total" aria-live="polite">{kind === "volume" ? <span className="route-muted">No weight for a volume</span>
      : kg !== undefined ? <>Total <strong>{formatKg(kg)}</strong>{remembered && kind !== "weight" ? <small>from this product&apos;s last order</small> : null}</>
      : <span className="route-muted">{kind === "pack" ? `Key in the unit weight and units per ${one} for the total kg` : "Key in the unit weight for the total kg"}</span>}</p>
  </div>;
}

type Row = { order: PurchaseOrder; number: number; rows: OrderProcessRow[]; product?: Product; progress: OrderProgress; format: ProductFormat; warnings: FlowWarning[]; status: ReturnType<typeof orderStatusSummary> };
type Column = {
  key: string; label: string; numeric?: boolean; required?: boolean;
  sort: (row: Row) => string | number; cell: (row: Row) => ReactNode;
  filter?: { kind: "text"; text: (row: Row) => string } | { kind: "select"; options: string[]; value: (row: Row) => string } | { kind: "date"; date: (row: Row) => string | undefined };
};
const COLUMN_STORAGE = "scheduler.orderColumns";


// Views of the order list, chosen from the tabs above it; each describes itself on hover.
type OrderView = "all" | "not-scheduled" | "scheduled" | "in-production" | "completed" | "closed";
const ORDER_VIEWS: { key: Exclude<OrderView, "all">; label: string; hint: string }[] = [
  { key: "not-scheduled", label: "Not scheduled", hint: "Orders with no job order planned yet" },
  { key: "scheduled", label: "Scheduled", hint: "Orders planned on the Planner Board but not started" },
  { key: "in-production", label: "In production", hint: "Orders with production under way" },
  { key: "completed", label: "Completed", hint: "Orders with all production finished, waiting to be closed" },
  { key: "closed", label: "Closed", hint: "Orders the planner has closed after QA's release" }
];
const viewOf = (row: Row): Exclude<OrderView, "all"> => row.order.closedAt ? "closed" : row.progress.status === "Completed" ? "completed" : row.progress.status === "In production" ? "in-production" : row.progress.status === "Scheduled" ? "scheduled" : "not-scheduled";
const isView = (value: unknown): value is OrderView => value === "all" || ORDER_VIEWS.some((view) => view.key === value);
// A printed list page holds about this many orders (A4 landscape).
const ORDERS_PER_PRINTED_PAGE = 14;
const monthBounds = (day: string) => { const [year, month] = day.split("-").map(Number); return { from: `${day.slice(0, 7)}-01`, to: `${day.slice(0, 7)}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}` }; };

function OrdersTable({ nonProduction, action, printable, orders, customerRecords, jobOrders, transfers, jobActions, lines, products, directory, visibleCalendarIds, editable, customers, onSave, onDelete, flow }: {
  customerRecords: Customer[]; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; jobActions?: JobActions; action?: ReactNode; nonProduction: boolean;
  flow: FlowWarning[];
  orders: PurchaseOrder[]; lines: PlanLine[]; products: Product[]; directory: CalendarDirectory; visibleCalendarIds: string[];
  editable: boolean; printable: boolean; customers: string[]; onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const today = localDateKey(new Date());
  const title = nonProduction ? "R&D, trial & pilot batches" : "Customer orders";
  const [filters, setFilters] = useState<Record<string, string>>({});
  // Newest order first, so recent orders are at the top of the first page.
  const [sort, setSort] = useState<{ key: string; ascending: boolean }>({ key: "number", ascending: false });
  // The tab chosen above the table, remembered per person on this computer, for each list.
  const viewStorage = nonProduction ? "scheduler.trialsView" : "scheduler.ordersView";
  const [view, setView] = useState<OrderView>("all");
  useEffect(() => { try { const saved = localStorage.getItem(viewStorage); if (isView(saved)) setView(saved); } catch { /* starts on All */ } }, [viewStorage]);
  const chooseView = (next: OrderView) => { setView(next); try { localStorage.setItem(viewStorage, next); } catch { /* not remembered */ } };
  // Print summary first asks which orders: views, and when the PO was received.
  const [printSetup, setPrintSetup] = useState<{ views: OrderView[]; period: PrintPeriod; from: string; to: string } | null>(null);
  const [printRows, setPrintRows] = useState<string[] | null>(null);
  // What the printed or downloaded list covers, e.g. "Scheduled, In production · PO received 01/10/2026 – 31/10/2026".
  const [printCaption, setPrintCaption] = useState("");
  // The print choices open in a pop-up window over the list.
  const printDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const box = printDialog.current; if (!box) return; if (printSetup && !box.open) box.showModal(); if (!printSetup && box.open) box.close(); }, [printSetup]);
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
    { key: "number", label: "#", required: true, sort: (row) => row.number, cell: (row) => <span className="order-number-cell" style={{ "--order-color": orderColor(row.number) } as React.CSSProperties}><OrderBadge number={row.number} poNumber={row.order.poNumber} trial={isNonProduction(row.order)} /></span> },
    ...(nonProduction ? [{ key: "category", label: "Type", sort: (row: Row) => row.order.category ?? "", cell: (row: Row) => <span className="badge neutral">{row.order.category}</span>, filter: { kind: "select" as const, options: [...ORDER_CATEGORIES], value: (row: Row) => row.order.category ?? "" } }] : []),
    { key: "received", label: nonProduction ? "Received" : "PO received", sort: (row) => row.order.receivedDate ?? "", cell: (row) => row.order.receivedDate ? displayDate(row.order.receivedDate) : <span className="route-muted">Not set</span>, filter: { kind: "date", date: (row) => row.order.receivedDate } },
    { key: "customer", label: "Customer", sort: (row) => row.order.customerName ?? "", cell: (row) => { const record = customerRecords.find((item) => item.id === row.order.customerId); return row.order.customerName ? <>{row.order.customerName}{record ? <small>ID {record.code}</small> : null}</> : <span className="route-muted">Not set</span>; }, filter: { kind: "text", text: (row) => `${row.order.customerName ?? ""} ${customerRecords.find((item) => item.id === row.order.customerId)?.code ?? ""}` } },
    { key: "po", label: nonProduction ? "Document no." : "PO number", required: true, sort: (row) => `${row.order.poNumber}#${String(poItem(row.order)).padStart(4, "0")}`, cell: (row) => <><strong>{row.order.poNumber}</strong>{poItems(row.order.poNumber, orders).length > 1 ? <small>Item {poItem(row.order)} of {poItems(row.order.poNumber, orders).length}</small> : null}</>, filter: { kind: "text", text: (row) => row.order.poNumber } },
    { key: "so", label: nonProduction ? "Reference" : "SO number", sort: (row) => row.order.soNumber ?? "", cell: (row) => row.order.soNumber ?? <span className="route-muted">-</span>, filter: { kind: "text", text: (row) => row.order.soNumber ?? "" } },
    { key: "product", label: "Product", sort: (row) => row.product?.name ?? "", cell: (row) => row.product?.name ?? "Unknown product", filter: { kind: "text", text: (row) => `${row.product?.name ?? ""} ${row.product?.sku ?? ""}` } },
    { key: "format", label: "Dosage form", sort: (row) => row.format, cell: (row) => <span title={unitRouteLabel(directory, row.order.unitId ?? directory.units[0]?.id, row.format)}>{row.format}</span>, filter: { kind: "select", options: [...PRODUCT_FORMATS], value: (row) => row.format } },
    { key: "quantity", label: "Order qty", numeric: true, sort: (row) => row.order.quantity, cell: (row) => `${row.order.quantity.toLocaleString()} ${row.order.uom}` },
    { key: "kg", label: "Total kg", numeric: true, sort: (row) => orderKg(row.order) ?? -1, cell: (row) => { const kg = orderKg(row.order); return kg !== undefined ? kg.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : <span className="route-muted" title="Key in the unit weight on the order">-</span>; } },
    { key: "progress", label: "Progress", sort: (row) => row.progress.batchCount ? row.progress.batchesFinished / row.progress.batchCount : -1, cell: (row) => <>
      <div className="order-steps" role="img" aria-label={row.rows.map((item) => `${item.processName} ${Math.round(item.completedCount / item.lineCount * 100)}%`).join(", ")}>
        {row.rows.map((item) => <i key={item.calendar.id} title={`${item.processName}: ${item.completedCount} of ${item.lineCount} days complete`} style={{ "--filled": `${item.completedCount / item.lineCount * 100}%` } as React.CSSProperties} />)}
      </div>
      <small title={progressText(row.progress)}>{progressText(row.progress)}</small></> },
    { key: "finished", label: "Finished", numeric: true, sort: (row) => row.progress.percent, cell: (row) => row.progress.finishedQuantity ? <>{row.progress.finishedQuantity.toLocaleString()}<small>{row.progress.percent}% of order</small></> : "-" },
    { key: "release", label: "Testing / release", sort: (row) => row.status.jobs ? row.status.released / row.status.jobs : -1, cell: (row) => statusText(row.status) },
    { key: "expected", label: nonProduction ? "Expected completion" : "Expected delivery", sort: (row) => row.progress.expectedDate ?? "9999", cell: (row) => <>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : <span className="route-muted">Not set</span>}{row.progress.overdue ? <span className="badge danger">Overdue</span> : null}</> },
    { key: "status", label: "Status", sort: (row) => statuses.indexOf(row.progress.status), cell: (row) => <>{row.order.closedAt ? <span className="badge success" title={[closedSummary(row.order), row.order.closeNote].filter(Boolean).join(" · ")}>Closed</span> : <span className={`badge ${statusBadge[row.progress.status]}`}>{row.progress.status}</span>}{row.order.closedAt ? <small>{closedSummary(row.order).replace(/^Closed · /, "")}</small> : null}{row.warnings.length ? <span className="badge danger order-warn-badge" title={row.warnings.map((warning) => warning.message).join("\n")}>⚠ {row.warnings.length}</span> : null}</> }
  ];
  const shown = columns.filter((column) => column.required || !hidden.includes(column.key));
  const numbers = orderNumbers(orders);
  const all: Row[] = orders.map((order) => {
    const rows = orderProcessRows(order, lines, directory).filter((row) => visibleCalendarIds.includes(row.calendar.id));
    const product = products.find((item) => item.id === order.productId);
    return { order, number: numbers.get(order.id)!, rows, product, progress: orderProgress(order, rows, today, lines), format: order.format ?? inferFormat(product), warnings: flow.filter((warning) => warning.orderId === order.id), status: orderStatusSummary(order.id, jobOrders, lines, transfers) };
  });
  const sorter = columns.find((column) => column.key === sort.key) ?? columns[0];
  const filtered = all.filter((row) => orderInMonth(row.order, row.rows, row.progress, month, basis) && columns.every((column) => {
    const value = filters[column.key]?.trim().toLowerCase();
    if (!value || !column.filter) return true;
    if (column.filter.kind === "date") return matchesDateFilter(column.filter.date(row), value);
    return column.filter.kind === "text" ? column.filter.text(row).toLowerCase().includes(value) : column.filter.value(row).toLowerCase() === value;
  })).sort((a, b) => {
    const x = sorter.sort(a), y = sorter.sort(b);
    const result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return (result || a.order.poNumber.localeCompare(b.order.poNumber)) * (sort.ascending ? 1 : -1);
  });
  const counts = Object.fromEntries(ORDER_VIEWS.map((item) => [item.key, filtered.filter((row) => viewOf(row) === item.key).length])) as Record<Exclude<OrderView, "all">, number>;
  const table = view === "all" ? filtered : filtered.filter((row) => viewOf(row) === view);
  const { rows: page, pager } = usePager(table, `${view}|${month}|${basis}|${JSON.stringify(filters)}|${sort.key}|${sort.ascending}`, [50, 100]);
  const filtering = !!month || Object.values(filters).some((value) => value.trim());
  // What the print options would print: the views ticked, received in the period, with the searches applied.
  const receivedOn = (row: Row) => row.order.receivedDate ?? row.order.createdAt.slice(0, 10);
  const inPeriod = (row: Row) => !printSetup || ((!printSetup.from || receivedOn(row) >= printSetup.from) && (!printSetup.to || receivedOn(row) <= printSetup.to));
  const toPrint = printSetup ? filtered.filter((row) => printSetup.views.includes(viewOf(row)) && inPeriod(row)) : [];
  const periodCounts = Object.fromEntries(ORDER_VIEWS.map((item) => [item.key, filtered.filter((row) => viewOf(row) === item.key && inPeriod(row)).length]));
  const receivedWord = nonProduction ? "Received" : "PO received";
  const captionFor = (setup: NonNullable<typeof printSetup>) => [
    setup.views.length === ORDER_VIEWS.length ? "All orders" : ORDER_VIEWS.filter((item) => setup.views.includes(item.key)).map((item) => item.label).join(", "),
    setup.from || setup.to ? `${receivedWord} ${setup.from ? displayDate(setup.from) : "…"} – ${setup.to ? displayDate(setup.to) : "…"}` : `${receivedWord}: all dates`,
    ...(filtering ? ["with the list's searches and month filter"] : [])
  ].join(" · ");
  const pages = Math.max(1, Math.ceil(toPrint.length / ORDERS_PER_PRINTED_PAGE));
  async function downloadExcel(rows: Row[], caption: string) {
    const book = await ordersWorkbook(rows.map((row) => ({
      received: row.order.receivedDate, customer: row.order.customerName ?? "", po: poLabel(row.order, orders), reference: row.order.soNumber ?? "", productCode: row.product?.sku ?? "", product: row.product?.name ?? "Unknown product",
      format: row.format, quantity: row.order.quantity, uom: row.order.uom, kg: orderKg(row.order), progress: progressText(row.progress), finished: row.progress.finishedQuantity || undefined,
      release: statusPrint(row.status), expected: row.progress.expectedDate, status: row.order.closedAt ? closedSummary(row.order) : row.progress.status
    })), { title, caption, sheet: nonProduction ? "R&D, trial & pilot" : "Customer orders", at: formatDateTime(new Date()),
      labels: { received: receivedWord, po: nonProduction ? "Document no." : "PO number", reference: nonProduction ? "Reference" : "SO number", expected: nonProduction ? "Expected completion" : "Expected delivery" } });
    const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${nonProduction ? "rnd-trial-pilot" : "customer-orders"}-${today}.xlsx`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="workspace-panel orders-list">
    <div className="orders-toolbar">
      <h2>{title} <span className="badge neutral">{orders.length}</span></h2>
      <fieldset className="orders-month"><legend>Month</legend>
        <select aria-label="Month based on" value={basis} onChange={(event) => setBasis(event.target.value as MonthBasis)}>
          <option value="scheduled">Scheduled in</option><option value="expected">{nonProduction ? "Expected completion in" : "Expected delivery in"}</option><option value="received">{nonProduction ? "Received in" : "PO received in"}</option><option value="created">Order created in</option>
        </select>
        <input type="month" aria-label="Month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </fieldset>
      <details className="orders-columns">
        <summary className="calendar-button"><Columns3 size={16} />Columns</summary>
        <div role="group" aria-label="Columns to show">{columns.map((column) => <label key={column.key}><input type="checkbox" disabled={column.required} checked={column.required || !hidden.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}</div>
      </details>
      {filtering ? <button type="button" className="calendar-button" onClick={() => { setFilters({}); setMonth(""); }}><X size={16} />Clear filters</button> : null}
      {printable ? <button type="button" className="calendar-button" aria-expanded={!!printSetup} onClick={() => setPrintSetup(printSetup ? null : { views: view === "all" ? ORDER_VIEWS.map((item) => item.key) : [view], period: "this-month", ...periodRange("this-month", today) })} title="Choose which orders to print or download in Excel"><Printer size={16} />Print summary</button> : null}
      <span className="result-count" aria-live="polite">{table.length} of {orders.length} orders</span>
      {action}
    </div>
    <dialog ref={printDialog} className="activity-dialog print-dialog" aria-labelledby="print-dialog-title" onClose={() => setPrintSetup(null)}>
    {printSetup ? <div className="print-chooser">
      <header className="print-chooser-head">
        <div><h2 id="print-dialog-title">Print summary</h2><p>Choose the orders, then print or download them in Excel.</p></div>
        <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={() => setPrintSetup(null)}><X size={18} /></button>
      </header>
      <section className="print-chooser-step" aria-labelledby="print-step-orders">
        <div className="print-chooser-label"><h3 id="print-step-orders">Orders to include</h3>
          <button type="button" className="link-button" onClick={() => setPrintSetup({ ...printSetup, views: printSetup.views.length === ORDER_VIEWS.length ? [] : ORDER_VIEWS.map((item) => item.key) })}>{printSetup.views.length === ORDER_VIEWS.length ? "Clear all" : "Select all"}</button></div>
        <div className="choice-chips" role="group" aria-label="Orders to include">
          {ORDER_VIEWS.map((item) => { const on = printSetup.views.includes(item.key); return <button key={item.key} type="button" className="choice-chip" aria-pressed={on} title={item.hint}
            onClick={() => setPrintSetup({ ...printSetup, views: on ? printSetup.views.filter((key) => key !== item.key) : [...printSetup.views, item.key] })}>
            <span className="choice-check" aria-hidden="true">{on ? "✓" : ""}</span>{item.label}<span className="choice-count">{periodCounts[item.key]}</span></button>; })}
        </div>
      </section>
      <section className="print-chooser-step" aria-labelledby="print-step-period">
        <div className="print-chooser-label"><h3 id="print-step-period">{receivedWord}</h3></div>
        <div className="choice-chips" role="radiogroup" aria-label={receivedWord}>
          {PRINT_PERIODS.map((item) => <button key={item.key} type="button" role="radio" className="choice-chip" aria-checked={printSetup.period === item.key} aria-pressed={printSetup.period === item.key}
            onClick={() => setPrintSetup({ ...printSetup, period: item.key, ...(item.key === "custom" ? {} : periodRange(item.key, today)) })}>{item.label}</button>)}
        </div>
        {printSetup.period === "custom" ? <div className="print-chooser-dates">
          <label>From<input type="date" value={printSetup.from} max={printSetup.to || undefined} onChange={(event) => setPrintSetup({ ...printSetup, from: event.target.value })} /></label>
          <label>To<input type="date" value={printSetup.to} min={printSetup.from || undefined} onChange={(event) => setPrintSetup({ ...printSetup, to: event.target.value })} /></label>
        </div> : <p className="print-chooser-range">{printSetup.from || printSetup.to ? `${displayDate(printSetup.from)} – ${displayDate(printSetup.to)}` : "Every order, whenever it was received"}</p>}
      </section>
      <section className={`print-chooser-summary${toPrint.length ? "" : " empty"}`} aria-live="polite">
        <strong>{toPrint.length}</strong>
        <span>{toPrint.length ? <>order{toPrint.length === 1 ? "" : "s"} · about {pages} printed page{pages === 1 ? "" : "s"}</> : "No orders match these choices"}
          {filtering ? <small>The list's searches and month filter also apply.</small> : null}</span>
      </section>
      <footer className="print-chooser-actions">
        <button type="button" className="calendar-button" onClick={() => setPrintSetup(null)}>Cancel</button>
        <button type="button" className="calendar-button" disabled={!toPrint.length} onClick={() => void downloadExcel(toPrint, captionFor(printSetup))}><FileSpreadsheet size={16} />Download Excel</button>
        <button type="button" className="primary-button" disabled={!toPrint.length} onClick={() => { printDialog.current?.close(); setPrintCaption(captionFor(printSetup)); setPrintRows(toPrint.map((row) => row.order.id)); setPrint((current) => ({ request: current.request + 1 })); setPrintSetup(null); }}><Printer size={16} />Print</button>
      </footer>
    </div> : null}
    </dialog>
    <div className="view-switch order-views" role="tablist" aria-label="Show orders">
      <button type="button" role="tab" aria-selected={view === "all"} title="Every order, whatever its stage" onClick={() => chooseView("all")}>All <span className="badge neutral">{filtered.length}</span></button>
      {ORDER_VIEWS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={view === item.key} title={item.hint} onClick={() => chooseView(item.key)}>{item.label} <span className="badge neutral">{counts[item.key]}</span></button>)}
    </div>
    <div className="orders-table-scroll" tabIndex={0} role="region" aria-label={title}>
      <table className="orders-table">
        <thead>
          <tr>
            <th scope="col" className="order-toggle-column"><span className="admin-sr-only">Details</span></th>
            {shown.map((column) => {
              const active = sort.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.ascending ? ArrowUp : ArrowDown;
              return <th scope="col" key={column.key} data-col={column.key} className={column.numeric ? "numeric" : undefined} aria-sort={active ? sort.ascending ? "ascending" : "descending" : "none"}>
                <button type="button" className="table-sort" title={column.key === "number" ? active && !sort.ascending ? "Newest first, click for oldest first" : active ? "Oldest first, click for newest first" : "Sort by order number" : undefined}
                  onClick={() => setSort({ key: column.key, ascending: active ? !sort.ascending : column.key !== "number" })}>{column.label}<Icon size={13} /></button>
              </th>;
            })}
          </tr>
          <tr className="orders-filter-row">
            <th scope="col"><span className="admin-sr-only">Filters</span></th>
            {shown.map((column) => <th scope="col" key={column.key} data-col={column.key}>
              {column.filter?.kind === "text" ? <input type="search" aria-label={`Search ${column.label}`} placeholder="Search" value={filters[column.key] ?? ""} list={column.key === "customer" ? "order-filter-customers" : undefined} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })} /> : null}
              {column.filter?.kind === "date" ? (() => { const date = column.filter.date; return <DateFilterPicker label={column.label} value={filters[column.key] ?? ""} dates={all.map((row) => date(row))} onChange={(value) => setFilters({ ...filters, [column.key]: value })} />; })() : null}
              {column.filter?.kind === "select" ? <select aria-label={`Filter ${column.label}`} value={filters[column.key] ?? ""} onChange={(event) => setFilters({ ...filters, [column.key]: event.target.value })}><option value="">All</option>{column.filter.options.map((option) => <option key={option}>{option}</option>)}</select> : null}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {!table.length ? <tr><td colSpan={shown.length + 1} className="empty-state">{!orders.length ? "No orders yet. Add a customer, PO number and quantity to start." : view !== "all" && filtered.length ? `No ${ORDER_VIEWS.find((item) => item.key === view)?.label.toLowerCase()} orders${filtering ? " match these filters" : ""}.` : "No orders match these filters."}</td></tr> : null}
          {page.map((row) => {
            const open = expanded === row.order.id;
            return <Fragment key={row.order.id}>
              <tr className={open ? "order-row open" : "order-row"} style={{ "--order-color": orderColor(row.number) } as React.CSSProperties} onClick={() => setExpanded(open ? null : row.order.id)}>
                <td><button type="button" className="icon-button order-toggle" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${row.order.poNumber} details`} onClick={(event) => { event.stopPropagation(); setExpanded(open ? null : row.order.id); }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                {shown.map((column) => <td key={column.key} data-col={column.key} className={column.numeric ? "numeric" : undefined}>{column.cell(row)}</td>)}
              </tr>
              {open ? <tr className="order-detail-row"><td colSpan={shown.length + 1}><OrderDetail printable={printable} orders={orders} products={products} jobOrders={jobOrders} transfers={transfers} jobActions={jobActions} product={row.product} onPrint={() => { setPrintRows(null); setPrint((current) => ({ orderId: row.order.id, request: current.request + 1 })); }} order={row.order} format={row.format} warnings={row.warnings} rows={row.rows} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} linked={lines.some((line) => line.productionOrderId === row.order.id)} editable={editable} customers={customers} onSave={onSave} onDelete={(id) => { const result = onDelete(id); if (!result.length) setExpanded(null); return result; }} /></td></tr> : null}
            </Fragment>;
          })}
        </tbody>
      </table>
      <datalist id="order-filter-customers">{customers.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
    {pager}
    <OrdersPrint title={title} caption={print.orderId || !printRows ? "" : printCaption} orders={orders} rows={print.orderId ? all.filter((row) => row.order.id === print.orderId) : printRows ? filtered.filter((row) => printRows.includes(row.order.id)) : table} detail={!!print.orderId} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} filtered={(printRows?.length ?? table.length) !== orders.length} />
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
function OrdersPrint({ title, caption, rows, orders, detail, lines, directory, visibleCalendarIds, filtered }: { title: string; caption: string; rows: Row[]; orders: PurchaseOrder[]; detail: boolean; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; filtered: boolean }) {
  if (typeof document === "undefined") return null;
  const printed = formatDateTime(new Date());
  return createPortal(<section className="calendar-print-sheet print-orders" aria-hidden="true">
    {detail && rows[0] ? <OrderPrintDetail row={rows[0]} lines={lines} directory={directory} visibleCalendarIds={visibleCalendarIds} printed={printed} /> : <>
      <header><h1>{title}</h1><p>{caption ? `${caption} · ` : ""}{rows.length} order{rows.length === 1 ? "" : "s"}{!caption && filtered ? " (filtered)" : ""} · printed {printed}</p></header>
      <table className="print-orders-table">
        <thead><tr><th>No.</th><th>PO received</th><th>Customer</th><th>PO number</th><th>SO number</th><th className="print-col-product">Product</th><th>Dosage form</th><th>Order qty</th><th>Total kg</th><th>Progress</th><th>Finished</th><th>Testing / release</th><th>Expected delivery</th><th>Status</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.order.id}>
          <td>{index + 1}</td><td>{row.order.receivedDate ? displayDate(row.order.receivedDate) : ""}</td><td>{row.order.customerName ?? ""}</td><td>{poLabel(row.order, orders)}</td><td>{row.order.soNumber ?? ""}</td><td className="print-col-product">{row.product?.name ?? "Unknown product"}</td><td>{row.format}</td>
          <td>{row.order.quantity.toLocaleString()} {row.order.uom}</td><td>{(() => { const kg = orderKg(row.order); return kg !== undefined ? kg.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : "-"; })()}</td><td>{progressText(row.progress)}</td>
          <td>{row.progress.finishedQuantity ? `${row.progress.finishedQuantity.toLocaleString()} (${row.progress.percent}%)` : "-"}</td>
          <td>{statusPrint(row.status)}</td>
          <td>{row.progress.expectedDate ? displayDate(row.progress.expectedDate) : "Not set"}{row.progress.overdue ? " · Overdue" : ""}</td>
          <td>{row.order.closedAt ? closedSummary(row.order) : row.progress.status}{row.warnings.length ? ` · ${row.warnings.length} warning${row.warnings.length === 1 ? "" : "s"}` : ""}</td>
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
    <p className="print-order-facts">PO received: {row.order.receivedDate ? displayDate(row.order.receivedDate) : "Not set"}{row.order.soNumber ? ` · SO: ${row.order.soNumber}` : ""} · Status: {row.progress.status} · {progressText(row.progress)} · Expected delivery: {row.progress.expectedDate ? displayDate(row.progress.expectedDate) : "Not set"}{row.progress.overdue ? " (overdue)" : ""}</p>
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
// A capsule, tablet or sachet batch is counted in its own units; an existing job order keeps the unit it has.
// Dispensing more than this % over the order's total kg is flagged.
const DISPENSING_OVERAGE_LIMIT = 1;
const FORM_UNITS: Partial<Record<ProductFormat, string[]>> = { Capsule: ["capsules"], Tablet: ["tablets"], Sachet: ["sachets"] };
function JobOrders({ orders, order, product, products, format, jobOrders, transfers, lines, actions, directory }: { directory: CalendarDirectory; orders: PurchaseOrder[]; order: PurchaseOrder; product?: Product; products: Product[]; format: ProductFormat; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; lines: PlanLine[]; actions: JobActions }) {
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [addVersion, setAddVersion] = useState(0);
  // The activities themselves, without the repeats that show a shared batch under each PO.
  lines = [...new Map(lines.map((line) => [line.id, line])).values()];
  // This PO item's own job orders first, then batches other PO items share with it.
  const jobs = [...jobsFor(order.id, jobOrders), ...jobsServing(order.id, jobOrders).filter((job) => job.orderId !== order.id)];
  const [shareDrafts, setShareDrafts] = useState<ShareDraft[]>([]);
  // Counted in the PO's unit whatever unit the batch quantity is in (capsules for a PO in boxes).
  const { total: released, uncounted } = orderedInJobs(order, jobOrders);
  // What dispensing weighs out for this PO (its share of each batch) against the order's total kg.
  const orderTotalKg = orderKg(order);
  const dispensedKg = jobs.reduce((sum, job) => sum + (job.batchSizeKg ?? 0) * (partFor(job, order.id)?.quantity ?? 0) / job.quantity, 0);
  const overage = orderTotalKg && dispensedKg ? (dispensedKg - orderTotalKg) / orderTotalKg * 100 : undefined;
  const remaining = Math.max(0, Number((order.quantity - released).toPrecision(12)));
  const allowable = product?.batchQuantity;
  const report = (result: string[], success: string) => { setErrors(result); setNotice(result.length ? "" : success); return !result.length; };
  const checkDates = useDateCheck();
  // Saves at once, unless the job orders would add up to more than a PO: then only with a reason.
  function withOverPlanReason(job: ManualJob | JobOrder, save: (reason?: string) => void) {
    const over = actions.overPlan(job);
    if (!over.length) { save(); return; }
    checkDates([], save, { reason: "overplan", changes: over.map((item) => `${item.poNumber}: job orders ${item.total.toLocaleString()} ${item.uom}, ${item.over.toLocaleString()} (${(item.over / item.ordered * 100).toFixed(1)}%) more than the ${item.ordered.toLocaleString()} ordered`) });
  }
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
    const packQuantity = number(data.get("packQuantity")), packUom = String(data.get("packUom") ?? "").trim(), packSize = number(data.get("packSize"));
    const size = number(data.get("batchSize")), sizeUom = String(data.get("batchSizeUom") ?? "kg");
    return { number: String(data.get("number") ?? "").trim(), quantity, uom, batchSizeKg: sizeUom === "kg" ? size : undefined, batchVolumeL: sizeUom === "L" ? size : undefined,
      packQuantity, packUom: packUom || undefined, packSize, boxQuantity: number(data.get("boxQuantity")), packingNumber: String(data.get("packingNumber") ?? "").trim() || undefined };
  }
  // The PO item's unit weight and units per box (else the product's last order), and units per
  // blister/bottle from the product's last job order: what the figures are worked out from.
  const factors = { unitWeightMg: order.unitWeightMg ?? lastOrderWeights(order.productId, orders).unitWeightMg, unitsPerBox: orderWeightKind(order.uom) === "pack" ? order.unitsPerPack ?? lastOrderWeights(order.productId, orders).unitsPerPack : undefined, packSize: lastPackSize(order.productId, orders, jobOrders) };
  const countUom = isCounted(order.uom) ? order.uom : format === "Capsule" ? "capsules" : format === "Tablet" ? "tablets" : format === "Sachet" ? "sachets" : order.uom;
  const fields = (job?: JobOrder, reserved = 0) => <JobOrderFields job={job} order={order} format={format} countSteps={countSteps} factors={factors} countUom={countUom} reserved={reserved}
    defaultQuantity={remaining && countUom === order.uom ? Math.min(remaining, allowable ?? remaining) : undefined} productKg={product?.batchSizeKg} options={options} />;
  const sum = (totals: { quantity: number; uom: string }[]) => totals.length ? totals.map((total) => <span key={total.uom} className="job-total">{total.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {total.uom}</span>) : <span className="route-muted">-</span>;
  const measure = (value?: { quantity: number; uom: string }) => value ? `${value.quantity.toLocaleString("en-MY", { maximumFractionDigits: 3 })} ${value.uom}` : <span className="route-muted">Not keyed in</span>;
  return <section className="job-orders" aria-label={`Job orders for ${order.poNumber}`}>
    <details className="order-section">
    <summary className="order-section-summary"><h3>Job orders <span className="badge neutral">{jobs.length}</span></h3>
      <span className="route-muted">{released.toLocaleString()} of {order.quantity.toLocaleString()} {order.uom} in job orders{remaining ? ` · ${remaining.toLocaleString()} still to release` : ""}{allowable ? ` · allowable batch ${allowable.toLocaleString()} ${order.uom}` : ""}</span>
      {overage !== undefined ? <span className={overage > DISPENSING_OVERAGE_LIMIT ? "order-warning" : "route-muted"} title="Batch sizes keyed in on the job orders against the order's total weight">{formatKg(dispensedKg)} for dispensing against the order's {formatKg(orderTotalKg!)} · {overage >= 0 ? `${overage.toFixed(1)}% overage${overage > DISPENSING_OVERAGE_LIMIT ? `, above the ${DISPENSING_OVERAGE_LIMIT}% limit` : ""}` : `${(-overage).toFixed(1)}% short`}</span> : null}
      {released > order.quantity ? <span className="order-warning" title={order.overPlanReason ? `Reason given by ${order.overPlannedBy ?? "planning"}${order.overPlannedAt ? ` on ${displayDate(order.overPlannedAt)}` : ""}` : undefined}>{(released - order.quantity).toLocaleString()} {order.uom} ({((released - order.quantity) / order.quantity * 100).toFixed(1)}%) more than the PO{order.overPlanReason ? `: ${order.overPlanReason}` : ""}</span> : null}
      {uncounted.length ? <span className="order-warning">{uncounted.map((job) => job.number).join(", ")}: no figure in {order.uom}, not counted</span> : null}</summary>
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
            const { shares: _s, ...unshared } = rest;
            const shares = readShares(shareDrafts);
            const next: JobOrder = { ...unshared, ...(shares.length ? { shares } : {}), number: read.number, quantity: read.quantity, uom: read.uom,
              ...(read.batchSizeKg ? { batchSizeKg: read.batchSizeKg } : {}), ...(read.batchVolumeL ? { batchVolumeL: read.batchVolumeL } : {}), ...(read.packQuantity ? { packQuantity: read.packQuantity } : {}),
              ...(read.packUom ? { packUom: read.packUom } : {}), ...(read.packSize ? { packSize: read.packSize } : {}), ...(read.boxQuantity ? { boxQuantity: read.boxQuantity } : {}), ...(read.packingNumber ? { packingNumber: read.packingNumber } : {}) };
            withOverPlanReason(next, (reason) => { if (report(actions.onUpdate(next, reason), `${next.number.trim()} saved.${planned.some((line) => !line.completedAt) ? " Its planned activities now carry the new quantities." : ""}`)) setEditing(null); });
          }}>
            {fields(job, shareDrafts.reduce((sum, draft) => sum + (Number(draft.quantity) || 0), 0))}
            <JobSharesEditor job={job} order={order} format={format} orders={orders} products={products} drafts={shareDrafts} onChange={setShareDrafts} />
            <div className="job-order-buttons"><button type="submit" className="primary-button">Save</button>
              <button type="button" className="calendar-button" onClick={() => { setEditing(null); setErrors([]); }}>Cancel</button></div>
            {planned.length ? <small className="route-muted">Saving also updates its {planned.length} planned activit{planned.length === 1 ? "y" : "ies"} (completed ones stay as they are).</small> : null}
          </form>
        </td></tr>;
        // A batch shared with other POs shows this PO's share and packing; it is edited on its first PO.
        const own = job.orderId === order.id;
        const view = jobForOrder(job, order.id);
        const others = jobParts(job).filter((part) => part.orderId !== order.id).map((part) => orders.find((item) => item.id === part.orderId)?.poNumber ?? "another PO");
        return <tr key={job.id}>
          <th scope="row"><strong>{job.number}</strong><small>{own ? `Batch ${job.sequence} of PO item` : `Shared batch of ${orders.find((item) => item.id === job.orderId)?.poNumber ?? "another PO"}`}</small>
            {others.length ? <span className="badge info job-shared-tag" title={`Made once for ${[order.poNumber, ...others].join(", ")}`}>Shared with {others.join(", ")}</span> : null}
            {formulaPending(job, orders) ? <span className="badge warning">Awaiting QA formula confirmation</span> : null}
            <Who verb="Added" who={job.createdBy} at={job.createdAt} /><Who verb="Edited" who={job.updatedBy} at={job.updatedAt} /></th>
          <td className="numeric">{measure(processQuantity(job, "dispensing"))}</td>
          <td className="numeric">{measure(processQuantity(job, "tableting"))}{others.length ? <small>this PO {(partFor(job, order.id)?.quantity ?? 0).toLocaleString("en-MY", { maximumFractionDigits: 3 })} {job.uom}</small> : null}
            {(() => { const short = shortYield(job, lines, orders, (calendarId) => calendarSettings(directory, calendarId).planned)?.shares.find((item) => item.orderId === order.id);
              return short && short.available < short.planned ? <small className="order-warning" title="The batch made less than planned: the PO due first keeps its share">Short yield: {short.available.toLocaleString()} {job.uom} for this PO</small> : null; })()}</td>
          <td>{packingNumber(view)}</td>
          {(["filling", "packing"] as const).map((step) => { const value = processQuantity(view, step); const first = orders.find((item) => item.id === job.orderId)?.poNumber ?? "its first PO";
            // A shared PO's packs are keyed in on the batch's first PO: say where.
            return <td key={step} className="numeric">{value || own ? measure(value) : <span className="route-muted">Not keyed in<small>Key in on {first}: edit {job.number}, under Other POs</small></span>}</td>; })}
          <td>{job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Keyed in on the Planner Board</span>}</td>
          <td><span className="job-actions">
            {actions.canEdit && own ? <button type="button" className="icon-button" title={`Edit ${job.number}`} aria-label={`Edit ${job.number}`} onClick={() => { setEditing(job.id); setShareDrafts((job.shares ?? []).map((share) => shareDraft(share, job))); setErrors([]); setNotice(""); }}><Pencil size={15} /></button> : null}
            {!own ? <small className="route-muted">Edit on {orders.find((item) => item.id === job.orderId)?.poNumber ?? "its first PO"}</small> : null}
            {!planned.length && actions.canEdit && own ? <button type="button" className="icon-button danger" title={`Remove ${job.number}`} aria-label={`Remove ${job.number}`} onClick={() => report(actions.onDelete(job.id), `${job.number} removed.`)}><Trash2 size={15} /></button> : null}
          </span></td>
        </tr>;
      })}</tbody>
      <tfoot><tr>
        <th scope="row">Total <small>{jobs.length} job order{jobs.length === 1 ? "" : "s"}</small></th>
        {(["dispensing", "tableting"] as const).map((step) => <td key={step} className="numeric">{sum(jobTotals(jobs, (job) => processQuantity(job, step)))}</td>)}
        <td />
        {(["filling", "packing"] as const).map((step) => <td key={step} className="numeric">{sum(jobTotals(jobs, (job) => processQuantity(job, step)))}</td>)}
        <td colSpan={2} />
      </tr></tfoot>
    </table></div> : <p className="order-empty">No job orders yet. Key in one for each batch of this PO item.</p>}
    {actions.canCreate ? <form key={addVersion} className="job-order-form" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const read = readJob(data);
      const batchSizeKg = read.batchSizeKg ?? (read.batchVolumeL ? undefined : kgFor(read.quantity, read.uom));
      const input = { ...read, orderId: order.id, batchSizeKg };
      withOverPlanReason(input, (reason) => { if (report(actions.onCreate(input, reason), `Job order ${read.number} added to ${order.poNumber}. Plan it on the Planner Board.`)) setAddVersion((value) => value + 1); });
    }}>
      {fields()}
      <div className="job-order-buttons"><button type="submit" className="primary-button"><Plus size={16} />Add job order</button></div>
    </form> : null}
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {notice && !errors.length ? <p role="status">{notice}</p> : null}
    </details>
  </section>;
}

/**
 * POs whose batches QA has released and reconciled, waiting for planning to close them: the closing
 * quantity starts as what QA released to the PO; closing above or below the order needs a reason.
 */
function ReadyToClose({ orders, jobOrders, onClose }: { orders: PurchaseOrder[]; jobOrders: JobOrder[]; onClose: (orderId: string, quantity: number, uom: string, note: string) => string[] }) {
  const ready = orders.filter((order) => readyToClose(order, jobOrders));
  const [drafts, setDrafts] = useState<Record<string, { quantity?: string; note: string }>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [closed, setClosed] = useState("");
  if (!ready.length) return closed ? <p role="status" className="calendar-notice">{closed}</p> : null;
  const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });
  return <section className="ready-to-close" aria-labelledby="ready-to-close-title">
    <h3 id="ready-to-close-title">Ready to close <span className="badge info">{ready.length}</span></h3>
    <p className="route-muted">QA has released and reconciled every batch for these POs. Check the quantity and close them.</p>
    {closed ? <p role="status" className="calendar-notice">{closed}</p> : null}
    <ul>{ready.map((order) => {
      const released = releasedToOrder(order.id, jobOrders);
      const inOrderUnit = released.find((item) => item.uom === order.uom);
      const draft = drafts[order.id] ?? { note: "" };
      const quantity = draft.quantity ?? (inOrderUnit ? String(inOrderUnit.quantity) : "");
      const difference = quantity.trim() !== "" ? Number((Number(quantity) - order.quantity).toPrecision(12)) : 0;
      const uses = jobsServing(order.id, jobOrders).flatMap((job) => releaseFor(job, order.id)?.otherUses ?? []);
      return <li key={order.id}>
        <span className="ready-po"><strong>{order.poNumber}</strong>{order.customerName ? <small>{order.customerName}</small> : null}
          <small>Ordered {amount(order.quantity)} {order.uom} · released {released.map((item) => `${amount(item.quantity)} ${item.uom}`).join(", ") || "nothing"}{uses.length ? ` · also ${uses.map((use) => `${amount(use.quantity)} ${use.note}`).join(", ")}` : ""}</small></span>
        <label>Close at<span className="status-release-qty"><input type="number" min="0" step="any" value={quantity} onChange={(event) => setDrafts({ ...drafts, [order.id]: { ...draft, quantity: event.target.value } })} /> {order.uom}</span>
          {difference ? <small className="order-warning">{difference > 0 ? "+" : "−"}{amount(Math.abs(difference))} {order.uom} against the order</small> : null}</label>
        <label className="ready-note">Note{difference ? " (why it differs)" : ""}<input maxLength={500} value={draft.note} placeholder={difference ? "e.g. customer accepted the extra 6" : "Optional"} onChange={(event) => setDrafts({ ...drafts, [order.id]: { ...draft, note: event.target.value } })} /></label>
        <button type="button" className="primary-button" onClick={() => {
          const errors = quantity.trim() === "" ? ["Key in the closing quantity."] : onClose(order.id, Number(quantity), order.uom, draft.note);
          setMessages({ ...messages, [order.id]: errors.join(" ") });
          if (!errors.length) setClosed(`${order.poNumber} closed at ${amount(Number(quantity))} ${order.uom}.`);
        }}>Close PO</button>
        {messages[order.id] ? <p role="alert">{messages[order.id]}</p> : null}
      </li>;
    })}</ul>
  </section>;
}

// A shared batch's other POs, as keyed in: each PO's share of the batch and its own packing.
type ShareDraft = { key: string; orderId: string; quantity: string; packSize: string; packQuantity: string; packUom: string; boxQuantity: string; packingNumber: string };
// A shared PO starts with the batch's units per pack and pack type (blisters of 10, say), as the main row has them.
// "blisters" → "blister", "boxes" → "box": one pack, for "tablets per blister".
const one = (uom: string) => uom.replace(/(x|ch|sh)es$/i, "$1").replace(/s$/i, "");
const shareDraft = (share?: JobShare, job?: JobOrder): ShareDraft => ({ key: crypto.randomUUID(), orderId: share?.orderId ?? "", quantity: shown(share?.quantity), packSize: shown(share?.packSize ?? job?.packSize),
  packQuantity: shown(share?.packQuantity), packUom: share?.packUom ?? job?.packUom ?? "bottles", boxQuantity: shown(share?.boxQuantity), packingNumber: share?.packingNumber ?? "" });
function readShares(drafts: ShareDraft[]): JobShare[] {
  return drafts.filter((draft) => draft.orderId).map((draft) => {
    const quantity = Number(draft.quantity), packSize = asNumber(draft.packSize);
    const packQuantity = asNumber(draft.packQuantity) ?? fullPacks(quantity > 0 ? quantity : undefined, packSize);
    return { orderId: draft.orderId, quantity, ...(packSize ? { packSize } : {}), ...(packQuantity ? { packQuantity, packUom: draft.packUom } : {}),
      ...(asNumber(draft.boxQuantity) ? { boxQuantity: asNumber(draft.boxQuantity) } : {}), ...(draft.packingNumber.trim() ? { packingNumber: draft.packingNumber.trim() } : {}) };
  });
}

/**
 * The other POs one batch is made for (up to 5 POs in all): each PO's share of the batch and its own
 * packing (pack size and type, packs, boxes, packing job order). Only PO items of the same dosage
 * form are offered; a different FG code needs QA to confirm the formula is the same.
 */
function JobSharesEditor({ job, order, format, orders, products, drafts, onChange }: {
  job: JobOrder; order: PurchaseOrder; format: ProductFormat; orders: PurchaseOrder[]; products: Product[]; drafts: ShareDraft[]; onChange: (drafts: ShareDraft[]) => void;
}) {
  const productOf = (item: PurchaseOrder) => products.find((product) => product.id === item.productId);
  const formatOf = (item: PurchaseOrder) => item.format ?? inferFormat(productOf(item));
  const choices = orders.filter((item) => item.id !== order.id && !item.closedAt && formatOf(item) === format && isNonProduction(item) === isNonProduction(order));
  const update = (key: string, change: Partial<ShareDraft>) => onChange(drafts.map((draft) => draft.key === key ? { ...draft, ...change } : draft));
  const firstShare = Number((job.quantity - drafts.reduce((sum, draft) => sum + (Number(draft.quantity) || 0), 0)).toPrecision(12));
  const differs = drafts.some((draft) => { const item = orders.find((entry) => entry.id === draft.orderId); return item && item.productId !== order.productId; });
  return <fieldset className="job-shares">
    <legend>Other POs made from this batch <span className="badge neutral">{drafts.length + 1} of {MAX_POS_PER_JOB} POs</span></legend>
    <p className="route-muted">The whole batch is made and planned once, filling and packing included. Key in each PO's own packs and boxes here: planning adds them up, and QA's release splits what was packed between the POs by them. {order.poNumber} keeps the rest of the batch: <strong>{firstShare.toLocaleString("en-MY", { maximumFractionDigits: 3 })} {job.uom}</strong>.</p>
    {drafts.map((draft, index) => {
      const chosen = orders.find((item) => item.id === draft.orderId);
      const packAuto = !draft.packQuantity.trim() ? fullPacks(Number(draft.quantity) > 0 ? Number(draft.quantity) : undefined, asNumber(draft.packSize)) : undefined;
      return <div className="job-share" key={draft.key} role="group" aria-label={`Shared PO ${index + 2}`}>
        <label className="job-share-po">PO item<select value={draft.orderId} onChange={(event) => update(draft.key, { orderId: event.target.value })}>
          <option value="">Choose a PO item</option>
          {choices.filter((item) => item.id === draft.orderId || !drafts.some((other) => other.orderId === item.id)).map((item) =>
            <option key={item.id} value={item.id}>{poLabel(item, orders)} · {productOf(item)?.sku ?? ""} {productOf(item)?.name ?? ""} · {item.customerName ?? ""}</option>)}
        </select>{chosen && chosen.productId !== order.productId ? <small className="order-warning">Different FG code: QA must confirm it is the same formula before planning</small> : null}</label>
        <label>Share of batch ({job.uom})<input type="number" min="0" step="any" required value={draft.quantity} onChange={(event) => update(draft.key, { quantity: event.target.value })} /></label>
        {/* Worded as the main row: "Pack quantity · Filling: 1,773 blisters of 10 tablets per blister". */}
        <fieldset className="job-measure job-pack job-share-pack"><legend title="This PO's pack quantity, for Filling">Pack quantity<span> · Filling</span></legend>
          <input type="number" min="0" step="any" aria-label="Pack quantity" value={draft.packQuantity} placeholder={packAuto ? String(packAuto) : ""} onChange={(event) => update(draft.key, { packQuantity: event.target.value })} />
          <select aria-label="Pack quantity UOM" value={draft.packUom} onChange={(event) => update(draft.key, { packUom: event.target.value })}>{FILL_UOMS.map((name) => <option key={name}>{name}</option>)}</select>
          <label className="job-pack-size">of<input type="number" min="0" step="any" aria-label={`${job.uom} per ${one(draft.packUom)}`} placeholder="e.g. 10" value={draft.packSize} onChange={(event) => update(draft.key, { packSize: event.target.value })} />{job.uom} per {one(draft.packUom)}</label>
          {packAuto !== undefined ? <small className="job-auto-note" title="Worked out; type over it to change">{Number(draft.quantity).toLocaleString()} ÷ {draft.packSize}</small> : null}</fieldset>
        <fieldset className="job-measure"><legend title="This PO's total pack quantity, for Packing">Total packs<span> · Packing</span></legend>
          <input type="number" min="0" step="any" aria-label="Total pack quantity in boxes" value={draft.boxQuantity} onChange={(event) => update(draft.key, { boxQuantity: event.target.value })} /><span className="job-measure-unit">boxes</span></fieldset>
        <label>Packing JO no.<input maxLength={60} value={draft.packingNumber} placeholder={`${packingNumber(job)}-${index + 2}`} onChange={(event) => update(draft.key, { packingNumber: event.target.value })} /></label>
        <button type="button" className="icon-button danger" title="Take this PO off the batch" aria-label={`Remove shared PO ${index + 2}`} onClick={() => onChange(drafts.filter((other) => other.key !== draft.key))}><Trash2 size={15} /></button>
      </div>;
    })}
    {drafts.length + 1 < MAX_POS_PER_JOB ? <button type="button" className="calendar-button" disabled={!choices.length} onClick={() => onChange([...drafts, shareDraft(undefined, job)])}><Plus size={16} />Add another PO to this batch</button> : null}
    {!choices.length ? <small className="route-muted">No other open {format.toLowerCase()} PO items to share this batch with.</small> : null}
    {differs ? <p className="route-muted">POs with different FG codes share this batch: QA confirms they are the same formula under QA/QC before it can be planned.</p> : null}
  </fieldset>;
}

type Factors = { unitWeightMg?: number; unitsPerBox?: number; packSize?: number };
type FigureKey = "quantity" | "packQuantity" | "boxQuantity";
const asNumber = (value: string) => value.trim() && Number(value) > 0 ? Number(value) : undefined;
const shown = (value: number | undefined) => value === undefined ? "" : String(value);

/**
 * The job order's figures, worked out as they are keyed in: batch size (kg) gives the batch quantity
 * from the unit weight, and the batch quantity gives the pack quantity (units per blister/bottle) and
 * the boxes (units per box). A figure typed over stays as typed; clearing it works it out again.
 */
function JobOrderFields({ job, order, format, countSteps, factors, countUom, defaultQuantity, productKg, options, reserved = 0 }: {
  // reserved: the batch other POs take (a shared batch); this PO's packs come from the rest.
  job?: JobOrder; order: PurchaseOrder; format: ProductFormat; countSteps: string; factors: Factors; countUom: string; reserved?: number;
  defaultQuantity?: number; productKg?: number; options: (list: string[], current?: string) => string[];
}) {
  const [values, setValues] = useState({
    batchSize: shown(job?.batchSizeKg ?? job?.batchVolumeL), batchSizeUom: job?.batchVolumeL ? "L" : "kg",
    quantity: shown(job ? job.quantity : defaultQuantity), uom: job?.uom ?? countUom,
    packQuantity: shown(job?.packQuantity), packUom: job?.packUom ?? (format === "Sachet" ? "sachets" : "blisters"),
    packSize: shown(job?.packSize ?? (job ? undefined : factors.packSize)), boxQuantity: shown(job?.boxQuantity)
  });
  const derive = (current: typeof values) => {
    const counted = isCounted(current.uom);
    const quantity = counted && current.batchSizeUom === "kg" ? batchUnits(asNumber(current.batchSize), factors.unitWeightMg) : undefined;
    return { quantity, units: counted ? quantity : undefined };
  };
  // A figure is worked out while it is blank or still what working it out gives; a new job order starts so.
  const [auto, setAuto] = useState<Record<FigureKey, boolean>>(() => {
    if (!job) return { quantity: true, packQuantity: true, boxQuantity: true };
    const units = isCounted(job.uom) ? job.quantity - (job.shares ?? []).reduce((sum, share) => sum + share.quantity, 0) : undefined;
    return { quantity: job.batchSizeKg !== undefined && batchUnits(job.batchSizeKg, factors.unitWeightMg) === job.quantity,
      packQuantity: !job.packQuantity || fullPacks(units, job.packSize) === job.packQuantity, boxQuantity: !job.boxQuantity || fullPacks(units, factors.unitsPerBox) === job.boxQuantity };
  });
  const worked = derive(values);
  const quantity = auto.quantity && worked.quantity !== undefined ? String(worked.quantity) : values.quantity;
  const units = isCounted(values.uom) && asNumber(quantity) ? Math.max(0, asNumber(quantity)! - reserved) || undefined : undefined;
  const packAuto = fullPacks(units, asNumber(values.packSize)), boxAuto = fullPacks(units, factors.unitsPerBox);
  const packQuantity = auto.packQuantity && packAuto !== undefined ? String(packAuto) : values.packQuantity;
  const boxQuantity = auto.boxQuantity && boxAuto !== undefined ? String(boxAuto) : values.boxQuantity;
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const type = (key: FigureKey, value: string) => { set(key, value); setAuto((current) => ({ ...current, [key]: !value.trim() })); };
  const note = (on: boolean, text: string) => on ? <small className="job-auto-note" title="Worked out; type over it to change">{text}</small> : null;
  const over = (perPack: number | undefined, packs: string) => units && perPack && asNumber(packs) ? leftOver(units, perPack, Number(packs)) : 0;
  return <>
    <fieldset className="job-measure job-number"><legend>Job order no.</legend><input name="number" required maxLength={60} autoComplete="off" aria-label="Job order no." placeholder="e.g. JO0010" defaultValue={job?.number} /></fieldset>
    <fieldset className="job-measure"><legend title="Batch size, for Dispensing">Batch size<span> · Dispensing</span></legend>
      <input name="batchSize" type="number" min="0" step="any" aria-label="Batch size" value={values.batchSize} onChange={(event) => set("batchSize", event.target.value)} placeholder={!job && productKg ? "From the product if blank" : "e.g. 41.5"} />
      <select name="batchSizeUom" aria-label="Batch size UOM" value={values.batchSizeUom} onChange={(event) => set("batchSizeUom", event.target.value)}><option>kg</option><option>L</option></select>
      {values.batchSizeUom === "kg" && isCounted(values.uom) && !factors.unitWeightMg ? <small className="route-muted">Add the unit weight on the PO item to work out the {values.uom}</small> : null}</fieldset>
    <fieldset className="job-measure"><legend title={`Batch quantity, for ${countSteps || "production"}`}>Batch quantity<span> · {countSteps || "Production"}</span></legend>
      <input name="quantity" type="number" min="0" step="any" required aria-label="Batch quantity" value={quantity} onChange={(event) => type("quantity", event.target.value)} />
      <select name="uom" aria-label="Batch quantity UOM" value={values.uom} onChange={(event) => set("uom", event.target.value)}>{options(FORM_UNITS[format] ?? [order.uom, countUom, ...COUNT_UOMS, "sachets"], values.uom).map((name) => <option key={name}>{name}</option>)}</select>
      {note(auto.quantity && worked.quantity !== undefined, `≈ ${values.batchSize} kg ÷ ${factors.unitWeightMg} mg`)}</fieldset>
    <fieldset className="job-measure job-number"><legend title="Packing job order number; follows the job order number with PJO in front unless keyed in">Packing JO no.<span> · Packing</span></legend>
      <input name="packingNumber" maxLength={60} autoComplete="off" aria-label="Packing job order no." defaultValue={job?.packingNumber} placeholder={job ? defaultPackingNumber(job.number) : "PJO + job order no."} /></fieldset>
    <fieldset className="job-measure job-pack"><legend title="Pack quantity, for Filling">Pack quantity<span> · Filling</span></legend>
      <input name="packQuantity" type="number" min="0" step="any" aria-label="Pack quantity" value={packQuantity} onChange={(event) => type("packQuantity", event.target.value)} />
      <select name="packUom" aria-label="Pack quantity UOM" value={values.packUom} onChange={(event) => set("packUom", event.target.value)}>{options(FILL_UOMS, values.packUom).map((name) => <option key={name}>{name}</option>)}</select>
      <label className="job-pack-size">of<input name="packSize" type="number" min="0" step="any" aria-label={`${values.uom} per ${one(values.packUom)}`} placeholder="e.g. 10" value={values.packSize} onChange={(event) => set("packSize", event.target.value)} />{values.uom} per {one(values.packUom)}</label>
      {note(auto.packQuantity && packAuto !== undefined, `${units?.toLocaleString()} ÷ ${values.packSize}${over(asNumber(values.packSize), packQuantity) ? ` · ${over(asNumber(values.packSize), packQuantity).toLocaleString()} ${values.uom} over` : ""}`)}</fieldset>
    <fieldset className="job-measure"><legend title="Total pack quantity, for Packing">Total packs<span> · Packing</span></legend>
      <input name="boxQuantity" type="number" min="0" step="any" aria-label="Total pack quantity in boxes" value={boxQuantity} onChange={(event) => type("boxQuantity", event.target.value)} /><span className="job-measure-unit">boxes</span>
      {note(auto.boxQuantity && boxAuto !== undefined, `${units?.toLocaleString()} ÷ ${factors.unitsPerBox} per box${over(factors.unitsPerBox, boxQuantity) ? ` · ${over(factors.unitsPerBox, boxQuantity).toLocaleString()} ${values.uom} over` : ""}`)}</fieldset>
  </>;
}

const shortDate = (value: string) => formatDate(value.slice(0, 10));

// The order's summary as its flow, one column per job order and the stages down the side:
// Planning (job order, planned quantity, batch number), Production (one row per process: days,
// status and actual quantity), QC testing (result) and QA release (released, released quantity).
function OrderFlow({ order, orders, directory, jobOrders, lines, transfers, matrix }: { order: PurchaseOrder; orders: PurchaseOrder[]; directory: CalendarDirectory; jobOrders: JobOrder[]; lines: PlanLine[]; transfers: { sourceLineId: string }[]; matrix: OrderBatchMatrix }) {
  const limits = useYieldLimits();
  // Batches shared with other POs show here too, with this PO's packing and release.
  const jobs = [...jobsFor(order.id, jobOrders), ...jobsServing(order.id, jobOrders).filter((job) => job.orderId !== order.id)];
  const amount = (value: number) => value.toLocaleString("en-MY", { maximumFractionDigits: 3 });
  const day = (value?: string) => value ? shortDate(value.slice(0, 10)) : "";
  if (!jobs.length) return <p className="order-empty">No job orders yet. Key them in under Job orders, then plan them on the Planner Board.</p>;
  const stage = (label: string) => <tr className="order-flow-stage"><th scope="rowgroup" colSpan={jobs.length + 2}>{label}</th></tr>;
  const row = (label: string, cell: (job: JobOrder) => ReactNode, total?: ReactNode, shade?: (job: JobOrder) => "done" | "planned" | "late" | "") => <tr><th scope="row" className="order-batch-process">{label}</th>
    {jobs.map((job) => { const tone = shade?.(job); return <td key={job.id} className={`order-batch-col${tone ? ` order-flow-${tone}` : ""}`}>{cell(job)}</td>; })}<td className="order-batch-summary">{total}</td></tr>;
  const states = new Map(jobs.map((job) => [job.id, batchStatus(job, lines, transfers)]));
  // Each batch's step yield per process and its final yield, against QA's limits.
  const yields = new Map(jobs.map((job) => [job.id, batchYield(job, order.id, lines, orders, directory, limits)]));
  const chip = (percent: number | undefined, tone: YieldTone, title?: string, label = "") => <small className={`yield-chip yield-${tone}`} title={title}>{label}{formatYield(percent)}{tone === "out" ? " · outside limits" : ""}</small>;
  // Planned quantity in boxes (the job order's total packs), else its batch quantity.
  const plannedBoxes = (job: JobOrder) => processQuantity(jobForOrder(job, order.id), "packing") ?? { quantity: partFor(job, order.id)?.quantity ?? job.quantity, uom: job.uom };
  const plannedUoms = [...new Set(jobs.map((job) => plannedBoxes(job).uom))];
  const plannedTotal = <small>{plannedUoms.map((uom) => `${amount(jobs.filter((job) => plannedBoxes(job).uom === uom).reduce((sum, job) => sum + plannedBoxes(job).quantity, 0))} ${uom}`).join(" · ")}{plannedUoms.length === 1 && plannedUoms[0] === order.uom ? ` of ${amount(order.quantity)} ordered` : ""}</small>;
  // What QA released to this PO from each batch.
  const releaseOf = (job: JobOrder) => releaseFor(job, order.id);
  const released = jobs.filter((job) => releaseOf(job));
  const releasedUoms = [...new Set(released.map((job) => releaseOf(job)!.uom))];
  return <div className="order-batch-scroll"><table className="order-batch-table order-flow-grid">
    <thead><tr><th scope="col" className="order-batch-process">Job order</th>{jobs.map((job) => <th scope="col" key={job.id} className="order-batch-col"><strong>{job.number}</strong></th>)}<th scope="col" className="order-batch-summary">Total</th></tr></thead>
    <tbody>
      {stage("Planning")}
      {row("Planned quantity", (job) => { const planned = plannedBoxes(job); return `${amount(planned.quantity)} ${planned.uom}`; }, plannedTotal)}
      {row("Batch number", (job) => job.batchNumber ? <strong>{job.batchNumber}</strong> : <span className="route-muted">Not keyed in</span>)}
      {stage("Production")}
      {matrix.rows.length ? matrix.rows.map((process) => {
        const percent = process.planned ? Math.min(100, Math.round(process.completed / process.planned * 100)) : 0;
        // The cell's colour says it (green done, light yellow planned, red late, white not planned); late also says so.
        const cellView = (job: JobOrder) => {
          const cell = process.cells[job.number];
          if (!cell) return null;
          const dates = cell.firstDate === cell.lastDate ? shortDate(cell.firstDate) : `${shortDate(cell.firstDate)} – ${shortDate(cell.lastDate)}`;
          const stage = yields.get(job.id)?.stages.find((item) => item.calendarId === process.calendar.id);
          return <><span className="batch-dates">{dates}</span>{cell.late && cell.daysDone < cell.days ? <strong className="order-flow-late-label" title="Planned on a day that has passed and not completed yet">Late</strong> : null}{cell.daysDone ? <small>{cell.completed.toLocaleString()} {process.uom} made</small> : null}
            {stage?.ofTheoretical !== undefined ? chip(stage.ofTheoretical, stage.tone, `% of theoretical: ${stage.theoreticalWorking}${stage.limit ? ` · QA limits ${limitText(stage.limit)}` : ""}`, "Yield ") : null}
            {stage?.percent !== undefined ? <small className="yield-step" title={`Step yield: ${stage.working}`}>Step {formatYield(stage.percent)}{stage.powder ? " by powder" : ""}</small>
              : stage?.missing ? <small className="yield-chip yield-missing" title={`Yield can't be worked out: ${stage.missing}`}>Yield – · figure missing</small> : null}
            {stage?.powder?.targetMg ? <FillNote powder={stage.powder} /> : null}</>;
        };
        return <Fragment key={process.calendar.id}>{row(process.processName, cellView,
          <><div className="batch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${process.processName} ${percent}% complete`}><span style={{ width: `${percent}%` }} /></div>
            <small>{process.completed.toLocaleString()} / {process.planned.toLocaleString()} {process.uom} · {percent}%</small></>,
          (job) => { const cell = process.cells[job.number]; return !cell ? "" : cell.days > 0 && cell.daysDone === cell.days ? "done" : cell.late ? "late" : "planned"; })}</Fragment>;
      }) : row("Processes", () => null)}
      {matrix.rows.length ? row("Final yield", (job) => {
        const final = yields.get(job.id)?.final;
        if (!final) return <span className="route-muted" title="Shown once every process of the batch is done">{yields.get(job.id)?.stages.some((item) => item.done) ? "After the last process" : "-"}</span>;
        return final.percent !== undefined ? chip(final.percent, final.tone, `Final yield: ${final.working}${final.limit ? ` · QA limits ${limitText(final.limit)}` : ""}`)
          : <small className="yield-chip yield-missing" title={`Final yield can't be worked out: ${final.missing}`}>– · figure missing</small>;
      }, limitText(limits.final) ? <small>QA limits {limitText(limits.final)}</small> : null) : null}
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
        const release = releaseOf(job);
        if (release) return <><span className="badge success">Released</span><small>{day(release.releasedAt)}{release.releasedBy ? ` · ${release.releasedBy}` : ""}</small></>;
        if (state === "Rejected") return <><span className="badge danger">Rejected</span><small>{day(job.rejectedAt)}{job.rejectedBy ? ` · ${job.rejectedBy}` : ""}</small></>;
        if (state === "Awaiting release") return <span className="badge info">Awaiting release</span>;
        if (state === "Failed testing") return <span className="badge warning">Awaiting QA rejection</span>;
        return <span className="route-muted">-</span>;
      }, <small>{released.length}/{jobs.length} released</small>)}
      {row("Released quantity", (job) => { const release = releaseOf(job); return release ? <>{amount(release.quantity)} {release.uom}{release.otherUses?.map((use) => <small key={use.note}>+ {amount(use.quantity)} {use.note}</small>)}</> : <span className="route-muted">-</span>; },
        releasedUoms.length ? <small>{releasedUoms.map((uom) => `${amount(released.filter((job) => releaseOf(job)!.uom === uom).reduce((sum, job) => sum + releaseOf(job)!.quantity, 0))} ${uom}`).join(" · ")}</small> : null)}
    </tbody>
  </table></div>;
}

function OrderDetail({ printable, orders, products, order, product, jobOrders, transfers, jobActions, format, warnings, rows, lines, directory, visibleCalendarIds, linked, editable, customers, onSave, onDelete, onPrint }: {
  orders: PurchaseOrder[]; products: Product[];
  product?: Product; jobOrders: JobOrder[]; transfers: { sourceLineId: string }[]; jobActions?: JobActions;
  format: ProductFormat; warnings: FlowWarning[];
  onPrint: () => void;
  order: PurchaseOrder; rows: OrderProcessRow[]; lines: PlanLine[]; directory: CalendarDirectory; visibleCalendarIds: string[]; linked: boolean; editable: boolean; printable: boolean; customers: string[];
  onSave: (order: PurchaseOrder) => string[]; onDelete: (id: string) => string[];
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const checkDates = useDateCheck();
  const [saved, setSaved] = useState(false);
  // Quantity and weights are live here so the total kg follows what is keyed in.
  const [weights, setWeights] = useState({ quantity: String(order.quantity), unitWeightMg: order.unitWeightMg ? String(order.unitWeightMg) : "", unitsPerPack: order.unitsPerPack ? String(order.unitsPerPack) : "" });
  const [confirming, setConfirming] = useState(false);
  const matrix = orderBatchMatrix(order, lines, directory, localDateKey(new Date()), visibleCalendarIds);
  const lastDate = rows.reduce((latest, row) => row.lastDate > latest ? row.lastDate : latest, "");
  const words = orderWords(!!order.category);
  return <div className="order-detail">
    <div className="order-detail-head">
      {printable ? <button type="button" className="calendar-button" onClick={onPrint}><Printer size={15} />Print this order</button> : null}
      <span className="order-detail-who"><Who verb="Added" who={order.createdBy} at={order.createdAt} /><Who verb="Last edited" who={order.updatedBy} at={order.updatedAt} /></span>
    </div>
    {order.deliveryDate && lastDate > order.deliveryDate ? <p className="order-warning" role="alert">Production is scheduled until {displayDate(lastDate)}, after the expected customer delivery on {displayDate(order.deliveryDate)}.</p> : null}
    {warnings.length ? <ul className="flow-warnings" role="alert">{warnings.map((warning) => <li key={warning.message}>{warning.message}</li>)}</ul> : null}
    <details className="order-section">
      <summary className="order-section-summary"><h3>Progress</h3><span className="route-muted">Planning · Production · QC testing · QA release</span></summary>
      <OrderFlow order={order} orders={orders} directory={directory} jobOrders={jobOrders} lines={lines} transfers={transfers} matrix={matrix} />
    </details>
    {jobActions ? <JobOrders directory={directory} orders={orders} order={order} product={product} products={products} format={format} jobOrders={jobOrders} transfers={transfers} lines={lines} actions={jobActions} /> : null}
    {editable ? <form className="order-edit" onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const delivery = String(data.get("deliveryDate") ?? ""), received = String(data.get("receivedDate") ?? "");
      // Only a date changed here is checked, so an older order does not ask again on every save.
      checkDates([{ label: words.received, value: received, rule: "today", was: order.receivedDate }, { label: words.delivery, value: delivery, rule: "delivery", was: order.deliveryDate, after: { label: `the ${words.received.toLowerCase()}`, value: received } }], () => {
      const so = String(data.get("so") ?? "").trim();
      const { deliveryDate: _d, receivedDate: _r, soNumber: _s, unitWeightMg: _w, unitsPerPack: _p, ...rest } = order;
      const weighed = draftWeights({ ...draftItem(), ...weights }, order.uom);
      const category = data.get("category") as OrderCategory | null;
      const result = onSave({ ...rest, ...(category ? { category } : {}), ...(delivery ? { deliveryDate: delivery } : {}), ...(received ? { receivedDate: received } : {}), ...(so ? { soNumber: so } : {}), ...weighed, customerName: String(data.get("customer")).trim(), poNumber: String(data.get("po")).trim(), quantity: Number(weights.quantity), format: String(data.get("format")) as ProductFormat });
      setErrors(result); setSaved(!result.length);
      });
    }}>
      <label>Customer name<input name="customer" required defaultValue={order.customerName} list={`customers-${order.id}`} /></label>
      <datalist id={`customers-${order.id}`}>{customers.map((name) => <option key={name} value={name} />)}</datalist>
      {order.category ? <label>Type<select name="category" defaultValue={order.category}>{ORDER_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
      <label>{words.po}<input name="po" required defaultValue={order.poNumber} /></label>
      <label>{words.so}<input name="so" maxLength={60} placeholder="Optional" defaultValue={order.soNumber ?? ""} /></label>
      <label>{words.received}<input name="receivedDate" type="date" max={localDateKey(new Date())} defaultValue={order.receivedDate ?? ""} /></label>
      <label>{words.delivery}<input name="deliveryDate" type="date" defaultValue={order.deliveryDate ?? ""} /></label>
      <label>Dosage form<select name="format" defaultValue={format}>{PRODUCT_FORMATS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Quantity ({order.uom})<input name="quantity" type="number" min="1" step="any" required value={weights.quantity} onChange={(event) => setWeights({ ...weights, quantity: event.target.value })} /></label>
      <OrderWeightFields uom={order.uom} quantity={weights.quantity} unitWeightMg={weights.unitWeightMg} unitsPerPack={weights.unitsPerPack} names={order.id} onChange={(change) => setWeights({ ...weights, ...change })} />
      <button type="submit" className="calendar-button">Save order</button>
      {confirming ? <><span>Delete {order.poNumber}?</span><button type="button" className="calendar-button" onClick={() => { setErrors(onDelete(order.id)); setConfirming(false); }}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => setConfirming(false)}>Cancel</button></>
        : <button type="button" className="icon-button danger" title={linked ? "Unlink its activities before deleting" : `Delete ${order.poNumber}`} aria-label={`Delete ${order.poNumber}`} onClick={() => setConfirming(true)}><Trash2 size={16} /></button>}
    </form> : null}
    {errors.map((error) => <p role="alert" key={error}>{error}</p>)}
    {saved && !errors.length ? <p role="status">Order saved.</p> : null}
  </div>;
}

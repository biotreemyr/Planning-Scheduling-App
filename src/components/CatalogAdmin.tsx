"use client";
import { useState } from "react";
import { AdminRows } from "./AdminRows";
import { useUoms } from "./MeasurementSettings";
import type { Product, WorkCentre } from "@/lib/domain/types";

export function CatalogAdmin({ products, workCentres, onProduct, onCentre, onDelete }: {
  products: Product[]; workCentres: WorkCentre[];
  onProduct: (item: Product) => string[]; onCentre: (item: WorkCentre) => string[];
  onDelete: (kind: "products" | "centres", id: string) => string[];
}) {
  const [kind, setKind] = useState<"products" | "centres">("products");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const uoms = useUoms();
  const rows = kind === "products" ? products : workCentres;
  const item = rows.find((row) => row.id === editing);
  const product = kind === "products" ? products.find((row) => row.id === editing) : undefined;
  const label = kind === "products" ? "product" : "work centre";
  function finish(errors: string[]) { setMessage(errors.join(" ") || "Changes saved."); if (!errors.length) { setEditing(null); setPending(null); setVersion((value) => value + 1); } }
  return <section className="calendar-admin">
    <div className="view-switch admin-sections">{(["products", "centres"] as const).map((key) => <button type="button" key={key} aria-pressed={kind === key} onClick={() => { setKind(key); setEditing(null); setPending(null); setMessage(""); setQuery(""); setStatus(""); }}>{key === "products" ? "Products" : "Work centres"}</button>)}</div>
    <section className="admin-create-area"><div className="panel-title"><h2>{editing ? "Edit" : "Add"} {label}</h2>{editing ? <button type="button" className="calendar-button" onClick={() => setEditing(null)}>Cancel edit</button> : null}</div>
      <form key={`${kind}-${editing}-${version}`} className="admin-inline" onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name")).trim(); const code = String(data.get("code")).trim(); const active = data.has("active") ? "Active" : "Inactive";
        if (!name || !code) return;
        if (rows.some((row) => row.id !== editing && ("sku" in row ? row.sku : row.code).toLowerCase() === code.toLowerCase())) { setMessage("Code already exists."); return; }
        // Blank batch fields clear them; job orders then ask for the batch quantity each time.
        const positive = (field: string) => { const value = Number(data.get(field)); return String(data.get(field) ?? "").trim() && Number.isFinite(value) && value > 0 ? value : undefined; };
        if (kind === "products") {
          const { batchQuantity: _q, batchSizeKg: _k, ...rest } = product ?? {} as Partial<Product>;
          const batchQuantity = positive("batchQuantity"), batchSizeKg = positive("batchSizeKg");
          finish(onProduct({ ...rest, id: editing ?? crypto.randomUUID(), name, sku: code, active, uom: String(data.get("uom")), productType: product?.productType ?? "Finished Good", ...(batchQuantity ? { batchQuantity } : {}), ...(batchSizeKg ? { batchSizeKg } : {}) }));
        } else finish(onCentre({ id: editing ?? crypto.randomUUID(), name, code, active }));
      }}><label>{kind === "products" ? "Product name" : "Work centre name"}<input name="name" required defaultValue={item?.name} /></label><label>Code<input name="code" required defaultValue={item ? "sku" in item ? item.sku : item.code : ""} /></label>
        {kind === "products" ? <label>UOM<select name="uom" required defaultValue={product?.uom ?? uoms.find((option) => option.active)?.name}>{uoms.filter((option) => option.active || option.name === product?.uom).map((option) => <option key={option.name}>{option.name}</option>)}{product && !uoms.some((option) => option.name === product.uom) ? <option>{product.uom}</option> : null}</select></label> : null}
        {kind === "products" ? <><label title="The most one batch (one job order) may hold, in the product's UOM">Allowable batch quantity<input name="batchQuantity" type="number" min="0" step="any" placeholder="e.g. 280000" defaultValue={product?.batchQuantity} /></label>
          <label title="Kilograms of one full batch">Batch size (kg)<input name="batchSizeKg" type="number" min="0" step="any" placeholder="e.g. 406" defaultValue={product?.batchSizeKg} /></label></> : null}
        <label className="actuals-filter"><input name="active" type="checkbox" defaultChecked={item?.active !== "Inactive"} />Active</label><button type="submit" className="primary-button">{editing ? "Save" : "Add"} {label}</button>
      </form>{message && !pending ? <p role="status">{message}</p> : null}
    </section>
    <section className="admin-saved-area"><h2>Existing {kind === "products" ? "products" : "work centres"}</h2>
      <div className="admin-inline"><label>Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select></label></div>
      {pending ? <div className="admin-delete-confirm" role="alert"><p>Delete <strong>{rows.find((row) => row.id === pending)?.name}</strong>?</p><button type="button" className="calendar-button" onClick={() => finish(onDelete(kind, pending))}>Confirm delete</button><button type="button" className="calendar-button" onClick={() => { setPending(null); setMessage(""); }}>Cancel</button>{message ? <p className="admin-delete-error">{message}</p> : null}</div> : null}
      <AdminRows columns={kind === "products" ? ["Product code", "Product name", "UOM", "Batch", "Status"] : undefined} scrollable={kind === "products"} detailLabel="Code / Status" rows={rows.filter((row) => (!status || row.active === status) && `${row.name} ${"sku" in row ? row.sku : row.code}`.toLowerCase().includes(query.toLowerCase())).map((row) => ({ ...row, cells: "sku" in row ? [row.sku, row.name, row.uom, row.batchQuantity ? `${row.batchQuantity.toLocaleString()} ${row.uom}${row.batchSizeKg ? ` · ${row.batchSizeKg.toLocaleString()} kg` : ""}` : "Not set", row.active] : undefined, detail: `${"code" in row ? row.code : ""} | ${row.active}` }))} onEdit={(id) => { setEditing(id); setPending(null); setMessage(""); }} onDelete={(id) => { setPending(id); setMessage(""); }} />
    </section>
  </section>;
}

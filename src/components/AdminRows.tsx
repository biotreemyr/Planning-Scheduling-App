"use client";
import { Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

export function AdminRows({ rows, detailLabel = "Details", columns, scrollable = false, onEdit, onDelete }: {
  rows: { id: string; name: string; detail?: ReactNode; cells?: ReactNode[] }[]; detailLabel?: string;
  columns?: string[]; scrollable?: boolean;
  onEdit: (id: string) => void; onDelete: (id: string) => void;
}) {
  const headers = columns ?? ["Name", detailLabel];
  return <div className={`admin-table-scroll${scrollable ? " admin-table-bounded" : ""}`} tabIndex={scrollable ? 0 : undefined} role={scrollable ? "region" : undefined} aria-label={scrollable ? "Product records" : undefined}><table className="admin-records"><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}<th scope="col"><span className="admin-sr-only">Actions</span></th></tr></thead><tbody>
    {!rows.length ? <tr><td colSpan={headers.length + 1}>No items added yet.</td></tr> : rows.map((row) => <tr key={row.id}>{(row.cells ?? [row.name, row.detail ?? "-"]).map((cell, index) => <td key={index}>{cell}</td>)}<td><div className="admin-row-actions">
      <button type="button" className="icon-button" title={`Edit ${row.name}`} aria-label={`Edit ${row.name}`} onClick={() => onEdit(row.id)}><Pencil size={16} /></button>
      <button type="button" className="icon-button" title={`Delete ${row.name}`} aria-label={`Delete ${row.name}`} onClick={() => onDelete(row.id)}><Trash2 size={16} /></button>
    </div></td></tr>)}
  </tbody></table></div>;
}

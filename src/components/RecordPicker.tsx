"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { placeNear } from "./popover";

export type PickerColumn<T> = { key: string; label: string; value: (record: T) => string; filter?: boolean };


/**
 * Pick one record from a list too long to scroll: type in the field to search every column, or open
 * it for a compact table with a filter above each filterable column. Only a listed record can be
 * chosen; the form will not submit with anything else typed in.
 */
export function RecordPicker<T extends { id: string }>({ label, name, records, columns, value, onChange, display, placeholder, noun, onText }: {
  label: string; name: string; records: T[]; columns: PickerColumn<T>[]; value?: string;
  onChange?: (id: string) => void; display: (record: T) => string; placeholder: string;
  // "product" or "customer": used in the empty and invalid messages.
  noun: string;
  // Called with whatever is typed, for forms that also react to a typed code.
  onText?: (text: string) => void;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Focus handed back to the field after picking or closing should not reopen the table.
  const quiet = useRef(false);
  const refocus = () => { quiet.current = true; input.current?.focus(); quiet.current = false; };
  const [query, setQuery] = useState(() => { const record = records.find((item) => item.id === value); return record ? display(record) : ""; });
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => { const field = box.current?.querySelector(".record-picker-input")?.getBoundingClientRect(); if (field) setPlace(placeNear(field, Math.min(Math.max(field.width, 560), 720))); };
    update();
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open]);
  const selected = records.find((record) => display(record) === query);
  const text = (record: T) => columns.map((column) => column.value(record)).join(" ").toLowerCase();
  const matches = records.filter((record) => (selected || text(record).includes(query.trim().toLowerCase()))
    && columns.every((column) => !filters[column.key]?.trim() || column.value(record).toLowerCase().includes(filters[column.key].trim().toLowerCase())));
  useEffect(() => { input.current?.setCustomValidity(query && !selected ? `Choose a ${noun} from the list.` : ""); }, [query, selected, noun]);
  useEffect(() => { if (active >= matches.length) setActive(Math.max(0, matches.length - 1)); }, [active, matches.length]);
  useEffect(() => { if (open) box.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  function choose(record: T) {
    const shown = display(record);
    setQuery(shown); setFilters({}); setOpen(false); onChange?.(record.id); onText?.(shown);
    input.current?.setCustomValidity(""); refocus();
  }
  // Shared by the field and the column filters: arrows move through the rows, Enter picks, Escape closes
  // the table without closing the dialog around it.
  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); refocus(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
    if (event.key === "Enter" && open && matches[active]) { event.preventDefault(); choose(matches[active]); }
  }
  return <div className="record-picker" ref={box} onBlur={(event) => { if (!box.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <label htmlFor={id}>{label}</label>
    <div className="record-picker-input">
      <input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={`${id}-table`} aria-autocomplete="list" type="text" required autoComplete="off" placeholder={placeholder} value={query} title={query}
        onFocus={() => { if (!quiet.current) setOpen(true); }} onClick={() => setOpen(true)} onKeyDown={keys}
        onChange={(event) => { const next = event.target.value; setQuery(next); setActive(0); setOpen(true); onText?.(next); onChange?.(records.find((record) => display(record) === next)?.id ?? ""); }} />
      <button type="button" className="record-picker-toggle" aria-label={`Show ${noun}s`} title={`Show ${noun}s`} onMouseDown={(event) => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!open); }}><ChevronDown size={16} /></button>
    </div>
    {open ? <div className="record-picker-panel" id={`${id}-table`} style={place}>
      <div className="record-picker-scroll">
        <table role="listbox" aria-label={`${label} list`}>
          <thead>
            <tr>{columns.map((column) => <th key={column.key} scope="col" className={`col-${column.key}`}>{column.label}</th>)}</tr>
            <tr>{columns.map((column) => <th key={column.key} className={`col-${column.key}`}>{column.filter
              ? <input type="search" aria-label={`Filter by ${column.label.toLowerCase()}`} placeholder="Filter" value={filters[column.key] ?? ""} onKeyDown={keys}
                  onChange={(event) => { setFilters((current) => ({ ...current, [column.key]: event.target.value })); if (selected) { setQuery(""); onText?.(""); onChange?.(""); } setActive(0); }} />
              : null}</th>)}</tr>
          </thead>
          <tbody>{matches.map((record, index) => <tr key={record.id} role="option" data-row={index} aria-selected={selected?.id === record.id} className={index === active ? "active" : undefined}
            onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(record)}>
            {columns.map((column) => <td key={column.key} className={`col-${column.key}`}>{column.value(record)}</td>)}
          </tr>)}</tbody>
        </table>
        {matches.length ? null : <p>No matching {noun}s.</p>}
      </div>
      <small>{matches.length} of {records.length} {noun}s</small>
    </div> : null}
    <input type="hidden" name={name} value={selected?.id ?? ""} />
  </div>;
}

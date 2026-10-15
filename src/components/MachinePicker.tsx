"use client";
import { useEffect, useRef, useState } from "react";
import type { Machine } from "@/lib/domain/types";
import { machineLabel } from "@/lib/services/machines";

/**
 * Choose the machines an activity is booked on: usually one, several for a line such as bottle
 * filling (counting, capping, sealing, labelling). Each shows as its Equipment ID and name. Controlled
 * with `value` and `onChange`, or, in a plain form, posted as one `name` value per ticked machine.
 */
export function MachinePicker({ machines, value, defaultValue = [], onChange, name, form, disabled, label, empty = "Not assigned" }: {
  machines: Machine[]; value?: string[]; defaultValue?: string[]; onChange?: (ids: string[]) => void;
  name?: string; form?: string; disabled?: boolean; label: string; empty?: string;
}) {
  const [own, setOwn] = useState(defaultValue);
  const chosen = value ?? own;
  const box = useRef<HTMLDetailsElement>(null);
  // Closes when the person clicks or tabs elsewhere, like a select.
  useEffect(() => {
    const close = (event: Event) => { if (box.current?.open && !box.current.contains(event.target as Node)) box.current.open = false; };
    document.addEventListener("pointerdown", close);
    document.addEventListener("focusin", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("focusin", close); };
  }, []);
  const set = (ids: string[]) => { if (value === undefined) setOwn(ids); onChange?.(ids); };
  const picked = machines.filter((machine) => chosen.includes(machine.id));
  const summary = !picked.length ? (machines.length ? empty : "No machine set up") : picked.length === 1 ? machineLabel(picked[0]) : `${machineLabel(picked[0])} +${picked.length - 1} more`;
  return <details ref={box} className={`machine-picker${disabled ? " disabled" : ""}`}>
    <summary aria-label={`${label}: ${picked.map(machineLabel).join(", ") || empty}`} title={picked.map(machineLabel).join("\n") || undefined}
      onClick={(event) => { if (disabled) event.preventDefault(); }}>{summary}</summary>
    {/* Ticked machines post with the form even while the list is closed. */}
    {name ? chosen.map((id) => <input key={id} type="hidden" name={name} form={form} value={id} />) : null}
    <div className="machine-picker-list" role="group" aria-label={label}>
      {machines.length ? machines.map((machine) => <label key={machine.id}>
        <input type="checkbox" disabled={disabled} checked={chosen.includes(machine.id)} onChange={(event) => set(event.target.checked ? [...chosen, machine.id] : chosen.filter((id) => id !== machine.id))} />
        <span className="machine-picker-id">{machine.code}</span><span>{machine.name}</span>
      </label>) : <p className="route-muted">No machine is set up for this process.</p>}
    </div>
  </details>;
}

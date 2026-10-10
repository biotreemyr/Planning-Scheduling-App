"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A toolbar button that opens a small panel over the page, so options people set now and then
 * (which processes, which filters, what is waiting) do not push the calendar or list down. Closes on
 * a click elsewhere or Escape. `active` marks the button when its options narrow what is shown.
 */
export function ToolbarMenu({ label, badge, active, align = "left", className, children }: {
  label: ReactNode; badge?: ReactNode; active?: boolean; align?: "left" | "right"; className?: string; children: ReactNode;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);
  return <div className={`toolbar-menu${className ? ` ${className}` : ""}`} ref={box} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className={`toolbar-menu-button${active ? " active" : ""}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {label}{badge !== undefined ? <span className="toolbar-menu-badge">{badge}</span> : null}<ChevronDown size={14} aria-hidden="true" />
    </button>
    {open ? <div className={`toolbar-menu-panel ${align}`} id={id}>{children}</div> : null}
  </div>;
}

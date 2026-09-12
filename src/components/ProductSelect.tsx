"use client";
import { useId, useRef, useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import type { Product } from "@/lib/domain/types";

export function ProductSelect({ products, value, onChange, name = "product" }: { products: Product[]; value?: string; onChange?: (id: string) => void; name?: string }) {
  const id = useId();
  const options = products.filter((product) => product.active === "Active");
  const label = (product: Product) => `${product.sku} - ${product.name}`;
  const [query, setQuery] = useState(() => { const product = options.find((item) => item.id === value); return product ? label(product) : ""; });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.find((product) => label(product) === query);
  const matches = options.filter((product) => selected || label(product).toLowerCase().includes(query.trim().toLowerCase()));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.setCustomValidity(query && !selected ? "Choose a product from the dropdown." : ""); }, [query, selected]);
  function choose(product: Product) { setQuery(label(product)); onChange?.(product.id); setOpen(false); input.current?.setCustomValidity(""); }
  return <div className="product-select"><label htmlFor={id}>Product</label>
    <div className="product-select-input"><input id={id} ref={input} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={open && matches[active] ? `${id}-${matches[active].id}` : undefined} type="text" required autoComplete="off" placeholder="Search product name or code" value={query} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); onChange?.(options.find((product) => label(product) === event.target.value)?.id ?? ""); }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && open && matches[active]) { event.preventDefault(); choose(matches[active]); }
    }} /><button type="button" className="product-select-toggle" aria-label="Show products" title="Show products" onMouseDown={(event) => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!open); }}><ChevronDown size={16} /></button></div>
    {open ? <div role="listbox" id={`${id}-options`} className="product-options" aria-label="Products">{matches.length ? matches.map((product, index) => <button type="button" role="option" aria-selected={selected?.id === product.id} id={`${id}-${product.id}`} key={product.id} className={active === index ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(product)}><strong>{product.name}</strong><small>{product.sku}</small></button>) : <p>No matching products.</p>}</div> : null}
    <input type="hidden" name={name} value={selected?.id ?? ""} />
  </div>;
}

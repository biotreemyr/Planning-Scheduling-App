"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SIZES = [25, 50, 100];

/**
 * Paging for a long table: `rows` is the current page. Changing `resetKey` (the filters, say) goes
 * back to page 1, and a page past the end (after rows were filtered out) shows the last page.
 */
export function usePager<T>(items: T[], resetKey: string) {
  const [size, setSize] = useState(SIZES[0]);
  const [state, setState] = useState({ page: 0, key: resetKey });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(state.key === resetKey ? state.page : 0, pages - 1);
  const go = (next: number) => setState({ page: Math.max(0, Math.min(next, pages - 1)), key: resetKey });
  return {
    rows: items.slice(page * size, page * size + size),
    pager: <Pager page={page} pages={pages} size={size} total={items.length} onPage={go} onSize={(value) => { setSize(value); setState({ page: 0, key: resetKey }); }} />
  };
}

function Pager({ page, pages, size, total, onPage, onSize }: { page: number; pages: number; size: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void }) {
  if (total <= SIZES[0]) return null;
  const first = page * size + 1, last = Math.min(total, first + size - 1);
  return <nav className="table-pager" aria-label="Pages">
    <span className="result-count">Showing {first}–{last} of {total}</span>
    <label>Rows per page<select value={size} onChange={(event) => onSize(Number(event.target.value))}>{SIZES.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
    <span className="table-pager-buttons">
      <button type="button" className="calendar-button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={15} />Previous</button>
      <span aria-live="polite">Page {page + 1} of {pages}</span>
      <button type="button" className="calendar-button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">Next<ChevronRight size={15} /></button>
    </span>
  </nav>;
}

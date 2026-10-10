import type { CSSProperties } from "react";

/**
 * Where to put a pop-up beside the field that opens it. It is placed against the window rather than
 * the form, so a scrolling dialog or table cannot clip it: below the field, or above it when there
 * is more room there, and kept inside the page's width.
 */
export function placeNear(anchor: DOMRect, preferredWidth: number, wantedHeight = 380): CSSProperties {
  const margin = 16, across = document.documentElement.clientWidth;
  const width = Math.min(preferredWidth, across - 2 * margin);
  const left = Math.max(margin, Math.min(anchor.left, across - width - margin));
  const below = window.innerHeight - anchor.bottom - margin, above = anchor.top - margin;
  return below >= Math.min(wantedHeight, above)
    ? { left, width, top: anchor.bottom + 4, maxHeight: Math.min(wantedHeight, below) }
    : { left, width, bottom: window.innerHeight - anchor.top + 4, maxHeight: Math.min(wantedHeight, above) };
}

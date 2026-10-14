"use client";
import { useRef, useState, type PointerEvent, type RefObject } from "react";

/**
 * A floating window rather than a modal, so the calendar behind stays in view and usable: dragged
 * by its title bar, minimised to that bar, and placed where it was left. Spread `barProps` on the
 * title bar and `style` on the dialog; `open(width)` places it centred near the top the first time.
 */
export function useFloatingWindow(dialog: RefObject<HTMLDialogElement | null>) {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [minimised, setMinimised] = useState(false);
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const keepInView = (left: number, top: number) => {
    const width = dialog.current?.offsetWidth ?? 600;
    // Fully on screen side to side, so its buttons stay in reach; the title bar always visible.
    return { left: Math.max(8, Math.min(left, document.documentElement.clientWidth - width - 8)), top: Math.min(Math.max(8, top), window.innerHeight - 48) };
  };
  const stop = () => { dragging.current = null; };
  const barProps = {
    title: "Drag to move",
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if ((event.target as HTMLElement).closest("button, a, input, select, textarea") || !dialog.current) return;
      const box = dialog.current.getBoundingClientRect();
      dragging.current = { dx: event.clientX - box.left, dy: event.clientY - box.top };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (dragging.current) setPlace(keepInView(event.clientX - dragging.current.dx, event.clientY - dragging.current.dy));
    },
    onPointerUp: stop, onPointerCancel: stop
  };
  // First opening: centred for the window's width, near the top; later it stays where it was left.
  const open = (width: number) => { if (!place) setPlace(keepInView((window.innerWidth - Math.min(width, window.innerWidth - 24)) / 2, 72)); };
  // It ends 12px above the bottom of the screen wherever it is placed, so a long window scrolls inside
  // itself and its Save button can always be reached.
  return { minimised, setMinimised, barProps, open, style: place ? { left: place.left, top: place.top, maxHeight: `max(120px, calc(100dvh - ${place.top + 12}px))` } : undefined };
}

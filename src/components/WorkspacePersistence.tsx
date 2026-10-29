"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, RotateCw } from "lucide-react";
import type { WorkspaceEnvelope } from "@/lib/domain/workspace";
import { formatDateTime } from "@/lib/services/dates";

// How often an open page asks whether someone else has saved since it was loaded.
const CHECK_EVERY_MS = 60_000;
// Something is being keyed in: a window is open, or the cursor is in a field.
function busy() {
  const active = document.activeElement;
  return !!document.querySelector("dialog[open]") || !!active?.closest("input, textarea, select, [contenteditable='true']");
}

// The newest save on the server: its revision, who made it and when.
async function latestSave(): Promise<{ revision: number; by?: string; at?: string } | undefined> {
  try {
    const result = await fetch("/api/workspace", { cache: "no-store" });
    if (!result.ok) return undefined;
    const body = await result.json() as { revision?: number; by?: string; at?: string };
    return typeof body.revision === "number" ? { revision: body.revision, by: body.by, at: body.at } : undefined;
  } catch { return undefined; }
}
// "NOR AZMAN SAHAD saved newer data at 29/10/2026 17:36", or without the name when it is not recorded.
const savedBy = (latest?: { by?: string; at?: string }) => `${latest?.by ? latest.by : "Someone else"} saved newer data${latest?.at ? ` at ${formatDateTime(latest.at)}` : ""}`;

export function useWorkspacePersistence(initial: WorkspaceEnvelope, snapshot: unknown, token: string) {
  const serialized = JSON.stringify(snapshot);
  const current = useRef(serialized);
  current.current = serialized;
  const saved = useRef(JSON.stringify(initial.snapshot));
  const revision = useRef(initial.revision);
  const running = useRef(false);
  const failed = useRef(false);
  const pending = useRef<{ snapshot: unknown; revision: number; mutationId: string; serialized: string } | null>(null);
  const [status, setStatus] = useState("Saved to PostgreSQL");
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  // Someone else has saved since this page was loaded: it must refresh before anything more is keyed in.
  // With who saved the newer data, and when, so they can be contacted.
  const [stale, setStale] = useState<false | { by?: string; at?: string }>(false);

  const save = useCallback(async () => {
    if (running.current || failed.current) return;
    running.current = true;
    try {
      while (pending.current || current.current !== saved.current) {
        setStatus("Saving...");
        pending.current ??= { snapshot: JSON.parse(current.current), revision: revision.current, mutationId: crypto.randomUUID(), serialized: current.current };
        const write = pending.current;
        const result = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json", "X-Scheduler-Token": token }, body: JSON.stringify({ snapshot: write.snapshot, revision: write.revision, mutationId: write.mutationId }) });
        const body = await result.json();
        if (!result.ok) {
          // Invalid snapshots were never committed; allow a corrected form to be retried.
          if (result.status === 400 || result.status === 413) pending.current = null;
          setConflict(result.status === 409 || result.status === 403);
          if (result.status === 409) { const latest = await latestSave(); setStale(latest ?? {}); throw new Error(`Not saved: ${savedBy(latest)} after this page was opened. Refresh the page, then key this in again.`); }
          throw new Error(body.error ?? "Save failed. Keep this tab open.");
        }
        revision.current = body.revision;
        saved.current = write.serialized;
        pending.current = null;
      }
      setError(false); setStatus("Saved to PostgreSQL");
    } catch (error) {
      failed.current = true; setError(true);
      // A network-level failure ("Failed to fetch") usually means the sign-in needs renewing.
      setStatus(error instanceof TypeError ? "Could not reach the scheduler, or your sign-in needs renewing. Retry; if it fails again, download your changes and reload the page." : error instanceof Error ? error.message : "Save failed. Keep this tab open and retry.");
    }
    finally { running.current = false; }
  }, [token]);

  useEffect(() => {
    if (serialized === saved.current || failed.current) return;
    setStatus("Unsaved changes");
    const timer = setTimeout(() => { void save(); }, 350);
    return () => clearTimeout(timer);
  }, [serialized, save]);
  // Pages left open (opened in the morning, used in the evening) fall behind other people's saves, and
  // a save from them is refused. Check every minute and when the page comes back into view: with
  // nothing being keyed in, refresh to the newest data at once; otherwise say so, with a Refresh button.
  useEffect(() => {
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== "visible" || running.current) return;
      checking = true;
      try {
        const body = await latestSave();
        if (!body || body.revision <= revision.current || running.current) return;
        const unsaved = current.current !== saved.current || !!pending.current || failed.current;
        if (!unsaved && !busy()) window.location.reload();
        else setStale({ by: body.by, at: body.at });
      } catch { /* offline for a moment: the next check tries again */ } finally { checking = false; }
    };
    const timer = setInterval(() => { void check(); }, CHECK_EVERY_MS);
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current !== saved.current || running.current || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const refresh = <button type="button" className="calendar-button" onClick={() => { failed.current = false; saved.current = current.current; pending.current = null; window.location.reload(); }}><RefreshCw size={16} />Refresh</button>;
  if (stale && !error) return <div className="persistence-status persistence-error" role="alert">
    <span>{savedBy(stale)} after this page was opened. Finish or close what you are keying in, then refresh before saving more.</span>{refresh}
  </div>;
  return <div className={`persistence-status${error ? " persistence-error" : ""}`} role={error ? "alert" : "status"}>
    <span>{status}</span>
    {error && stale ? refresh : null}
    {error && !conflict ? <button type="button" className="calendar-button" onClick={() => { failed.current = false; setError(false); void save(); }}><RotateCw size={16} />Retry save</button> : null}
    {error && !stale ? <button type="button" className="calendar-button" onClick={() => {
      const url = URL.createObjectURL(new Blob([current.current], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `unsaved-workspace-${Date.now()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}><Download size={16} />Download unsaved changes</button> : null}
  </div>;
}

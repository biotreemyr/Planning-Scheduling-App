"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RotateCw } from "lucide-react";
import type { WorkspaceEnvelope } from "@/lib/domain/workspace";

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
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (current.current !== saved.current || running.current || pending.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  return <div className={`persistence-status${error ? " persistence-error" : ""}`} role={error ? "alert" : "status"}>
    <span>{status}</span>
    {error && !conflict ? <button type="button" className="calendar-button" onClick={() => { failed.current = false; setError(false); void save(); }}><RotateCw size={16} />Retry save</button> : null}
    {error ? <button type="button" className="calendar-button" onClick={() => {
      const url = URL.createObjectURL(new Blob([current.current], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `unsaved-workspace-${Date.now()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}><Download size={16} />Download unsaved changes</button> : null}
  </div>;
}

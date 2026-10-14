"use client";
import { useState } from "react";
import { X } from "lucide-react";
import type { Release } from "@/lib/services/releases";
import { formatDate } from "@/lib/services/dates";
import { usePager } from "./Pager";

// Keep a Changelog's kinds of change, each with its own badge colour.
const TYPE_BADGE: Record<string, string> = { Added: "success", Changed: "info", Fixed: "warning", Removed: "danger", Deprecated: "neutral", Security: "danger" };

// What's new: every released version and what changed in it, newest first, from CHANGELOG.md.
// Laid out like the Audit trail: search and filters above one table, one row per change.
export function ReleaseNotes({ releases }: { releases: Release[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [version, setVersion] = useState("");
  const current = releases[0]?.version;
  const rows = releases.flatMap((release) => release.sections.flatMap((section) => section.items.map((item, index) => ({ key: `${release.version}-${section.title}-${index}`, release, type: section.title, text: item }))));
  const types = [...new Set(rows.map((row) => row.type))];
  const shown = rows.filter((row) => (!type || row.type === type) && (!version || row.release.version === version) && `${row.release.version} ${row.type} ${plain(row.text)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const { rows: page, pager } = usePager(shown, `${query}|${type}|${version}`);
  // The version and date show once on each page, beside the first of that version's changes.
  const firstOf = new Set(releases.map((release) => page.find((row) => row.release === release)?.key));
  const spanOf = (release: Release) => page.filter((row) => row.release === release).length;
  const filtering = !!(query || type || version);
  return <section className="workspace-panel history-panel release-notes">
    <div className="panel-title"><h2>Releases <span className="badge neutral">{releases.length}</span></h2>
      {current ? <p className="release-current">You are on <strong>version {current}</strong>{releases[0].date ? ` · released ${formatDate(releases[0].date)}` : ""}</p> : null}
    </div>
    <p className="orders-help">What changed in each version of the scheduler, newest first. Search for a screen or feature to see when it changed.</p>
    <div className="orders-toolbar">
      <label className="planning-search">Search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Feature, screen or change" /></label>
      <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{types.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Version<select value={version} onChange={(event) => setVersion(event.target.value)}><option value="">All versions</option>{releases.map((item) => <option key={item.version} value={item.version}>{item.version}</option>)}</select></label>
      {filtering ? <button type="button" className="calendar-button" onClick={() => { setQuery(""); setType(""); setVersion(""); }}><X size={15} />Clear</button> : null}
      <span className="result-count" aria-live="polite">{shown.length} of {rows.length} changes</span>
    </div>
    <div className="orders-table-scroll" tabIndex={0} role="region" aria-label="Release notes">
      <table className="orders-table history-table release-table">
        <thead><tr><th scope="col">Version</th><th scope="col">Released</th><th scope="col">Type</th><th scope="col">Change</th></tr></thead>
        <tbody>
          {!shown.length ? <tr><td colSpan={4} className="empty-state">{rows.length ? "No changes match these filters." : "No release notes yet."}</td></tr> : null}
          {page.map((row) => <tr key={row.key} className={firstOf.has(row.key) ? "release-first" : undefined}>
            {firstOf.has(row.key) ? <>
              <th scope="rowgroup" rowSpan={spanOf(row.release)} className="release-version">
                <span className="release-number">v{row.release.version}</span>
                {row.release.version === current ? <span className="badge success">Current</span> : null}
                {row.release.summary ? <small>{row.release.summary}</small> : null}
              </th>
              <td rowSpan={spanOf(row.release)} className="history-when">{row.release.date ? formatDate(row.release.date) : "-"}</td>
            </> : null}
            <td><span className={`badge ${TYPE_BADGE[row.type] ?? "neutral"}`}>{row.type}</span></td>
            <td><Inline text={row.text} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {pager}
  </section>;
}

const plain = (text: string) => text.replace(/\*\*/g, "");

// The notes use **bold** for the feature's name; everything else is plain text.
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}

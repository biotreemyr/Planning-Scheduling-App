import type { Release } from "@/lib/services/releases";
import { formatDate } from "@/lib/services/dates";

// What's new: every released version and what changed in it, newest first, from CHANGELOG.md.
export function ReleaseNotes({ releases }: { releases: Release[] }) {
  if (!releases.length) return <section className="workspace-panel"><p className="empty-state">No release notes yet.</p></section>;
  return <section className="release-notes">
    {releases.map((release, index) => <article key={release.version} className="workspace-panel release">
      <header className="release-head">
        <h2>Version {release.version}</h2>
        {index === 0 ? <span className="badge success">Current</span> : null}
        {release.date ? <time dateTime={release.date}>{formatDate(release.date)}</time> : null}
      </header>
      {release.summary ? <p className="release-summary">{release.summary}</p> : null}
      {release.sections.map((section) => <section key={section.title} className="release-section">
        <h3>{section.title}</h3>
        <ul>{section.items.map((item) => <li key={item}><Inline text={item} /></li>)}</ul>
      </section>)}
    </article>)}
  </section>;
}

// The notes use **bold** for the feature's name; everything else is plain text.
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : part)}</>;
}

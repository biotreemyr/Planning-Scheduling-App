// Release notes for the What's new tab, read from CHANGELOG.md (Keep a Changelog format):
//   ## [1.1.0] - 2026-10-21
//   ### Added
//   - Something people can now do.
// "Unreleased" is work merged but not yet released, so it is not shown to users.
export type Release = { version: string; date: string; summary: string; sections: { title: string; items: string[] }[] };

export function parseChangelog(text: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^##\s+\[?([^\]\s]+)\]?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (heading && !line.startsWith("###")) {
      release = heading[1].toLowerCase() === "unreleased" ? null : { version: heading[1], date: heading[2] ?? "", summary: "", sections: [] };
      if (release) releases.push(release);
      continue;
    }
    if (!release) continue;
    const section = /^###\s+(.+)$/.exec(line);
    if (section) { release.sections.push({ title: section[1], items: [] }); continue; }
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item && release.sections.length) { release.sections.at(-1)!.items.push(item[1]); continue; }
    // A plain line under the version heading, before its first section, is the release's one-line summary.
    if (line && !release.sections.length && !line.startsWith("[")) release.summary = release.summary ? `${release.summary} ${line}` : line;
  }
  return releases;
}

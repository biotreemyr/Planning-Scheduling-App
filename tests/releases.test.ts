import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseChangelog } from "../src/lib/services/releases";

describe("release notes", () => {
  it("reads released versions, newest first, and leaves out Unreleased", () => {
    const releases = parseChangelog(["# Changelog", "", "## [Unreleased]", "### Added", "- Not out yet", "",
      "## [1.1.0] - 2026-10-21", "Smaller fixes.", "### Fixed", "- **Orders** print the right date", "",
      "## [1.0.0] - 2026-10-14", "### Added", "- First item", "- Second item"].join("\n"));
    expect(releases).toEqual([
      { version: "1.1.0", date: "2026-10-21", summary: "Smaller fixes.", sections: [{ title: "Fixed", items: ["**Orders** print the right date"] }] },
      { version: "1.0.0", date: "2026-10-14", summary: "", sections: [{ title: "Added", items: ["First item", "Second item"] }] }
    ]);
  });
  it("the app's version matches the newest release in CHANGELOG.md", () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(parseChangelog(readFileSync("CHANGELOG.md", "utf8"))[0]?.version).toBe(version);
  });
});

describe("What's new tab", () => {
  it("lists every change with its version once, and marks the newest version current", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ReleaseNotes } = await import("../src/components/ReleaseNotes");
    const html = renderToStaticMarkup(createElement(ReleaseNotes, { releases: parseChangelog("## [1.0.1] - 2026-10-14\n### Fixed\n- A fix\n## [1.0.0] - 2026-10-14\n### Added\n- One\n- Two") }));
    expect(html.match(/<tr/g)?.length).toBe(4);
    expect(html.match(/class="release-number"/g)?.length).toBe(2);
    expect(html.match(/>Current</g)?.length).toBe(1);
    expect(html).toContain("3 of 3 changes");
  });
});

describe("long lists", () => {
  it("show 25 changes per page with page controls", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ReleaseNotes } = await import("../src/components/ReleaseNotes");
    const notes = "## [1.0.0] - 2026-10-14\n### Added\n" + Array.from({ length: 30 }, (_, index) => `- Change ${index + 1}`).join("\n");
    const html = renderToStaticMarkup(createElement(ReleaseNotes, { releases: parseChangelog(notes) }));
    expect(html.match(/<tr/g)?.length).toBe(26);
    expect(html).toContain("Showing 1–25 of 30");
    expect(html).toContain("Page 1 of 2");
  });
});

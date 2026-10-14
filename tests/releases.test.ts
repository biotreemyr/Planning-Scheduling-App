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

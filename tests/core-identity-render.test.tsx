import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import SchedulerDemo from "../src/components/SchedulerDemo";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";

const initial = { revision: 3, snapshot: addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state! };
// The toolbar button, not the (hidden) add form's own heading.
const addButton = /<button class="primary-button" type="button"[^>]*>(?:(?!<\/button>).)*Add activity<\/button>/;
const render = (permissions: string[]) => renderToString(<SchedulerDemo initial={initial} writeToken="t" identity={{ id: "u1", name: "Angeline Tan", permissions: permissions.map((key) => `scheduler.${key}`) }} />);

describe("workspace for a signed-in Core user", () => {
  it("shows who is signed in instead of the demo person picker, and opens on the plan", () => {
    const html = render(["planning.view", "planning.create", "planning.edit", "reports.view"]);
    expect(html).toContain("Signed in as <strong>Angeline Tan</strong>");
    expect(html).not.toContain("Aida (Sample planner)</option>");
    expect(html).toContain("Production plan");
    expect(html).toMatch(addButton);
  });
  it("hides Reports and adding for a role without those permissions", () => {
    const html = render(["planning.view", "schedule.view"]);
    expect(html).not.toMatch(/<span>Reports<\/span>/);
    expect(html).not.toMatch(addButton);
    expect(html).toContain("Your role can view this plan but not move activities.");
    expect(html).toContain("Ask your Bio Tree administrator for planning access");
    expect(html).not.toContain("Switch <strong>User</strong>");
  });
});

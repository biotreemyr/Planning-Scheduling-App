// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useWorkspacePersistence } from "../src/components/WorkspacePersistence";
import type { WorkspaceEnvelope } from "../src/lib/domain/workspace";

// A page loaded at revision 10. Someone else then saves revision 11 on the server.
const initial = { revision: 10, snapshot: { data: { lines: [] } } } as unknown as WorkspaceEnvelope;
function Page({ snapshot = initial.snapshot }: { snapshot?: unknown }) { return useWorkspacePersistence(initial, snapshot, "token"); }
const reload = vi.fn();

beforeEach(() => {
  reload.mockReset();
  Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PUT"
    ? new Response(JSON.stringify({ error: "Another tab saved newer data." }), { status: 409 })
    : new Response(JSON.stringify({ revision: 11, by: "NOR AZMAN SAHAD", at: "2026-10-29T10:51:00.000Z" }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
const comeBack = async () => { await act(async () => { window.dispatchEvent(new Event("focus")); await new Promise((resolve) => setTimeout(resolve, 0)); }); };

describe("a page left open while someone else saves", () => {
  it("refreshes itself when it comes back into view and nothing is being keyed in", async () => {
    render(<Page />);
    await comeBack();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("keeps an open window and names who saved, instead of refreshing", async () => {
    const dialog = document.createElement("dialog"); dialog.setAttribute("open", ""); document.body.append(dialog);
    render(<Page />);
    await comeBack();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/NOR AZMAN SAHAD saved newer data at 29\/10\/2026 \d\d:51 after this page was opened/);
  });
  it("says plainly that a refused save was not saved, who saved, and to refresh", async () => {
    const { rerender } = render(<Page />);
    await act(async () => { rerender(<Page snapshot={{ data: { lines: [{ id: "new" }] } }} />); await new Promise((resolve) => setTimeout(resolve, 400)); });
    expect((await screen.findByRole("alert", {}, { timeout: 2000 })).textContent).toMatch(/^Not saved: NOR AZMAN SAHAD saved newer data .* Refresh the page, then key this in again\./);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
});

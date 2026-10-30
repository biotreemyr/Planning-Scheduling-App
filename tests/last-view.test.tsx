// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import SchedulerDemo from "../src/components/SchedulerDemo";
import { newWorkspace } from "../src/lib/domain/workspace";
import { addSampleData } from "../src/lib/domain/sampleData";
import { lastViewKey, readLastView, saveLastView } from "../src/lib/services/lastView";

const initial = { revision: 3, snapshot: addSampleData(newWorkspace(), new Date(2026, 9, 7, 10)).state! };
const identity = (permissions: string[]) => ({ id: "u1", name: "Angeline Tan", permissions: permissions.map((key) => `scheduler.${key}`) });
const open = async (permissions: string[]) => { await act(async () => { render(<SchedulerDemo initial={initial} writeToken="t" identity={identity(permissions)} />); }); };
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const saved = () => JSON.parse(localStorage.getItem(lastViewKey("core-u1")) ?? "null");

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ revision: 3 }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("last view per person", () => {
  it("reads back only known values", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    saveLastView("p1", { tab: "planner", planningView: "list", calendarView: "week" }, storage);
    expect(readLastView("p1", storage)).toEqual({ tab: "planner", planningView: "list", calendarView: "week" });
    expect(readLastView("p2", storage)).toEqual({});
    store.set(lastViewKey("p3"), JSON.stringify({ planningView: "board", calendarView: 7 }));
    expect(readLastView("p3", storage)).toEqual({});
    store.set(lastViewKey("p4"), "not json");
    expect(readLastView("p4", storage)).toEqual({});
  });

  it("reopens the page the person last used", async () => {
    localStorage.setItem(lastViewKey("core-u1"), JSON.stringify({ tab: "news" }));
    await open(["planning.view"]);
    expect(heading()).toBe("What's new");
    expect(saved().tab).toBe("news");
  });

  it("isn't overwritten by the first render when React runs effects twice", async () => {
    localStorage.setItem(lastViewKey("core-u1"), JSON.stringify({ tab: "news" }));
    await act(async () => { render(<StrictMode><SchedulerDemo initial={initial} writeToken="t" identity={identity(["planning.view"])} /></StrictMode>); });
    expect(heading()).toBe("What's new");
    expect(saved().tab).toBe("news");
  });

  it("skips a page the person may no longer open", async () => {
    localStorage.setItem(lastViewKey("core-u1"), JSON.stringify({ tab: "audit" }));
    await open(["planning.view"]);
    expect(heading()).toBe("Planner Board");
  });

  it("remembers List on the Planner Board", async () => {
    localStorage.setItem(lastViewKey("core-u1"), JSON.stringify({ tab: "planner", planningView: "list" }));
    await open(["planning.view"]);
    expect(screen.getByRole("button", { name: "List" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => { screen.getByRole("button", { name: "Calendar" }).click(); });
    expect(saved()).toMatchObject({ tab: "planner", planningView: "calendar" });
  });

  it("keeps each person's view apart", async () => {
    localStorage.setItem(lastViewKey("core-someone-else"), JSON.stringify({ tab: "news" }));
    await open(["planning.view"]);
    expect(heading()).toBe("Planner Board");
  });
});

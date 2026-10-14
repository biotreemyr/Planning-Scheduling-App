import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A Master Data database: `hasSwitch` says whether its tables have the "Use in production" column yet.
const db = vi.hoisted(() => ({ hasSwitch: true, queries: [] as string[] }));
vi.mock("pg", () => ({
  Pool: class {
    async query(sql: string) {
      db.queries.push(sql);
      if (sql.includes("for_production") && !db.hasSwitch) throw Object.assign(new Error('column "for_production" does not exist'), { code: "42703" });
      return { rows: sql.includes("FROM products") ? [{ id: "p1", code: "FG-1", name: "Product", uom: "boxes" }] : [{ id: "c1", code: "305-A", name: "Customer" }] };
    }
  }
}));

const { loadMasterLists } = await import("../src/lib/masterdata/catalog");
const env = (name: string) => ({ MASTER_DATA_DATABASE_URL: `postgres://reader@localhost/${name}`, MASTER_DATA_COMPANY: "btp" }) as unknown as NodeJS.ProcessEnv;

describe("Master Data's Use in production switch", () => {
  beforeEach(() => { db.queries = []; delete (globalThis as { schedulerMasterDataPool?: unknown }).schedulerMasterDataPool; });
  it("leaves out records switched off for production", async () => {
    db.hasSwitch = true;
    const lists = await loadMasterLists(env("with-switch"));
    expect(lists?.customers).toHaveLength(1);
    expect(db.queries.every((sql) => sql.includes("AND for_production"))).toBe(true);
  });
  it("still lists every active record while Master Data has no switch yet", async () => {
    db.hasSwitch = false;
    const lists = await loadMasterLists(env("without-switch"));
    expect(lists).toEqual({ products: [{ id: "p1", code: "FG-1", name: "Product", uom: "boxes" }], customers: [{ id: "c1", code: "305-A", name: "Customer" }] });
    expect(db.queries.filter((sql) => !sql.includes("for_production"))).toHaveLength(2);
  });
});

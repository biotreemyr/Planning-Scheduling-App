import "server-only";
import { Pool } from "pg";
import type { EquipmentCatalog, MasterEquipment, MasterLists, OrderCatalog } from "@/lib/services/masterData";

/**
 * Read-only view of Bio Tree Master Data (master-data/docs/CONSUMING.md), read live like Core: a
 * second pool on the same PostgreSQL server, through a role that may only SELECT the lists.
 * Nothing here ever writes to Master Data.
 */

const state = globalThis as unknown as { schedulerMasterDataPool?: Pool };

function getPool(url: string) {
  return state.schedulerMasterDataPool ??= new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

/**
 * What an order may be for and whose it may be: the company's active `FG-` products and its active
 * customers, leaving out any switched off for production in Master Data (`for_production`, e.g. an
 * accounting-only customer). Orders already made with one keep it: the workspace has its own copy.
 */
export async function loadMasterLists(env: NodeJS.ProcessEnv = process.env): Promise<MasterLists | null> {
  if (!env.MASTER_DATA_DATABASE_URL) return null;
  const company = (env.MASTER_DATA_COMPANY || "btp").trim().toLowerCase();
  const pool = getPool(env.MASTER_DATA_DATABASE_URL);
  const lists = async (production: string) => {
    const [products, customers] = await Promise.all([
      pool.query(`SELECT id::text AS id, code, name, coalesce(source->>'UOM', '') AS uom
                    FROM products WHERE company_key = $1 AND is_active${production} AND code LIKE 'FG-%' ORDER BY code`, [company]),
      pool.query(`SELECT id::text AS id, code, name FROM customers WHERE company_key = $1 AND is_active${production} ORDER BY code`, [company])
    ]);
    return { products: products.rows, customers: customers.rows };
  };
  try {
    return await lists(" AND for_production");
  } catch (error) {
    // A Master Data database without the switch yet (undefined column) offers every active record, as before.
    if ((error as { code?: string }).code === "42703") return lists("");
    throw error;
  }
}

/** For the page: undefined when Master Data is not configured, so the order form keeps its own lists. */
export async function loadOrderCatalog(): Promise<OrderCatalog | undefined> {
  try {
    const lists = await loadMasterLists();
    return lists ? { status: "ok", ...lists } : undefined;
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * The company's Production Equipment (department "Production Equipment" on QA's master list), for
 * Admin to choose machines from. Inactive and switched-off equipment is included, marked inactive, so
 * a machine already set up still shows its current state.
 */
export async function loadMasterEquipment(env: NodeJS.ProcessEnv = process.env): Promise<MasterEquipment[] | null> {
  if (!env.MASTER_DATA_DATABASE_URL) return null;
  const company = (env.MASTER_DATA_COMPANY || "btp").trim().toLowerCase();
  const pool = getPool(env.MASTER_DATA_DATABASE_URL);
  const read = (production: string) => pool.query(`SELECT id::text AS id, code, name, coalesce(source->>'Process Type', '') AS "processType", (is_active${production}) AS active
      FROM equipment WHERE company_key = $1 AND lower(trim(source->>'Department')) = 'production equipment' ORDER BY code`, [company]);
  try {
    return (await read(" AND for_production")).rows;
  } catch (error) {
    if ((error as { code?: string }).code === "42703") return (await read("")).rows;
    throw error;
  }
}

/** For the page: undefined when Master Data is not configured; unavailable when it cannot be read. */
export async function loadEquipmentCatalog(): Promise<EquipmentCatalog | undefined> {
  try {
    const equipment = await loadMasterEquipment();
    return equipment ? { status: "ok", equipment } : undefined;
  } catch {
    return { status: "unavailable" };
  }
}

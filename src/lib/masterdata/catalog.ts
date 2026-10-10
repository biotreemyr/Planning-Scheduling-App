import "server-only";
import { Pool } from "pg";
import type { MasterLists, OrderCatalog } from "@/lib/services/masterData";

/**
 * Read-only view of Bio Tree Master Data (master-data/docs/CONSUMING.md), read live like Core: a
 * second pool on the same PostgreSQL server, through a role that may only SELECT the lists.
 * Nothing here ever writes to Master Data.
 */

const state = globalThis as unknown as { schedulerMasterDataPool?: Pool };

function getPool(url: string) {
  return state.schedulerMasterDataPool ??= new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

/** What an order may be for and whose it may be: the company's active `FG-` products and its active customers. */
export async function loadMasterLists(env: NodeJS.ProcessEnv = process.env): Promise<MasterLists | null> {
  if (!env.MASTER_DATA_DATABASE_URL) return null;
  const company = (env.MASTER_DATA_COMPANY || "btp").trim().toLowerCase();
  const pool = getPool(env.MASTER_DATA_DATABASE_URL);
  const [products, customers] = await Promise.all([
    pool.query(`SELECT id::text AS id, code, name, coalesce(source->>'UOM', '') AS uom
                  FROM products WHERE company_key = $1 AND is_active AND code LIKE 'FG-%' ORDER BY code`, [company]),
    pool.query(`SELECT id::text AS id, code, name FROM customers WHERE company_key = $1 AND is_active ORDER BY code`, [company])
  ]);
  return { products: products.rows, customers: customers.rows };
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

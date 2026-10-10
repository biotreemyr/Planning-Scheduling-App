import "server-only";
import { Pool } from "pg";
import type { MasterProduct, OrderCatalog } from "@/lib/services/masterProducts";

/**
 * Read-only view of Bio Tree Master Data (master-data/docs/CONSUMING.md), read live like Core: a
 * second pool on the same PostgreSQL server, through a role that may only SELECT the lists.
 * Nothing here ever writes to Master Data.
 */

const state = globalThis as unknown as { schedulerMasterDataPool?: Pool };

function getPool(url: string) {
  return state.schedulerMasterDataPool ??= new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

/** The finished goods an order may be for: the company's active `FG-` products. */
export async function loadOrderProducts(env: NodeJS.ProcessEnv = process.env): Promise<MasterProduct[] | null> {
  if (!env.MASTER_DATA_DATABASE_URL) return null;
  const company = (env.MASTER_DATA_COMPANY || "btp").trim().toLowerCase();
  const { rows } = await getPool(env.MASTER_DATA_DATABASE_URL).query<MasterProduct>(
    `SELECT id::text AS id, code, name, coalesce(source->>'UOM', '') AS uom
       FROM products
      WHERE company_key = $1 AND is_active AND code LIKE 'FG-%'
      ORDER BY code`, [company]);
  return rows;
}

/** For the page: undefined when Master Data is not configured, so the order form keeps its own list. */
export async function loadOrderCatalog(): Promise<OrderCatalog | undefined> {
  try {
    const products = await loadOrderProducts();
    return products ? { status: "ok", products } : undefined;
  } catch {
    return { status: "unavailable" };
  }
}

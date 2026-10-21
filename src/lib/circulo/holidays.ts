import "server-only";
import { Pool } from "pg";
import type { HolidayList } from "@/lib/services/workingDays";

/**
 * The company's public holidays, read live from Circulo, where QA keeps them (Controlled System ·
 * Public holidays). One list for every Bio Tree app: the scheduler never writes to it. Read through a
 * role that may only SELECT the holidays table (CIRCULO_DATABASE_URL), like Master Data.
 */

const state = globalThis as unknown as { schedulerCirculoPool?: Pool };

function getPool(url: string) {
  return state.schedulerCirculoPool ??= new Pool({ connectionString: url, max: 2, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

// From a year back, so past plans still show their holidays, onwards.
export async function loadHolidays(env: NodeJS.ProcessEnv = process.env): Promise<HolidayList> {
  if (!env.CIRCULO_DATABASE_URL) return { status: "off", holidays: [] };
  const company = (env.CIRCULO_COMPANY || env.MASTER_DATA_COMPANY || "btp").trim().toLowerCase();
  try {
    const result = await getPool(env.CIRCULO_DATABASE_URL).query<{ date: string; name: string }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS date, name FROM holidays
        WHERE company_key = $1 AND day >= current_date - 366 ORDER BY day`, [company]);
    return { status: "ok", holidays: result.rows };
  } catch {
    // Planning still opens; the window says the holidays could not be read.
    return { status: "unavailable", holidays: [] };
  }
}

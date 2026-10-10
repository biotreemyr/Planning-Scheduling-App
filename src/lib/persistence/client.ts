import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

// Shared by the app (through database.ts) and the maintenance scripts. Close with `db.$client.end()`.
export function createDatabase(connectionString = process.env.DATABASE_URL): Database {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return drizzle(new Pool({ connectionString }), { schema });
}

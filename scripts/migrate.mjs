// Applies the drizzle/ migrations (npm run db:migrate). Take a backup first (npm run db:backup).
// Databases built by the old Prisma migrations already hold everything in 0000_prisma_baseline, so
// the baseline is recorded as applied there instead of being run; anything newer then runs as usual.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const folder = new URL("../drizzle/", import.meta.url);
const prismaMigrations = ["202609130001_workspace_persistence", "202610030001_workspace_audit"];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const client = await pool.connect();
  try {
    const { rows: [{ prisma }] } = await client.query(`select to_regclass('public."_prisma_migrations"') is not null as prisma`);
    if (prisma) {
      const { rows } = await client.query(`select migration_name from "_prisma_migrations" where finished_at is not null and rolled_back_at is null`);
      const applied = new Set(rows.map((row) => row.migration_name));
      if (!prismaMigrations.every((name) => applied.has(name))) throw new Error(`Prisma migrations incomplete (have ${[...applied].join(", ") || "none"}); finish them before switching to Drizzle.`);
      // Same table drizzle's migrator creates; it skips any migration not newer than the latest row.
      await client.query(`create schema if not exists drizzle`);
      await client.query(`create table if not exists drizzle."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)`);
      const { rows: [{ count }] } = await client.query(`select count(*)::int as count from drizzle."__drizzle_migrations"`);
      if (count === 0) {
        const [baseline] = JSON.parse(readFileSync(new URL("meta/_journal.json", folder), "utf8")).entries;
        const hash = createHash("sha256").update(readFileSync(new URL(`${baseline.tag}.sql`, folder), "utf8")).digest("hex");
        await client.query(`insert into drizzle."__drizzle_migrations" (hash, created_at) values ($1, $2)`, [hash, baseline.when]);
        console.log(`Recorded ${baseline.tag} as applied (database was built by Prisma migrations).`);
      }
    }
  } finally { client.release(); }
  await migrate(drizzle(pool), { migrationsFolder: folder.pathname });
  console.log("Migrations up to date.");
} finally { await pool.end(); }

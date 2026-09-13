import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

if (!process.env.RESTORE_DATABASE_URL || !process.argv[2]) throw new Error("Set RESTORE_DATABASE_URL to a new empty database and provide a dump file path.");
const url = new URL(process.env.RESTORE_DATABASE_URL);
const source = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (source && source.host === url.host && source.pathname === url.pathname) throw new Error("Refusing to restore over the active database.");
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
const count = execFileSync("psql", ["-X", "-At", "-c", "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"], { env, encoding: "utf8" }).trim();
if (count !== "0") throw new Error("Restore destination must be empty. No data was changed.");
execFileSync("pg_restore", ["--single-transaction", "--no-owner", "--no-acl", "--dbname", env.PGDATABASE, resolve(process.argv[2])], { env, stdio: "inherit" });
console.log("Restore complete in the separate destination database. Verify data before switching DATABASE_URL.");

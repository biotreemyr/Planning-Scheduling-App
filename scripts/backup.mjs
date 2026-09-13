import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, chmodSync } from "node:fs";
import path from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const url = new URL(process.env.DATABASE_URL);
const folder = path.resolve(process.env.SCHEDULER_BACKUP_DIR ?? ".backups");
mkdirSync(folder, { recursive: true, mode: 0o700 });
const file = path.join(folder, `scheduler-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
try {
  execFileSync("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${file}.tmp`], { stdio: "pipe", env: { ...process.env,
    PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) } });
  chmodSync(`${file}.tmp`, 0o600);
  renameSync(`${file}.tmp`, file);
  console.log(`Backup written: ${file}`);
} finally { rmSync(`${file}.tmp`, { force: true }); }

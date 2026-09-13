import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, stat, rename, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const execute = promisify(execFile);
let pending: Promise<void> | undefined;

// First save of each UTC day makes a consistent PostgreSQL dump before writing.
export async function ensureDailyBackup() {
  if (pending) return pending;
  pending = (async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const directory = path.resolve(process.env.SCHEDULER_BACKUP_DIR ?? ".backups");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = path.join(directory, `${url.pathname.slice(1).replace(/[^a-z0-9_-]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.dump`);
    if (await stat(filename).then((value) => value.size > 0).catch(() => false)) return;
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      await execute("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${temporary}`], { timeout: 120000, env: { ...process.env,
        PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) } });
      await chmod(temporary, 0o600);
      await rename(temporary, filename);
    } finally { await unlink(temporary).catch(() => {}); }
  })();
  try { await pending; } finally { pending = undefined; }
}

import "server-only";
import { Pool } from "pg";
import { getCoreDirectoryConfig, type AuthEnv, type CoreDirectoryConfig } from "./config";
import type { BioTreeUser } from "./permissions";

/**
 * Read-only view of the Bio Tree Core identity and permission database.
 *
 * Core (the dashboard app) owns who a person is and which apps they may enter.
 * This app owns scheduling data only. Both run against the same PostgreSQL
 * server, so Core is read through its own pool rather than an HTTP API — the
 * same arrangement Courier Tracker uses (courier-tracker/services/bioTreeCore.js).
 *
 * Nothing here ever writes to Core.
 */

const state = globalThis as unknown as {
  schedulerCorePool?: Pool;
  schedulerCoreCache?: Map<string, { value: BioTreeUser | null; expiresAt: number }>;
};

function getPool(config: CoreDirectoryConfig) {
  return state.schedulerCorePool ??= new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });
}

async function query<T extends Record<string, unknown>>(config: CoreDirectoryConfig, text: string, params: unknown[]) {
  const result = await getPool(config).query<T>(text, params);
  return result.rows;
}

type CoreUserRow = { id: string; clerk_user_id: string; core_role: string; is_active: boolean; employment_status: string; display_name: string | null };

/**
 * Core grants app access two ways: an active role assignment, and a direct
 * grant from the per-user permission picker. Core's own dashboard shows the
 * tile to anyone holding either, so honour both — otherwise a visible tile
 * opens onto a denial page. Super Admin holds every permission in an active app.
 */
async function resolveUser(config: CoreDirectoryConfig, clerkUserId: string): Promise<BioTreeUser | null> {
  const [account] = await query<CoreUserRow>(config,
    `SELECT id, clerk_user_id, core_role, is_active, employment_status,
            COALESCE(NULLIF(full_name, ''), NULLIF(username, ''), email) AS display_name
       FROM users WHERE clerk_user_id = $1 LIMIT 1`,
    [clerkUserId]);
  if (!account) return null;

  const active = account.is_active && account.employment_status === "active";
  const [appRow] = await query<{ id: string }>(config,
    `SELECT id FROM apps WHERE app_key = $1 AND status = 'active' LIMIT 1`,
    [config.appKey]);

  if (!active || !appRow) {
    return { id: account.id, clerkUserId: account.clerk_user_id, name: account.display_name ?? undefined, active, apps: [] };
  }

  const superAdmin = account.core_role === "super_admin";
  const rows = superAdmin
    ? await query<{ permission_key: string }>(config,
        `SELECT permission_key FROM permissions WHERE app_id = $1`, [appRow.id])
    : await query<{ permission_key: string }>(config,
        `SELECT p.permission_key
           FROM user_app_roles uar
           JOIN app_roles r ON r.id = uar.app_role_id AND r.is_active
           JOIN app_role_permissions arp ON arp.app_role_id = r.id
           JOIN permissions p ON p.id = arp.permission_id
          WHERE uar.user_id = $1 AND uar.app_id = $2 AND uar.is_active
            AND (uar.expires_at IS NULL OR uar.expires_at > now())
          UNION
         SELECT p.permission_key
           FROM user_app_permissions uap
           JOIN permissions p ON p.id = uap.permission_id
          WHERE uap.user_id = $1 AND uap.app_id = $2`,
        [account.id, appRow.id]);

  const permissions = rows.map((row) => row.permission_key);
  return {
    id: account.id,
    clerkUserId: account.clerk_user_id,
    name: account.display_name ?? undefined,
    active,
    // Core has no team model yet, so teamIds stays undefined and every
    // requireTeamPermission call fails closed. See TEAM_ACCESS.md.
    apps: [{ appKey: config.appKey, active: true, assigned: superAdmin || permissions.length > 0, permissions }]
  };
}

/**
 * Cached briefly so one page render does not fan out into repeated Core
 * queries. Deactivating someone in Core takes effect within the TTL.
 */
export async function findCoreUserByClerkId(clerkUserId: string, env: AuthEnv = process.env): Promise<BioTreeUser | null> {
  const config = getCoreDirectoryConfig(env);
  if (!config) throw new Error("BIO_TREE_CORE_DATABASE_URL is not set");
  if (config.cacheTtlMs <= 0) return resolveUser(config, clerkUserId);

  const cache = state.schedulerCoreCache ??= new Map();
  const key = `${config.appKey}:${clerkUserId}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const value = await resolveUser(config, clerkUserId);
  cache.set(key, { value, expiresAt: Date.now() + config.cacheTtlMs });
  return value;
}

export function clearCoreDirectoryCache() {
  state.schedulerCoreCache?.clear();
}

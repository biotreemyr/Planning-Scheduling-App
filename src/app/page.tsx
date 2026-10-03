import { redirect } from "next/navigation";
import type { Route } from "next";
import SchedulerDemo from "@/components/SchedulerDemo";
import { AccessError, requireAnyPermission } from "@/lib/auth/guards";
import { getAuthMode, getSignInUrl } from "@/lib/auth/config";
import { boardPermissions } from "@/lib/auth/permissions";
import { headers } from "next/headers";
import { localPersistenceAllowed } from "@/lib/persistence/access";
import { db, writeToken } from "@/lib/persistence/database";
import { workspaceRepository } from "@/lib/persistence/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    if (getAuthMode() === "demo") {
      if (!localPersistenceAllowed((await headers()).get("host"), process.env)) return <AccessMessage title="Local pilot only" message="Open this workspace on localhost. Verified dashboard login is required for shared deployment." />;
      if (!process.env.DATABASE_URL) return <AccessMessage title="Database setup required" message="Configure PostgreSQL and apply database migrations before using the workspace." />;
      const initial = await workspaceRepository(db).load();
      return <SchedulerDemo initial={initial} writeToken={writeToken()} />;
    }
  } catch {
    return <AccessMessage title="Scheduler unavailable" message="The database or authentication configuration is unavailable. No data has been reset. Contact your administrator." />;
  }
  let signInUrl: string | null = null;
  try {
    await requireAnyPermission(boardPermissions);
  } catch (error) {
    if (error instanceof AccessError && error.code === "unauthenticated") {
      try { signInUrl = getSignInUrl(process.env, "/"); } catch { signInUrl = null; }
      if (!signInUrl) return <AccessMessage title="Sign-in unavailable" message="Please contact your Bio Tree administrator." />;
    } else if (error instanceof AccessError && error.code === "forbidden") {
      return <AccessMessage title="Access denied" message="Your Bio Tree account does not have access to this scheduler." />;
    } else {
      return <AccessMessage title="Scheduler unavailable" message="Please contact your Bio Tree administrator." />;
    }
  }
  if (signInUrl) redirect(signInUrl as Route);
  // Never expose the browser-only demo as a connected production workspace.
  return <AccessMessage title="Scheduler connection pending" message="Your account has access. The scheduling workspace is not available yet." />;
}

function AccessMessage({ title, message }: { title: string; message: string }) {
  return <main><h1>{title}</h1><p>{message}</p></main>;
}

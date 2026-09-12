import { redirect } from "next/navigation";
import type { Route } from "next";
import SchedulerDemo from "@/components/SchedulerDemo";
import { AccessError, requirePermission } from "@/lib/auth/guards";
import { getAuthMode, getSignInUrl } from "@/lib/auth/config";
import { permissions } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    if (getAuthMode() === "demo") return <SchedulerDemo />;
  } catch {
    return <AccessMessage title="Scheduler unavailable" message="Please contact your Bio Tree administrator." />;
  }
  let signInUrl: string | null = null;
  try {
    await requirePermission(permissions.view);
  } catch (error) {
    if (error instanceof AccessError && error.code === "unauthenticated") {
      try { signInUrl = getSignInUrl(); } catch { signInUrl = null; }
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

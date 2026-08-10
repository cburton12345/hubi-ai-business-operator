import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/auth/admin-session";
import { can, type Permission } from "@/lib/auth/permissions";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import type { TenantRole } from "@/types/core";
import { absoluteAppUrl } from "@/lib/http/safe-redirect";

export async function getCurrentActor() {
  const [session, adminSession] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);

  if (!session && !adminSession) {
    redirect(absoluteAppUrl("/login"));
  }

  const workspace = await getCurrentWorkspace();

  if (adminSession) {
    return {
      userId: "admin-token",
      email: "admin-token",
      platformRole: "super_admin" as const,
      tenantRole: "owner" as TenantRole,
      workspace
    };
  }

  return {
    userId: session!.userId,
    email: session!.email,
    platformRole: session!.platformRole,
    tenantRole: workspace.role as TenantRole,
    workspace
  };
}

export async function requirePermission(permission: Permission) {
  const actor = await getCurrentActor();

  if (!can(actor, permission)) {
    redirect("/app?permission=denied");
  }

  return actor;
}

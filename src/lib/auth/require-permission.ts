import { redirect } from "next/navigation";
import { can, type Permission } from "@/lib/auth/permissions";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import type { TenantRole } from "@/types/core";

export async function getCurrentActor() {
  const [session, workspace] = await Promise.all([getCurrentAppSession(), getCurrentWorkspace()]);

  if (!session) {
    return {
      userId: "admin-token",
      email: "admin-token",
      platformRole: "super_admin" as const,
      tenantRole: "owner" as TenantRole,
      workspace
    };
  }

  return {
    userId: session.userId,
    email: session.email,
    platformRole: session.platformRole,
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

import { hasAdminSession } from "@/lib/auth/admin-session";
import { can, type Permission } from "@/lib/auth/permissions";
import { getCurrentAppSession } from "@/lib/auth/session";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";
import type { TenantRole } from "@/types/core";

export type ApiPermissionResult =
  | {
      ok: true;
      actor: {
        userId: string;
        email: string;
        platformRole: "super_admin" | "support" | "user";
        tenantRole: TenantRole;
        workspace: Awaited<ReturnType<typeof getCurrentWorkspace>>;
      };
    }
  | { ok: false; status: 401 | 403 };

export async function authorizeApiPermission(permission: Permission): Promise<ApiPermissionResult> {
  const [session, adminSession] = await Promise.all([getCurrentAppSession(), hasAdminSession()]);
  if (!session && !adminSession) return { ok: false, status: 401 };

  const workspace = await getCurrentWorkspace();
  const actor = adminSession
    ? {
        userId: "admin-token",
        email: "admin-token",
        platformRole: "super_admin" as const,
        tenantRole: "owner" as const,
        workspace
      }
    : {
        userId: session!.userId,
        email: session!.email,
        platformRole: session!.platformRole,
        tenantRole: workspace.role as TenantRole,
        workspace
      };

  return can(actor, permission) ? { ok: true, actor } : { ok: false, status: 403 };
}

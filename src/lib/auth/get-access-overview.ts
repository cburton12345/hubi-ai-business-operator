import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { describeTenantRole } from "@/lib/auth/permissions";
import type { PlatformRole, TenantRole } from "@/types/core";

export type AccessOverviewRow = {
  id: string;
  tenantName: string;
  tenantSlug: string;
  userEmail: string;
  userName: string;
  platformRole: PlatformRole;
  tenantRole: TenantRole;
  status: string;
  roleDescription: string;
};

type TenantUserRow = {
  role: TenantRole;
  status: string;
  tenants: { name: string; slug: string } | { name: string; slug: string }[] | null;
  users: { email: string; name: string | null; platform_role: PlatformRole } | { email: string; name: string | null; platform_role: PlatformRole }[] | null;
};

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getAccessOverviewRows(): Promise<AccessOverviewRow[]> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return [
      {
        id: "local-admin-internal-portfolio",
        tenantName: "Internal Portfolio",
        tenantSlug: "internal-portfolio",
        userEmail: "local-admin",
        userName: "Local Admin",
        platformRole: "super_admin",
        tenantRole: "owner",
        status: "active",
        roleDescription: describeTenantRole("owner")
      }
    ];
  }

  const { data, error } = await supabase
    .from("tenant_users")
    .select("role, status, tenants:tenant_id(name, slug), users:user_id(email, name, platform_role)")
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as TenantUserRow[]).map((row) => {
    const tenant = first(row.tenants);
    const user = first(row.users);

    return {
      id: `${tenant?.slug ?? "tenant"}-${user?.email ?? "user"}`,
      tenantName: tenant?.name ?? "Unknown tenant",
      tenantSlug: tenant?.slug ?? "unknown",
      userEmail: user?.email ?? "unknown",
      userName: user?.name ?? "Unnamed user",
      platformRole: user?.platform_role ?? "user",
      tenantRole: row.role,
      status: row.status,
      roleDescription: describeTenantRole(row.role)
    };
  });
}

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { describeTenantRole } from "@/lib/auth/permissions";
import type { PlatformRole, TenantRole } from "@/types/core";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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

export type BrandAccessRow = {
  id: string;
  brandName: string;
  brandSlug: string;
  userEmail: string;
  userName: string;
  role: TenantRole;
  status: string;
  notes: string;
};

export type AccessAssignableOption = {
  id: string;
  label: string;
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
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      tenant_name: string;
      tenant_slug: string;
      user_email: string;
      user_name: string | null;
      platform_role: PlatformRole;
      tenant_role: TenantRole;
      status: string;
    }>(
      `
      select
        t.name as tenant_name,
        t.slug as tenant_slug,
        u.email as user_email,
        u.name as user_name,
        u.platform_role,
        tu.role as tenant_role,
        tu.status
      from public.tenant_users tu
      join public.tenants t on t.id = tu.tenant_id
      join public.users u on u.id = tu.user_id
      where tu.tenant_id = $1
      order by tu.created_at asc
      `,
      [workspaceId]
    );

    return (result?.rows ?? []).map((row) => ({
      id: `${row.tenant_slug}-${row.user_email}`,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      userEmail: row.user_email,
      userName: row.user_name ?? row.user_email,
      platformRole: row.platform_role,
      tenantRole: row.tenant_role,
      status: row.status,
      roleDescription: describeTenantRole(row.tenant_role)
    }));
  }

  const { data, error } = await supabase
    .from("tenant_users")
    .select("role, status, tenants:tenant_id(name, slug), users:user_id(email, name, platform_role)")
    .eq("tenant_id", workspaceId)
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

export async function getBrandAccessRows(): Promise<BrandAccessRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    brand_name: string;
    brand_slug: string;
    user_email: string;
    user_name: string | null;
    role: TenantRole;
    status: string;
    notes: string | null;
  }>(
    `
    select
      bua.id,
      b.name as brand_name,
      b.slug as brand_slug,
      u.email as user_email,
      u.name as user_name,
      bua.role,
      bua.status,
      bua.notes
    from public.brand_user_access bua
    join public.brands b on b.id = bua.brand_id
    join public.users u on u.id = bua.user_id
    where bua.tenant_id = $1
    order by b.name, u.email
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    userEmail: row.user_email,
    userName: row.user_name ?? row.user_email,
    role: row.role,
    status: row.status,
    notes: row.notes ?? ""
  }));
}

export async function getBrandAccessOptions(): Promise<{
  brands: AccessAssignableOption[];
  users: AccessAssignableOption[];
}> {
  const workspaceId = await getCurrentWorkspaceId();
  const [brandsResult, usersResult] = await Promise.all([
    queryPostgres<{ id: string; name: string; slug: string }>(
      "select id, name, slug from public.brands where tenant_id = $1 order by name",
      [workspaceId]
    ),
    queryPostgres<{ id: string; email: string; name: string | null; role: TenantRole }>(
      `
      select u.id, u.email, u.name, tu.role
      from public.tenant_users tu
      join public.users u on u.id = tu.user_id
      where tu.tenant_id = $1 and tu.status = 'active'
      order by u.email
      `,
      [workspaceId]
    )
  ]);

  return {
    brands: (brandsResult?.rows ?? []).map((brand) => ({
      id: brand.id,
      label: `${brand.name} (${brand.slug})`
    })),
    users: (usersResult?.rows ?? []).map((user) => ({
      id: user.id,
      label: `${user.name ?? user.email} / ${user.email} / ${user.role}`
    }))
  };
}

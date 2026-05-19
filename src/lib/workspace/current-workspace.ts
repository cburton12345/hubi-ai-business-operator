import { cookies } from "next/headers";
import { queryPostgres } from "@/lib/db/postgres";
import { appSessionCookieName, getCurrentAppSession } from "@/lib/auth/session";

export const selectedWorkspaceCookieName = "hubi_selected_workspace";
export const fallbackWorkspaceId = "11111111-1111-4111-8111-111111111111";

export type CurrentWorkspace = {
  id: string;
  name: string;
  slug: string;
  accountType: string;
  role: string;
};

export async function getCurrentWorkspace(): Promise<CurrentWorkspace> {
  const cookieStore = await cookies();
  const selectedCookie = cookieStore.get(selectedWorkspaceCookieName)?.value;
  const session = await getCurrentAppSession();
  const selectedId = session?.selectedTenantId ?? selectedCookie ?? fallbackWorkspaceId;

  const result = await queryPostgres<{
    id: string;
    name: string;
    slug: string;
    account_type: string;
    role: string | null;
  }>(
    `
    select t.id, t.name, t.slug, t.account_type, tu.role
    from public.tenants t
    left join public.tenant_users tu on tu.tenant_id = t.id and tu.user_id = $2 and tu.status = 'active'
    where t.id = $1
       or t.slug = $3
    order by case when t.id = $1 then 0 else 1 end
    limit 1
    `,
    [selectedId, session?.userId ?? null, selectedId]
  );
  const row = result?.rows[0];

  if (row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      accountType: row.account_type,
      role: session?.platformRole === "super_admin" ? "owner" : row.role ?? "viewer"
    };
  }

  return {
    id: fallbackWorkspaceId,
    name: "Internal Portfolio",
    slug: "internal-portfolio",
    accountType: "internal",
    role: "owner"
  };
}

export async function getCurrentWorkspaceId() {
  return (await getCurrentWorkspace()).id;
}

export async function getWorkspaceOptions() {
  const session = await getCurrentAppSession();
  const result = await queryPostgres<{
    id: string;
    name: string;
    slug: string;
    account_type: string;
    role: string;
  }>(
    session?.platformRole === "super_admin" || !session
      ? `
        select id, name, slug, account_type, 'owner'::text as role
        from public.tenants
        where status <> 'archived'
        order by name
        limit 100
        `
      : `
        select t.id, t.name, t.slug, t.account_type, tu.role
        from public.tenant_users tu
        join public.tenants t on t.id = tu.tenant_id
        where tu.user_id = $1 and tu.status = 'active' and t.status <> 'archived'
        order by t.name
        limit 100
        `,
    session?.platformRole === "super_admin" || !session ? [] : [session.userId]
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    accountType: row.account_type,
    role: row.role
  }));
}

export async function hasAppSessionCookie() {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(appSessionCookieName)?.value);
}

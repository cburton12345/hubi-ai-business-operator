import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { queryPostgres } from "@/lib/db/postgres";

export type TenantSelectorRow = {
  id: string;
  name: string;
  slug: string;
  accountType: string;
  status: string;
};

export async function getTenantSelectorRows(): Promise<TenantSelectorRow[]> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      name: string;
      slug: string;
      account_type: string;
      status: string;
    }>(
      `
      select id, name, slug, account_type, status
      from public.tenants
      order by name
      `
    );

    if (result) {
      return result.rows.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        accountType: tenant.account_type,
        status: tenant.status
      }));
    }

    return [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Internal Portfolio",
        slug: "internal-portfolio",
        accountType: "internal",
        status: "active"
      }
    ];
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, account_type, status")
    .order("name");

  if (error || !data) {
    return [];
  }

  return data.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    accountType: tenant.account_type,
    status: tenant.status
  }));
}

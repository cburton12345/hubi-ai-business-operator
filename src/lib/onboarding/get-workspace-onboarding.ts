import { queryPostgres } from "@/lib/db/postgres";

export type WorkspaceOnboardingRow = {
  id: string;
  name: string;
  slug: string;
  accountType: string;
  status: string;
  onboardingStatus: string;
  brandCount: number;
  leadFormCount: number;
  createdAt: string;
};

export async function getWorkspaceOnboardingRows() {
  const result = await queryPostgres<{
    id: string;
    name: string;
    slug: string;
    account_type: string;
    status: string;
    onboarding_status: string;
    brand_count: string;
    lead_form_count: string;
    created_at: string;
  }>(
    `
    select
      t.id,
      t.name,
      t.slug,
      t.account_type,
      t.status,
      t.onboarding_status,
      count(distinct b.id)::text as brand_count,
      count(distinct f.id)::text as lead_form_count,
      t.created_at
    from public.tenants t
    left join public.brands b on b.tenant_id = t.id
    left join public.forms f on f.tenant_id = t.id
    group by t.id
    order by t.created_at desc
    limit 50
    `
  );

  return (result?.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    accountType: row.account_type,
    status: row.status,
    onboardingStatus: row.onboarding_status,
    brandCount: Number(row.brand_count),
    leadFormCount: Number(row.lead_form_count),
    createdAt: row.created_at
  }));
}

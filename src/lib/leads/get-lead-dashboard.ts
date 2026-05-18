import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { demoLeads } from "@/lib/leads/demo-leads";
import { queryPostgres } from "@/lib/db/postgres";

export type LeadDashboardRow = {
  id: string;
  brandName: string;
  leadType: string;
  status: string;
  qualificationStatus: string;
  priority: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
};

type LeadRow = {
  id: string;
  lead_type: string;
  status: string;
  qualification_status: string;
  priority: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  brands:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

export async function getLeadDashboardRows() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      lead_type: string;
      status: string;
      qualification_status: string;
      priority: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      created_at: string;
    }>(
      `
      select
        l.id,
        b.name as brand_name,
        l.lead_type,
        l.status,
        l.qualification_status,
        l.priority,
        l.name,
        l.email,
        l.phone,
        l.created_at
      from public.leads l
      join public.brands b on b.id = l.brand_id
      where l.tenant_id = $1
      order by l.created_at desc
      limit 100
      `,
      ["11111111-1111-4111-8111-111111111111"]
    );

    if (result) {
      return result.rows.map((lead) => ({
        id: lead.id,
        brandName: lead.brand_name,
        leadType: lead.lead_type,
        status: lead.status,
        qualificationStatus: lead.qualification_status,
        priority: lead.priority,
        name: lead.name ?? "Unknown",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        createdAt: lead.created_at
      }));
    }

    return demoLeads;
  }

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
      id,
      lead_type,
      status,
      qualification_status,
      priority,
      name,
      email,
      phone,
      created_at,
      brands:brand_id(name)
    `
    )
    .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) {
    return [];
  }

  return (data as LeadRow[]).map((lead) => {
    const brand = Array.isArray(lead.brands) ? lead.brands[0] : lead.brands;

    return {
      id: lead.id,
      brandName: brand?.name ?? "Unknown brand",
      leadType: lead.lead_type,
      status: lead.status,
      qualificationStatus: lead.qualification_status,
      priority: lead.priority,
      name: lead.name ?? "Unknown",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      createdAt: lead.created_at
    };
  });
}

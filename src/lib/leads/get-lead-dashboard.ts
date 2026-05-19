import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { demoLeads } from "@/lib/leads/demo-leads";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type LeadDashboardRow = {
  id: string;
  brandName: string;
  brandSlug: string;
  leadType: string;
  status: string;
  qualificationStatus: string;
  priority: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  score: number;
  grade: string;
  assignedTo: string;
  duplicateKey: string;
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
        slug: string;
      }
    | {
        name: string;
        slug: string;
      }[]
    | null;
};

export async function getLeadDashboardRows() {
  const supabase = createSupabaseAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const result = await queryPostgres<{
      id: string;
      brand_name: string;
      brand_slug: string;
      lead_type: string;
      status: string;
      qualification_status: string;
      priority: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      created_at: string;
      score: number | null;
      grade: string | null;
      assigned_to: string | null;
    }>(
      `
      select
        l.id,
        b.name as brand_name,
        b.slug as brand_slug,
        l.lead_type,
        l.status,
        l.qualification_status,
        l.priority,
        l.name,
        l.email,
        l.phone,
        l.created_at,
        ls.score,
        ls.grade,
        u.name as assigned_to
      from public.leads l
      join public.brands b on b.id = l.brand_id
      left join public.lead_scores ls on ls.lead_id = l.id
      left join lateral (
        select users.name
        from public.lead_assignments la
        left join public.users users on users.id = la.assigned_user_id
        where la.lead_id = l.id and la.status = 'active'
        order by la.created_at desc
        limit 1
      ) u on true
      where l.tenant_id = $1
      order by l.created_at desc
      limit 100
      `,
      [workspaceId]
    );

    if (result) {
      return result.rows.map((lead) => ({
        id: lead.id,
        brandName: lead.brand_name,
        brandSlug: lead.brand_slug,
        leadType: lead.lead_type,
        status: lead.status,
        qualificationStatus: lead.qualification_status,
        priority: lead.priority,
        name: lead.name ?? "Unknown",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        createdAt: lead.created_at,
        score: Number(lead.score ?? 0),
        grade: lead.grade ?? "unscored",
        assignedTo: lead.assigned_to ?? "Unassigned",
        duplicateKey: (lead.email || lead.phone || "").toLowerCase()
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
      brands:brand_id(name, slug)
    `
    )
    .eq("tenant_id", workspaceId)
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
      brandSlug: brand?.slug ?? "",
      leadType: lead.lead_type,
      status: lead.status,
      qualificationStatus: lead.qualification_status,
      priority: lead.priority,
      name: lead.name ?? "Unknown",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      createdAt: lead.created_at,
      score: 0,
      grade: "unscored",
      assignedTo: "Unassigned",
      duplicateKey: (lead.email || lead.phone || "").toLowerCase()
    };
  });
}

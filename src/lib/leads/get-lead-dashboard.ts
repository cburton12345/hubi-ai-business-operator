import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

const demoLeads: LeadDashboardRow[] = [
  {
    id: "demo-ferocity-intake",
    brandName: "Ferocity",
    leadType: "case_intake",
    status: "new",
    qualificationStatus: "needs_review",
    priority: "high",
    name: "Sample Legal Intake",
    email: "intake@example.com",
    phone: "",
    createdAt: new Date().toISOString()
  },
  {
    id: "demo-trailer-quote",
    brandName: "Preferred Trailer Rental",
    leadType: "rental_request",
    status: "new",
    qualificationStatus: "unqualified",
    priority: "normal",
    name: "Sample Rental Lead",
    email: "",
    phone: "(555) 010-0000",
    createdAt: new Date().toISOString()
  }
];

export async function getLeadDashboardRows() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
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

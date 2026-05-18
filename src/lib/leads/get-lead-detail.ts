import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { demoLeadDetails } from "@/lib/leads/demo-leads";

export type LeadEventRow = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
};

export type LeadDetail = {
  id: string;
  brandName: string;
  leadType: string;
  status: string;
  qualificationStatus: string;
  priority: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
  sourceDetail: string;
  consentToContact: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  events: LeadEventRow[];
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
  message: string | null;
  source: string | null;
  source_detail: string | null;
  consent_to_contact: boolean;
  metadata_json: Record<string, unknown>;
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

type EventRow = {
  id: string;
  type: string;
  body: string | null;
  created_at: string;
};

export async function getLeadDetail(leadId: string) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return demoLeadDetails.find((lead) => lead.id === leadId) ?? null;
  }

  const { data: lead, error } = await supabase
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
      message,
      source,
      source_detail,
      consent_to_contact,
      metadata_json,
      created_at,
      brands:brand_id(name)
    `
    )
    .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
    .eq("id", leadId)
    .maybeSingle<LeadRow>();

  if (error || !lead) {
    return null;
  }

  const { data: events } = await supabase
    .from("lead_events")
    .select("id, type, body, created_at")
    .eq("tenant_id", "11111111-1111-4111-8111-111111111111")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

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
    message: lead.message ?? "",
    source: lead.source ?? "",
    sourceDetail: lead.source_detail ?? "",
    consentToContact: lead.consent_to_contact,
    metadata: lead.metadata_json ?? {},
    createdAt: lead.created_at,
    events: ((events as EventRow[] | null) ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      body: event.body ?? "",
      createdAt: event.created_at
    }))
  };
}

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { demoLeadDetails } from "@/lib/leads/demo-leads";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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
  score: {
    score: number;
    grade: string;
    reasons: string[];
  } | null;
  assignment: {
    assignedTo: string;
    notes: string;
  } | null;
  events: LeadEventRow[];
  intelligence: {
    summary: string;
    urgency: string;
    likelySpam: boolean;
    suggestedService: string;
    suggestedCategory: string;
    suggestedNextAction: string;
    draftReply: string;
    createdAt: string;
  } | null;
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

type LeadIntelligenceRow = {
  summary: string;
  urgency: string;
  likely_spam: boolean;
  suggested_service: string | null;
  suggested_category: string | null;
  suggested_next_action: string | null;
  draft_reply: string | null;
  created_at: string;
};

type LeadScoreRow = {
  score: number;
  grade: string;
  reasons_json: string[] | null;
};

type LeadAssignmentRow = {
  assigned_to: string | null;
  notes: string | null;
};

function mapIntelligence(row: LeadIntelligenceRow | undefined) {
  if (!row) return null;

  return {
    summary: row.summary,
    urgency: row.urgency,
    likelySpam: row.likely_spam,
    suggestedService: row.suggested_service ?? "",
    suggestedCategory: row.suggested_category ?? "",
    suggestedNextAction: row.suggested_next_action ?? "",
    draftReply: row.draft_reply ?? "",
    createdAt: row.created_at
  };
}

export async function getLeadDetail(leadId: string) {
  const supabase = createSupabaseAdminClient();
  const workspaceId = await getCurrentWorkspaceId();

  if (!supabase) {
    const leadResult = await queryPostgres<
      Omit<LeadRow, "brands"> & {
        brand_name: string;
      }
    >(
      `
      select
        l.id,
        l.lead_type,
        l.status,
        l.qualification_status,
        l.priority,
        l.name,
        l.email,
        l.phone,
        l.message,
        l.source,
        l.source_detail,
        l.consent_to_contact,
        l.metadata_json,
        l.created_at,
        b.name as brand_name
      from public.leads l
      join public.brands b on b.id = l.brand_id
      where l.tenant_id = $1 and l.id = $2
      limit 1
      `,
      [workspaceId, leadId]
    );
    const lead = leadResult?.rows[0];

    if (!lead) {
      return demoLeadDetails.find((item) => item.id === leadId) ?? null;
    }

    const eventsResult = await queryPostgres<EventRow>(
      `
      select id, type, body, created_at
      from public.lead_events
      where tenant_id = $1 and lead_id = $2
      order by created_at desc
      `,
      [workspaceId, leadId]
    );
    const intelligenceResult = await queryPostgres<LeadIntelligenceRow>(
      `
      select summary, urgency, likely_spam, suggested_service, suggested_category, suggested_next_action, draft_reply, created_at
      from public.lead_intelligence
      where tenant_id = $1 and lead_id = $2
      limit 1
      `,
      [workspaceId, leadId]
    );
    const scoreResult = await queryPostgres<LeadScoreRow>(
      "select score, grade, reasons_json from public.lead_scores where tenant_id = $1 and lead_id = $2 limit 1",
      [workspaceId, leadId]
    );
    const assignmentResult = await queryPostgres<LeadAssignmentRow>(
      `
      select u.name as assigned_to, la.notes
      from public.lead_assignments la
      left join public.users u on u.id = la.assigned_user_id
      where la.tenant_id = $1 and la.lead_id = $2 and la.status = 'active'
      order by la.created_at desc
      limit 1
      `,
      [workspaceId, leadId]
    );
    const score = scoreResult?.rows[0];
    const assignment = assignmentResult?.rows[0];

    return {
      id: lead.id,
      brandName: lead.brand_name,
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
      score: score ? { score: score.score, grade: score.grade, reasons: score.reasons_json ?? [] } : null,
      assignment: assignment ? { assignedTo: assignment.assigned_to ?? "Unassigned", notes: assignment.notes ?? "" } : null,
      intelligence: mapIntelligence(intelligenceResult?.rows[0]),
      events: (eventsResult?.rows ?? []).map((event) => ({
        id: event.id,
        type: event.type,
        body: event.body ?? "",
        createdAt: event.created_at
      }))
    };
  }

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
    .eq("tenant_id", workspaceId)
    .eq("id", leadId)
    .maybeSingle<LeadRow>();

  if (error || !lead) {
    return null;
  }

  const { data: events } = await supabase
    .from("lead_events")
    .select("id, type, body, created_at")
    .eq("tenant_id", workspaceId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  const { data: intelligence } = await supabase
    .from("lead_intelligence")
    .select("summary, urgency, likely_spam, suggested_service, suggested_category, suggested_next_action, draft_reply, created_at")
    .eq("tenant_id", workspaceId)
    .eq("lead_id", leadId)
    .maybeSingle<LeadIntelligenceRow>();

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
    score: null,
    assignment: null,
    intelligence: mapIntelligence(intelligence ?? undefined),
    events: ((events as EventRow[] | null) ?? []).map((event) => ({
      id: event.id,
      type: event.type,
      body: event.body ?? "",
      createdAt: event.created_at
    }))
  };
}

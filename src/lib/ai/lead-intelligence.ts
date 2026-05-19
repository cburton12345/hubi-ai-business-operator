import { queryPostgres } from "@/lib/db/postgres";

const internalTenantId = "11111111-1111-4111-8111-111111111111";

type LeadContextRow = {
  tenant_id: string;
  brand_id: string;
  lead_id: string;
  brand_name: string;
  brand_phone: string | null;
  brand_email: string | null;
  brand_business_model: string;
  brand_industry: string | null;
  target_customers: string | null;
  cta_goals: string | null;
  follow_up_strategy: string | null;
  tone_of_voice: string | null;
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
  services: { name: string; slug: string; description: string | null; priority: number }[];
};

export type LeadIntelligenceResult = {
  ok: boolean;
  leadId: string;
  message: string;
};

function includesAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function classifySpam(row: LeadContextRow) {
  const text = `${row.name ?? ""} ${row.email ?? ""} ${row.phone ?? ""} ${row.message ?? ""}`.trim();
  if (!text) return true;
  return includesAny(text, ["seo package", "crypto", "backlinks", "guest post", "casino", "viagra", "telegram", "whatsapp marketing"]);
}

function classifyUrgency(row: LeadContextRow) {
  const text = `${row.priority} ${row.message ?? ""} ${JSON.stringify(row.metadata_json ?? {})}`;
  if (row.priority === "high" || includesAny(text, ["urgent", "asap", "today", "tomorrow", "emergency", "same day"])) {
    return "high";
  }
  if (includesAny(text, ["next month", "researching", "curious", "not sure"])) {
    return "low";
  }
  return "normal";
}

function suggestedService(row: LeadContextRow) {
  const text = `${row.lead_type} ${row.message ?? ""} ${JSON.stringify(row.metadata_json ?? {})}`.toLowerCase();
  const matched = row.services.find((service) => text.includes(service.name.toLowerCase()) || text.includes(service.slug.replace(/-/g, " ")));
  return matched?.name ?? row.services[0]?.name ?? row.brand_industry ?? row.lead_type;
}

function draftReply(row: LeadContextRow, service: string) {
  const name = row.name && row.name !== "Unknown" ? row.name.split(" ")[0] : "there";
  const contact = [row.brand_phone, row.brand_email].filter(Boolean).join(" or ");
  const nextStep = row.cta_goals ?? "confirm the best next step";
  const tone = row.tone_of_voice ?? "clear and helpful";

  return [
    `Hi ${name},`,
    "",
    `Thanks for reaching out to ${row.brand_name}. I saw your request about ${service} and wanted to follow up with a quick next step.`,
    "",
    `Could you reply with your timing, location, and any details that would help us understand the request? We can then ${nextStep}.`,
    "",
    contact ? `You can also reach us at ${contact}.` : "",
    "",
    `Internal note: this is a ${tone} draft only. Confirm consent and lead details before sending.`
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadLeadContext(leadId: string) {
  const result = await queryPostgres<LeadContextRow>(
    `
    select
      l.tenant_id,
      l.brand_id,
      l.id as lead_id,
      b.name as brand_name,
      b.phone as brand_phone,
      b.email as brand_email,
      b.business_model as brand_business_model,
      b.industry as brand_industry,
      s.target_customers,
      s.cta_goals,
      s.follow_up_strategy,
      s.tone_of_voice,
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
      coalesce(services.items, '[]'::jsonb) as services
    from public.leads l
    join public.brands b on b.id = l.brand_id
    left join public.brand_marketing_settings s on s.brand_id = b.id
    left join lateral (
      select jsonb_agg(jsonb_build_object('name', name, 'slug', slug, 'description', description, 'priority', priority) order by priority desc, name) as items
      from public.brand_services
      where tenant_id = l.tenant_id and brand_id = l.brand_id and active = true
    ) services on true
    where l.tenant_id = $1 and l.id = $2
    limit 1
    `,
    [internalTenantId, leadId]
  );

  return result?.rows[0] ?? null;
}

export async function generateLeadIntelligence(leadId: string): Promise<LeadIntelligenceResult> {
  const row = await loadLeadContext(leadId);

  if (!row) {
    return { ok: false, leadId, message: "Lead not found." };
  }

  const likelySpam = classifySpam(row);
  const urgency = likelySpam ? "low" : classifyUrgency(row);
  const service = suggestedService(row);
  const category = row.lead_type === "rental_request" ? "rental" : row.brand_business_model;
  const nextAction = likelySpam
    ? "Review before responding; this lead has spam signals."
    : urgency === "high"
      ? "Prioritize manual follow-up today and confirm details before sending a reply."
      : "Send a manual follow-up after confirming consent and service fit.";
  const summary = [
    `${row.name ?? "Unknown lead"} contacted ${row.brand_name}`,
    row.source ? `from ${row.source}` : "",
    row.message ? `about: ${row.message.slice(0, 220)}` : "without a detailed message",
    `Suggested service: ${service}.`,
    `Urgency: ${urgency}.`,
    likelySpam ? "Spam signals detected." : "No obvious spam signals detected."
  ]
    .filter(Boolean)
    .join(" ");

  await queryPostgres(
    `
    insert into public.lead_intelligence (
      tenant_id,
      brand_id,
      lead_id,
      summary,
      urgency,
      likely_spam,
      suggested_service,
      suggested_category,
      suggested_next_action,
      draft_reply,
      metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    on conflict (lead_id)
    do update set
      summary = excluded.summary,
      urgency = excluded.urgency,
      likely_spam = excluded.likely_spam,
      suggested_service = excluded.suggested_service,
      suggested_category = excluded.suggested_category,
      suggested_next_action = excluded.suggested_next_action,
      draft_reply = excluded.draft_reply,
      metadata_json = excluded.metadata_json,
      created_at = now()
    `,
    [
      row.tenant_id,
      row.brand_id,
      row.lead_id,
      summary,
      urgency,
      likelySpam,
      service,
      category,
      nextAction,
      draftReply(row, service),
      JSON.stringify({
        generator: "phase2_deterministic_lead_intelligence",
        source: row.source,
        sourceDetail: row.source_detail,
        consentToContact: row.consent_to_contact,
        status: row.status,
        qualificationStatus: row.qualification_status
      })
    ]
  );

  await queryPostgres(
    `
    insert into public.activity_logs (tenant_id, brand_id, actor_type, action, target_type, target_id, metadata_json)
    values ($1, $2, 'system', 'phase2.lead_intelligence_generated', 'lead', $3, $4::jsonb)
    `,
    [row.tenant_id, row.brand_id, row.lead_id, JSON.stringify({ urgency, likelySpam, suggestedService: service })]
  );

  return { ok: true, leadId, message: "Lead intelligence generated." };
}

import { queryPostgres } from "@/lib/db/postgres";
import { sendWorkspacePushNotifications } from "@/lib/push/send-workspace-push";
import { fallbackWorkspaceId } from "@/lib/workspace/current-workspace";

type SalesOpportunityInput = {
  tenantId?: string | null;
  brandId?: string | null;
  externalEventId: string;
  source: "business_grader" | "access_request" | "signup" | "billing" | "support";
  title: string;
  summary: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  companyName?: string | null;
  businessType?: string | null;
  websiteUrl?: string | null;
  score?: number | null;
  reportToken?: string | null;
  requestedPlan?: string | null;
  actionHref?: string | null;
  moneyCents?: number;
  metadata?: Record<string, unknown>;
};

async function firstBrandForTenant(tenantId: string) {
  const result = await queryPostgres<{ id: string }>(
    `
    select id
    from public.brands
    where tenant_id = $1 and status = 'active'
    order by created_at asc
    limit 1
    `,
    [tenantId]
  );
  return result?.rows[0]?.id ?? null;
}

function priorityFrom(input: SalesOpportunityInput) {
  if (typeof input.score === "number" && input.score < 65) return "high";
  if (input.requestedPlan && !["", "free", "not_sure"].includes(input.requestedPlan)) return "high";
  return "normal";
}

function leadMessage(input: SalesOpportunityInput) {
  return [
    input.summary,
    input.score != null ? `Business score: ${input.score}/100.` : null,
    input.requestedPlan ? `Plan interest: ${input.requestedPlan}.` : null,
    input.websiteUrl ? `Website: ${input.websiteUrl}` : null
  ].filter(Boolean).join("\n");
}

export async function recordSalesOpportunity(input: SalesOpportunityInput) {
  const tenantId = input.tenantId ?? fallbackWorkspaceId;
  const brandId = input.brandId ?? (await firstBrandForTenant(tenantId));
  if (!brandId) return { ok: false, reason: "missing_brand" as const };

  const metadata = {
    ...(input.metadata ?? {}),
    source: input.source,
    externalEventId: input.externalEventId,
    reportToken: input.reportToken ?? null,
    score: input.score ?? null,
    requestedPlan: input.requestedPlan ?? null
  };

  const leadResult = await queryPostgres<{ id: string }>(
    `
    insert into public.leads (
      tenant_id, brand_id, source, source_detail, name, email, phone, message,
      lead_type, status, qualification_status, priority, lead_score, consent_to_contact, metadata_json
    )
    values ($1, $2, $3, $4, $5, lower($6), $7, $8, 'demo', 'new', 'needs_review', $9, $10, true, $11::jsonb)
    on conflict do nothing
    returning id
    `,
    [
      tenantId,
      brandId,
      input.source,
      input.reportToken ?? input.externalEventId,
      input.name ?? input.companyName ?? null,
      input.email,
      input.phone ?? null,
      leadMessage(input),
      priorityFrom(input),
      input.score ?? null,
      JSON.stringify(metadata)
    ]
  );

  const leadId = leadResult?.rows[0]?.id ?? null;
  if (leadId) {
    await queryPostgres(
      `
      insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
      values ($1, $2, $3, 'note', $4, $5::jsonb)
      `,
      [tenantId, brandId, leadId, input.title, JSON.stringify(metadata)]
    );
  }

  const ownerEvent = await queryPostgres<{ id: string }>(
    `
    insert into public.owner_command_events (
      tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
      severity, status, owner_attention, ai_handled, recommended_action, action_href,
      money_cents, risk_type, confidence_score, metadata_json
    )
    values ($1, 'ferocity', 'Ferocity', $2, $3, $4, $5, $6, 'needs_owner', true, false, $7, $8, $9, 'revenue', 88, $10::jsonb)
    on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
    set title = excluded.title,
        summary = excluded.summary,
        status = 'needs_owner',
        owner_attention = true,
        recommended_action = excluded.recommended_action,
        action_href = excluded.action_href,
        money_cents = excluded.money_cents,
        metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
        updated_at = now()
    returning id
    `,
    [
      tenantId,
      input.externalEventId,
      `${input.source}.sales_opportunity`,
      input.title,
      input.summary,
      priorityFrom(input) === "high" ? "high" : "medium",
      "Review the request, follow up, and guide the prospect into the right Ferocity setup path.",
      input.actionHref ?? "/app/website-grader",
      input.moneyCents ?? 0,
      JSON.stringify({ ...metadata, leadId })
    ]
  );

  await sendWorkspacePushNotifications({
    tenantId,
    eventType: `${input.source}.sales_opportunity`,
    title: input.title,
    body: input.summary,
    url: input.actionHref ?? "/app/owner-command-center",
    tag: `${input.source}-${input.externalEventId}`,
    metadata: {
      ...metadata,
      leadId,
      ownerEventId: ownerEvent?.rows[0]?.id ?? null
    }
  });

  return { ok: true, leadId, ownerEventId: ownerEvent?.rows[0]?.id ?? null };
}

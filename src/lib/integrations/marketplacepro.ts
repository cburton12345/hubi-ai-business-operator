import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import type { MarketplaceProDeliveryConnection } from "@/lib/integrations/marketplacepro-delivery";
import type { MarketplaceProQuery } from "@/lib/integrations/marketplacepro-delivery-store";

function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (value === null || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 4_000;
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => boundedJson(item, depth + 1));
  if (typeof value !== "object") return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 50 && entries.every(([key, item]) => key.length <= 80 && boundedJson(item, depth + 1));
}

const boundedMetadataSchema = z.record(z.string().max(80), z.unknown()).superRefine((value, context) => {
  if (!boundedJson(value) || JSON.stringify(value).length > 32_000) {
    context.addIssue({ code: "custom", message: "Metadata exceeds MarketplacePro payload limits." });
  }
});

export const marketplaceProLeadSchema = z.object({
  marketplaceLeadId: z.string().trim().min(1).max(200),
  marketplaceAccountId: z.string().trim().min(1).max(200).optional(),
  vendorId: z.string().trim().max(200).optional(),
  listingId: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  service: z.string().trim().max(160).optional(),
  customer: z.object({
    name: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional()
  }).strict().default({}),
  message: z.string().trim().max(4_000).optional(),
  urgency: z.enum(["low", "normal", "high"]).optional(),
  status: z.string().trim().max(120).optional(),
  consentToContact: z.boolean().default(false),
  submittedAt: z.string().datetime({ offset: true }).optional(),
  metadata: boundedMetadataSchema.default({})
}).strict();

export const marketplaceProStatusSchema = z.object({
  marketplaceLeadId: z.string().trim().min(1).max(200),
  marketplaceAccountId: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["new_lead", "contacted", "estimate_sent", "booked", "won", "lost", "review_requested", "completed_job"]),
  note: z.string().trim().max(2_000).optional(),
  metadata: boundedMetadataSchema.default({})
}).strict();

export const marketplaceProEventSchema = z.object({
  marketplaceTable: z.enum([
    "posts",
    "offers",
    "labor_pool",
    "saved_providers",
    "worker_contact_requests",
    "follows",
    "notifications",
    "support_requests",
    "payments",
    "traffic_events",
    "labor_requests",
    "worker_matches",
    "labor_assignments",
    "contractor_recruiting_leads",
    "coverage_requirements"
  ]),
  marketplaceObjectId: z.string().trim().min(1).max(200),
  marketplaceAccountId: z.string().trim().min(1).max(200).optional(),
  vendorId: z.string().trim().max(200).optional(),
  listingId: z.string().trim().max(200).optional(),
  eventType: z.string().trim().max(120).optional(),
  title: z.string().trim().max(220).optional(),
  body: z.string().trim().max(4_000).optional(),
  actorLabel: z.string().trim().max(220).optional(),
  category: z.string().trim().max(120).optional(),
  service: z.string().trim().max(160).optional(),
  status: z.string().trim().max(120).optional(),
  payload: boundedMetadataSchema.default({})
}).strict();

type MarketplaceProLeadInput = z.infer<typeof marketplaceProLeadSchema>;
type MarketplaceProStatusInput = z.infer<typeof marketplaceProStatusSchema>;
type MarketplaceProEventInput = z.infer<typeof marketplaceProEventSchema>;

export type MarketplaceProExecutionContext = {
  connection: MarketplaceProDeliveryConnection;
  query: MarketplaceProQuery;
  deliveryId?: string;
  occurredAt?: string;
};

async function logMarketplaceEvent(input: {
  tenantId: string;
  brandId?: string | null;
  connectionId?: string | null;
  leadId?: string | null;
  eventType: string;
  objectId?: string | null;
  status: string;
  message?: string | null;
  payload: Record<string, unknown>;
}, query: MarketplaceProQuery = queryPostgres) {
  await query(
    `
    insert into public.marketplacepro_sync_events (
      tenant_id, brand_id, connection_id, lead_id, event_type, direction,
      marketplace_object_id, ferocity_object_type, ferocity_object_id, sync_status, status_message, payload_json
    )
    values ($1, $2, $3, $4, $5, 'inbound', $6, $7, $8, $9, $10, $11::jsonb)
    `,
    [
      input.tenantId,
      input.brandId ?? null,
      input.connectionId ?? null,
      input.leadId ?? null,
      input.eventType,
      input.objectId ?? null,
      input.leadId ? "lead" : null,
      input.leadId ?? null,
      input.status,
      input.message ?? null,
      JSON.stringify(input.payload)
    ]
  );
}

function leadStatusFromMarketplace(status?: string) {
  if (status === "contacted") return "contacted";
  if (status === "won" || status === "booked") return "won";
  if (status === "lost") return "lost";
  return "new";
}

function eventTypeForTable(table: MarketplaceProEventInput["marketplaceTable"], explicit?: string) {
  const allowed = new Set([
    "post_created",
    "post_updated",
    "offer_submitted",
    "labor_pool_submitted",
    "saved_provider_created",
    "worker_contact_request_submitted",
    "follow_created",
    "notification_logged",
    "support_request_created",
    "payment_completed",
    "payment_failed",
    "checkout_session_completed",
    "checkout_session_failed",
    "traffic_event_logged",
    "opportunity_received",
    "contractor_matches_found",
    "coverage_gap_detected",
    "contractor_confirmed",
    "assignment_status_changed",
    "recruiting_status_changed"
  ]);
  if (explicit && allowed.has(explicit)) return explicit;
  if (table === "posts") return "post_created";
  if (table === "offers") return "offer_submitted";
  if (table === "labor_pool") return "labor_pool_submitted";
  if (table === "saved_providers") return "saved_provider_created";
  if (table === "worker_contact_requests") return "worker_contact_request_submitted";
  if (table === "follows") return "follow_created";
  if (table === "notifications") return "notification_logged";
  if (table === "payments") return "payment_completed";
  if (table === "traffic_events") return "traffic_event_logged";
  if (table === "labor_requests") return "opportunity_received";
  if (table === "worker_matches") return "contractor_matches_found";
  if (table === "labor_assignments") return "assignment_status_changed";
  if (table === "contractor_recruiting_leads") return "recruiting_status_changed";
  if (table === "coverage_requirements") return "coverage_gap_detected";
  return "support_request_created";
}

function operationalFamilyForTable(table: MarketplaceProEventInput["marketplaceTable"]) {
  if (table === "posts" || table === "offers" || table === "worker_contact_requests") return "lead";
  if (table === "payments") return "revenue";
  if (table === "traffic_events" || table === "notifications" || table === "follows") return "marketing";
  if (table === "support_requests") return "system";
  if (["labor_requests", "worker_matches", "labor_assignments", "contractor_recruiting_leads", "coverage_requirements"].includes(table)) return "workforce";
  return "lead";
}

function titleForEvent(input: MarketplaceProEventInput) {
  if (input.title) return input.title;
  if (input.marketplaceTable === "posts") return "MarketplacePro post activity";
  if (input.marketplaceTable === "offers") return "MarketplacePro offer submitted";
  if (input.marketplaceTable === "labor_pool") return "MarketplacePro labor pool activity";
  if (input.marketplaceTable === "saved_providers") return "MarketplacePro provider saved";
  if (input.marketplaceTable === "worker_contact_requests") return "MarketplacePro worker contact request";
  if (input.marketplaceTable === "follows") return "MarketplacePro alert created";
  if (input.marketplaceTable === "notifications") return "MarketplacePro notification logged";
  if (input.marketplaceTable === "payments") return "MarketplacePro payment activity";
  if (input.marketplaceTable === "traffic_events") return "MarketplacePro traffic activity";
  if (input.marketplaceTable === "labor_requests") return "MarketplacePro contractor opportunity update";
  if (input.marketplaceTable === "worker_matches") return "MarketplacePro contractor match update";
  if (input.marketplaceTable === "labor_assignments") return "MarketplacePro contractor assignment update";
  if (input.marketplaceTable === "contractor_recruiting_leads") return "MarketplacePro recruiting update";
  if (input.marketplaceTable === "coverage_requirements") return "MarketplacePro coverage gap update";
  return "MarketplacePro support request";
}

export async function recordMarketplaceProEvent(input: MarketplaceProEventInput, context: MarketplaceProExecutionContext) {
  // Adapter endpoint for MarketplacePro launch tables. Do not require MarketplacePro to rename core tables.
  const { connection, query, deliveryId, occurredAt } = context;
  if (!connection.brandId) throw new Error("MarketplacePro connection is missing a brand mapping.");

  const eventType = eventTypeForTable(input.marketplaceTable, input.eventType);
  const timelineResult = await query<{ id: string }>(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, metadata_json, occurred_at
    )
    values ($1, $2, $3, $4, $5, $6, null, null, 'marketplacepro_object_links', $7::jsonb, coalesce($8::timestamptz, now()))
    returning id
    `,
    [
      connection.tenantId,
      connection.brandId,
      operationalFamilyForTable(input.marketplaceTable),
      eventType,
      titleForEvent(input),
      input.body ?? input.actorLabel ?? null,
      JSON.stringify({
        marketplaceTable: input.marketplaceTable,
        marketplaceObjectId: input.marketplaceObjectId,
        category: input.category,
        service: input.service,
        status: input.status,
        payload: input.payload
      }),
      occurredAt ?? null,
    ]
  );
  const timelineId = timelineResult?.rows[0]?.id ?? null;

  await query(
    `
    insert into public.marketplacepro_object_links (
      tenant_id, brand_id, connection_id, marketplace_table, marketplace_object_id,
      ferocity_object_type, ferocity_object_id, sync_status, metadata_json
    )
    values ($1, $2, $3, $4, $5, 'timeline_event', $6, 'logged', $7::jsonb)
    on conflict (tenant_id, marketplace_table, marketplace_object_id) do update
    set ferocity_object_type = excluded.ferocity_object_type,
        ferocity_object_id = excluded.ferocity_object_id,
        sync_status = excluded.sync_status,
        metadata_json = public.marketplacepro_object_links.metadata_json || excluded.metadata_json,
        updated_at = now()
    `,
    [
      connection.tenantId,
      connection.brandId,
      connection.id,
      input.marketplaceTable,
      input.marketplaceObjectId,
      timelineId,
      JSON.stringify({ eventType, status: input.status, category: input.category, service: input.service })
    ]
  );

  if (input.marketplaceTable === "offers" || input.marketplaceTable === "worker_contact_requests" || input.marketplaceTable === "support_requests") {
    await query(
      `
      insert into public.follow_up_workflows (
        tenant_id, brand_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
      )
      values ($1, $2, $3, 'manual', 'open', now(), $4, $5::jsonb)
      `,
      [
        connection.tenantId,
        connection.brandId,
        input.marketplaceTable === "support_requests" ? "nurture" : "new_lead_response",
        "Review this MarketplacePro activity and decide the next useful response in Ferocity.",
        JSON.stringify({ source: "MarketplacePro", marketplaceTable: input.marketplaceTable, marketplaceObjectId: input.marketplaceObjectId })
      ]
    );
  }

  await logMarketplaceEvent({
    tenantId: connection.tenantId,
    brandId: connection.brandId,
    connectionId: connection.id,
    eventType,
    objectId: input.marketplaceObjectId,
    status: "logged",
    message: input.body ?? null,
    payload: input
  }, query);

  if (deliveryId && occurredAt) {
    const actionable = ["offers", "worker_contact_requests", "support_requests", "payments", "labor_requests", "worker_matches", "labor_assignments", "coverage_requirements"].includes(input.marketplaceTable);
    await query(
      `
      insert into public.owner_command_events (
        tenant_id, platform_key, platform_name, external_event_id, event_type, title, summary,
        severity, status, owner_attention, recommended_action, metadata_json, occurred_at
      )
      values ($1, 'marketplacepro', 'MarketplacePro', $2, $3, $4, $5, $6, 'open', $7, $8, $9::jsonb, $10::timestamptz)
      on conflict (tenant_id, platform_key, external_event_id) where external_event_id is not null do update
      set metadata_json = public.owner_command_events.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        connection.tenantId,
        `${connection.id}:${deliveryId}`,
        eventType,
        titleForEvent(input),
        input.body ?? input.actorLabel ?? `MarketplacePro reported ${input.marketplaceTable} activity.`,
        input.marketplaceTable === "support_requests" ? "high" : actionable ? "medium" : "info",
        actionable,
        actionable ? "Review this MarketplacePro activity and choose the next authorized business action." : null,
        JSON.stringify({
          connectionId: connection.id,
          sourceWorkspaceId: connection.sourceAccountId,
          marketplaceObjectId: input.marketplaceObjectId,
          marketplaceTable: input.marketplaceTable,
          deliveryId,
          durableGoalObservation: "pending_existing_automation",
        }),
        occurredAt,
      ],
    );
  }

  await query("update public.marketplacepro_connections set last_sync_at = now(), updated_at = now() where id = $1", [connection.id]);

  return { ok: true, status: 202, recorded: true, timelineId };
}

export async function importMarketplaceProLead(input: MarketplaceProLeadInput, context: MarketplaceProExecutionContext) {
  // MarketplacePro remains the discovery layer. This import only creates Ferocity operational records.
  const { connection, query, occurredAt } = context;
  if (!connection.brandId) throw new Error("MarketplacePro connection is missing a brand mapping.");

  const existing = await query<{ lead_id: string }>(
    `
    select lead_id
    from public.marketplacepro_lead_links
    where tenant_id = $1 and marketplace_lead_id = $2
    limit 1
    `,
    [connection.tenantId, input.marketplaceLeadId]
  );
  const existingLeadId = existing?.rows[0]?.lead_id;

  if (existingLeadId) {
    await logMarketplaceEvent({
      tenantId: connection.tenantId,
      brandId: connection.brandId,
      connectionId: connection.id,
      leadId: existingLeadId,
      eventType: "lead_import",
      objectId: input.marketplaceLeadId,
      status: "ignored",
      message: "MarketplacePro lead already exists in Ferocity.",
      payload: input
    }, query);
    return { ok: true, status: 200, imported: false, leadId: existingLeadId };
  }

  const priority = input.urgency === "high" ? "high" : "normal";
  const sourceDetail = [input.category, input.service, input.listingId].filter(Boolean).join(" / ") || null;
  const leadResult = await query<{ id: string }>(
    `
    insert into public.leads (
      tenant_id, brand_id, source, source_detail, name, email, phone, message,
      lead_type, status, qualification_status, priority, consent_to_contact, metadata_json
    )
    values ($1, $2, 'MarketplacePro', $3, $4, $5, $6, $7, 'quote', $8, 'needs_review', $9, $10, $11::jsonb)
    returning id
    `,
    [
      connection.tenantId,
      connection.brandId,
      sourceDetail,
      input.customer.name ?? null,
      input.customer.email ?? null,
      input.customer.phone ?? null,
      input.message ?? null,
      leadStatusFromMarketplace(input.status),
      priority,
      input.consentToContact,
      JSON.stringify({
        marketplacePro: {
          marketplaceLeadId: input.marketplaceLeadId,
          marketplaceAccountId: connection.sourceAccountId,
          vendorId: input.vendorId,
          listingId: input.listingId,
          category: input.category,
          service: input.service,
          status: input.status
        },
        submittedAt: input.submittedAt ?? null,
        raw: input.metadata
      })
    ]
  );
  const leadId = leadResult?.rows[0]?.id;

  if (!leadId) {
    await logMarketplaceEvent({
      tenantId: connection.tenantId,
      brandId: connection.brandId,
      connectionId: connection.id,
      eventType: "sync_error",
      objectId: input.marketplaceLeadId,
      status: "failed",
      message: "Unable to create Ferocity lead.",
      payload: input
    }, query);
    return { ok: false, status: 500, error: "Unable to import MarketplacePro lead." };
  }

  await query(
    `
    insert into public.local_service_lead_details (tenant_id, brand_id, lead_id, service_interest, location, urgency)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (lead_id) do nothing
    `,
    [
      connection.tenantId,
      connection.brandId,
      leadId,
      input.service ?? input.category ?? null,
      typeof input.metadata.location === "string" ? input.metadata.location : null,
      input.urgency ?? null
    ]
  );

  await query(
    `
    insert into public.marketplacepro_lead_links (
      tenant_id, brand_id, connection_id, lead_id, marketplace_lead_id, marketplace_account_id,
      marketplace_vendor_id, marketplace_listing_id, marketplace_category, marketplace_service, marketplace_status, raw_payload_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
    `,
    [
      connection.tenantId,
      connection.brandId,
      connection.id,
      leadId,
      input.marketplaceLeadId,
      connection.sourceAccountId,
      input.vendorId ?? null,
      input.listingId ?? null,
      input.category ?? null,
      input.service ?? null,
      input.status ?? "new_lead",
      JSON.stringify(input)
    ]
  );

  await query(
    `
    insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
    values ($1, $2, $3, 'form_submission', 'Lead imported from MarketplacePro.', $4::jsonb)
    `,
    [
      connection.tenantId,
      connection.brandId,
      leadId,
      JSON.stringify({ source: "MarketplacePro", marketplaceLeadId: input.marketplaceLeadId, category: input.category, service: input.service })
    ]
  );

  await query(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    values ($1, $2, $3, 'new_lead_response', 'manual', 'open', now(),
      'Reply quickly. Mention the MarketplacePro request, answer the main question, and ask one clear next-step question.',
      $4::jsonb)
    `,
    [
      connection.tenantId,
      connection.brandId,
      leadId,
      JSON.stringify({ source: "MarketplacePro", urgency: input.urgency ?? "normal" })
    ]
  );

  await query(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json, occurred_at
    )
    values ($1, $2, 'lead', 'marketplacepro_lead_imported', 'MarketplacePro lead imported',
      $3, 'lead', $4, 'marketplacepro_lead_links', $4, $5::jsonb, coalesce($6::timestamptz, now()))
    `,
    [
      connection.tenantId,
      connection.brandId,
      input.message ?? "New lead from MarketplacePro.",
      leadId,
      JSON.stringify({ marketplaceLeadId: input.marketplaceLeadId, listingId: input.listingId, category: input.category, service: input.service }),
      occurredAt ?? input.submittedAt ?? null,
    ]
  );

  await logMarketplaceEvent({
    tenantId: connection.tenantId,
    brandId: connection.brandId,
    connectionId: connection.id,
    leadId,
    eventType: "lead_import",
    objectId: input.marketplaceLeadId,
    status: "processed",
    message: "MarketplacePro lead imported into Ferocity.",
    payload: input
  }, query);

  await query("update public.marketplacepro_connections set last_sync_at = now(), updated_at = now() where id = $1", [connection.id]);

  return { ok: true, status: 201, imported: true, leadId };
}

export async function updateMarketplaceProLeadStatus(input: MarketplaceProStatusInput, context: MarketplaceProExecutionContext) {
  // Inbound status sync is safe; outbound updates back to MarketplacePro should stay disabled until rules are approved.
  const { connection, query, occurredAt } = context;
  const linkResult = await query<{
    tenant_id: string;
    brand_id: string | null;
    connection_id: string | null;
    lead_id: string;
  }>(
    `
    select tenant_id, brand_id, connection_id, lead_id
    from public.marketplacepro_lead_links
    where tenant_id = $1
      and connection_id = $2
      and marketplace_lead_id = $3
    limit 1
    `,
    [connection.tenantId, connection.id, input.marketplaceLeadId]
  );
  const link = linkResult?.rows[0];

  if (!link) {
    return { ok: true, status: 202, updated: false, reason: "No matching Ferocity lead link was found." };
  }

  const ferocityStatus = leadStatusFromMarketplace(input.status);
  await query(
    `
    update public.leads
    set status = $3,
        metadata_json = metadata_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      link.tenant_id,
      link.lead_id,
      ferocityStatus,
      JSON.stringify({ marketplaceProLastStatus: input.status, marketplaceProStatusUpdatedAt: occurredAt ?? new Date().toISOString() })
    ]
  );

  await query(
    `
    update public.marketplacepro_lead_links
    set marketplace_status = $3,
        raw_payload_json = raw_payload_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and lead_id = $2
    `,
    [link.tenant_id, link.lead_id, input.status, JSON.stringify({ lastStatusPayload: input })]
  );

  await query(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json, occurred_at
    )
    values ($1, $2, 'lead', 'marketplacepro_status_update', 'MarketplacePro status updated',
      $3, 'lead', $4, 'marketplacepro_lead_links', $4, $5::jsonb, coalesce($6::timestamptz, now()))
    `,
    [link.tenant_id, link.brand_id, input.note ?? `MarketplacePro marked this lead ${input.status}.`, link.lead_id, JSON.stringify(input), occurredAt ?? null]
  );

  await logMarketplaceEvent({
    tenantId: link.tenant_id,
    brandId: link.brand_id,
    connectionId: link.connection_id,
    leadId: link.lead_id,
    eventType: "status_update",
    objectId: input.marketplaceLeadId,
    status: "processed",
    message: input.note ?? null,
    payload: input
  }, query);

  return { ok: true, status: 200, updated: true, leadId: link.lead_id };
}

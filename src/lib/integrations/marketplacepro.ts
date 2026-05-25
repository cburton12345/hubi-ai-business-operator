import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

export const marketplaceProLeadSchema = z.object({
  marketplaceLeadId: z.string().min(1),
  marketplaceAccountId: z.string().optional(),
  vendorId: z.string().optional(),
  listingId: z.string().optional(),
  category: z.string().optional(),
  service: z.string().optional(),
  customer: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional()
  }).default({}),
  message: z.string().optional(),
  urgency: z.enum(["low", "normal", "high"]).optional(),
  status: z.string().optional(),
  consentToContact: z.boolean().default(false),
  submittedAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const marketplaceProStatusSchema = z.object({
  marketplaceLeadId: z.string().min(1),
  status: z.enum(["new_lead", "contacted", "estimate_sent", "booked", "won", "lost", "review_requested", "completed_job"]),
  note: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const marketplaceProEventSchema = z.object({
  marketplaceTable: z.enum([
    "posts",
    "offers",
    "labor_pool",
    "saved_providers",
    "worker_contact_requests",
    "follows",
    "notifications",
    "support_requests"
  ]),
  marketplaceObjectId: z.string().min(1),
  marketplaceAccountId: z.string().optional(),
  vendorId: z.string().optional(),
  listingId: z.string().optional(),
  eventType: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  actorLabel: z.string().optional(),
  category: z.string().optional(),
  service: z.string().optional(),
  status: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({})
});

type MarketplaceProLeadInput = z.infer<typeof marketplaceProLeadSchema>;
type MarketplaceProStatusInput = z.infer<typeof marketplaceProStatusSchema>;
type MarketplaceProEventInput = z.infer<typeof marketplaceProEventSchema>;

type ConnectionRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  connection_status: string;
};

function hasValidSignature(request: Request) {
  // TODO: Replace shared-token comparison with MarketplacePro's final HMAC signature contract.
  if (!env.MARKETPLACEPRO_WEBHOOK_SECRET) return false;
  const signature = request.headers.get("x-marketplacepro-signature")?.trim();
  const token = request.headers.get("x-marketplacepro-token")?.trim();
  return signature === env.MARKETPLACEPRO_WEBHOOK_SECRET || token === env.MARKETPLACEPRO_WEBHOOK_SECRET;
}

export function marketplaceProAuthState(request: Request) {
  if (!env.MARKETPLACEPRO_WEBHOOK_SECRET) {
    return { ok: false, status: 501, error: "MarketplacePro webhook secret is not configured." };
  }

  if (!hasValidSignature(request)) {
    return { ok: false, status: 401, error: "MarketplacePro signature is missing or invalid." };
  }

  return { ok: true as const };
}

async function resolveConnection(input: { marketplaceAccountId?: string; vendorId?: string; listingId?: string }) {
  const result = await queryPostgres<ConnectionRow>(
    `
    select id, tenant_id, brand_id, connection_status
    from public.marketplacepro_connections
    where connection_status in ('connected', 'needs_attention')
      and ($1::text is null or marketplace_account_id = $1)
      and ($2::text is null or marketplace_vendor_id = $2)
      and ($3::text is null or marketplace_listing_id = $3 or marketplace_listing_id is null)
    order by
      case when marketplace_listing_id = $3 then 1 else 2 end,
      updated_at desc
    limit 1
    `,
    [input.marketplaceAccountId ?? null, input.vendorId ?? null, input.listingId ?? null]
  );

  return result?.rows[0] ?? null;
}

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
}) {
  await queryPostgres(
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
    "support_request_created"
  ]);
  if (explicit && allowed.has(explicit)) return explicit;
  if (table === "posts") return "post_created";
  if (table === "offers") return "offer_submitted";
  if (table === "labor_pool") return "labor_pool_submitted";
  if (table === "saved_providers") return "saved_provider_created";
  if (table === "worker_contact_requests") return "worker_contact_request_submitted";
  if (table === "follows") return "follow_created";
  if (table === "notifications") return "notification_logged";
  return "support_request_created";
}

function operationalFamilyForTable(table: MarketplaceProEventInput["marketplaceTable"]) {
  if (table === "posts" || table === "offers" || table === "worker_contact_requests") return "lead";
  if (table === "notifications") return "communication";
  if (table === "support_requests") return "system";
  return "marketplace";
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
  return "MarketplacePro support request";
}

export async function recordMarketplaceProEvent(input: MarketplaceProEventInput) {
  // Adapter endpoint for MarketplacePro launch tables. Do not require MarketplacePro to rename core tables.
  const connection = await resolveConnection({
    marketplaceAccountId: input.marketplaceAccountId,
    vendorId: input.vendorId,
    listingId: input.listingId
  });

  if (!connection?.brand_id) {
    return {
      ok: true,
      status: 202,
      recorded: false,
      reason: "No connected MarketplacePro mapping was found for this event."
    };
  }

  const eventType = eventTypeForTable(input.marketplaceTable, input.eventType);
  const timelineResult = await queryPostgres<{ id: string }>(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, null, null, 'marketplacepro_object_links', $7::jsonb)
    returning id
    `,
    [
      connection.tenant_id,
      connection.brand_id,
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
      })
    ]
  );
  const timelineId = timelineResult?.rows[0]?.id ?? null;

  await queryPostgres(
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
      connection.tenant_id,
      connection.brand_id,
      connection.id,
      input.marketplaceTable,
      input.marketplaceObjectId,
      timelineId,
      JSON.stringify({ eventType, status: input.status, category: input.category, service: input.service })
    ]
  );

  if (input.marketplaceTable === "offers" || input.marketplaceTable === "worker_contact_requests" || input.marketplaceTable === "support_requests") {
    await queryPostgres(
      `
      insert into public.follow_up_workflows (
        tenant_id, brand_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
      )
      values ($1, $2, $3, 'manual', 'open', now(), $4, $5::jsonb)
      `,
      [
        connection.tenant_id,
        connection.brand_id,
        input.marketplaceTable === "support_requests" ? "nurture" : "new_lead_response",
        "Review this MarketplacePro activity and decide the next useful response in Ferocity.",
        JSON.stringify({ source: "MarketplacePro", marketplaceTable: input.marketplaceTable, marketplaceObjectId: input.marketplaceObjectId })
      ]
    );
  }

  await logMarketplaceEvent({
    tenantId: connection.tenant_id,
    brandId: connection.brand_id,
    connectionId: connection.id,
    eventType,
    objectId: input.marketplaceObjectId,
    status: "logged",
    message: input.body ?? null,
    payload: input
  });

  await queryPostgres("update public.marketplacepro_connections set last_sync_at = now(), updated_at = now() where id = $1", [connection.id]);

  return { ok: true, status: 202, recorded: true, timelineId };
}

export async function importMarketplaceProLead(input: MarketplaceProLeadInput) {
  // MarketplacePro remains the discovery layer. This import only creates Ferocity operational records.
  const connection = await resolveConnection({
    marketplaceAccountId: input.marketplaceAccountId,
    vendorId: input.vendorId,
    listingId: input.listingId
  });

  if (!connection?.brand_id) {
    return {
      ok: true,
      status: 202,
      imported: false,
      reason: "No connected MarketplacePro vendor mapping was found."
    };
  }

  const existing = await queryPostgres<{ lead_id: string }>(
    `
    select lead_id
    from public.marketplacepro_lead_links
    where tenant_id = $1 and marketplace_lead_id = $2
    limit 1
    `,
    [connection.tenant_id, input.marketplaceLeadId]
  );
  const existingLeadId = existing?.rows[0]?.lead_id;

  if (existingLeadId) {
    await logMarketplaceEvent({
      tenantId: connection.tenant_id,
      brandId: connection.brand_id,
      connectionId: connection.id,
      leadId: existingLeadId,
      eventType: "lead_import",
      objectId: input.marketplaceLeadId,
      status: "ignored",
      message: "MarketplacePro lead already exists in Ferocity.",
      payload: input
    });
    return { ok: true, status: 200, imported: false, leadId: existingLeadId };
  }

  const priority = input.urgency === "high" ? "high" : "normal";
  const sourceDetail = [input.category, input.service, input.listingId].filter(Boolean).join(" / ") || null;
  const leadResult = await queryPostgres<{ id: string }>(
    `
    insert into public.leads (
      tenant_id, brand_id, source, source_detail, name, email, phone, message,
      lead_type, status, qualification_status, priority, consent_to_contact, metadata_json
    )
    values ($1, $2, 'MarketplacePro', $3, $4, $5, $6, $7, 'quote', $8, 'needs_review', $9, $10, $11::jsonb)
    returning id
    `,
    [
      connection.tenant_id,
      connection.brand_id,
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
          marketplaceAccountId: input.marketplaceAccountId,
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
      tenantId: connection.tenant_id,
      brandId: connection.brand_id,
      connectionId: connection.id,
      eventType: "sync_error",
      objectId: input.marketplaceLeadId,
      status: "failed",
      message: "Unable to create Ferocity lead.",
      payload: input
    });
    return { ok: false, status: 500, error: "Unable to import MarketplacePro lead." };
  }

  await queryPostgres(
    `
    insert into public.local_service_lead_details (tenant_id, brand_id, lead_id, service_interest, location, urgency)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (lead_id) do nothing
    `,
    [
      connection.tenant_id,
      connection.brand_id,
      leadId,
      input.service ?? input.category ?? null,
      typeof input.metadata.location === "string" ? input.metadata.location : null,
      input.urgency ?? null
    ]
  );

  await queryPostgres(
    `
    insert into public.marketplacepro_lead_links (
      tenant_id, brand_id, connection_id, lead_id, marketplace_lead_id, marketplace_account_id,
      marketplace_vendor_id, marketplace_listing_id, marketplace_category, marketplace_service, marketplace_status, raw_payload_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
    `,
    [
      connection.tenant_id,
      connection.brand_id,
      connection.id,
      leadId,
      input.marketplaceLeadId,
      input.marketplaceAccountId ?? null,
      input.vendorId ?? null,
      input.listingId ?? null,
      input.category ?? null,
      input.service ?? null,
      input.status ?? "new_lead",
      JSON.stringify(input)
    ]
  );

  await queryPostgres(
    `
    insert into public.lead_events (tenant_id, brand_id, lead_id, type, body, metadata_json)
    values ($1, $2, $3, 'form_submission', 'Lead imported from MarketplacePro.', $4::jsonb)
    `,
    [
      connection.tenant_id,
      connection.brand_id,
      leadId,
      JSON.stringify({ source: "MarketplacePro", marketplaceLeadId: input.marketplaceLeadId, category: input.category, service: input.service })
    ]
  );

  await queryPostgres(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    values ($1, $2, $3, 'new_lead_response', 'manual', 'open', now(),
      'Reply quickly. Mention the MarketplacePro request, answer the main question, and ask one clear next-step question.',
      $4::jsonb)
    `,
    [
      connection.tenant_id,
      connection.brand_id,
      leadId,
      JSON.stringify({ source: "MarketplacePro", urgency: input.urgency ?? "normal" })
    ]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, 'lead', 'marketplacepro_lead_imported', 'MarketplacePro lead imported',
      $3, 'lead', $4, 'marketplacepro_lead_links', $4, $5::jsonb)
    `,
    [
      connection.tenant_id,
      connection.brand_id,
      input.message ?? "New lead from MarketplacePro.",
      leadId,
      JSON.stringify({ marketplaceLeadId: input.marketplaceLeadId, listingId: input.listingId, category: input.category, service: input.service })
    ]
  );

  await logMarketplaceEvent({
    tenantId: connection.tenant_id,
    brandId: connection.brand_id,
    connectionId: connection.id,
    leadId,
    eventType: "lead_import",
    objectId: input.marketplaceLeadId,
    status: "processed",
    message: "MarketplacePro lead imported into Ferocity.",
    payload: input
  });

  await queryPostgres("update public.marketplacepro_connections set last_sync_at = now(), updated_at = now() where id = $1", [connection.id]);

  return { ok: true, status: 201, imported: true, leadId };
}

export async function updateMarketplaceProLeadStatus(input: MarketplaceProStatusInput) {
  // Inbound status sync is safe; outbound updates back to MarketplacePro should stay disabled until rules are approved.
  const linkResult = await queryPostgres<{
    tenant_id: string;
    brand_id: string | null;
    connection_id: string | null;
    lead_id: string;
  }>(
    `
    select tenant_id, brand_id, connection_id, lead_id
    from public.marketplacepro_lead_links
    where marketplace_lead_id = $1
    order by updated_at desc
    limit 1
    `,
    [input.marketplaceLeadId]
  );
  const link = linkResult?.rows[0];

  if (!link) {
    return { ok: true, status: 202, updated: false, reason: "No matching Ferocity lead link was found." };
  }

  const ferocityStatus = leadStatusFromMarketplace(input.status);
  await queryPostgres(
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
      JSON.stringify({ marketplaceProLastStatus: input.status, marketplaceProStatusUpdatedAt: new Date().toISOString() })
    ]
  );

  await queryPostgres(
    `
    update public.marketplacepro_lead_links
    set marketplace_status = $3,
        raw_payload_json = raw_payload_json || $4::jsonb,
        updated_at = now()
    where tenant_id = $1 and lead_id = $2
    `,
    [link.tenant_id, link.lead_id, input.status, JSON.stringify({ lastStatusPayload: input })]
  );

  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, 'lead', 'marketplacepro_status_update', 'MarketplacePro status updated',
      $3, 'lead', $4, 'marketplacepro_lead_links', $4, $5::jsonb)
    `,
    [link.tenant_id, link.brand_id, input.note ?? `MarketplacePro marked this lead ${input.status}.`, link.lead_id, JSON.stringify(input)]
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
  });

  return { ok: true, status: 200, updated: true, leadId: link.lead_id };
}

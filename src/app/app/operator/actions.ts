"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const stageSchema = z.object({
  opportunityId: z.string().min(1),
  stageId: z.string().min(1),
  notes: z.string().optional()
});

const threadSchema = z.object({
  threadId: z.string().min(1),
  status: z.enum(["open", "waiting_on_customer", "waiting_on_team", "closed", "archived"]),
  note: z.string().optional()
});

const scheduleSchema = z.object({
  eventId: z.string().min(1),
  status: z.enum(["scheduled", "completed", "missed", "canceled"])
});

async function insertTimeline(input: {
  tenantId: string;
  brandId?: string | null;
  family: string;
  type: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (
      tenant_id, brand_id, event_family, event_type, title, body,
      primary_entity_type, primary_entity_id, source_table, source_id, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10::uuid, $11::jsonb)
    `,
    [
      input.tenantId,
      input.brandId ?? null,
      input.family,
      input.type,
      input.title,
      input.body ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.sourceTable ?? null,
      input.sourceId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

export async function scanLeadToJobLoopAction() {
  await requirePermission("lead:manage");
  const workspaceId = await getCurrentWorkspaceId();

  await queryPostgres(
    `
    insert into public.communication_threads (
      tenant_id, brand_id, lead_id, subject, channel, status, next_follow_up_at, unanswered_since, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id,
      coalesce('Lead: ' || nullif(l.name, ''), 'Lead: ' || coalesce(l.email, l.phone, l.id::text)),
      case when l.phone is not null and l.phone <> '' then 'sms' when l.email is not null and l.email <> '' then 'email' else 'manual' end,
      'open',
      case when l.status in ('new', 'contacted') then now() else null end,
      case when l.status = 'new' then l.created_at else null end,
      jsonb_build_object('createdByScan', 'lead_to_job_loop', 'source', l.source, 'sourceDetail', l.source_detail)
    from public.leads l
    where l.tenant_id = $1
      and l.status in ('new', 'contacted', 'qualified')
      and not exists (
        select 1 from public.communication_threads t
        where t.tenant_id = l.tenant_id and t.lead_id = l.id
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.communication_messages (
      tenant_id, brand_id, thread_id, direction, channel, visibility, body, status, ai_generated, metadata_json
    )
    select t.tenant_id, t.brand_id, t.id, 'draft', t.channel, 'customer_visible',
      'Draft only: respond quickly, reference the original request, and ask one clear next-step question.',
      'draft',
      true,
      jsonb_build_object('createdByScan', 'lead_to_job_loop', 'sendDisabledUntilProviderConnected', true)
    from public.communication_threads t
    where t.tenant_id = $1
      and not exists (
        select 1 from public.communication_messages m
        where m.thread_id = t.id and m.metadata_json->>'createdByScan' = 'lead_to_job_loop'
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.opportunities (
      tenant_id, brand_id, lead_id, stage_id, title, status, value_cents, close_probability,
      next_follow_up_at, source, ai_summary, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, s.id,
      coalesce(nullif(l.name, ''), nullif(l.email, ''), nullif(l.phone, ''), 'New opportunity'),
      'open',
      0,
      s.default_probability,
      case when l.status in ('new', 'contacted') then now() else null end,
      coalesce(l.source, 'unknown'),
      'Opportunity created from lead intake. Add estimate value when pricing is known.',
      jsonb_build_object('createdByScan', 'lead_to_job_loop', 'leadStatus', l.status, 'sourceDetail', l.source_detail)
    from public.leads l
    join public.pipeline_stages s on s.tenant_id = l.tenant_id and s.stage_key =
      case when l.status = 'qualified' then 'qualified' else 'new' end
    where l.tenant_id = $1
      and l.status in ('new', 'contacted', 'qualified')
      and not exists (
        select 1 from public.opportunities o
        where o.tenant_id = l.tenant_id and o.lead_id = l.id and o.status <> 'archived'
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.operator_schedule_events (
      tenant_id, brand_id, lead_id, opportunity_id, event_type, title, status, starts_at, reminder_policy_json, metadata_json
    )
    select o.tenant_id, o.brand_id, o.lead_id, o.id, 'callback',
      'Callback: ' || o.title,
      'scheduled',
      coalesce(o.callback_at, o.next_follow_up_at, now() + interval '4 hours'),
      jsonb_build_object('manualReminder', true, 'futureProviders', array['google_calendar', 'sms', 'email']),
      jsonb_build_object('createdByScan', 'lead_to_job_loop')
    from public.opportunities o
    where o.tenant_id = $1
      and o.status = 'open'
      and o.next_follow_up_at is not null
      and not exists (
        select 1 from public.operator_schedule_events e
        where e.tenant_id = o.tenant_id and e.opportunity_id = o.id and e.event_type = 'callback' and e.status = 'scheduled'
      )
    limit 200
    `,
    [workspaceId]
  );

  await queryPostgres(
    `
    insert into public.operator_schedule_events (
      tenant_id, brand_id, customer_id, job_id, event_type, title, status, starts_at, ends_at, location, reminder_policy_json, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, j.id, 'job', j.title, 'scheduled',
      j.scheduled_start, j.scheduled_end, j.service_address,
      jsonb_build_object('manualReminder', true, 'futureProviders', array['google_calendar', 'dispatch_optimizer']),
      jsonb_build_object('createdByScan', 'lead_to_job_loop', 'serviceArea', j.service_area)
    from public.service_jobs j
    where j.tenant_id = $1
      and j.scheduled_start is not null
      and j.status in ('scheduled', 'in_progress')
      and not exists (
        select 1 from public.operator_schedule_events e
        where e.tenant_id = j.tenant_id and e.job_id = j.id and e.event_type = 'job'
      )
    limit 200
    `,
    [workspaceId]
  );

  await insertTimeline({
    tenantId: workspaceId,
    family: "lead",
    type: "lead_to_job_scan",
    title: "Lead-to-job loop scan completed",
    body: "Ferocity checked leads for communication threads, opportunity records, callbacks, and scheduled job events.",
    metadata: { scan: "lead_to_job_loop" }
  });

  revalidatePath("/app/operator");
  revalidatePath("/app/growth");
}

export async function moveOpportunityStageAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = stageSchema.safeParse({
    opportunityId: formData.get("opportunityId"),
    stageId: formData.get("stageId"),
    notes: formData.get("notes")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const result = await queryPostgres<{ brand_id: string | null; from_stage_id: string | null; title: string; stage_name: string; stage_probability: number; is_won: boolean; is_lost: boolean }>(
    `
    with current_opportunity as (
      select id, brand_id, stage_id, title
      from public.opportunities
      where tenant_id = $1 and id = $2
    )
    update public.opportunities o
    set stage_id = $3,
        close_probability = s.default_probability,
        status = case when s.is_won then 'won' when s.is_lost then 'lost' else 'open' end,
        updated_at = now()
    from public.pipeline_stages s, current_opportunity c
    where o.tenant_id = $1 and o.id = c.id and s.tenant_id = o.tenant_id and s.id = $3
    returning o.brand_id, c.stage_id as from_stage_id, o.title, s.name as stage_name, s.default_probability as stage_probability, s.is_won, s.is_lost
    `,
    [workspaceId, parsed.data.opportunityId, parsed.data.stageId]
  );
  const opportunity = result?.rows[0];
  if (!opportunity) return;

  await queryPostgres(
    `
    insert into public.opportunity_stage_events (
      tenant_id, opportunity_id, from_stage_id, to_stage_id, moved_by_user_id, notes, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      workspaceId,
      parsed.data.opportunityId,
      opportunity.from_stage_id,
      parsed.data.stageId,
      session?.userId ?? null,
      parsed.data.notes ?? "",
      JSON.stringify({ stageName: opportunity.stage_name, probability: opportunity.stage_probability })
    ]
  );

  await insertTimeline({
    tenantId: workspaceId,
    brandId: opportunity.brand_id,
    family: opportunity.is_won ? "revenue" : "lead",
    type: "opportunity_stage_changed",
    title: `Opportunity moved to ${opportunity.stage_name}`,
    body: opportunity.title,
    entityType: "opportunity",
    entityId: parsed.data.opportunityId,
    sourceTable: "opportunities",
    sourceId: parsed.data.opportunityId,
    metadata: { notes: parsed.data.notes ?? "", won: opportunity.is_won, lost: opportunity.is_lost }
  });

  revalidatePath("/app/operator");
}

export async function updateCommunicationThreadAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = threadSchema.safeParse({
    threadId: formData.get("threadId"),
    status: formData.get("status"),
    note: formData.get("note")?.toString() || undefined
  });
  if (!parsed.success) return;

  const [workspaceId, session] = await Promise.all([getCurrentWorkspaceId(), getCurrentAppSession()]);
  const result = await queryPostgres<{ brand_id: string | null; subject: string; channel: string }>(
    `
    update public.communication_threads
    set status = $3,
        unanswered_since = case when $3 in ('closed', 'archived') then null else unanswered_since end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    returning brand_id, subject, channel
    `,
    [workspaceId, parsed.data.threadId, parsed.data.status]
  );
  const thread = result?.rows[0];
  if (!thread) return;

  if (parsed.data.note) {
    await queryPostgres(
      `
      insert into public.communication_messages (
        tenant_id, brand_id, thread_id, direction, channel, visibility, body, status, created_by_user_id
      )
      values ($1, $2, $3, 'internal', 'internal', 'internal', $4, 'sent_manually', $5)
      `,
      [workspaceId, thread.brand_id, parsed.data.threadId, parsed.data.note, session?.userId ?? null]
    );
  }

  await insertTimeline({
    tenantId: workspaceId,
    brandId: thread.brand_id,
    family: "lead",
    type: "communication_thread_updated",
    title: `Conversation marked ${parsed.data.status}`,
    body: thread.subject,
    entityType: "communication_thread",
    entityId: parsed.data.threadId,
    sourceTable: "communication_threads",
    sourceId: parsed.data.threadId,
    metadata: { note: parsed.data.note ?? "" }
  });

  revalidatePath("/app/operator");
}

export async function updateScheduleEventAction(formData: FormData) {
  await requirePermission("lead:manage");
  const parsed = scheduleSchema.safeParse({
    eventId: formData.get("eventId"),
    status: formData.get("status")
  });
  if (!parsed.success) return;

  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{ brand_id: string | null; title: string; event_type: string }>(
    `
    update public.operator_schedule_events
    set status = $3, updated_at = now()
    where tenant_id = $1 and id = $2
    returning brand_id, title, event_type
    `,
    [workspaceId, parsed.data.eventId, parsed.data.status]
  );
  const event = result?.rows[0];
  if (event) {
    await insertTimeline({
      tenantId: workspaceId,
      brandId: event.brand_id,
      family: "follow_up",
      type: "schedule_event_updated",
      title: `${event.event_type} marked ${parsed.data.status}`,
      body: event.title,
      entityType: "operator_schedule_event",
      entityId: parsed.data.eventId,
      sourceTable: "operator_schedule_events",
      sourceId: parsed.data.eventId,
      metadata: { status: parsed.data.status }
    });
  }
  revalidatePath("/app/operator");
}

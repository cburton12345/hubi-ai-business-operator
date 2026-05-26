import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type OperatorMetric = {
  label: string;
  value: number;
  detail: string;
};

export type CommunicationThreadRow = {
  id: string;
  subject: string;
  brandName: string | null;
  leadName: string | null;
  customerName: string | null;
  channel: string;
  status: string;
  nextFollowUpAt: string | null;
  unansweredSince: string | null;
  lastMessageAt: string | null;
};

export type OpportunityStageRow = {
  id: string;
  name: string;
  stageKey: string;
  probability: number;
  opportunities: {
    id: string;
    title: string;
    brandName: string | null;
    leadName: string | null;
    customerName: string | null;
    status: string;
    valueCents: number;
    closeProbability: number;
    nextFollowUpAt: string | null;
    callbackAt: string | null;
  }[];
};

export type ScheduleEventRow = {
  id: string;
  title: string;
  brandName: string | null;
  eventType: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
};

export type TemplateRow = {
  id: string;
  name: string;
  channel: string;
  purpose: string;
  requiresApproval: boolean;
};

export type CommunicationMessageRow = {
  id: string;
  threadId: string;
  subject: string;
  direction: string;
  channel: string;
  visibility: string;
  status: string;
  body: string;
  aiGenerated: boolean;
  createdAt: string;
};

export type OperatorTimelineRow = {
  id: string;
  family: string;
  type: string;
  title: string;
  body: string | null;
  occurredAt: string;
};

export type OperatorConsoleDashboard = {
  metrics: OperatorMetric[];
  threads: CommunicationThreadRow[];
  stages: OpportunityStageRow[];
  schedule: ScheduleEventRow[];
  templates: TemplateRow[];
  messages: CommunicationMessageRow[];
  timeline: OperatorTimelineRow[];
};

function num(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export async function getOperatorConsoleDashboard(): Promise<OperatorConsoleDashboard> {
  const workspaceId = await getCurrentWorkspaceId();

  const [metricsResult, threadsResult, stagesResult, messagesResult, opportunitiesResult, scheduleResult, templatesResult, timelineResult] =
    await Promise.all([
      queryPostgres<{
        open_threads: string;
        unanswered_threads: string;
        open_opportunities: string;
        pipeline_value_cents: string;
        callbacks_due: string;
        scheduled_events: string;
      }>(
        `
        select
          (select count(*) from public.communication_threads where tenant_id = $1 and status in ('open', 'waiting_on_customer', 'waiting_on_team')) as open_threads,
          (select count(*) from public.communication_threads where tenant_id = $1 and unanswered_since is not null and status <> 'closed') as unanswered_threads,
          (select count(*) from public.opportunities where tenant_id = $1 and status = 'open') as open_opportunities,
          (select coalesce(sum(value_cents), 0) from public.opportunities where tenant_id = $1 and status = 'open') as pipeline_value_cents,
          (select count(*) from public.operator_schedule_events where tenant_id = $1 and status = 'scheduled' and starts_at <= now() + interval '24 hours') as callbacks_due,
          (select count(*) from public.operator_schedule_events where tenant_id = $1 and status = 'scheduled') as scheduled_events
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        subject: string;
        brand_name: string | null;
        lead_name: string | null;
        customer_name: string | null;
        channel: string;
        status: string;
        next_follow_up_at: string | null;
        unanswered_since: string | null;
        last_message_at: string | null;
      }>(
        `
        select t.id, t.subject, b.name as brand_name, coalesce(l.name, l.email, l.phone) as lead_name, c.name as customer_name,
          t.channel, t.status, t.next_follow_up_at, t.unanswered_since, t.last_message_at
        from public.communication_threads t
        left join public.brands b on b.id = t.brand_id
        left join public.leads l on l.id = t.lead_id
        left join public.customers c on c.id = t.customer_id
        where t.tenant_id = $1
        order by coalesce(t.next_follow_up_at, t.last_message_at, t.created_at) desc
        limit 30
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        name: string;
        stage_key: string;
        default_probability: number;
        sort_order: number;
      }>(
        `
        select id, name, stage_key, default_probability, sort_order
        from public.pipeline_stages
        where tenant_id = $1 and active = true
        order by sort_order asc, name
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        thread_id: string;
        subject: string;
        direction: string;
        channel: string;
        visibility: string;
        status: string;
        body: string;
        ai_generated: boolean;
        created_at: string;
      }>(
        `
        select m.id, m.thread_id, t.subject, m.direction, m.channel, m.visibility, m.status, m.body, m.ai_generated, m.created_at
        from public.communication_messages m
        join public.communication_threads t on t.id = m.thread_id and t.tenant_id = m.tenant_id
        where m.tenant_id = $1
          and m.status in ('draft', 'queued', 'failed')
        order by m.created_at desc
        limit 20
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        stage_id: string | null;
        title: string;
        brand_name: string | null;
        lead_name: string | null;
        customer_name: string | null;
        status: string;
        value_cents: number;
        close_probability: number;
        next_follow_up_at: string | null;
        callback_at: string | null;
      }>(
        `
        select o.id, o.stage_id, o.title, b.name as brand_name, coalesce(l.name, l.email, l.phone) as lead_name, c.name as customer_name,
          o.status, o.value_cents, o.close_probability, o.next_follow_up_at, o.callback_at
        from public.opportunities o
        left join public.brands b on b.id = o.brand_id
        left join public.leads l on l.id = o.lead_id
        left join public.customers c on c.id = o.customer_id
        where o.tenant_id = $1 and o.status = 'open'
        order by coalesce(o.next_follow_up_at, o.callback_at, o.updated_at) asc
        limit 100
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        title: string;
        brand_name: string | null;
        event_type: string;
        status: string;
        starts_at: string;
        ends_at: string | null;
        location: string | null;
      }>(
        `
        select e.id, e.title, b.name as brand_name, e.event_type, e.status, e.starts_at, e.ends_at, e.location
        from public.operator_schedule_events e
        left join public.brands b on b.id = e.brand_id
        where e.tenant_id = $1
        order by e.starts_at asc
        limit 30
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        name: string;
        channel: string;
        purpose: string;
        requires_approval: boolean;
      }>(
        `
        select id, name, channel, purpose, requires_approval
        from public.communication_templates
        where tenant_id = $1 and active = true
        order by purpose, name
        limit 30
        `,
        [workspaceId]
      ),
      queryPostgres<{
        id: string;
        event_family: string;
        event_type: string;
        title: string;
        body: string | null;
        occurred_at: string;
      }>(
        `
        select id, event_family, event_type, title, body, occurred_at
        from public.operator_timeline_events
        where tenant_id = $1 and event_family in ('lead', 'follow_up', 'estimate', 'job', 'revenue', 'system')
        order by occurred_at desc
        limit 30
        `,
        [workspaceId]
      )
    ]);

  const metrics = metricsResult?.rows[0];
  const opportunities = opportunitiesResult?.rows ?? [];

  return {
    metrics: [
      { label: "Open conversations", value: num(metrics?.open_threads), detail: "Threads needing visibility" },
      { label: "Unanswered", value: num(metrics?.unanswered_threads), detail: "Lead response risk" },
      { label: "Open opportunities", value: num(metrics?.open_opportunities), detail: "Pipeline records" },
      { label: "Pipeline value", value: Math.round(num(metrics?.pipeline_value_cents) / 100), detail: "Forecast-ready dollars" },
      { label: "Due in 24h", value: num(metrics?.callbacks_due), detail: "Callbacks and appointments" },
      { label: "Scheduled", value: num(metrics?.scheduled_events), detail: "Calendar foundation" }
    ],
    threads: (threadsResult?.rows ?? []).map((row) => ({
      id: row.id,
      subject: row.subject,
      brandName: row.brand_name,
      leadName: row.lead_name,
      customerName: row.customer_name,
      channel: row.channel,
      status: row.status,
      nextFollowUpAt: row.next_follow_up_at,
      unansweredSince: row.unanswered_since,
      lastMessageAt: row.last_message_at
    })),
    stages: (stagesResult?.rows ?? []).map((stage) => ({
      id: stage.id,
      name: stage.name,
      stageKey: stage.stage_key,
      probability: stage.default_probability,
      opportunities: opportunities
        .filter((opportunity) => opportunity.stage_id === stage.id)
        .map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          brandName: opportunity.brand_name,
          leadName: opportunity.lead_name,
          customerName: opportunity.customer_name,
          status: opportunity.status,
          valueCents: opportunity.value_cents,
          closeProbability: opportunity.close_probability,
          nextFollowUpAt: opportunity.next_follow_up_at,
          callbackAt: opportunity.callback_at
        }))
    })),
    schedule: (scheduleResult?.rows ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      brandName: row.brand_name,
      eventType: row.event_type,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      location: row.location
    })),
    templates: (templatesResult?.rows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      channel: row.channel,
      purpose: row.purpose,
      requiresApproval: row.requires_approval
    })),
    messages: (messagesResult?.rows ?? []).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      subject: row.subject,
      direction: row.direction,
      channel: row.channel,
      visibility: row.visibility,
      status: row.status,
      body: row.body,
      aiGenerated: row.ai_generated,
      createdAt: row.created_at
    })),
    timeline: (timelineResult?.rows ?? []).map((row) => ({
      id: row.id,
      family: row.event_family,
      type: row.event_type,
      title: row.title,
      body: row.body,
      occurredAt: row.occurred_at
    }))
  };
}

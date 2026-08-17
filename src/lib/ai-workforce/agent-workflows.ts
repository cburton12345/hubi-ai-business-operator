import { sendTransactionalEmail } from "@/lib/email/transactional";
import { getServiceGate } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { syncCustomerLifecycleForTenant } from "@/lib/customer-lifecycle/sync-customer-lifecycle";
import { evaluateVisitSchedule } from "@/lib/scheduling/evaluate-visit";

export type AgentWorkflowRow = {
  id: string;
  agentKey: string;
  agentName: string;
  plainGoal: string;
  status: string;
  runMode: string;
  cadenceKey: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string | null;
  metadata: Record<string, unknown>;
  tone: string;
  customInstructions: string;
  knowledgeFocus: string;
  escalationRules: string;
  successMeasures: string;
  enabledChannels: string[];
  authoritySummary: string;
  openOutputs: number;
};

export type AgentRunRow = {
  id: string;
  agentKey: string;
  status: string;
  summary: string | null;
  startedAt: string;
  completedAt: string | null;
  outputsPrepared: number;
  outputsSent: number;
  outputsBlocked: number;
};

export type AgentOutputRow = {
  id: string;
  agentKey: string;
  outputType: string;
  title: string;
  status: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
};

export type AgentWorkflowDashboard = {
  workflows: AgentWorkflowRow[];
  runs: AgentRunRow[];
  outputs: AgentOutputRow[];
  tableReady: boolean;
};

const defaultWorkflows = [
  {
    agentKey: "lead_response_agent",
    agentName: "Lead Response Agent",
    plainGoal: "Find new leads, prepare first replies, and notify the owner/team.",
    runMode: "approval_required",
    cadenceKey: "hourly",
    plainName: "Catch the lead"
  },
  {
    agentKey: "follow_up_agent",
    agentName: "Follow-Up Agent",
    plainGoal: "Find stale leads, callbacks, viewed estimates, and forgotten opportunities.",
    runMode: "approval_required",
    cadenceKey: "daily",
    plainName: "Follow up"
  },
  {
    agentKey: "customer_lifecycle_agent",
    agentName: "Customer Lifecycle Manager",
    plainGoal: "Recover missed calls and estimates, nurture leads, reactivate the database, earn referrals, and grow customer lifetime value.",
    runMode: "approval_required",
    cadenceKey: "daily",
    plainName: "Grow customer value"
  },
  {
    agentKey: "dispatcher_agent",
    agentName: "AI Dispatcher",
    plainGoal: "Protect the schedule, find unassigned work, detect conflicts, and recommend the next safe dispatch action.",
    runMode: "approval_required",
    cadenceKey: "hourly",
    plainName: "Run the field day"
  },
  {
    agentKey: "review_agent",
    agentName: "Review Agent",
    plainGoal: "Turn completed jobs into review requests, proof capture, and reputation tasks.",
    runMode: "approval_required",
    cadenceKey: "daily",
    plainName: "Get reviews"
  },
  {
    agentKey: "invoice_reminder_agent",
    agentName: "Invoice Reminder Agent",
    plainGoal: "Find overdue invoices and prepare payment reminder work.",
    runMode: "approval_required",
    cadenceKey: "daily",
    plainName: "Collect money"
  },
  {
    agentKey: "estimator_agent",
    agentName: "AI Estimator",
    plainGoal: "Read job notes and measurements, prepare material takeoffs, flag missing scope, and build reviewed bid drafts.",
    runMode: "approval_required",
    cadenceKey: "daily",
    plainName: "Build bids"
  },
  {
    agentKey: "seo_marketing_agent",
    agentName: "AI Marketing Department",
    plainGoal: "Recommend campaigns and prepare useful marketing drafts from services, areas, proof, reviews, capacity, stale leads, and lead sources.",
    runMode: "draft_only",
    cadenceKey: "weekly",
    plainName: "Create demand"
  },
  {
    agentKey: "authority_manager",
    agentName: "Authority Manager",
    plainGoal: "Turn completed jobs, proof, reviews, and customer questions into review-ready authority assets.",
    runMode: "approval_required",
    cadenceKey: "daily",
    plainName: "Build trust"
  }
];

const agentRequiredFeatures: Record<string, string[]> = {
  lead_response_agent: ["ai_generation", "follow_up_recovery"],
  follow_up_agent: ["follow_up_recovery"],
  customer_lifecycle_agent: ["follow_up_recovery", "review_requests"],
  dispatcher_agent: ["ai_office_manager"],
  review_agent: ["review_requests"],
  invoice_reminder_agent: ["payment_collection"],
  estimator_agent: ["ai_estimator_takeoff"],
  seo_marketing_agent: ["seo_autopilot"],
  authority_manager: ["authority_engine"]
};

function nextRunSql(cadenceKey: string) {
  if (cadenceKey === "every_15_min") return "now() + interval '15 minutes'";
  if (cadenceKey === "hourly") return "now() + interval '1 hour'";
  if (cadenceKey === "daily") return "now() + interval '1 day'";
  if (cadenceKey === "weekly") return "now() + interval '1 week'";
  return "null";
}

function runModeLabel(mode: string) {
  if (mode === "draft_only") return "draft only";
  if (mode === "auto_allowed") return "auto allowed";
  return "approval required";
}

export async function ensureDefaultAgentWorkflows(tenantId: string) {
  for (const workflow of defaultWorkflows) {
    await queryPostgres(
      `
      insert into public.ai_agent_workflows (
        tenant_id, agent_key, agent_name, plain_goal, status, run_mode, cadence_key,
        trigger_json, output_policy_json, next_run_at, metadata_json
      )
      values (
        $1, $2, $3, $4, 'active', $5, $6,
        $7::jsonb, $8::jsonb, now(), $9::jsonb
      )
      on conflict (tenant_id, agent_key) do nothing
      `,
      [
        tenantId,
        workflow.agentKey,
        workflow.agentName,
        workflow.plainGoal,
        workflow.runMode,
        workflow.cadenceKey,
        JSON.stringify({ defaultTrigger: true }),
        JSON.stringify({ liveCustomerSends: false, livePublishing: false, mode: workflow.runMode }),
        JSON.stringify({ plainName: workflow.plainName })
      ]
    );
  }
}

export async function getAgentWorkflowDashboard(): Promise<AgentWorkflowDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  await ensureDefaultAgentWorkflows(tenantId);

  const [workflowResult, runResult, outputResult] = await Promise.all([
    queryPostgres<{
      id: string;
      agent_key: string;
      agent_name: string;
      plain_goal: string;
      status: string;
      run_mode: string;
      cadence_key: string;
      last_run_at: string | null;
      next_run_at: string | null;
      last_run_status: string | null;
      metadata_json: Record<string, unknown> | null;
      open_outputs: string;
    }>(
      `
      select
        w.id, w.agent_key, w.agent_name, w.plain_goal, w.status, w.run_mode, w.cadence_key,
        w.last_run_at, w.next_run_at, w.last_run_status, w.metadata_json,
        (
          select count(*)
          from public.ai_agent_outputs o
          where o.tenant_id = w.tenant_id
            and o.workflow_id = w.id
            and o.status in ('needs_review', 'blocked')
        )::text as open_outputs
      from public.ai_agent_workflows w
      where w.tenant_id = $1 and w.status <> 'archived'
      order by
        case w.agent_key
          when 'lead_response_agent' then 1
          when 'follow_up_agent' then 2
          when 'customer_lifecycle_agent' then 3
          when 'dispatcher_agent' then 4
          when 'review_agent' then 5
          when 'invoice_reminder_agent' then 6
          when 'estimator_agent' then 7
          when 'seo_marketing_agent' then 8
          when 'authority_manager' then 9
          else 99
        end
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      agent_key: string;
      status: string;
      summary: string | null;
      started_at: string;
      completed_at: string | null;
      outputs_prepared: string;
      outputs_sent: string;
      outputs_blocked: string;
    }>(
      `
      select
        r.id, r.agent_key, r.status, r.summary, r.started_at, r.completed_at,
        count(o.id) filter (where o.status in ('prepared', 'needs_review'))::text as outputs_prepared,
        count(o.id) filter (where o.status = 'sent')::text as outputs_sent,
        count(o.id) filter (where o.status in ('blocked', 'failed', 'skipped'))::text as outputs_blocked
      from public.ai_agent_runs r
      left join public.ai_agent_outputs o on o.run_id = r.id
      where r.tenant_id = $1
      group by r.id
      order by r.started_at desc
      limit 12
      `,
      [tenantId]
    ),
    queryPostgres<{
      id: string;
      agent_key: string;
      output_type: string;
      title: string;
      status: string;
      target_type: string | null;
      target_id: string | null;
      created_at: string;
    }>(
      `
      select id, agent_key, output_type, title, status, target_type, target_id, created_at
      from public.ai_agent_outputs
      where tenant_id = $1
      order by created_at desc
      limit 20
      `,
      [tenantId]
    )
  ]);

  const workflows = workflowResult?.rows ?? [];

  return {
    tableReady: Boolean(workflowResult),
    workflows: workflows.map((row) => ({
      id: row.id,
      agentKey: row.agent_key,
      agentName: row.agent_name,
      plainGoal: row.plain_goal,
      status: row.status,
      runMode: row.run_mode,
      cadenceKey: row.cadence_key,
      lastRunAt: row.last_run_at,
      nextRunAt: row.next_run_at,
      lastRunStatus: row.last_run_status,
      metadata: row.metadata_json ?? {},
      tone: typeof row.metadata_json?.tone === "string" ? row.metadata_json.tone : "Clear, practical, helpful, and professional",
      customInstructions: typeof row.metadata_json?.customInstructions === "string" ? row.metadata_json.customInstructions : "",
      knowledgeFocus: typeof row.metadata_json?.knowledgeFocus === "string" ? row.metadata_json.knowledgeFocus : "Use the Business Brain, current records, approved SOPs, and industry knowledge.",
      escalationRules: typeof row.metadata_json?.escalationRules === "string" ? row.metadata_json.escalationRules : "Escalate low-confidence, legal, safety, angry-customer, unusual pricing, and money-movement decisions.",
      successMeasures: typeof row.metadata_json?.successMeasures === "string" ? row.metadata_json.successMeasures : "Complete useful work accurately, avoid duplicate actions, and surface exceptions promptly.",
      enabledChannels: Array.isArray(row.metadata_json?.enabledChannels) ? row.metadata_json.enabledChannels.map(String) : ["in_app"],
      authoritySummary: typeof row.metadata_json?.authoritySummary === "string" ? row.metadata_json.authoritySummary : "Prepare work under the selected approval mode. Never bypass provider, consent, spending, or safety controls.",
      openOutputs: Number(row.open_outputs ?? 0)
    })),
    runs: (runResult?.rows ?? []).map((row) => ({
      id: row.id,
      agentKey: row.agent_key,
      status: row.status,
      summary: row.summary,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      outputsPrepared: Number(row.outputs_prepared ?? 0),
      outputsSent: Number(row.outputs_sent ?? 0),
      outputsBlocked: Number(row.outputs_blocked ?? 0)
    })),
    outputs: (outputResult?.rows ?? []).map((row) => ({
      id: row.id,
      agentKey: row.agent_key,
      outputType: row.output_type,
      title: row.title,
      status: row.status,
      targetType: row.target_type,
      targetId: row.target_id,
      createdAt: row.created_at
    }))
  };
}

async function createRun(tenantId: string, workflowId: string, agentKey: string, source = "manual_run_now") {
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.ai_agent_runs (tenant_id, workflow_id, agent_key, status, input_json)
    select $1, $2, $3, 'running', $4::jsonb
    where not exists (
      select 1 from public.ai_agent_runs
      where workflow_id = $2 and status in ('queued', 'running')
    )
    on conflict do nothing
    returning id
    `,
    [tenantId, workflowId, agentKey, JSON.stringify({ source })]
  );
  return result?.rows[0]?.id ?? null;
}

export async function expireStaleAgentRuns(tenantId?: string | null) {
  const result = await queryPostgres<{ workflow_id: string }>(
    `
    with stale as (
      update public.ai_agent_runs
      set status = 'failed',
          summary = coalesce(summary, 'Agent run expired before completion.'),
          error_message = coalesce(error_message, 'stale_run_timeout'),
          completed_at = now(),
          metadata_json = metadata_json || jsonb_build_object('expiredBy', 'stale_run_reaper', 'expiredAt', now())
      where status in ('queued', 'running')
        and started_at < now() - interval '30 minutes'
        and ($1::uuid is null or tenant_id = $1)
      returning workflow_id, tenant_id
    ), affected as (
      select distinct workflow_id, tenant_id from stale where workflow_id is not null
    )
    update public.ai_agent_workflows w
    set last_run_at = now(), last_run_status = 'failed', updated_at = now()
    from affected a
    where w.id = a.workflow_id and w.tenant_id = a.tenant_id
    returning w.id as workflow_id
    `,
    [tenantId ?? null]
  );
  return result?.rows.length ?? 0;
}

async function finishRun(input: {
  tenantId: string;
  workflowId: string;
  agentKey: string;
  runId: string;
  status: "completed" | "failed";
  summary: string;
  output: Record<string, unknown>;
  error?: string | null;
}) {
  await queryPostgres(
    `
    update public.ai_agent_runs
    set status = $3,
        summary = $4,
        output_json = $5::jsonb,
        error_message = $6,
        completed_at = now()
    where tenant_id = $1 and id = $2
    `,
    [input.tenantId, input.runId, input.status, input.summary, JSON.stringify(input.output), input.error ?? null]
  );

  await queryPostgres(
    `
    update public.ai_agent_workflows
    set last_run_at = now(),
        next_run_at = ${nextRunSql(input.output.cadenceKey as string)},
        last_run_status = $4,
        updated_at = now()
    where tenant_id = $1 and id = $2 and agent_key = $3
    `,
    [input.tenantId, input.workflowId, input.agentKey, input.status]
  );
}

async function recordOutput(input: {
  tenantId: string;
  workflowId: string;
  runId: string;
  agentKey: string;
  outputType: string;
  title: string;
  status?: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.ai_agent_outputs (
      tenant_id, run_id, workflow_id, agent_key, output_type, title, status, target_type, target_id, metadata_json
    )
    select $1, $2, $3, $4, $5, $6,
      case
        when w.run_mode = 'auto_allowed' and $7::text in ('prepared', 'needs_review') then 'prepared'
        else $7::text
      end,
      $8, $9,
      $10::jsonb || jsonb_build_object(
        'runMode', w.run_mode,
        'reviewOptional', w.run_mode = 'auto_allowed' and $7::text in ('prepared', 'needs_review')
      )
    from public.ai_agent_workflows w
    where w.tenant_id = $1 and w.id = $3
    `,
    [
      input.tenantId,
      input.runId,
      input.workflowId,
      input.agentKey,
      input.outputType,
      input.title,
      input.status ?? "prepared",
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}

async function logAgentTimeline(input: {
  tenantId: string;
  agentKey: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  await queryPostgres(
    `
    insert into public.operator_timeline_events (tenant_id, event_family, event_type, title, body, metadata_json)
    values ($1, 'ai', 'ai_agent_workflow_run', $2, $3, $4::jsonb)
    `,
    [input.tenantId, input.title, input.body, JSON.stringify({ agentKey: input.agentKey, ...(input.metadata ?? {}) })]
  );
}

async function getOwnerEmails(tenantId: string) {
  const result = await queryPostgres<{ email: string }>(
    `
    select email from (
      select ws.default_report_email as email, 1 as sort_order
      from public.workspace_settings ws
      where ws.tenant_id = $1 and ws.default_report_email is not null and ws.default_report_email <> ''
      union
      select u.email, 2 as sort_order
      from public.tenant_users tu
      join public.users u on u.id = tu.user_id
      where tu.tenant_id = $1
        and tu.status = 'active'
        and tu.role in ('owner', 'admin')
      union
      select b.email, 3 as sort_order
      from public.brands b
      where b.tenant_id = $1 and b.status = 'active' and b.email is not null and b.email <> ''
    ) emails
    where email like '%@%'
    order by sort_order
    limit 3
    `,
    [tenantId]
  );
  return [...new Set((result?.rows ?? []).map((row) => row.email.trim().toLowerCase()).filter(Boolean))];
}

async function runLeadResponseAgent(tenantId: string, workflowId: string, runId: string) {
  const leads = await queryPostgres<{
    id: string;
    brand_id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    created_at: string;
  }>(
    `
    select l.id, l.brand_id, l.name, l.email, l.phone, l.source, l.created_at
    from public.leads l
    where l.tenant_id = $1
      and l.status in ('new', 'qualified')
      and not exists (
        select 1
        from public.communication_messages m
        join public.communication_threads t on t.id = m.thread_id
        where t.lead_id = l.id
          and m.direction in ('draft', 'outbound')
          and m.visibility = 'customer_visible'
      )
    order by l.created_at desc
    limit 10
    `,
    [tenantId]
  );

  const rows = leads?.rows ?? [];
  for (const lead of rows) {
    const thread = await queryPostgres<{ id: string }>(
      `
      insert into public.communication_threads (tenant_id, brand_id, lead_id, subject, channel, status, unanswered_since, metadata_json)
      values ($1, $2, $3, $4, case when $5::text is not null then 'sms' when $6::text is not null then 'email' else 'manual' end, 'open', now(), $7::jsonb)
      on conflict do nothing
      returning id
      `,
      [
        tenantId,
        lead.brand_id,
        lead.id,
        `Lead: ${lead.name ?? lead.email ?? lead.phone ?? "New lead"}`,
        lead.phone,
        lead.email,
        JSON.stringify({ createdByAgent: "lead_response_agent" })
      ]
    );
    const threadId = thread?.rows[0]?.id;
    if (!threadId) continue;

    const body = `Hi ${lead.name || "there"}, thanks for reaching out. We saw your request and can help. What is the best time for a quick follow-up?`;
    const message = await queryPostgres<{ id: string }>(
      `
      insert into public.communication_messages (
        tenant_id, brand_id, thread_id, direction, channel, visibility, recipient_label, body, status, ai_generated, metadata_json
      )
      values ($1, $2, $3, 'draft',
        case when $4::text is not null then 'sms' when $5::text is not null then 'email' else 'manual' end,
        'customer_visible', coalesce($4, $5), $6, 'draft', true, $7::jsonb
      )
      returning id
      `,
      [
        tenantId,
        lead.brand_id,
        threadId,
        lead.phone,
        lead.email,
        body,
        JSON.stringify({ createdByAgent: "lead_response_agent", liveSendRequiresApproval: true })
      ]
    );
    const messageId = message?.rows[0]?.id;
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "lead_response_agent",
      outputType: "draft_message",
      title: `Drafted first response for ${lead.name ?? lead.email ?? lead.phone ?? "new lead"}`,
      status: "needs_review",
      targetType: "communication_message",
      targetId: messageId,
      metadata: { leadId: lead.id, liveCustomerSend: false }
    });
  }

  const ownerEmails = await getOwnerEmails(tenantId);
  let ownerEmailSent = 0;
  if (rows.length && ownerEmails.length) {
    const text = [
      `Ferocity found ${rows.length} new lead(s) that need attention.`,
      "",
      ...rows.slice(0, 5).map((lead) => `- ${lead.name ?? "Unnamed lead"} / ${lead.email ?? lead.phone ?? "no contact"} / ${lead.source ?? "unknown source"}`),
      "",
      "Customer-facing replies were prepared as drafts and still need review before sending."
    ].join("\n");
    for (const to of ownerEmails) {
      const result = await sendTransactionalEmail({
        to,
        subject: `Ferocity: ${rows.length} lead(s) need a reply`,
        text,
        tenantId,
        eventKey: "lead_response_agent_owner_notice",
        metadata: { agentKey: "lead_response_agent", leadCount: rows.length }
      });
      await recordOutput({
        tenantId,
        workflowId,
        runId,
        agentKey: "lead_response_agent",
        outputType: "internal_email",
        title: result.ok ? `Sent owner lead alert to ${to}` : `Owner lead alert skipped for ${to}`,
        status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
        metadata: { to, result }
      });
      if (result.ok) ownerEmailSent += 1;
    }
  }

  return {
    preparedCount: rows.length,
    ownerEmailSent,
    summary: rows.length
      ? `Prepared ${rows.length} lead response draft(s) and sent ${ownerEmailSent} owner notification email(s).`
      : "No new leads needed first-response drafts."
  };
}

async function runFollowUpAgent(tenantId: string, workflowId: string, runId: string) {
  const result = await queryPostgres<{ id: string; lead_label: string | null }>(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select l.tenant_id, l.brand_id, l.id, 'stale_lead_recovery', 'manual', 'open', now(),
      'This lead is aging. Review the history, then call or send an approved follow-up.',
      jsonb_build_object('createdByAgent', 'follow_up_agent', 'liveCustomerSend', false)
    from public.leads l
    where l.tenant_id = $1
      and l.status in ('new', 'qualified')
      and l.created_at < now() - interval '1 day'
      and not exists (
        select 1 from public.follow_up_workflows f
        where f.tenant_id = l.tenant_id
          and f.lead_id = l.id
          and f.workflow_type = 'stale_lead_recovery'
          and f.status in ('open', 'scheduled')
      )
    order by l.created_at asc
    limit 20
    returning id, lead_id::text as lead_label
    `,
    [tenantId]
  );
  const rows = result?.rows ?? [];
  for (const row of rows) {
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "follow_up_agent",
      outputType: "follow_up_workflow",
      title: "Created stale lead follow-up task",
      status: "needs_review",
      targetType: "follow_up_workflow",
      targetId: row.id
    });
  }
  return {
    preparedCount: rows.length,
    summary: rows.length ? `Created ${rows.length} stale lead follow-up task(s).` : "No stale lead follow-up tasks were needed."
  };
}

async function runCustomerLifecycleAgent(tenantId: string, workflowId: string, runId: string) {
  const result = await syncCustomerLifecycleForTenant(tenantId);
  const preparedCount = Object.values(result).reduce((sum, value) => sum + value, 0);
  await recordOutput({
    tenantId,
    workflowId,
    runId,
    agentKey: "customer_lifecycle_agent",
    outputType: "follow_up_workflow",
    title: preparedCount
      ? `Prepared ${preparedCount} customer lifecycle action(s)`
      : "Customer lifecycle is caught up",
    status: preparedCount ? "needs_review" : "prepared",
    metadata: result
  });
  return {
    preparedCount,
    summary: preparedCount
      ? `Prepared ${preparedCount} guarded lifecycle action(s) across missed calls, estimates, nurturing, reactivation, referrals, and past-customer growth.`
      : "No customer lifecycle action was due."
  };
}

async function runDispatcherAgent(tenantId: string, workflowId: string, runId: string) {
  const visitsResult = await queryPostgres<{
    id: string;
    title: string;
    status: string;
    scheduled_start: string | null;
    customer_name: string;
    assigned_workers: string;
  }>(
    `
    select
      v.id, v.title, v.status, v.scheduled_start, c.name as customer_name,
      count(distinct va.worker_id) filter (
        where va.worker_id is not null
          and va.status in ('proposed','assigned','acknowledged','dispatched')
      )::text as assigned_workers
    from public.service_visits v
    join public.customers c on c.id = v.customer_id and c.tenant_id = v.tenant_id
    left join public.service_visit_assignments va
      on va.visit_id = v.id and va.tenant_id = v.tenant_id
    where v.tenant_id = $1
      and v.status not in ('completed','canceled','no_show')
      and (
        v.status = 'unscheduled'
        or v.scheduled_start < now() + interval '30 days'
        or v.status in ('dispatched','en_route','arrived','in_progress','paused')
      )
    group by v.id, c.name
    order by v.scheduled_start nulls first, v.priority desc, v.created_at
    limit 300
    `,
    [tenantId]
  );

  let blocking = 0;
  let warnings = 0;
  let unassigned = 0;
  const urgentOutputs: Array<{
    id: string;
    title: string;
    customerName: string;
    status: string;
    scheduledStart: string | null;
    conflicts: Awaited<ReturnType<typeof evaluateVisitSchedule>>;
  }> = [];

  for (const visit of visitsResult?.rows ?? []) {
    const conflicts = await evaluateVisitSchedule({ tenantId, visitId: visit.id });
    const visitBlocking = conflicts.filter((conflict) => conflict.severity === "blocking").length;
    const visitWarnings = conflicts.filter((conflict) => conflict.severity === "warning").length;
    blocking += visitBlocking;
    warnings += visitWarnings;
    if (Number(visit.assigned_workers) === 0) unassigned += 1;
    if (visitBlocking > 0 || visit.status === "unscheduled") {
      urgentOutputs.push({
        id: visit.id,
        title: visit.title,
        customerName: visit.customer_name,
        status: visit.status,
        scheduledStart: visit.scheduled_start,
        conflicts
      });
    }
  }

  for (const visit of urgentOutputs.slice(0, 30)) {
    const conflictTitles = visit.conflicts.map((conflict) => conflict.title);
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "dispatcher_agent",
      outputType: visit.status === "unscheduled" ? "schedule_needed" : "dispatch_risk",
      title:
        visit.status === "unscheduled"
          ? `Schedule ${visit.title} for ${visit.customerName}`
          : `Resolve dispatch risk for ${visit.title}`,
      status: "needs_review",
      targetType: "service_visit",
      targetId: visit.id,
      metadata: {
        href: `/app/schedule#visit-${visit.id}`,
        visitStatus: visit.status,
        scheduledStart: visit.scheduledStart,
        conflicts: visit.conflicts,
        nextAction:
          conflictTitles.length > 0
            ? `Resolve: ${conflictTitles.join("; ")}`
            : "Choose a time and eligible worker."
      }
    });
  }

  const checked = visitsResult?.rows.length ?? 0;
  const summary = checked
    ? `AI Dispatcher checked ${checked} visit(s): ${blocking} blocking conflict(s), ${warnings} warning(s), and ${unassigned} unassigned visit(s).`
    : "AI Dispatcher found no open visits to review.";

  await logAgentTimeline({
    tenantId,
    agentKey: "dispatcher_agent",
    title: "AI Dispatcher checked the field day",
    body: summary,
    metadata: { checked, blocking, warnings, unassigned, reviewItems: urgentOutputs.length }
  });

  return {
    summary,
    checked,
    prepared: urgentOutputs.length,
    blocking,
    warnings,
    unassigned
  };
}

async function runReviewAgent(tenantId: string, workflowId: string, runId: string) {
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.review_request_workflows (
      tenant_id, brand_id, customer_id, lead_id, job_id, trigger_event, channel, status,
      scheduled_for, negative_interception_status, ai_response_draft, metadata_json
    )
    select j.tenant_id, j.brand_id, j.customer_id, j.source_lead_id, j.id, 'job_completed', 'sms', 'draft',
      now() + interval '1 day', 'not_applicable',
      'Thanks again for choosing us. If everything looks good, we would really appreciate a quick review.',
      jsonb_build_object('createdByAgent', 'review_agent', 'liveCustomerSend', false)
    from public.service_jobs j
    where j.tenant_id = $1
      and j.status = 'completed'
      and not exists (
        select 1 from public.review_request_workflows r
        where r.tenant_id = j.tenant_id and r.job_id = j.id
      )
    order by j.updated_at desc
    limit 20
    returning id
    `,
    [tenantId]
  );
  const rows = result?.rows ?? [];
  for (const row of rows) {
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "review_agent",
      outputType: "review_workflow",
      title: "Prepared review request workflow after completed job",
      status: "needs_review",
      targetType: "review_request_workflow",
      targetId: row.id
    });
  }
  return {
    preparedCount: rows.length,
    summary: rows.length ? `Prepared ${rows.length} review request workflow(s).` : "No completed jobs needed review workflows."
  };
}

async function runInvoiceReminderAgent(tenantId: string, workflowId: string, runId: string) {
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.follow_up_workflows (
      tenant_id, brand_id, lead_id, customer_id, estimate_id, invoice_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select i.tenant_id, i.brand_id, j.source_lead_id, i.customer_id, i.estimate_id, i.id,
      'invoice_followup', 'email', 'open', now(),
      concat(
        'Hi ', c.name, ', this is a friendly reminder that ', i.title, ' has a balance of $',
        to_char(greatest(i.total_cents - i.amount_paid_cents, 0) / 100.0, 'FM999999990.00'),
        case
          when i.due_date is null then ' due upon receipt.'
          when i.due_date < current_date then concat(' and was due ', to_char(i.due_date, 'Mon FMDD, YYYY'), '.')
          when i.due_date = current_date then ' and is due today.'
          else concat(' and is due ', to_char(i.due_date, 'Mon FMDD, YYYY'), '.')
        end,
        case when payment.payment_url is not null then concat(' Pay securely: ', payment.payment_url) else '' end,
        ' If you already paid, please disregard this reminder or reply so we can confirm it.'
      ),
      jsonb_build_object(
        'createdByAgent', 'invoice_reminder_agent',
        'invoiceId', i.id,
        'liveCustomerSend', coalesce(policy.status = 'live' and policy.requires_human_approval = false, false),
        'paymentUrlIncluded', payment.payment_url is not null,
        'reminderCadenceDays', 3
      )
    from public.service_invoices i
    left join public.service_jobs j on j.id = i.job_id
    join public.customers c on c.id = i.customer_id and c.tenant_id = i.tenant_id
    left join lateral (
      select l.payment_url
      from public.service_invoice_payment_links l
      where l.tenant_id=i.tenant_id and l.invoice_id=i.id
        and l.status in ('ready','sent') and l.payment_url is not null
      order by l.created_at desc limit 1
    ) payment on true
    left join public.live_action_policies policy on policy.tenant_id=i.tenant_id and policy.action_key='email_send'
    where i.tenant_id = $1
      and i.status in ('sent_manually', 'partially_paid', 'overdue')
      and greatest(i.total_cents - i.amount_paid_cents, 0) > 0
      and coalesce(i.due_date, current_date) <= current_date + 3
      and c.email is not null
      and not exists (
        select 1
        from public.follow_up_workflows f
        where f.tenant_id = i.tenant_id
          and f.workflow_type = 'invoice_followup'
          and f.metadata_json->>'invoiceId' = i.id::text
          and (f.status in ('open', 'scheduled') or f.created_at >= now() - interval '3 days')
      )
    order by i.due_date asc nulls first
    limit 20
    returning id
    `,
    [tenantId]
  );
  const rows = result?.rows ?? [];
  for (const row of rows) {
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "invoice_reminder_agent",
      outputType: "invoice_followup",
      title: "Prepared invoice follow-up task",
      status: "needs_review",
      targetType: "follow_up_workflow",
      targetId: row.id
    });
  }
  return {
    preparedCount: rows.length,
    summary: rows.length ? `Prepared ${rows.length} invoice follow-up task(s).` : "No invoices needed reminder tasks."
  };
}

async function runSeoMarketingAgent(tenantId: string, workflowId: string, runId: string) {
  const brandSignals = await queryPostgres<{
    brand_id: string;
    brand_name: string;
    service_name: string | null;
    area_name: string | null;
    completed_jobs: string;
    open_jobs: string;
    stale_leads: string;
    proof_assets: string;
  }>(
    `
    select
      b.id as brand_id,
      b.name as brand_name,
      s.name as service_name,
      coalesce(l.service_area_name, l.city, b.primary_location) as area_name,
      (select count(*) from public.service_jobs j where j.tenant_id = b.tenant_id and j.brand_id = b.id and j.status = 'completed')::text as completed_jobs,
      (select count(*) from public.service_jobs j where j.tenant_id = b.tenant_id and j.brand_id = b.id and j.status in ('scheduled','in_progress'))::text as open_jobs,
      (select count(*) from public.leads lead where lead.tenant_id = b.tenant_id and lead.brand_id = b.id and lead.status in ('new','qualified') and lead.created_at < now() - interval '1 day')::text as stale_leads,
      (select count(*) from public.marketing_media_assets a where a.tenant_id = b.tenant_id and a.brand_id = b.id and a.status <> 'archived')::text as proof_assets
    from public.brands b
    left join lateral (
      select name from public.brand_services s
      where s.brand_id = b.id and s.active = true
      order by s.priority desc, s.created_at asc
      limit 1
    ) s on true
    left join lateral (
      select service_area_name, city from public.brand_locations l
      where l.brand_id = b.id and l.active = true
      order by l.priority desc, l.created_at asc
      limit 1
    ) l on true
    where b.tenant_id = $1 and b.status = 'active'
    order by b.created_at asc
    limit 5
    `,
    [tenantId]
  );
  const signals = brandSignals?.rows ?? [];

  for (const signal of signals) {
    const sourceSignals = {
      completedJobs: Number(signal.completed_jobs),
      openJobs: Number(signal.open_jobs),
      staleLeads: Number(signal.stale_leads),
      proofAssets: Number(signal.proof_assets),
      serviceName: signal.service_name,
      areaName: signal.area_name
    };
    const recommendationKey = sourceSignals.staleLeads > 0
      ? "reactivate_stale_leads"
      : sourceSignals.completedJobs > 0 || sourceSignals.proofAssets > 0
        ? "completed_job_proof_machine"
        : "fill_open_schedule";
    const title = recommendationKey === "reactivate_stale_leads"
      ? "Recover stale leads before they disappear"
      : recommendationKey === "completed_job_proof_machine"
        ? "Turn completed jobs into proof and reviews"
        : "Fill open schedule with profitable work";
    const recommendedOutputs = recommendationKey === "reactivate_stale_leads"
      ? ["follow-up email", "call list", "reply script"]
      : recommendationKey === "completed_job_proof_machine"
        ? ["review request", "GBP post", "before/after social post", "case study"]
        : ["Facebook post", "GBP post", "landing page", "Google ad copy"];

    const recommendation = await queryPostgres<{ id: string }>(
      `
      insert into public.marketing_campaign_recommendations (
        tenant_id, brand_id, recommendation_key, title, trigger_reason, primary_goal,
        recommended_channels, recommended_outputs_json, expected_impact, difficulty, priority_score,
        source_signals_json, metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12::jsonb, $13::jsonb)
      on conflict (tenant_id, brand_id, recommendation_key) do update set
        title = excluded.title,
        trigger_reason = excluded.trigger_reason,
        primary_goal = excluded.primary_goal,
        recommended_channels = excluded.recommended_channels,
        recommended_outputs_json = excluded.recommended_outputs_json,
        expected_impact = excluded.expected_impact,
        difficulty = excluded.difficulty,
        priority_score = excluded.priority_score,
        source_signals_json = excluded.source_signals_json,
        metadata_json = public.marketing_campaign_recommendations.metadata_json || excluded.metadata_json,
        status = case when public.marketing_campaign_recommendations.status in ('dismissed','paused') then public.marketing_campaign_recommendations.status else 'recommended' end,
        updated_at = now()
      returning id
      `,
      [
        tenantId,
        signal.brand_id,
        recommendationKey,
        title,
        `Based on current signals for ${signal.brand_name}: ${sourceSignals.staleLeads} stale leads, ${sourceSignals.completedJobs} completed jobs, ${sourceSignals.proofAssets} proof assets, ${sourceSignals.openJobs} open jobs.`,
        recommendationKey === "reactivate_stale_leads" ? "Recover already-earned opportunities." : recommendationKey === "completed_job_proof_machine" ? "Turn real work into trust and demand." : "Create demand for open capacity.",
        recommendationKey === "reactivate_stale_leads" ? ["email", "manual call", "approved text draft"] : ["Google Business Profile", "Facebook", "website", "email"],
        JSON.stringify(recommendedOutputs),
        recommendationKey === "reactivate_stale_leads" ? "Recovered conversations and booked work." : "More trust, stronger conversion, and more qualified demand.",
        recommendationKey === "completed_job_proof_machine" ? "low" : "medium",
        recommendationKey === "reactivate_stale_leads" && sourceSignals.staleLeads > 0 ? 88 : recommendationKey === "completed_job_proof_machine" ? 84 : 76,
        JSON.stringify(sourceSignals),
        JSON.stringify({ createdByAgent: "seo_marketing_agent", noLivePublishing: true })
      ]
    );
    const recommendationId = recommendation?.rows[0]?.id;
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "seo_marketing_agent",
      outputType: "campaign_recommendation",
      title: `Recommended campaign: ${title}`,
      status: "needs_review",
      targetType: "marketing_campaign_recommendation",
      targetId: recommendationId,
      metadata: { sourceSignals, noLivePublishing: true }
    });

    const campaign = await queryPostgres<{ id: string }>(
      `
      insert into public.content_studio_campaigns (
        tenant_id, brand_id, campaign_key, prompt, campaign_name, goal, status, mode, approval_required, metadata_json
      )
      values ($1, $2, 'ai_marketing_department_check', $3, $4, $5, 'needs_review', 'simple', true, $6::jsonb)
      returning id
      `,
      [
        tenantId,
        signal.brand_id,
        `${title}. Service: ${signal.service_name ?? "main service"}. Area: ${signal.area_name ?? "primary market"}. Build review-first creative variants, a landing page, ad copy, and a video script.`,
        title,
        recommendationKey === "reactivate_stale_leads" ? "Recover stale leads" : recommendationKey === "completed_job_proof_machine" ? "Turn proof into demand" : "Fill open schedule",
        JSON.stringify({ createdByAgent: "seo_marketing_agent", recommendationId, sourceSignals, noLivePublishing: true })
      ]
    );
    const campaignId = campaign?.rows[0]?.id;
    if (campaignId) {
      const landing = await queryPostgres<{ id: string }>(
        `
        insert into public.content_studio_outputs (
          tenant_id, brand_id, campaign_id, output_type, platform, title, body, status, risk_level, metadata_json
        )
        values
          ($1, $2, $3, 'landing_page', 'website', $4, $5, 'needs_review', 'medium', $6::jsonb),
          ($1, $2, $3, 'image_ad', 'meta', $7, $8, 'needs_review', 'medium', $6::jsonb),
          ($1, $2, $3, 'short_video_script', 'video', $9, $10, 'needs_review', 'medium', $6::jsonb)
        returning id
        `,
        [
          tenantId,
          signal.brand_id,
          campaignId,
          `${title} landing page`,
          `Draft a focused page for ${signal.service_name ?? "the main service"}${signal.area_name ? ` in ${signal.area_name}` : ""}. Use real proof, clear CTA, source tracking, and review before publishing.`,
          JSON.stringify({ createdByAgent: "seo_marketing_agent", noLivePublishing: true, recommendationId }),
          `${title} static ad`,
          "Create a simple image ad concept using one hook, one proof point, one offer, and one CTA.",
          `${title} video script`,
          "Create a short UGC-style video script with hook, proof, offer, CTA, and safe claims."
        ]
      );
      const landingId = landing?.rows[0]?.id ?? null;
      const experiment = await queryPostgres<{ id: string }>(
        `
        insert into public.marketing_ad_experiments (
          tenant_id, brand_id, campaign_id, experiment_name, objective, platforms, budget_mode,
          status, landing_page_output_id, creative_count, launch_checklist_json, metadata_json
        )
        values ($1, $2, $3, $4, 'book_more_work', $5, 'manual_export', 'needs_review', $6, 3, $7::jsonb, $8::jsonb)
        returning id
        `,
        [
          tenantId,
          signal.brand_id,
          campaignId,
          `${title} launch kit`,
          recommendationKey === "reactivate_stale_leads" ? ["email", "manual"] : ["facebook", "google", "website"],
          landingId,
          JSON.stringify(["Approve offer and claims.", "Connect or export to customer-owned ad account.", "Track campaign source through lead, job, invoice, and revenue."]),
          JSON.stringify({ createdByAgent: "seo_marketing_agent", recommendationId, noLiveSpend: true })
        ]
      );
      const experimentId = experiment?.rows[0]?.id;
      for (const [angleIndex, angle] of ["Proof", "Offer", "Urgency"].entries()) {
        await queryPostgres(
          `
          insert into public.marketing_creative_variants (
            tenant_id, brand_id, campaign_id, experiment_id, platform, format, hook, angle, audience, cta, status, predicted_score, metadata_json
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Request a quote', 'needs_review', $10, $11::jsonb)
          `,
          [
            tenantId,
            signal.brand_id,
            campaignId,
            experimentId,
            angleIndex === 0 ? "facebook" : angleIndex === 1 ? "google" : "website",
            angleIndex === 1 ? "search_ad" : "static_ad",
            angle === "Proof" ? "Real work creates the next customer." : angle === "Offer" ? "Clear next step, no guessing." : "Open schedule should become booked work.",
            angle,
            signal.area_name,
            78 - angleIndex * 4,
            JSON.stringify({ createdByAgent: "seo_marketing_agent", noProviderSubmitted: true })
          ]
        );
      }
      await recordOutput({
        tenantId,
        workflowId,
        runId,
        agentKey: "seo_marketing_agent",
        outputType: "ad_launch_kit",
        title: `Prepared launch kit: ${title}`,
        status: "needs_review",
        targetType: "marketing_ad_experiment",
        targetId: experimentId,
        metadata: { campaignId, recommendationId, noLiveSpend: true }
      });
    }
  }

  const result = await queryPostgres<{ id: string; title: string }>(
    `
    insert into public.ai_drafts (tenant_id, brand_id, content_type, title, body, status, risk_level, metadata_json)
    select b.tenant_id, b.id, 'service_page',
      coalesce(s.name, 'Main service') || ' in ' || coalesce(l.service_area_name, l.city, b.primary_location, 'your service area'),
      'Draft useful local service content from real services, service areas, customer proof, reviews, and lead source data. Add real photos, job details, proof, and approval before publishing.',
      'draft',
      'medium',
      jsonb_build_object('createdByAgent', 'seo_marketing_agent', 'draftOnly', true, 'thinSeoAvoidance', true)
    from public.brands b
    left join lateral (
      select name from public.brand_services s
      where s.brand_id = b.id and s.active = true
      order by s.priority desc, s.created_at asc
      limit 1
    ) s on true
    left join lateral (
      select service_area_name, city from public.brand_locations l
      where l.brand_id = b.id and l.active = true
      order by l.priority desc, l.created_at asc
      limit 1
    ) l on true
    where b.tenant_id = $1 and b.status = 'active'
      and not exists (
        select 1 from public.ai_drafts d
        where d.tenant_id = b.tenant_id
          and d.brand_id = b.id
          and d.metadata_json->>'createdByAgent' = 'seo_marketing_agent'
          and d.status in ('draft', 'needs_review')
      )
    order by b.created_at asc
    limit 5
    returning id, title
    `,
    [tenantId]
  );
  const rows = result?.rows ?? [];
  for (const row of rows) {
    await recordOutput({
      tenantId,
      workflowId,
      runId,
      agentKey: "seo_marketing_agent",
      outputType: "seo_draft",
      title: `Prepared SEO draft: ${row.title}`,
      status: "prepared",
      targetType: "ai_draft",
      targetId: row.id,
      metadata: { draftOnly: true }
    });
  }
  for (const signal of signals) {
    await queryPostgres(
      `
      insert into public.marketing_memory_items (
        tenant_id, brand_id, memory_type, title, summary, source_table, performance_json, score, status, metadata_json
      )
      values ($1, $2, 'campaign', $3, $4, 'ai_agent_runs', $5::jsonb, 60, 'learning', $6::jsonb)
      `,
      [
        tenantId,
        signal.brand_id,
        `Marketing signal: ${signal.service_name ?? "main service"}${signal.area_name ? ` in ${signal.area_name}` : ""}`,
        "Use business operations, proof, lead source, completed job, and capacity signals when planning marketing.",
        JSON.stringify({
          completedJobs: Number(signal.completed_jobs),
          staleLeads: Number(signal.stale_leads),
          proofAssets: Number(signal.proof_assets)
        }),
        JSON.stringify({ createdByAgent: "seo_marketing_agent", runId })
      ]
    );
  }
  return {
    preparedCount: rows.length + signals.length,
    summary: rows.length || signals.length
      ? `Prepared ${rows.length} SEO draft(s) and ${signals.length} marketing recommendation(s).`
      : "No new SEO or marketing work was needed."
  };
}

async function runAuthorityManagerAgent(tenantId: string, workflowId: string, runId: string) {
  const result = await queryPostgres<{
    completed_jobs: string;
    unprocessed_jobs: string;
    proof_items: string;
    approved_proof_items: string;
    open_gaps: string;
  }>(
    `
    select
      (select count(*) from public.service_jobs where tenant_id = $1 and status = 'completed')::text as completed_jobs,
      (
        select count(*)
        from public.service_jobs j
        where j.tenant_id = $1
          and j.status = 'completed'
          and not exists (
            select 1 from public.authority_content_bundles b
            where b.tenant_id = j.tenant_id and b.job_id = j.id and b.bundle_type = 'completed_job'
          )
      )::text as unprocessed_jobs,
      (select count(*) from public.ugc_submissions where tenant_id = $1)::text as proof_items,
      (select count(*) from public.ugc_submissions where tenant_id = $1 and status = 'approved')::text as approved_proof_items,
      (select count(*) from public.authority_content_gaps where tenant_id = $1 and status in ('open','planned','drafted'))::text as open_gaps
    `,
    [tenantId]
  );
  const row = result?.rows[0];
  const unprocessedJobs = Number(row?.unprocessed_jobs ?? 0);
  const proofItems = Number(row?.proof_items ?? 0);
  const openGaps = Number(row?.open_gaps ?? 0);

  if (unprocessedJobs > 0) {
    await queryPostgres(
      `
      insert into public.authority_events (
        tenant_id, event_type, status, priority, title, summary, recommended_action, metadata_json
      )
      values ($1, 'job_completed', 'open', 'high', 'Completed jobs need authority bundles', $2, $3, $4::jsonb)
      `,
      [
        tenantId,
        `${unprocessedJobs} completed jobs have not been turned into proof, review, content, and publishing work yet.`,
        "Open Authority Engine and process completed jobs.",
        JSON.stringify({ createdByAgent: "authority_manager", runId, unprocessedJobs })
      ]
    );
  }

  const title = unprocessedJobs > 0
    ? "Authority Manager found completed jobs to process"
    : "Authority Manager checked completed jobs";
  const summary = unprocessedJobs > 0
    ? `${unprocessedJobs} completed jobs need authority bundles. ${proofItems} proof items and ${openGaps} content gaps are currently tracked.`
    : `No unprocessed completed jobs found. ${proofItems} proof items and ${openGaps} content gaps are currently tracked.`;

  await recordOutput({
    tenantId,
    workflowId,
    runId,
    agentKey: "authority_manager",
    outputType: "authority_check",
    title,
    status: unprocessedJobs > 0 ? "needs_review" : "prepared",
    targetType: "authority_engine",
    targetId: null,
    metadata: {
      href: "/app/authority",
      completedJobs: Number(row?.completed_jobs ?? 0),
      unprocessedJobs,
      proofItems,
      approvedProofItems: Number(row?.approved_proof_items ?? 0),
      openGaps
    }
  });

  return {
    summary,
    checked: Number(row?.completed_jobs ?? 0),
    prepared: unprocessedJobs,
    proofItems,
    openGaps
  };
}

async function runAgentWorkflowForTenant(input: {
  tenantId: string;
  agentKey: string;
  source?: string;
  workflowId?: string;
}) {
  const { tenantId, agentKey } = input;
  await ensureDefaultAgentWorkflows(tenantId);
  const workflowResult = await queryPostgres<{
    id: string;
    agent_key: string;
    status: string;
    run_mode: string;
    cadence_key: string;
  }>(
    `
    select id, agent_key, status, run_mode, cadence_key
    from public.ai_agent_workflows
    where tenant_id = $1
      and agent_key = $2
      and ($3::uuid is null or id = $3)
    limit 1
    `,
    [tenantId, agentKey, input.workflowId ?? null]
  );
  const workflow = workflowResult?.rows[0];
  if (!workflow) return { ok: false, message: "Agent workflow tables are not ready yet." };
  if (workflow.status !== "active") return { ok: false, message: "This agent is paused. Turn it on before running it." };

  const requiredFeatures = agentRequiredFeatures[agentKey] ?? ["ai_generation"];
  const gates = await Promise.all(requiredFeatures.map((featureKey) => getServiceGate(tenantId, featureKey)));
  const blockedGate = gates.find((gate) => !gate.enabled);
  await expireStaleAgentRuns(tenantId);
  const runId = await createRun(tenantId, workflow.id, workflow.agent_key, input.source);
  if (!runId) return { ok: false, message: "This agent already has a run in progress." };

  if (blockedGate) {
    const summary = `${workflow.agent_key} blocked: ${blockedGate.reason}`;
    await recordOutput({
      tenantId,
      workflowId: workflow.id,
      runId,
      agentKey: workflow.agent_key,
      outputType: "plan_gate",
      title: summary,
      status: "blocked",
      metadata: {
        featureKey: blockedGate.featureKey,
        planKey: blockedGate.planKey,
        minimumPlanKey: blockedGate.minimumPlanKey,
        usageLimit: blockedGate.usageLimit,
        currentUsage: blockedGate.currentUsage,
        remaining: blockedGate.remaining,
        reason: blockedGate.reason
      }
    });
    await finishRun({
      tenantId,
      workflowId: workflow.id,
      agentKey: workflow.agent_key,
      runId,
      status: "completed",
      summary,
      output: {
        cadenceKey: workflow.cadence_key,
        runMode: workflow.run_mode,
        blocked: true,
        blockedFeature: blockedGate.featureKey,
        reason: blockedGate.reason,
        planKey: blockedGate.planKey,
        minimumPlanKey: blockedGate.minimumPlanKey
      }
    });
    await logAgentTimeline({
      tenantId,
      agentKey: workflow.agent_key,
      title: "AI agent workflow blocked by plan or limit",
      body: summary,
      metadata: {
        runId,
        workflowId: workflow.id,
        blockedFeature: blockedGate.featureKey,
        planKey: blockedGate.planKey,
        minimumPlanKey: blockedGate.minimumPlanKey
      }
    });
    return { ok: false, message: summary };
  }

  try {
    const result =
      agentKey === "lead_response_agent"
        ? await runLeadResponseAgent(tenantId, workflow.id, runId)
        : agentKey === "follow_up_agent"
          ? await runFollowUpAgent(tenantId, workflow.id, runId)
          : agentKey === "customer_lifecycle_agent"
            ? await runCustomerLifecycleAgent(tenantId, workflow.id, runId)
          : agentKey === "dispatcher_agent"
            ? await runDispatcherAgent(tenantId, workflow.id, runId)
          : agentKey === "review_agent"
            ? await runReviewAgent(tenantId, workflow.id, runId)
            : agentKey === "invoice_reminder_agent"
              ? await runInvoiceReminderAgent(tenantId, workflow.id, runId)
              : agentKey === "authority_manager"
                ? await runAuthorityManagerAgent(tenantId, workflow.id, runId)
                : await runSeoMarketingAgent(tenantId, workflow.id, runId);

    await finishRun({
      tenantId,
      workflowId: workflow.id,
      agentKey,
      runId,
      status: "completed",
      summary: result.summary,
      output: {
        ...result,
        cadenceKey: workflow.cadence_key,
        runMode: workflow.run_mode,
        liveCustomerSends: false,
        livePublishing: false
      }
    });
    await logAgentTimeline({
      tenantId,
      agentKey,
      title: "AI agent workflow ran",
      body: `${result.summary} Mode: ${runModeLabel(workflow.run_mode)}.`,
      metadata: { runId, workflowId: workflow.id, runMode: workflow.run_mode }
    });
    return { ok: true, message: result.summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown agent error.";
    await finishRun({
      tenantId,
      workflowId: workflow.id,
      agentKey,
      runId,
      status: "failed",
      summary: "Agent run failed.",
      error: message,
      output: { cadenceKey: workflow.cadence_key, error: message }
    });
    return { ok: false, message };
  }
}

export async function runAgentWorkflow(agentKey: string) {
  const tenantId = await getCurrentWorkspaceId();
  return runAgentWorkflowForTenant({ tenantId, agentKey, source: "manual_run_now" });
}

export async function runDueAgentWorkflows(input: { limit?: number; tenantId?: string | null } = {}) {
  await expireStaleAgentRuns(input.tenantId);
  const tenantResult = await queryPostgres<{ id: string }>(
    `
    select id
    from public.tenants
    where status in ('active', 'trial')
      and ($1::uuid is null or id = $1)
    order by created_at asc
    limit 100
    `,
    [input.tenantId ?? null]
  );
  const tenantIds = tenantResult?.rows.map((row) => row.id) ?? [];
  for (const tenantId of tenantIds) {
    await ensureDefaultAgentWorkflows(tenantId);
  }

  const dueResult = await queryPostgres<{
    id: string;
    tenant_id: string;
    agent_key: string;
    cadence_key: string;
  }>(
    `
    select id, tenant_id, agent_key, cadence_key
    from public.ai_agent_workflows
    where status = 'active'
      and cadence_key <> 'manual'
      and ($1::uuid is null or tenant_id = $1)
      and (next_run_at is null or next_run_at <= now())
    order by coalesce(next_run_at, created_at) asc
    limit $2
    `,
    [input.tenantId ?? null, input.limit ?? 25]
  );

  const due = dueResult?.rows ?? [];
  const completed: Array<{ tenantId: string; agentKey: string; ok: boolean; message: string }> = [];

  for (const workflow of due) {
    const result = await runAgentWorkflowForTenant({
      tenantId: workflow.tenant_id,
      agentKey: workflow.agent_key,
      workflowId: workflow.id,
      source: "scheduled_ai_workforce_monitor"
    });
    completed.push({
      tenantId: workflow.tenant_id,
      agentKey: workflow.agent_key,
      ok: result.ok,
      message: result.message
    });
  }

  return {
    ok: true,
    tenantsChecked: tenantIds.length,
    dueCount: due.length,
    completed
  };
}

export async function updateAgentWorkflow(input: {
  workflowId: string;
  status: string;
  runMode: string;
  cadenceKey: string;
  agentName: string;
  plainGoal: string;
  tone: string;
  customInstructions: string;
  knowledgeFocus: string;
  escalationRules: string;
  successMeasures: string;
  enabledChannels: string[];
  authoritySummary: string;
}) {
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.ai_agent_workflows
    set status = $3,
        run_mode = $4,
        cadence_key = $5,
        agent_name = $6,
        plain_goal = $7,
        metadata_json = metadata_json || $8::jsonb,
        next_run_at = case when $3 = 'active' then now() else null end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      tenantId, input.workflowId, input.status, input.runMode, input.cadenceKey,
      input.agentName, input.plainGoal,
      JSON.stringify({
        tone: input.tone,
        customInstructions: input.customInstructions,
        knowledgeFocus: input.knowledgeFocus,
        escalationRules: input.escalationRules,
        successMeasures: input.successMeasures,
        enabledChannels: input.enabledChannels,
        authoritySummary: input.authoritySummary,
        customizedAt: new Date().toISOString()
      })
    ]
  );
}

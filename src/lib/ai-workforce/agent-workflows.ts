import { sendTransactionalEmail } from "@/lib/email/transactional";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

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
    agentKey: "seo_marketing_agent",
    agentName: "SEO And Marketing Agent",
    plainGoal: "Prepare useful SEO and marketing drafts from services, areas, proof, reviews, and lead sources.",
    runMode: "draft_only",
    cadenceKey: "weekly",
    plainName: "Get found"
  }
];

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
            and o.status in ('prepared', 'needs_review', 'blocked')
        )::text as open_outputs
      from public.ai_agent_workflows w
      where w.tenant_id = $1 and w.status <> 'archived'
      order by
        case w.agent_key
          when 'lead_response_agent' then 1
          when 'follow_up_agent' then 2
          when 'review_agent' then 3
          when 'invoice_reminder_agent' then 4
          when 'seo_marketing_agent' then 5
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
    values ($1, $2, $3, 'running', $4::jsonb)
    returning id
    `,
    [tenantId, workflowId, agentKey, JSON.stringify({ source })]
  );
  return result?.rows[0]?.id ?? null;
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
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
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
      tenant_id, brand_id, lead_id, customer_id, estimate_id, workflow_type, channel, status, due_at, ai_suggested_message, metadata_json
    )
    select i.tenant_id, i.brand_id, j.source_lead_id, i.customer_id, i.estimate_id, 'invoice_followup', 'email', 'open', now(),
      'Invoice is unpaid or overdue. Review payment history, then send an approved reminder.',
      jsonb_build_object('createdByAgent', 'invoice_reminder_agent', 'invoiceId', i.id, 'liveCustomerSend', false)
    from public.service_invoices i
    left join public.service_jobs j on j.id = i.job_id
    where i.tenant_id = $1
      and i.status in ('sent_manually', 'partially_paid', 'overdue')
      and coalesce(i.due_date, current_date - 1) <= current_date
      and j.source_lead_id is not null
      and not exists (
        select 1
        from public.follow_up_workflows f
        where f.tenant_id = i.tenant_id
          and f.workflow_type = 'invoice_followup'
          and f.metadata_json->>'invoiceId' = i.id::text
          and f.status in ('open', 'scheduled')
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
  return {
    preparedCount: rows.length,
    summary: rows.length ? `Prepared ${rows.length} draft SEO asset(s).` : "No new SEO drafts were needed."
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

  const runId = await createRun(tenantId, workflow.id, workflow.agent_key, input.source);
  if (!runId) return { ok: false, message: "Could not start the agent run." };

  try {
    const result =
      agentKey === "lead_response_agent"
        ? await runLeadResponseAgent(tenantId, workflow.id, runId)
        : agentKey === "follow_up_agent"
          ? await runFollowUpAgent(tenantId, workflow.id, runId)
          : agentKey === "review_agent"
            ? await runReviewAgent(tenantId, workflow.id, runId)
            : agentKey === "invoice_reminder_agent"
              ? await runInvoiceReminderAgent(tenantId, workflow.id, runId)
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

export async function updateAgentWorkflow(input: { workflowId: string; status: string; runMode: string; cadenceKey: string }) {
  const tenantId = await getCurrentWorkspaceId();
  await queryPostgres(
    `
    update public.ai_agent_workflows
    set status = $3,
        run_mode = $4,
        cadence_key = $5,
        next_run_at = case when $3 = 'active' then now() else null end,
        updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [tenantId, input.workflowId, input.status, input.runMode, input.cadenceKey]
  );
}

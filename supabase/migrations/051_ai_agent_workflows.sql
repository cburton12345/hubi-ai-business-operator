create table if not exists public.ai_agent_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_key text not null,
  agent_name text not null,
  plain_goal text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'draft', 'archived')),
  run_mode text not null default 'approval_required'
    check (run_mode in ('draft_only', 'approval_required', 'auto_allowed')),
  cadence_key text not null default 'manual'
    check (cadence_key in ('manual', 'every_15_min', 'hourly', 'daily', 'weekly')),
  trigger_json jsonb not null default '{}'::jsonb,
  output_policy_json jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_run_status text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, agent_key)
);

create table if not exists public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  workflow_id uuid references public.ai_agent_workflows(id) on delete set null,
  agent_key text not null,
  status text not null default 'running'
    check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  summary text,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_agent_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid references public.ai_agent_runs(id) on delete cascade,
  workflow_id uuid references public.ai_agent_workflows(id) on delete set null,
  agent_key text not null,
  output_type text not null
    check (output_type in ('internal_email', 'draft_message', 'follow_up_workflow', 'review_workflow', 'invoice_followup', 'seo_draft', 'action_queue', 'timeline', 'recommendation')),
  title text not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'needs_review', 'sent', 'blocked', 'failed', 'skipped')),
  target_type text,
  target_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_agent_workflows_tenant_status
  on public.ai_agent_workflows(tenant_id, status, next_run_at);

create index if not exists idx_ai_agent_runs_tenant
  on public.ai_agent_runs(tenant_id, started_at desc);

create index if not exists idx_ai_agent_outputs_tenant_status
  on public.ai_agent_outputs(tenant_id, status, created_at desc);

alter table public.ai_agent_workflows enable row level security;
alter table public.ai_agent_runs enable row level security;
alter table public.ai_agent_outputs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_agent_workflows',
    'ai_agent_runs',
    'ai_agent_outputs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

insert into public.ai_agent_workflows (
  tenant_id, agent_key, agent_name, plain_goal, status, run_mode, cadence_key,
  trigger_json, output_policy_json, next_run_at, metadata_json
)
select
  t.id,
  defaults.agent_key,
  defaults.agent_name,
  defaults.plain_goal,
  'active',
  defaults.run_mode,
  defaults.cadence_key,
  defaults.trigger_json,
  defaults.output_policy_json,
  now(),
  defaults.metadata_json
from public.tenants t
cross join (
  values
    (
      'lead_response_agent',
      'Lead Response Agent',
      'Find new leads, prepare first replies, and notify the owner/team.',
      'approval_required',
      'hourly',
      '{"when":"new lead has no thread or reply draft"}'::jsonb,
      '{"customerSends":"approval_required","internalEmail":"allowed_when_email_provider_ready","writesTo":["communication_threads","communication_messages","outbound_action_queue","ai_agent_outputs"]}'::jsonb,
      '{"plainName":"Catch the lead","liveCustomerSend":false}'::jsonb
    ),
    (
      'follow_up_agent',
      'Follow-Up Agent',
      'Find stale leads, callbacks, viewed estimates, and forgotten opportunities.',
      'approval_required',
      'daily',
      '{"when":"lead, estimate, or callback needs attention"}'::jsonb,
      '{"customerSends":"approval_required","writesTo":["follow_up_workflows","ai_agent_outputs"]}'::jsonb,
      '{"plainName":"Follow up","liveCustomerSend":false}'::jsonb
    ),
    (
      'review_agent',
      'Review Agent',
      'Turn completed jobs into review requests, proof capture, and reputation tasks.',
      'approval_required',
      'daily',
      '{"when":"completed job has no review request workflow"}'::jsonb,
      '{"customerSends":"approval_required","writesTo":["review_request_workflows","outbound_action_queue","ai_agent_outputs"]}'::jsonb,
      '{"plainName":"Get reviews","liveCustomerSend":false}'::jsonb
    ),
    (
      'invoice_reminder_agent',
      'Invoice Reminder Agent',
      'Find overdue invoices and prepare payment reminder work.',
      'approval_required',
      'daily',
      '{"when":"invoice is overdue or aging after manual send"}'::jsonb,
      '{"customerSends":"approval_required","writesTo":["follow_up_workflows","outbound_action_queue","ai_agent_outputs"]}'::jsonb,
      '{"plainName":"Collect money","liveCustomerSend":false}'::jsonb
    ),
    (
      'seo_marketing_agent',
      'SEO And Marketing Agent',
      'Prepare useful SEO and marketing drafts from services, areas, proof, reviews, and lead sources.',
      'draft_only',
      'weekly',
      '{"when":"service, area, proof, review, or campaign data needs content"}'::jsonb,
      '{"publishing":"draft_only","writesTo":["ai_drafts","content_quality_reviews","ai_agent_outputs"]}'::jsonb,
      '{"plainName":"Get found","livePublishing":false}'::jsonb
    )
) as defaults(agent_key, agent_name, plain_goal, run_mode, cadence_key, trigger_json, output_policy_json, metadata_json)
on conflict (tenant_id, agent_key) do nothing;

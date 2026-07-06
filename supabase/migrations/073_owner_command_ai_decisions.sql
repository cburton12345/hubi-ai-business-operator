create table if not exists public.owner_ai_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_event_id uuid references public.owner_command_events(id) on delete cascade,
  decision_type text not null
    check (decision_type in ('triage', 'briefing', 'action_recommendation', 'approval_review')),
  model_provider text not null default 'ferocity',
  model_name text not null default 'rules_fallback',
  decision_status text not null default 'completed'
    check (decision_status in ('completed', 'fallback', 'failed', 'review_required')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  confidence_score integer not null default 0 check (confidence_score >= 0 and confidence_score <= 100),
  owner_attention boolean not null default false,
  live_action_allowed boolean not null default false,
  escalation_reasons text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_owner_ai_decisions_event
  on public.owner_ai_decisions(owner_event_id, created_at desc);

create index if not exists idx_owner_ai_decisions_tenant
  on public.owner_ai_decisions(tenant_id, decision_type, owner_attention, created_at desc);

alter table public.owner_ai_decisions enable row level security;

drop policy if exists owner_ai_decisions_tenant_operator on public.owner_ai_decisions;
create policy owner_ai_decisions_tenant_operator
on public.owner_ai_decisions
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('growth', 'owner_ai_decisions', 'Owner AI Decision Memory', true, 'Persisted AI triage and escalation decisions', 278, '{"aiCommand":true,"productionData":true}'::jsonb),
  ('operator', 'owner_ai_decisions', 'Owner AI Chief of Staff Decisions', true, 'Persisted AI triage, briefing, approvals, and escalation memory', 279, '{"aiCommand":true,"productionData":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

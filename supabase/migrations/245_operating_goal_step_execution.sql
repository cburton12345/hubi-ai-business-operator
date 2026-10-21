-- Durable, idempotent execution state for bounded operating-goal plans.
-- Existing workforce, approval, dependency, and outcome records remain authoritative.

create table if not exists public.operating_goal_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  goal_id uuid not null,
  plan_version integer not null check (plan_version > 0),
  step_key text not null,
  sequence_number integer not null default 0 check (sequence_number >= 0),
  action text not null check (action in (
    'inspect_domain_state','assign_work','prepare_communication',
    'await_event','request_information','verify_outcome'
  )),
  title text not null,
  why text,
  status text not null default 'planned' check (status in (
    'planned','ready','in_progress','waiting','needs_owner',
    'completed','blocked','failed','canceled'
  )),
  owner_required boolean not null default false,
  dependency_keys_json jsonb not null default '[]'::jsonb,
  completion_evidence_requirement text not null,
  reference_table text,
  reference_id uuid,
  href text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  last_safe_error text,
  evidence_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, goal_id, plan_version, step_key),
  constraint operating_goal_steps_goal_fk
    foreign key (tenant_id, goal_id)
    references public.operating_goals(tenant_id, id) on delete cascade
);

create index if not exists operating_goal_steps_due_idx
  on public.operating_goal_steps(tenant_id, status, next_attempt_at, sequence_number)
  where status in ('planned','ready','waiting','blocked','needs_owner','in_progress');

alter table public.operating_goal_steps enable row level security;

drop policy if exists operating_goal_steps_tenant_operator on public.operating_goal_steps;
create policy operating_goal_steps_tenant_operator on public.operating_goal_steps
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop trigger if exists operating_goal_steps_wake_goal on public.operating_goal_steps;
create trigger operating_goal_steps_wake_goal
after insert or update of status on public.operating_goal_steps
for each row execute function public.wake_linked_operating_goal();

comment on table public.operating_goal_steps is
  'Durable plan-step state. Safe internal work links to existing records; external effects retain their normal approval, consent, provider, and spend gates.';

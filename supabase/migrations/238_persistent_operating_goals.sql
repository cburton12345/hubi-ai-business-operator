-- Durable outcome ownership for Ferocity.
-- Domain systems remain authoritative; goals coordinate existing commitments,
-- workforce assignments, service tasks, and approval-safe outbound actions.

create table if not exists public.operating_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  goal_key text not null,
  goal_type text not null,
  title text not null,
  desired_outcome text not null,
  status text not null default 'active'
    check (status in ('draft','active','progressing','waiting','blocked','needs_owner','completed','verified','canceled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  authority_mode text not null default 'observe'
    check (authority_mode in ('observe','prepare','execute')),
  domain_system text not null default 'ferocity',
  source_type text not null default 'owner_instruction',
  source_table text,
  source_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  external_workspace_id text,
  external_entity_type text,
  external_entity_id text,
  target_at timestamptz,
  next_evaluation_at timestamptz not null default now(),
  last_evaluated_at timestamptz,
  evaluation_version integer not null default 0,
  plan_version integer not null default 0,
  consecutive_failures integer not null default 0,
  current_state_json jsonb not null default '{}'::jsonb,
  plan_json jsonb not null default '[]'::jsonb,
  completion_rules_json jsonb not null default '{}'::jsonb,
  constraints_json jsonb not null default '{}'::jsonb,
  blind_spots_json jsonb not null default '[]'::jsonb,
  reasoning_policy_json jsonb not null default '{"mode":"on_material_change","humanReviewForConsequentialActions":true}'::jsonb,
  last_evaluation_summary text,
  last_safe_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  verified_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, goal_key),
  unique (tenant_id, id)
);

create table if not exists public.operating_goal_dependencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  goal_id uuid not null,
  dependency_key text not null,
  dependency_type text not null
    check (dependency_type in ('goal','commitment','work_assignment','service_task','outbound_action','capability','integration','information','person_response','external_event')),
  title text not null,
  status text not null default 'pending'
    check (status in ('pending','waiting','satisfied','blocked','waived','failed')),
  required boolean not null default true,
  owner_action_required boolean not null default false,
  reference_table text,
  reference_id uuid,
  external_reference text,
  next_check_at timestamptz,
  expected_by timestamptz,
  satisfied_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, goal_id, dependency_key),
  constraint operating_goal_dependencies_goal_fk
    foreign key (tenant_id, goal_id) references public.operating_goals(tenant_id, id) on delete cascade
);

create table if not exists public.operating_goal_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  goal_id uuid not null,
  event_type text not null,
  event_key text,
  source_system text not null default 'ferocity',
  source_table text,
  source_id text,
  previous_status text,
  next_status text,
  material_change boolean not null default true,
  observed_at timestamptz not null default now(),
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operating_goal_events_goal_fk
    foreign key (tenant_id, goal_id) references public.operating_goals(tenant_id, id) on delete cascade
);

create unique index if not exists operating_goal_events_key_idx
  on public.operating_goal_events(tenant_id, goal_id, event_key)
  where event_key is not null;
create index if not exists operating_goals_due_idx
  on public.operating_goals(tenant_id, next_evaluation_at, priority)
  where status in ('active','progressing','waiting','blocked','needs_owner');
create index if not exists operating_goals_entity_idx
  on public.operating_goals(tenant_id, domain_system, related_entity_type, related_entity_id, updated_at desc);
create index if not exists operating_goals_external_entity_idx
  on public.operating_goals(domain_system, external_workspace_id, external_entity_type, external_entity_id)
  where external_entity_id is not null;
create index if not exists operating_goal_dependencies_open_idx
  on public.operating_goal_dependencies(tenant_id, goal_id, status, next_check_at)
  where required = true and status not in ('satisfied','waived');
create index if not exists operating_goal_events_timeline_idx
  on public.operating_goal_events(tenant_id, goal_id, observed_at desc);

alter table public.operating_commitments add column if not exists goal_id uuid;
alter table public.operations_assignments add column if not exists goal_id uuid;
alter table public.service_operational_tasks add column if not exists goal_id uuid;
alter table public.outbound_action_queue add column if not exists goal_id uuid;

alter table public.operating_commitments
  add constraint operating_commitments_goal_fk foreign key (tenant_id, goal_id)
  references public.operating_goals(tenant_id, id) on delete set null (goal_id);
alter table public.operations_assignments
  add constraint operations_assignments_goal_fk foreign key (tenant_id, goal_id)
  references public.operating_goals(tenant_id, id) on delete set null (goal_id);
alter table public.service_operational_tasks
  add constraint service_operational_tasks_goal_fk foreign key (tenant_id, goal_id)
  references public.operating_goals(tenant_id, id) on delete set null (goal_id);
alter table public.outbound_action_queue
  add constraint outbound_action_queue_goal_fk foreign key (tenant_id, goal_id)
  references public.operating_goals(tenant_id, id) on delete set null (goal_id);

create index if not exists operating_commitments_goal_idx on public.operating_commitments(tenant_id, goal_id, status) where goal_id is not null;
create index if not exists operations_assignments_goal_idx on public.operations_assignments(tenant_id, goal_id, status) where goal_id is not null;
create index if not exists service_operational_tasks_goal_idx on public.service_operational_tasks(tenant_id, goal_id, status) where goal_id is not null;
create index if not exists outbound_action_queue_goal_idx on public.outbound_action_queue(tenant_id, goal_id, status) where goal_id is not null;

alter table public.operating_goals enable row level security;
alter table public.operating_goal_dependencies enable row level security;
alter table public.operating_goal_events enable row level security;

drop policy if exists operating_goals_tenant_operator on public.operating_goals;
create policy operating_goals_tenant_operator on public.operating_goals
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists operating_goal_dependencies_tenant_operator on public.operating_goal_dependencies;
create policy operating_goal_dependencies_tenant_operator on public.operating_goal_dependencies
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists operating_goal_events_tenant_operator on public.operating_goal_events;
create policy operating_goal_events_tenant_operator on public.operating_goal_events
for all using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

create or replace function public.wake_linked_operating_goal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.goal_id is not null and (
    tg_op = 'INSERT'
    or old.goal_id is distinct from new.goal_id
    or old.status is distinct from new.status
  ) then
    update public.operating_goals
    set next_evaluation_at = least(next_evaluation_at, now()), updated_at = now()
    where tenant_id = new.tenant_id and id = new.goal_id
      and status in ('active','progressing','waiting','blocked','needs_owner');
  end if;
  return new;
end;
$$;

drop trigger if exists operating_commitments_wake_goal on public.operating_commitments;
create trigger operating_commitments_wake_goal after insert or update of goal_id,status on public.operating_commitments
for each row execute function public.wake_linked_operating_goal();
drop trigger if exists operations_assignments_wake_goal on public.operations_assignments;
create trigger operations_assignments_wake_goal after insert or update of goal_id,status on public.operations_assignments
for each row execute function public.wake_linked_operating_goal();
drop trigger if exists service_operational_tasks_wake_goal on public.service_operational_tasks;
create trigger service_operational_tasks_wake_goal after insert or update of goal_id,status on public.service_operational_tasks
for each row execute function public.wake_linked_operating_goal();
drop trigger if exists outbound_action_queue_wake_goal on public.outbound_action_queue;
create trigger outbound_action_queue_wake_goal after insert or update of goal_id,status on public.outbound_action_queue
for each row execute function public.wake_linked_operating_goal();

insert into public.workspace_feature_entitlements
  (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select tenant.id,'persistent_operating_goals','enabled',null,'monthly',
  '{"category":"Operations","description":"Persistent outcome ownership across Ferocity and connected domain systems.","approvalMode":"risk_based","plainRule":"Ferocity can observe, plan, prepare, and execute only within the goal authority mode and existing action approvals.","costed":false,"publicFacing":false}'::jsonb
from public.tenants tenant where tenant.status <> 'archived'
on conflict (tenant_id,feature_key) do update set
  metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at=now();

comment on table public.operating_goals is
  'Durable outcomes Ferocity continues pursuing across time and events; domain systems remain authoritative.';
comment on column public.operating_goals.authority_mode is
  'Maximum goal-level autonomy. Existing provider, spend, consent, approval, and business-action gates still apply.';

create table if not exists public.call_handling_modes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  mode_key text not null,
  display_name text not null,
  description text not null default '',
  handling_strategy text not null default 'ai_first'
    check (handling_strategy in (
      'ai_first','simultaneous','owner_first','important_only',
      'ai_unless_requested','schedule_based','presence_based','custom'
    )),
  active_when_json jsonb not null default '{}'::jsonb,
  transfer_categories_json jsonb not null default
    '["emergency","urgent","sales_opportunity","vip"]'::jsonb,
  ai_handle_categories_json jsonb not null default
    '["faq","scheduling","appointment_change","status_update","spam","wrong_number"]'::jsonb,
  minimum_transfer_score integer not null default 70
    check (minimum_transfer_score between 0 and 100),
  minimum_sales_value_cents integer not null default 0
    check (minimum_sales_value_cents >= 0),
  is_default boolean not null default false,
  is_custom boolean not null default false,
  status text not null default 'active'
    check (status in ('active','inactive','archived')),
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, mode_key)
);

create unique index if not exists call_handling_modes_one_default_idx
  on public.call_handling_modes (tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default = true and status = 'active';

create unique index if not exists call_handling_modes_scope_key_idx
  on public.call_handling_modes (
    tenant_id,
    coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    mode_key
  );

create table if not exists public.owner_attention_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  state_key text not null
    check (state_key in (
      'available','busy','driving','on_job','focus','meeting',
      'lunch','vacation','emergency_only'
    )),
  status text not null default 'active'
    check (status in ('active','expired','cleared')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  source text not null default 'manual'
    check (source in ('manual','calendar','mobile','workflow','system')),
  note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_attention_states_active_idx
  on public.owner_attention_states (tenant_id, user_id, starts_at desc)
  where status = 'active';

create table if not exists public.call_management_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  call_id uuid not null references public.receptionist_calls(id) on delete cascade,
  mode_id uuid references public.call_handling_modes(id) on delete set null,
  priority_class text not null default 'unknown'
    check (priority_class in (
      'emergency','urgent','sales_opportunity','existing_customer','vip',
      'warranty','supplier','employee','spam','unknown'
    )),
  urgency_score integer not null default 0 check (urgency_score between 0 and 100),
  estimated_value_cents integer not null default 0 check (estimated_value_cents >= 0),
  decision text not null
    check (decision in (
      'ai_handle','ring_owner','ring_simultaneously','screen_then_transfer',
      'voicemail','schedule_callback','transfer_employee','block'
    )),
  should_interrupt_owner boolean not null default false,
  caller_context text not null default '',
  screening_summary text not null default '',
  decision_reason text not null default '',
  confidence_score integer not null default 70 check (confidence_score between 0 and 100),
  response_options_json jsonb not null default
    '["accept","decline","voicemail","return_to_ai","transfer_employee","schedule_callback"]'::jsonb,
  owner_response text
    check (owner_response is null or owner_response in (
      'accept','decline','voicemail','return_to_ai','transfer_employee','schedule_callback'
    )),
  response_target text,
  status text not null default 'pending'
    check (status in ('pending','presented','accepted','executing','completed','declined','failed','expired')),
  resolved_scope text,
  resolved_mode_source text not null default 'organization_default',
  provider_execution_status text,
  metadata_json jsonb not null default '{}'::jsonb,
  responded_by_user_id uuid references public.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, call_id)
);

create index if not exists call_management_decisions_attention_idx
  on public.call_management_decisions
    (tenant_id, should_interrupt_owner, status, urgency_score desc, created_at desc);

alter table public.call_handling_modes enable row level security;
alter table public.owner_attention_states enable row level security;
alter table public.call_management_decisions enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'call_handling_modes','owner_attention_states','call_management_decisions'
  ]
  loop
    execute format('drop policy if exists %I_tenant_operator on public.%I', table_name, table_name);
    execute format(
      'create policy %I_tenant_operator on public.%I for all using
       (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))
       with check
       (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name, table_name
    );
  end loop;
end $$;

insert into public.call_handling_modes (
  tenant_id, mode_key, display_name, description, handling_strategy,
  active_when_json, transfer_categories_json, minimum_transfer_score,
  is_default, metadata_json
)
select
  t.id,
  seed.mode_key,
  seed.display_name,
  seed.description,
  seed.handling_strategy,
  seed.active_when_json::jsonb,
  '["emergency","urgent","sales_opportunity","vip"]'::jsonb,
  seed.minimum_transfer_score,
  seed.mode_key = 'ai_first',
  '{"source":"intelligent_call_management_seed","providerIndependent":true}'::jsonb
from public.tenants t
cross join (values
  ('ai_first','AI answers first','AI handles the call and transfers only when the rules say the owner is needed.','ai_first','{}',70),
  ('simultaneous','Ring owner and AI','Ring both, while AI prepares context if the owner answers.','simultaneous','{}',60),
  ('owner_first','Owner first','Ring the owner first, then let AI answer when there is no response.','owner_first','{}',65),
  ('important_only','Important calls only','AI handles routine calls and interrupts the owner only for important calls.','important_only','{}',75),
  ('business_hours','AI during business hours','AI answers during business hours; the owner is first after hours.','schedule_based','{"schedule":"business_hours","startHour":8,"endHour":17,"weekdays":[1,2,3,4,5]}',70),
  ('after_hours','AI after hours only','The owner is first during business hours; AI answers nights and weekends.','schedule_based','{"schedule":"after_hours","startHour":8,"endHour":17,"weekdays":[1,2,3,4,5]}',70),
  ('weekends','AI on weekends','The owner is first on weekdays; AI answers on weekends.','schedule_based','{"schedule":"weekends"}',70),
  ('vacation','Vacation','AI handles calls while the owner is away.','presence_based','{"states":["vacation"]}',80),
  ('busy','Busy','AI protects the owner while busy, in a meeting, or in Focus Mode.','presence_based','{"states":["busy","meeting","focus"]}',80),
  ('driving','Driving','AI handles calls while the owner is driving and transfers only emergencies.','presence_based','{"states":["driving"]}',90),
  ('on_job','On a job','AI handles routine calls while the owner is working in the field.','presence_based','{"states":["on_job"]}',80),
  ('emergency_only','Emergency only','Interrupt the owner only for emergencies.','important_only','{"states":["emergency_only"]}',95)
) as seed(mode_key,display_name,description,handling_strategy,active_when_json,minimum_transfer_score)
where t.status <> 'archived'
  and not exists (
    select 1 from public.call_handling_modes existing
    where existing.tenant_id = t.id
      and existing.brand_id is null
      and existing.mode_key = seed.mode_key
  );

insert into public.workspace_feature_entitlements (
  tenant_id, feature_key, status, usage_limit, usage_period, metadata_json
)
select t.id, 'intelligent_call_management', 'enabled', null, null,
  '{"category":"AI Office Manager","publicFacing":true,"costed":false,"providerIndependent":true}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at = now();

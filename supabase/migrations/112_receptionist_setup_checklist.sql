create table if not exists public.receptionist_setup_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  setup_key text not null default 'default',
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'ready_to_test', 'ready_to_activate', 'active', 'paused', 'needs_attention')),
  business_basics_status text not null default 'not_started'
    check (business_basics_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  call_behavior_status text not null default 'not_started'
    check (call_behavior_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  routing_status text not null default 'not_started'
    check (routing_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  scheduling_status text not null default 'not_started'
    check (scheduling_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  phone_number_status text not null default 'not_started'
    check (phone_number_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  test_status text not null default 'not_started'
    check (test_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  activation_status text not null default 'not_started'
    check (activation_status in ('not_started', 'in_progress', 'complete', 'needs_attention')),
  launch_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, setup_key)
);

create index if not exists idx_receptionist_setup_checklists_tenant
  on public.receptionist_setup_checklists(tenant_id, status, updated_at desc);

alter table public.receptionist_setup_checklists enable row level security;

drop policy if exists receptionist_setup_checklists_tenant_operator on public.receptionist_setup_checklists;
create policy receptionist_setup_checklists_tenant_operator
on public.receptionist_setup_checklists
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.receptionist_setup_checklists (
  tenant_id, brand_id, setup_key, status, launch_notes, metadata_json
)
select
  t.id,
  null,
  'default',
  'not_started',
  'Start with business basics, call behavior, routing, scheduling, phone number, test, then activate.',
  '{"source":"migration_seed","liveProviderRequired":true}'::jsonb
from public.tenants t
on conflict (tenant_id, brand_id, setup_key) do nothing;

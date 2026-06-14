create table if not exists public.personal_ops_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  owner_user_id uuid references public.users(id) on delete set null,
  category text not null default 'today'
    check (category in ('today', 'money', 'paperwork', 'people', 'reminder', 'project', 'waiting', 'personal')),
  title text not null,
  notes text,
  status text not null default 'open'
    check (status in ('open', 'watching', 'ai_handled', 'done', 'archived')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  owner_attention boolean not null default true,
  due_at timestamptz,
  ai_summary text,
  recommended_action text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_personal_ops_items_tenant_status
  on public.personal_ops_items(tenant_id, status, priority, due_at nulls last, created_at desc);

create index if not exists idx_personal_ops_items_attention
  on public.personal_ops_items(tenant_id, owner_attention, priority, created_at desc)
  where owner_attention = true;

alter table public.personal_ops_items enable row level security;

drop policy if exists personal_ops_items_tenant_owner_admin on public.personal_ops_items;
create policy personal_ops_items_tenant_owner_admin
on public.personal_ops_items
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create or replace function public.set_personal_ops_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists personal_ops_items_touch_updated_at on public.personal_ops_items;
create trigger personal_ops_items_touch_updated_at
before update on public.personal_ops_items
for each row
execute function public.set_personal_ops_items_updated_at();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('operator', 'personal_ops', 'Personal Ops', true, 'Owner-only personal command queue', 256, '{"ownerLayer":true,"private":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

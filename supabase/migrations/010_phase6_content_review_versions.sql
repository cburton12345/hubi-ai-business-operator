create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  draft_id uuid not null references public.ai_drafts(id) on delete cascade,
  version_number integer not null,
  title text not null,
  body text not null,
  status text not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (draft_id, version_number)
);

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  draft_id uuid not null references public.ai_drafts(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.approval_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_versions_draft_created
  on public.content_versions(draft_id, version_number desc);

create index if not exists idx_content_comments_draft_created
  on public.content_comments(draft_id, created_at desc);

create index if not exists idx_approval_audit_events_tenant_target
  on public.approval_audit_events(tenant_id, target_type, target_id, created_at desc);

alter table public.content_versions enable row level security;
alter table public.content_comments enable row level security;
alter table public.approval_audit_events enable row level security;

drop policy if exists content_versions_tenant_operator on public.content_versions;
create policy content_versions_tenant_operator
on public.content_versions
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists content_comments_tenant_operator on public.content_comments;
create policy content_comments_tenant_operator
on public.content_comments
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists approval_audit_events_tenant_operator on public.approval_audit_events;
create policy approval_audit_events_tenant_operator
on public.approval_audit_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

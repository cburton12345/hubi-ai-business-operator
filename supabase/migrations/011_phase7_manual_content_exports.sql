create table if not exists public.content_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  draft_id uuid references public.ai_drafts(id) on delete set null,
  export_type text not null
    check (export_type in ('copy_package', 'seo_brief', 'ad_copy', 'social_post', 'review_request', 'lead_followup')),
  title text not null,
  body text not null,
  checklist_json jsonb not null default '[]'::jsonb,
  status text not null default 'ready'
    check (status in ('ready', 'downloaded', 'copied', 'archived')),
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_exports_tenant_created
  on public.content_exports(tenant_id, created_at desc);

alter table public.content_exports enable row level security;

drop policy if exists content_exports_tenant_operator on public.content_exports;
create policy content_exports_tenant_operator
on public.content_exports
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

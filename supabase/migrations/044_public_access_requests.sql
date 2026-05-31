create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null default 'early_access',
  status text not null default 'new' check (status in ('new', 'reviewing', 'invited', 'closed', 'spam')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  name text,
  email text not null,
  phone text,
  company_name text,
  business_type text,
  website_url text,
  requested_plan text,
  main_goal text,
  message text,
  source text not null default 'ferocity_public_site',
  source_detail text,
  metadata_json jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_access_requests_created on public.access_requests(created_at desc);
create index if not exists idx_access_requests_status on public.access_requests(status, created_at desc);
create index if not exists idx_access_requests_email on public.access_requests(lower(email));

alter table public.access_requests enable row level security;

drop policy if exists "access_requests_no_public_read" on public.access_requests;
create policy "access_requests_no_public_read"
on public.access_requests
for select
using (false);

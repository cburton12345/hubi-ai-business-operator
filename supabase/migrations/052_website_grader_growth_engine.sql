create table if not exists public.website_grader_reports (
  id uuid primary key default gen_random_uuid(),
  report_token text not null unique,
  status text not null default 'completed'
    check (status in ('completed', 'failed', 'spam')),
  website_url text not null,
  final_url text,
  name text,
  email text not null,
  company_name text,
  business_type text,
  score integer not null default 0 check (score between 0 and 100),
  grade_label text not null default 'Needs Review',
  extraction_json jsonb not null default '{}'::jsonb,
  findings_json jsonb not null default '[]'::jsonb,
  recommended_steps_json jsonb not null default '[]'::jsonb,
  access_request_id uuid references public.access_requests(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_website_grader_reports_created
  on public.website_grader_reports(created_at desc);

create index if not exists idx_website_grader_reports_email
  on public.website_grader_reports(lower(email), created_at desc);

create index if not exists idx_website_grader_reports_status
  on public.website_grader_reports(status, score, created_at desc);

alter table public.website_grader_reports enable row level security;

drop policy if exists website_grader_reports_no_public_read on public.website_grader_reports;
create policy website_grader_reports_no_public_read
on public.website_grader_reports
for select
using (false);

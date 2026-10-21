-- Risk-based second-model and deterministic review evidence.
-- This records review outcomes only; it never authorizes external execution.

create table if not exists public.ai_independent_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  risk_tier text not null check (risk_tier in ('important','critical')),
  status text not null check (status in ('passed','disagreed','reviewer_unavailable','human_confirmed','rejected')),
  primary_run_type text not null,
  reviewer_run_type text,
  deterministic_checks_json jsonb not null default '[]'::jsonb,
  disagreements_json jsonb not null default '[]'::jsonb,
  human_review_required boolean not null default true,
  human_reviewed_by_user_id uuid references public.users(id) on delete set null,
  human_reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_independent_reviews_subject
  on public.ai_independent_reviews(tenant_id,subject_type,subject_id,created_at desc);
create index if not exists idx_ai_independent_reviews_attention
  on public.ai_independent_reviews(tenant_id,status,human_review_required,created_at desc);

alter table public.ai_independent_reviews enable row level security;
drop policy if exists ai_independent_reviews_tenant_operator on public.ai_independent_reviews;
create policy ai_independent_reviews_tenant_operator on public.ai_independent_reviews for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

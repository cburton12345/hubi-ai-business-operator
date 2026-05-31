create table if not exists public.ugc_capture_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete cascade,
  job_id uuid references public.service_jobs(id) on delete set null,
  public_token text not null unique,
  request_type text not null default 'job_proof'
    check (request_type in ('job_proof', 'review_proof', 'testimonial', 'before_after', 'general')),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent_manually', 'submitted', 'closed', 'expired')),
  requested_at timestamptz,
  submitted_at timestamptz,
  expires_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ugc_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  capture_request_id uuid references public.ugc_capture_requests(id) on delete set null,
  source text not null default 'customer_portal'
    check (source in ('customer_portal', 'manual', 'review_import', 'marketplacepro', 'website_form')),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'needs_edit', 'rejected', 'archived')),
  title text,
  customer_name text,
  customer_email text,
  customer_phone text,
  service_type text,
  city text,
  state text,
  rating integer check (rating between 1 and 5),
  story_text text,
  result_summary text,
  permission_marketing boolean not null default false,
  permission_use_name boolean not null default false,
  permission_use_location boolean not null default false,
  permission_contact_followup boolean not null default false,
  release_version text not null default 'ugc-release-v1',
  release_text text not null default 'Customer grants the business permission to review this submission and use approved words, photos, or videos in marketing after internal approval. Customer can contact the business to request removal.',
  ip_address text,
  user_agent text,
  reviewer_notes text,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ugc_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  submission_id uuid not null references public.ugc_submissions(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  asset_type text not null
    check (asset_type in ('photo', 'video', 'testimonial_text', 'document_link', 'other')),
  before_after text not null default 'other'
    check (before_after in ('before', 'during', 'after', 'result', 'other')),
  storage_bucket text,
  storage_path text,
  external_url text,
  original_filename text,
  mime_type text,
  caption text,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ugc_asset_has_location check (
    asset_type = 'testimonial_text'
    or external_url is not null
    or storage_path is not null
  )
);

create table if not exists public.ugc_content_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  submission_id uuid not null references public.ugc_submissions(id) on delete cascade,
  asset_id uuid references public.ugc_assets(id) on delete set null,
  ai_draft_id uuid references public.ai_drafts(id) on delete set null,
  output_type text not null
    check (output_type in ('gbp_post', 'facebook_post', 'seo_page', 'testimonial_card', 'gallery_item', 'ad_creative', 'review_request_followup')),
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'exported', 'published_manually', 'archived')),
  title text,
  summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ugc-proof-assets',
  'ugc-proof-assets',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists idx_ugc_capture_requests_tenant_status
  on public.ugc_capture_requests(tenant_id, status, created_at desc);

create index if not exists idx_ugc_capture_requests_token
  on public.ugc_capture_requests(public_token)
  where status in ('ready', 'sent_manually');

create index if not exists idx_ugc_submissions_tenant_status
  on public.ugc_submissions(tenant_id, status, created_at desc);

create index if not exists idx_ugc_submissions_customer
  on public.ugc_submissions(tenant_id, customer_id, created_at desc);

create index if not exists idx_ugc_assets_submission
  on public.ugc_assets(submission_id, status);

create index if not exists idx_ugc_content_outputs_submission
  on public.ugc_content_outputs(submission_id, status);

alter table public.ugc_capture_requests enable row level security;
alter table public.ugc_submissions enable row level security;
alter table public.ugc_assets enable row level security;
alter table public.ugc_content_outputs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ugc_capture_requests',
    'ugc_submissions',
    'ugc_assets',
    'ugc_content_outputs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'ugc_proof_capture',
  'enabled',
  100,
  'monthly',
  '{"category":"Reputation","description":"Customer proof, testimonials, before/after assets, consent, and draft marketing outputs","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Capture proof after real jobs. Review consent and assets before public use.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do nothing;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'ugc_proof_capture', 'Customer proof capture', true, '5 submissions/month, review only', 150, '{"serviceControl":true}'::jsonb),
  ('starter', 'ugc_proof_capture', 'Customer proof capture', true, '25 submissions/month', 150, '{"serviceControl":true}'::jsonb),
  ('growth', 'ugc_proof_capture', 'UGC marketing engine', true, '100 submissions/month plus draft content packages', 150, '{"serviceControl":true}'::jsonb),
  ('operator', 'ugc_proof_capture', 'UGC marketing engine', true, '500 submissions/month plus proof-to-content workflows', 150, '{"serviceControl":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

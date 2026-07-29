create table if not exists public.marketing_ad_experiments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  campaign_id uuid references public.content_studio_campaigns(id) on delete cascade,
  experiment_name text not null,
  objective text not null default 'book_more_work',
  platforms text[] not null default '{}',
  budget_mode text not null default 'not_connected'
    check (budget_mode in ('not_connected', 'customer_owned_account', 'ferocity_managed_future', 'manual_export')),
  budget_cents integer not null default 0 check (budget_cents >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'ready_to_launch', 'launched_manually', 'paused', 'completed', 'archived')),
  landing_page_output_id uuid references public.content_studio_outputs(id) on delete set null,
  creative_count integer not null default 0 check (creative_count >= 0),
  launch_checklist_json jsonb not null default '[]'::jsonb,
  performance_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_creative_variants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  campaign_id uuid references public.content_studio_campaigns(id) on delete cascade,
  experiment_id uuid references public.marketing_ad_experiments(id) on delete cascade,
  output_id uuid references public.content_studio_outputs(id) on delete set null,
  platform text not null default 'multi_platform',
  format text not null default 'static_ad'
    check (format in ('static_ad', 'story_ad', 'ugc_video_script', 'short_video_script', 'search_ad', 'display_ad', 'caption', 'landing_page')),
  hook text not null,
  angle text not null,
  audience text,
  cta text not null default 'Request a quote',
  status text not null default 'needs_review'
    check (status in ('draft', 'needs_review', 'approved', 'exported', 'launched_manually', 'winner', 'paused', 'archived')),
  predicted_score integer not null default 50 check (predicted_score between 0 and 100),
  performance_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_ad_experiments_tenant
  on public.marketing_ad_experiments(tenant_id, brand_id, status, created_at desc);

create index if not exists idx_marketing_creative_variants_tenant
  on public.marketing_creative_variants(tenant_id, brand_id, status, predicted_score desc);

alter table public.marketing_ad_experiments enable row level security;
alter table public.marketing_creative_variants enable row level security;

drop policy if exists marketing_ad_experiments_tenant_operator on public.marketing_ad_experiments;
create policy marketing_ad_experiments_tenant_operator
on public.marketing_ad_experiments
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists marketing_creative_variants_tenant_operator on public.marketing_creative_variants;
create policy marketing_creative_variants_tenant_operator
on public.marketing_creative_variants
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('ad_launch_kits', 'enabled', 30, 'monthly', '{"category":"Marketing OS","description":"Create multi-platform ad launch kits with static ads, UGC video scripts, captions, landing pages, and review-first launch checklists.","approvalMode":"review_required","plainRule":"Prepare ads and landing pages. Live publishing, ad spend, and provider launch require connection and approval.","costed":true,"publicFacing":true}'::jsonb),
    ('creative_variant_testing', 'enabled', 150, 'monthly', '{"category":"Marketing OS","description":"Prepare multiple creative angles and remember winning hooks, offers, audiences, and platforms.","approvalMode":"review_required","plainRule":"Test variants manually or through connected ad accounts; store results in Marketing Memory.","costed":true,"publicFacing":true}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  status = excluded.status,
  usage_limit = excluded.usage_limit,
  usage_period = excluded.usage_period,
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('starter', 'ad_launch_kits', 'Ad Launch Kits', true, 'Starter launch kits and manual export', 241, '{"marketingOs":true}'::jsonb),
  ('growth', 'creative_variant_testing', 'Creative Variant Testing', true, 'Multiple angles and performance memory', 242, '{"marketingOs":true}'::jsonb),
  ('operator', 'ad_launch_kits', 'Ad Launch Kits Plus', true, 'More launch kits, variants, and provider-ready briefs', 241, '{"marketingOs":true}'::jsonb)
on conflict (plan_key, feature_key) do update set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

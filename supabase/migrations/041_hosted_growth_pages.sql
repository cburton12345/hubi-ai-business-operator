alter table public.brand_landing_pages
  add column if not exists headline text,
  add column if not exists subheadline text,
  add column if not exists body_sections jsonb not null default '[]'::jsonb,
  add column if not exists form_id uuid references public.forms(id) on delete set null,
  add column if not exists tracking_code text,
  add column if not exists canonical_url text,
  add column if not exists noindex boolean not null default true,
  add column if not exists published_at timestamptz,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists idx_brand_landing_pages_public_lookup
  on public.brand_landing_pages(brand_id, slug, status);

create index if not exists idx_brand_landing_pages_form
  on public.brand_landing_pages(tenant_id, form_id);

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'hosted_growth_pages',
  'enabled',
  50,
  'monthly',
  '{"description":"Ferocity-hosted campaign, service, and city landing pages connected to lead capture and attribution."}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do nothing;

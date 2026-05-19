alter table public.recommendations
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists idx_recommendations_metadata_period
  on public.recommendations(tenant_id, brand_id, (metadata_json->>'periodKey'))
  where metadata_json ? 'periodKey';

begin;

alter table public.ai_drafts add column if not exists generation_key text;
alter table public.recommendations add column if not exists generation_key text;
alter table public.marketing_calendar_items add column if not exists generation_key text;
alter table public.publishing_queue add column if not exists generation_key text;
alter table public.operator_timeline_events add column if not exists generation_key text;

create unique index if not exists ai_drafts_generation_key_unique
  on public.ai_drafts (tenant_id, brand_id, generation_key)
  where generation_key is not null;

create unique index if not exists recommendations_generation_key_unique
  on public.recommendations (tenant_id, brand_id, generation_key)
  where generation_key is not null;

create unique index if not exists marketing_calendar_generation_key_unique
  on public.marketing_calendar_items (tenant_id, brand_id, generation_key)
  where generation_key is not null;

create unique index if not exists publishing_queue_generation_key_unique
  on public.publishing_queue (tenant_id, brand_id, generation_key)
  where generation_key is not null;

create unique index if not exists operator_timeline_generation_key_unique
  on public.operator_timeline_events (tenant_id, brand_id, generation_key)
  where generation_key is not null;

commit;

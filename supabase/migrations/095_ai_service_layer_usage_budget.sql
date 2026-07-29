create table if not exists public.ai_provider_configs (
  provider_key text primary key,
  display_name text not null,
  provider_family text not null default 'text',
  status text not null default 'planned',
  default_model text,
  supports_text boolean not null default false,
  supports_json boolean not null default false,
  supports_vision boolean not null default false,
  supports_image boolean not null default false,
  supports_video boolean not null default false,
  supports_voice boolean not null default false,
  cost_category text not null default 'core',
  priority int not null default 100,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  provider_key text not null,
  model_name text,
  feature_key text not null,
  run_type text not null,
  request_type text not null default 'json',
  ai_category text not null default 'core',
  status text not null,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  media_units int not null default 0,
  estimated_cost_cents numeric(12,4) not null default 0,
  latency_ms int,
  fallback_used boolean not null default false,
  error_category text,
  correlation_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_budget_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  scope_type text not null default 'workspace',
  scope_id text,
  ai_category text not null default 'core',
  monthly_cap_cents numeric(12,2),
  monthly_request_cap int,
  emergency_paused boolean not null default false,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, scope_type, scope_id, ai_category)
);

create index if not exists idx_ai_usage_events_tenant_created
  on public.ai_usage_events(tenant_id, created_at desc);

create index if not exists idx_ai_usage_events_provider_created
  on public.ai_usage_events(provider_key, created_at desc);

create index if not exists idx_ai_usage_events_feature_created
  on public.ai_usage_events(feature_key, created_at desc);

alter table public.ai_provider_configs enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_budget_policies enable row level security;

drop policy if exists ai_provider_configs_read_all on public.ai_provider_configs;
create policy ai_provider_configs_read_all
on public.ai_provider_configs
for select
using (true);

drop policy if exists ai_usage_events_tenant_operator on public.ai_usage_events;
create policy ai_usage_events_tenant_operator
on public.ai_usage_events
for all
using (
  exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = ai_usage_events.tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  )
)
with check (
  exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = ai_usage_events.tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  )
);

drop policy if exists ai_budget_policies_tenant_operator on public.ai_budget_policies;
create policy ai_budget_policies_tenant_operator
on public.ai_budget_policies
for all
using (
  tenant_id is null
  or exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = ai_budget_policies.tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  )
)
with check (
  tenant_id is null
  or exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = ai_budget_policies.tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
  )
);

insert into public.ai_provider_configs (
  provider_key,
  display_name,
  provider_family,
  status,
  default_model,
  supports_text,
  supports_json,
  supports_vision,
  supports_image,
  supports_video,
  supports_voice,
  cost_category,
  priority,
  config_json
)
values
  ('openai', 'OpenAI', 'text', 'enabled', 'gpt-4.1-mini', true, true, true, false, false, false, 'core', 10, '{"purpose":"Core setup, drafts, summaries, receipt extraction, and operator guidance"}'::jsonb),
  ('openai_media_future', 'OpenAI Media', 'media', 'planned', null, false, false, false, true, true, true, 'premium_media', 50, '{"purpose":"Future image, video, and voice models"}'::jsonb),
  ('google_veo_future', 'Google Veo', 'video', 'planned', null, false, false, false, false, true, false, 'premium_media', 60, '{"purpose":"Future premium video generation"}'::jsonb),
  ('runway_future', 'Runway', 'video', 'planned', null, false, false, false, false, true, false, 'premium_media', 70, '{"purpose":"Future premium video generation"}'::jsonb),
  ('kling_future', 'Kling', 'video', 'planned', null, false, false, false, false, true, false, 'premium_media', 80, '{"purpose":"Future premium video generation"}'::jsonb)
on conflict (provider_key) do update
set
  display_name = excluded.display_name,
  provider_family = excluded.provider_family,
  default_model = coalesce(public.ai_provider_configs.default_model, excluded.default_model),
  supports_text = excluded.supports_text,
  supports_json = excluded.supports_json,
  supports_vision = excluded.supports_vision,
  supports_image = excluded.supports_image,
  supports_video = excluded.supports_video,
  supports_voice = excluded.supports_voice,
  cost_category = excluded.cost_category,
  priority = excluded.priority,
  config_json = public.ai_provider_configs.config_json || excluded.config_json,
  updated_at = now();

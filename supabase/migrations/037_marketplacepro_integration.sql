create table if not exists public.marketplacepro_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  marketplace_account_id text,
  marketplace_vendor_id text,
  marketplace_listing_id text,
  profile_mode text not null default 'lightweight'
    check (profile_mode in ('lightweight', 'ferocity_connected')),
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected', 'connected', 'needs_attention', 'sync_paused')),
  sync_status text not null default 'paused'
    check (sync_status in ('paused', 'ready', 'error')),
  last_sync_at timestamptz,
  settings_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, marketplace_account_id, marketplace_vendor_id, marketplace_listing_id)
);

create table if not exists public.marketplacepro_lead_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  connection_id uuid references public.marketplacepro_connections(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  marketplace_lead_id text not null,
  marketplace_account_id text,
  marketplace_vendor_id text,
  marketplace_listing_id text,
  marketplace_category text,
  marketplace_service text,
  marketplace_status text,
  raw_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, marketplace_lead_id)
);

create table if not exists public.marketplacepro_sync_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  connection_id uuid references public.marketplacepro_connections(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  event_type text not null
    check (event_type in ('connection_check', 'lead_import', 'status_update', 'message', 'quote_request', 'estimate_request', 'review', 'profile_publish', 'sync_error')),
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound', 'internal')),
  marketplace_object_id text,
  ferocity_object_type text,
  ferocity_object_id uuid,
  sync_status text not null default 'logged'
    check (sync_status in ('logged', 'queued', 'processed', 'ignored', 'failed')),
  status_message text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplacepro_profile_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  connection_id uuid references public.marketplacepro_connections(id) on delete set null,
  export_status text not null default 'draft'
    check (export_status in ('draft', 'needs_review', 'approved', 'published_manually', 'sync_paused', 'failed')),
  profile_payload_json jsonb not null default '{}'::jsonb,
  last_exported_at timestamptz,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, connection_id)
);

create index if not exists idx_marketplacepro_connections_tenant
  on public.marketplacepro_connections(tenant_id, connection_status, marketplace_vendor_id);
create index if not exists idx_marketplacepro_lead_links_tenant
  on public.marketplacepro_lead_links(tenant_id, marketplace_lead_id, lead_id);
create index if not exists idx_marketplacepro_sync_events_tenant
  on public.marketplacepro_sync_events(tenant_id, event_type, created_at desc);
create index if not exists idx_marketplacepro_profile_exports_tenant
  on public.marketplacepro_profile_exports(tenant_id, export_status, updated_at desc);

alter table public.marketplacepro_connections enable row level security;
alter table public.marketplacepro_lead_links enable row level security;
alter table public.marketplacepro_sync_events enable row level security;
alter table public.marketplacepro_profile_exports enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'marketplacepro_connections',
    'marketplacepro_lead_links',
    'marketplacepro_sync_events',
    'marketplacepro_profile_exports'
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

insert into public.provider_setup_steps (
  provider_key, label, plain_language_goal, env_vars, callback_path, risk_level, live_action_rule, sort_order, metadata_json
)
values (
  'marketplacepro',
  'MarketplacePro',
  'Send MarketplacePro leads into Ferocity and use Ferocity for follow-up, estimates, jobs, reviews, and operational tracking.',
  array['MARKETPLACEPRO_WEBHOOK_SECRET'],
  '/api/integrations/marketplacepro/leads',
  'medium',
  'MarketplacePro imports are inbound only until connection mapping, signature checks, and sync rules are reviewed.',
  65,
  '{"productBoundary":"MarketplacePro remains discovery; Ferocity remains operations."}'::jsonb
)
on conflict (provider_key, label) do update
set label = excluded.label,
    plain_language_goal = excluded.plain_language_goal,
    env_vars = excluded.env_vars,
    callback_path = excluded.callback_path,
    risk_level = excluded.risk_level,
    live_action_rule = excluded.live_action_rule,
    metadata_json = excluded.metadata_json,
    updated_at = now();

insert into public.provider_accounts (tenant_id, provider_key, display_name, status, credentials_status, ownership_mode, metadata_json)
select t.id, 'marketplacepro', 'MarketplacePro', 'planned', 'not_configured', 'workspace',
  '{"purpose":"Optional discovery-to-operations integration for MarketplacePro vendors and leads"}'::jsonb
from public.tenants t
on conflict (tenant_id, provider_key) do update
set display_name = excluded.display_name,
    ownership_mode = excluded.ownership_mode,
    metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
    updated_at = now();

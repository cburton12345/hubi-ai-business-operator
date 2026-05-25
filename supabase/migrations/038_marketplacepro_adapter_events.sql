alter table public.marketplacepro_sync_events
  drop constraint if exists marketplacepro_sync_events_event_type_check;

alter table public.marketplacepro_sync_events
  add constraint marketplacepro_sync_events_event_type_check
  check (event_type in (
    'connection_check',
    'lead_import',
    'status_update',
    'message',
    'quote_request',
    'estimate_request',
    'review',
    'profile_publish',
    'sync_error',
    'post_created',
    'post_updated',
    'offer_submitted',
    'labor_pool_submitted',
    'saved_provider_created',
    'worker_contact_request_submitted',
    'follow_created',
    'notification_logged',
    'support_request_created'
  ));

create table if not exists public.marketplacepro_object_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  connection_id uuid references public.marketplacepro_connections(id) on delete set null,
  marketplace_table text not null
    check (marketplace_table in ('posts', 'offers', 'labor_pool', 'saved_providers', 'worker_contact_requests', 'follows', 'notifications', 'support_requests')),
  marketplace_object_id text not null,
  ferocity_object_type text
    check (ferocity_object_type in ('lead', 'opportunity', 'task', 'follow_up', 'customer', 'provider_relationship', 'timeline_event', 'support_request')),
  ferocity_object_id uuid,
  sync_status text not null default 'logged'
    check (sync_status in ('logged', 'queued', 'processed', 'ignored', 'failed')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, marketplace_table, marketplace_object_id)
);

create index if not exists idx_marketplacepro_object_links_tenant
  on public.marketplacepro_object_links(tenant_id, marketplace_table, marketplace_object_id);

alter table public.marketplacepro_object_links enable row level security;

drop policy if exists marketplacepro_object_links_tenant_operator on public.marketplacepro_object_links;
create policy marketplacepro_object_links_tenant_operator
on public.marketplacepro_object_links
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

update public.provider_setup_steps
set plain_language_goal = 'Connect MarketplacePro launch tables through an adapter: posts, offers, labor_pool, saved_providers, worker_contact_requests, follows, notifications, and support_requests.',
    callback_path = '/api/integrations/marketplacepro/events',
    live_action_rule = 'MarketplacePro remains public discovery. Ferocity imports activity for operations and follow-up; outbound sync stays paused until reviewed.',
    metadata_json = metadata_json || '{"adapterTables":["posts","offers","labor_pool","saved_providers","worker_contact_requests","follows","notifications","support_requests"]}'::jsonb,
    updated_at = now()
where provider_key = 'marketplacepro';

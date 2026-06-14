create table if not exists public.owner_platform_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform_key text not null,
  platform_name text not null,
  platform_type text not null default 'business'
    check (platform_type in ('business', 'marketplace', 'software', 'personal', 'safety', 'finance', 'property', 'operations')),
  connection_status text not null default 'planned'
    check (connection_status in ('planned', 'connected', 'paused', 'needs_attention', 'archived')),
  owner_layer text not null default 'owner_command'
    check (owner_layer in ('owner_command', 'personal_ops', 'both')),
  event_scope text[] not null default array[]::text[],
  action_href text,
  external_base_url text,
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform_key)
);

create index if not exists idx_owner_platform_connections_tenant_status
  on public.owner_platform_connections(tenant_id, connection_status, platform_type);

alter table public.owner_platform_connections enable row level security;

drop policy if exists owner_platform_connections_tenant_admin on public.owner_platform_connections;
create policy owner_platform_connections_tenant_admin
on public.owner_platform_connections
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

create or replace function public.set_owner_platform_connections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owner_platform_connections_touch_updated_at on public.owner_platform_connections;
create trigger owner_platform_connections_touch_updated_at
before update on public.owner_platform_connections
for each row
execute function public.set_owner_platform_connections_updated_at();

insert into public.owner_platform_connections (
  tenant_id, platform_key, platform_name, platform_type, connection_status, owner_layer, event_scope, action_href, notes, metadata_json
)
values
  ('11111111-1111-4111-8111-111111111111', 'ferocity', 'Ferocity', 'operations', 'connected', 'owner_command', array['leads','jobs','reviews','invoices','ai_actions'], '/app', 'Primary operations and AI layer.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'marketplacepro', 'MarketplacePro', 'marketplace', 'planned', 'owner_command', array['marketplace_leads','offers','contact_requests'], '/app/integrations', 'Public marketplace and vendor discovery layer.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'govflow', 'GovFlow', 'software', 'planned', 'owner_command', array['deadlines','opportunities','compliance'], '/app/owner-command-center', 'Government opportunity and deadline signals.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', '4bid', '4Bid', 'marketplace', 'planned', 'owner_command', array['offers','buyer_seller_risk','disputes'], '/app/owner-command-center', 'Auction/offer marketplace signals.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'h4r', 'Homes4Rent', 'property', 'planned', 'owner_command', array['properties','rentals','owner_leads','maintenance'], '/app/owner-command-center', 'Rental/property command signals.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'guardiansignal', 'GuardianSignal', 'safety', 'planned', 'owner_command', array['safety_alerts','risk','monitoring'], '/app/alerts', 'Safety and risk alerts must escalate carefully.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'preferred-trailer', 'Preferred Trailer', 'business', 'planned', 'owner_command', array['rentals','availability','payments','maintenance'], '/app/service', 'Trailer rental operations.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'diamond-homes', 'Diamond Homes', 'business', 'planned', 'owner_command', array['leads','jobs','proof','reviews'], '/app/service', 'Construction/remodeling proof and revenue signals.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'tz-construction', 'TZ''s Construction', 'business', 'planned', 'owner_command', array['storm_leads','jobs','invoices','reviews'], '/app/service', 'Roofing/storm operations and marketing signals.', '{"seed":true}'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 'personal-lifeops', 'Personal LifeOps', 'personal', 'planned', 'both', array['reminders','paperwork','people','money','waiting'], '/app/personal-ops', 'Private personal ops and owner reminders.', '{"seed":true,"private":true}'::jsonb)
on conflict (tenant_id, platform_key) do update
set platform_name = excluded.platform_name,
    platform_type = excluded.platform_type,
    event_scope = excluded.event_scope,
    action_href = excluded.action_href,
    notes = excluded.notes,
    metadata_json = public.owner_platform_connections.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('operator', 'lifeops_connections', 'LifeOps Connections', true, 'Owner-level cross-platform event registry', 257, '{"ownerLayer":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

create table if not exists public.estimate_share_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_id uuid not null references public.service_estimates(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  public_token text not null unique,
  status text not null default 'ready'
    check (status in ('draft', 'ready', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revoked')),
  email_to text,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  last_viewed_at timestamptz,
  provider_message_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, estimate_id)
);

create table if not exists public.estimate_acceptances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  estimate_share_link_id uuid not null references public.estimate_share_links(id) on delete cascade,
  estimate_id uuid not null references public.service_estimates(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  accepted_name text not null,
  accepted_email text,
  acceptance_note text,
  ip_address text,
  user_agent text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (estimate_share_link_id)
);

create table if not exists public.estimator_supplier_order_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'blocked'
    check (status in ('blocked', 'ready_for_review', 'approved_to_submit', 'submitted', 'failed', 'cancelled')),
  provider_key text,
  blocked_reason text,
  submitted_at timestamptz,
  provider_order_id text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimate_share_links enable row level security;
alter table public.estimate_acceptances enable row level security;
alter table public.estimator_supplier_order_attempts enable row level security;

drop policy if exists estimate_share_links_tenant_member on public.estimate_share_links;
create policy estimate_share_links_tenant_member
on public.estimate_share_links
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists estimate_acceptances_tenant_member on public.estimate_acceptances;
create policy estimate_acceptances_tenant_member
on public.estimate_acceptances
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists estimator_supplier_order_attempts_tenant_member on public.estimator_supplier_order_attempts;
create policy estimator_supplier_order_attempts_tenant_member
on public.estimator_supplier_order_attempts
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

create index if not exists estimate_share_links_tenant_estimate_idx
  on public.estimate_share_links (tenant_id, estimate_id, status, created_at desc);

create index if not exists estimate_acceptances_tenant_estimate_idx
  on public.estimate_acceptances (tenant_id, estimate_id, created_at desc);

create index if not exists estimator_supplier_order_attempts_tenant_po_idx
  on public.estimator_supplier_order_attempts (tenant_id, purchase_order_id, status, created_at desc);

insert into public.provider_connection_lanes (
  tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
  credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
)
select
  t.id,
  lanes.capability_key,
  lanes.provider_key,
  lanes.lane_key,
  lanes.display_name,
  lanes.connection_status,
  lanes.credentials_status,
  false,
  lanes.source,
  lanes.plain_language_status,
  lanes.metadata_json
from public.tenants t
cross join (
  values
    (
      'supplier_purchasing',
      'supplier_accounts',
      'customer_owned',
      'Customer supplier accounts',
      'not_connected',
      'not_configured',
      'manual',
      'Connect customer supplier accounts when Ferocity should check account pricing, SKUs, availability, quotes, and order readiness.',
      '{"sort":120}'::jsonb
    ),
    (
      'supplier_purchasing',
      'ferocity_supplier_purchasing',
      'ferocity_managed',
      'Ferocity-assisted purchasing',
      'available',
      'not_required',
      'platform_default',
      'Ferocity can prepare order lists and supplier quote tasks now. Live supplier ordering requires account/API setup, approval rules, and purchasing controls.',
      '{"sort":120}'::jsonb
    )
) as lanes(
  capability_key, provider_key, lane_key, display_name, connection_status,
  credentials_status, source, plain_language_status, metadata_json
)
on conflict (tenant_id, capability_key, lane_key) do nothing;

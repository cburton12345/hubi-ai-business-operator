create table if not exists public.billing_usage_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_key text references public.billing_plans(plan_key) on delete set null,
  fee_policy_id uuid references public.rebilling_markup_policies(id) on delete set null,
  charge_key text not null,
  fee_family text not null
    check (fee_family in ('tracked_growth', 'managed_payments', 'managed_marketing', 'usage_rebilling', 'managed_service')),
  description text not null,
  source_table text,
  source_id text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'queued_for_invoice', 'invoiced', 'paid', 'void', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  stripe_invoice_item_id text,
  stripe_invoice_id text,
  synced_at timestamptz,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_usage_charges_tenant_status
  on public.billing_usage_charges(tenant_id, status, created_at desc);

create index if not exists idx_billing_usage_charges_source
  on public.billing_usage_charges(tenant_id, source_table, source_id)
  where source_table is not null and source_id is not null;

create unique index if not exists uniq_billing_usage_charges_source_key
  on public.billing_usage_charges(tenant_id, charge_key, source_table, source_id)
  where source_table is not null and source_id is not null;

alter table public.billing_usage_charges enable row level security;

drop policy if exists billing_usage_charges_tenant_admin on public.billing_usage_charges;
create policy billing_usage_charges_tenant_admin
on public.billing_usage_charges
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'usage_rebilling',
  'limited',
  250,
  'monthly',
  '{"category":"Billing","description":"Approved usage, tracked-growth, managed-payment, and managed-service charges can be queued to the next Stripe subscription invoice.","approvalMode":"approval_required","plainRule":"No usage charge is sent to Stripe until reviewed and approved.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('starter', 'usage_rebilling', 'Usage and tracked-growth billing', true, 'Approved charges queue to next invoice', 252, '{"billing":true,"approvalRequired":true}'::jsonb),
  ('growth', 'usage_rebilling', 'Usage and tracked-growth billing', true, 'Approved charges queue to next invoice', 252, '{"billing":true,"approvalRequired":true}'::jsonb),
  ('operator', 'usage_rebilling', 'Usage and managed-service billing', true, 'Approved charges queue to next invoice', 252, '{"billing":true,"approvalRequired":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

create table if not exists public.rebilling_markup_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  plan_key text references public.billing_plans(plan_key) on delete cascade,
  fee_key text not null,
  fee_family text not null
    check (fee_family in ('tracked_growth', 'managed_payments', 'managed_marketing', 'usage_rebilling', 'managed_service')),
  fee_label text not null,
  applies_when text not null,
  fee_type text not null default 'percentage'
    check (fee_type in ('percentage', 'flat', 'pass_through', 'custom')),
  percentage_bps integer not null default 0
    check (percentage_bps >= 0 and percentage_bps <= 5000),
  flat_fee_cents integer not null default 0
    check (flat_fee_cents >= 0),
  monthly_cap_cents integer
    check (monthly_cap_cents is null or monthly_cap_cents >= 0),
  included boolean not null default false,
  required boolean not null default false,
  status text not null default 'planned'
    check (status in ('planned', 'available', 'active', 'paused', 'retired')),
  disclosure text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, plan_key, fee_key)
);

create index if not exists idx_rebilling_markup_policies_plan
  on public.rebilling_markup_policies(plan_key, fee_family, status);

create index if not exists idx_rebilling_markup_policies_tenant
  on public.rebilling_markup_policies(tenant_id, plan_key, fee_family, status);

alter table public.rebilling_markup_policies enable row level security;

drop policy if exists rebilling_markup_policies_tenant_admin on public.rebilling_markup_policies;
create policy rebilling_markup_policies_tenant_admin
on public.rebilling_markup_policies
for all
using (
  tenant_id is not null
  and public.has_tenant_role(tenant_id, array['owner', 'admin'])
)
with check (
  tenant_id is not null
  and public.has_tenant_role(tenant_id, array['owner', 'admin'])
);

-- Plan defaults are readable by the service/backend. Tenant-specific overrides
-- use the RLS policy above and should be created only after explicit consent.
insert into public.rebilling_markup_policies (
  tenant_id,
  plan_key,
  fee_key,
  fee_family,
  fee_label,
  applies_when,
  fee_type,
  percentage_bps,
  flat_fee_cents,
  monthly_cap_cents,
  included,
  required,
  status,
  disclosure,
  metadata_json
)
values
  (null, 'job_tracker', 'manual_tracking_only', 'usage_rebilling', 'Manual job and money tracking', 'Only manual/offline tracking is used.', 'pass_through', 0, 0, null, true, false, 'active', 'No Ferocity percentage applies when Ferocity is only tracking jobs, receipts, bids, and manual payments.', '{"publicPricing":true}'::jsonb),
  (null, 'starter', 'tracked_growth_fee', 'tracked_growth', 'Tracked growth fee', 'A Ferocity-tracked lead, follow-up, campaign, or automation becomes paid work.', 'percentage', 300, 0, 150000, false, true, 'available', 'Starter stays low-cost by using a 3% tracked-growth fee on paid jobs Ferocity can reasonably attribute. The workspace can review attributed jobs.', '{"publicPricing":true,"launchDefault":true}'::jsonb),
  (null, 'growth', 'tracked_growth_fee', 'tracked_growth', 'Reduced tracked growth fee', 'A Ferocity-tracked lead, follow-up, campaign, or automation becomes paid work.', 'percentage', 150, 0, 250000, false, true, 'available', 'Growth has a lower 1.5% tracked-growth fee because the monthly plan already covers more of the operating system.', '{"publicPricing":true,"launchDefault":true}'::jsonb),
  (null, 'operator', 'tracked_growth_fee', 'tracked_growth', 'No required tracked growth fee', 'Operator and above pay more monthly, so no default tracked-growth percentage is required.', 'percentage', 0, 0, null, true, false, 'active', 'Operator avoids required growth-fee stacking. Optional managed services, provider usage, ad spend, and payment processing can still apply when chosen.', '{"publicPricing":true,"launchDefault":true}'::jsonb),
  (null, null, 'pro_agency_tracked_growth_fee', 'tracked_growth', 'Custom growth terms', 'A multi-business, agency, or managed-growth deal includes custom terms.', 'custom', 0, 0, null, false, false, 'available', 'Pro and managed-growth arrangements use custom written terms instead of hidden default percentages.', '{"publicPricing":true,"manualPlan":"pro_agency"}'::jsonb),
  (null, 'starter', 'ferocity_pay_markup', 'managed_payments', 'Ferocity Managed Payments', 'The customer chooses Ferocity-managed Stripe Connect payments instead of connecting their own Stripe.', 'percentage', 150, 0, null, false, false, 'planned', 'Ferocity Managed Payments is not live until Stripe Connect onboarding, fee disclosure, payouts, refunds, disputes, and bank-return handling are verified.', '{"paymentMode":"ferocity_managed_connect","publicPricing":true}'::jsonb),
  (null, 'growth', 'ferocity_pay_markup', 'managed_payments', 'Ferocity Managed Payments', 'The customer chooses Ferocity-managed Stripe Connect payments instead of connecting their own Stripe.', 'percentage', 125, 0, null, false, false, 'planned', 'Ferocity Managed Payments is optional and separate from plan price or tracked-growth fees.', '{"paymentMode":"ferocity_managed_connect","publicPricing":true}'::jsonb),
  (null, 'operator', 'ferocity_pay_markup', 'managed_payments', 'Ferocity Managed Payments', 'The customer chooses Ferocity-managed Stripe Connect payments instead of connecting their own Stripe.', 'percentage', 100, 0, null, false, false, 'planned', 'Operator does not require a tracked-growth fee, but optional managed payments may carry a clearly disclosed platform fee.', '{"paymentMode":"ferocity_managed_connect","publicPricing":true}'::jsonb),
  (null, 'starter', 'managed_marketing_markup', 'managed_marketing', 'Managed marketing infrastructure', 'The customer asks Ferocity to run campaigns through Ferocity-managed ad/marketing accounts or managed services.', 'percentage', 1500, 0, null, false, false, 'planned', 'Customer-owned ad accounts are preferred for launch. Ferocity-managed marketing requires approved budgets, transparent fees, and written authorization.', '{"publicPricing":true,"adSpendMarkup":true}'::jsonb),
  (null, 'growth', 'managed_marketing_markup', 'managed_marketing', 'Managed marketing infrastructure', 'The customer asks Ferocity to run campaigns through Ferocity-managed ad/marketing accounts or managed services.', 'percentage', 1000, 0, null, false, false, 'planned', 'Managed marketing is optional. Ad spend, provider costs, and management fees must be shown before live spend.', '{"publicPricing":true,"adSpendMarkup":true}'::jsonb),
  (null, 'operator', 'managed_marketing_markup', 'managed_marketing', 'Managed marketing infrastructure', 'The customer asks Ferocity to run campaigns through Ferocity-managed ad/marketing accounts or managed services.', 'percentage', 750, 0, null, false, false, 'planned', 'Higher tiers can have lower managed-marketing markup, but live spend still requires approval and budget limits.', '{"publicPricing":true,"adSpendMarkup":true}'::jsonb)
on conflict (tenant_id, plan_key, fee_key) do update
set fee_family = excluded.fee_family,
    fee_label = excluded.fee_label,
    applies_when = excluded.applies_when,
    fee_type = excluded.fee_type,
    percentage_bps = excluded.percentage_bps,
    flat_fee_cents = excluded.flat_fee_cents,
    monthly_cap_cents = excluded.monthly_cap_cents,
    included = excluded.included,
    required = excluded.required,
    status = excluded.status,
    disclosure = excluded.disclosure,
    metadata_json = public.rebilling_markup_policies.metadata_json || excluded.metadata_json,
    updated_at = now();

update public.billing_plans
set metadata_json = metadata_json || case plan_key
  when 'starter' then '{"trackedGrowthFeeBps":300,"trackedGrowthFeeCapCents":150000,"ferocityPayFeeBps":150,"managedMarketingMarkupBps":1500}'::jsonb
  when 'growth' then '{"trackedGrowthFeeBps":150,"trackedGrowthFeeCapCents":250000,"ferocityPayFeeBps":125,"managedMarketingMarkupBps":1000}'::jsonb
  when 'operator' then '{"trackedGrowthFeeBps":0,"ferocityPayFeeBps":100,"managedMarketingMarkupBps":750}'::jsonb
  else '{}'::jsonb
end
where plan_key in ('starter', 'growth', 'operator');

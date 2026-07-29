-- Managed voice is optional. Customer-owned providers continue to be billed by
-- their provider; these policies only price Ferocity-managed voice.
update public.usage_allowance_policies
set
  overage_unit_price_cents = case
    when plan_key in ('starter', 'growth', 'operator', 'managed_operator') then 59
    else 0
  end,
  status = 'active',
  metadata_json = metadata_json || jsonb_build_object(
    'managedVoiceOnly', true,
    'byoBilledByProvider', true,
    'disclosedOverage', plan_key in ('starter', 'growth', 'operator', 'managed_operator'),
    'autoBillDisclosedOverage', plan_key in ('starter', 'growth', 'operator', 'managed_operator'),
    'providerCostCeilingCentsPerMinute', 35,
    'pricingReviewedAt', '2026-07-29',
    'plainRule', case
      when plan_key in ('starter', 'growth', 'operator', 'managed_operator')
        then 'Managed AI receptionist minutes above the plan allowance are 59 cents per minute. Bring-your-own provider usage is billed directly by that provider.'
      else 'Managed AI receptionist calling is not included on this plan.'
    end
  ),
  updated_at = now()
where tenant_id is null
  and feature_key = 'ai_receptionist'
  and unit_type = 'minute'
  and plan_key in ('free', 'job_tracker', 'starter', 'growth', 'operator', 'managed_operator');

insert into public.usage_allowance_policies (
  tenant_id, plan_key, feature_key, unit_type, included_quantity, soft_limit_quantity,
  hard_limit_quantity, overage_mode, overage_unit_price_cents, status, metadata_json
)
select
  null,
  defaults.plan_key,
  'ai_receptionist',
  'minute',
  defaults.included_quantity,
  defaults.soft_limit_quantity,
  defaults.hard_limit_quantity,
  defaults.overage_mode,
  defaults.overage_unit_price_cents,
  'active',
  jsonb_build_object(
    'managedVoiceOnly', true,
    'byoBilledByProvider', true,
    'disclosedOverage', defaults.overage_unit_price_cents > 0,
    'autoBillDisclosedOverage', defaults.overage_unit_price_cents > 0,
    'providerCostCeilingCentsPerMinute', 35,
    'pricingReviewedAt', '2026-07-29'
  )
from (
  values
    ('free', 0::numeric, 0::numeric, 0::numeric, 'pause_ai', 0::numeric),
    ('job_tracker', 0::numeric, 0::numeric, 0::numeric, 'pause_ai', 0::numeric),
    ('starter', 25::numeric, 20::numeric, 200::numeric, 'notify_then_bill', 59::numeric),
    ('growth', 100::numeric, 80::numeric, 750::numeric, 'notify_then_bill', 59::numeric),
    ('operator', 300::numeric, 240::numeric, 2000::numeric, 'notify_then_bill', 59::numeric),
    ('managed_operator', 500::numeric, 400::numeric, 5000::numeric, 'notify_then_bill', 59::numeric)
) as defaults(plan_key, included_quantity, soft_limit_quantity, hard_limit_quantity, overage_mode, overage_unit_price_cents)
where exists (select 1 from public.billing_plans p where p.plan_key = defaults.plan_key)
  and not exists (
    select 1
    from public.usage_allowance_policies p
    where p.tenant_id is null
      and p.plan_key = defaults.plan_key
      and p.feature_key = 'ai_receptionist'
      and p.unit_type = 'minute'
  );

insert into public.spend_limits (
  tenant_id, scope_type, scope_key, monthly_provider_cost_cap_cents,
  monthly_customer_charge_cap_cents, concurrent_call_limit,
  max_call_duration_seconds, failed_payment_behavior, status, metadata_json
)
select
  t.id,
  'feature',
  'ai_receptionist',
  case coalesce(s.plan_key, t.plan_key, 'free')
    when 'starter' then 2500
    when 'growth' then 10000
    when 'operator' then 30000
    when 'managed_operator' then 100000
    else 0
  end,
  case coalesce(s.plan_key, t.plan_key, 'free')
    when 'starter' then 10000
    when 'growth' then 50000
    when 'operator' then 150000
    when 'managed_operator' then 500000
    else 0
  end,
  case coalesce(s.plan_key, t.plan_key, 'free')
    when 'starter' then 2
    when 'growth' then 5
    when 'operator' then 10
    when 'managed_operator' then 20
    else 0
  end,
  case coalesce(s.plan_key, t.plan_key, 'free')
    when 'starter' then 900
    when 'growth' then 1800
    when 'operator' then 1800
    when 'managed_operator' then 3600
    else 0
  end,
  'pause_paid_ai',
  'active',
  jsonb_build_object(
    'seededForManagedVoice', true,
    'planKey', coalesce(s.plan_key, t.plan_key, 'free'),
    'providerCostCeilingCentsPerMinute', 35
  )
from public.tenants t
left join public.billing_subscriptions s on s.tenant_id = t.id
where t.account_type <> 'internal'
on conflict (tenant_id, scope_type, scope_key) do nothing;

insert into public.spend_limits (
  tenant_id, scope_type, scope_key, monthly_provider_cost_cap_cents,
  monthly_customer_charge_cap_cents, concurrent_call_limit,
  max_call_duration_seconds, failed_payment_behavior, status, metadata_json
)
select
  null, 'global', 'managed_voice', 50000, 250000, 20, 1800,
  'pause_paid_ai', 'active',
  '{"managedVoiceOnly":true,"providerCostCeilingCentsPerMinute":35,"reviewAsCustomerCountGrows":true}'::jsonb
where not exists (
  select 1
  from public.spend_limits
  where tenant_id is null and scope_type = 'global' and scope_key = 'managed_voice'
);

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
select
  defaults.plan_key,
  'managed_ai_receptionist',
  'AI phone receptionist',
  defaults.included,
  defaults.limit_label,
  208,
  jsonb_build_object(
    'managedOverageCentsPerMinute', 59,
    'byoSupported', true,
    'plainRule', defaults.plain_rule
  )
from (
  values
    ('starter', true, '25 managed minutes included; then 59 cents/minute', 'Answers, qualifies, books, and follows up within your plan allowance.'),
    ('growth', true, '100 managed minutes included; then 59 cents/minute', 'More included managed calling for growing teams.'),
    ('operator', true, '300 managed minutes included; then 59 cents/minute', 'Higher-volume autonomous reception and outbound follow-up.'),
    ('managed_operator', true, '500 managed minutes included; then 59 cents/minute', 'Managed launch with the largest included voice allowance.'),
    ('job_tracker', false, 'Available as an upgrade or with your own provider', 'Keep job tracking simple; add voice when the business needs it.')
) as defaults(plan_key, included, limit_label, plain_rule)
where exists (select 1 from public.billing_plans p where p.plan_key = defaults.plan_key)
on conflict (plan_key, feature_key) do update
set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
  updated_at = now();

create index if not exists idx_receptionist_calls_active_tenant
  on public.receptionist_calls(tenant_id, provider_key, status, started_at desc)
  where status in ('received', 'ringing', 'in_progress');

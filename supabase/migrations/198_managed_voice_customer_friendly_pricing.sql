-- Keep managed voice simple and consistent: higher-paying full-platform plans
-- must never pay a worse per-minute rate than the standalone Calls plan.

update public.usage_allowance_policies
set soft_limit_quantity = null,
    hard_limit_quantity = null,
    overage_mode = 'notify_then_bill',
    overage_unit_price_cents = 25,
    metadata_json = metadata_json || jsonb_build_object(
      'managedVoiceOnly', true,
      'byoBilledByProvider', true,
      'disclosedOverage', true,
      'autoBillDisclosedOverage', true,
      'providerCostCeilingCentsPerMinute', 20,
      'customerMaySetOptionalLimit', true,
      'noMandatoryPlanUsageCap', true,
      'pricingReviewedAt', '2026-08-26',
      'plainRule', 'Managed AI phone minutes above the plan allowance are 25 cents per completed minute. Bring-your-own provider usage is billed directly by that provider.'
    ),
    updated_at = now()
where tenant_id is null
  and plan_key in ('starter', 'growth', 'operator', 'managed_operator')
  and feature_key = 'ai_receptionist'
  and unit_type = 'minute';

update public.plan_feature_matrix
set limit_label = case plan_key
      when 'starter' then '25 managed minutes included; then 25 cents/minute'
      when 'growth' then '100 managed minutes included; then 25 cents/minute'
      when 'operator' then '300 managed minutes included; then 25 cents/minute'
      when 'managed_operator' then '500 managed minutes included; then 25 cents/minute'
      else limit_label
    end,
    metadata_json = metadata_json || jsonb_build_object(
      'managedOverageCentsPerMinute', 25,
      'byoSupported', true,
      'pricingReviewedAt', '2026-08-26'
    ),
    updated_at = now()
where feature_key = 'managed_ai_receptionist'
  and plan_key in ('starter', 'growth', 'operator', 'managed_operator');

-- Older plan seeds used a mandatory monthly charge ceiling. Paid workspaces now
-- continue at the disclosed overage price unless the customer deliberately sets
-- a limit. Provider-cost and platform emergency safeguards remain separate.
update public.spend_limits l
set monthly_customer_charge_cap_cents = null,
    metadata_json = l.metadata_json || jsonb_build_object(
      'customerMaySetOptionalLimit', true,
      'customerLimitSource', 'not_set',
      'noMandatoryPlanUsageCap', true
    ),
    updated_at = now()
from public.tenants t
left join public.billing_subscriptions s on s.tenant_id = t.id
where l.tenant_id = t.id
  and l.scope_type = 'feature'
  and l.scope_key = 'ai_receptionist'
  and coalesce(s.plan_key, t.plan_key) in ('calls', 'starter', 'growth', 'operator', 'managed_operator')
  and coalesce(l.metadata_json->>'customerLimitSource', '') <> 'customer';

update public.spend_limits
set max_call_duration_seconds = least(coalesce(max_call_duration_seconds, 1200), 1200),
    metadata_json = metadata_json || jsonb_build_object(
      'providerCostCeilingCentsPerMinute', 20,
      'managedVoiceRetailCentsPerMinute', 25,
      'emergencyCallCeilingSeconds', 1200,
      'reviewActualBlendedCost', true
    ),
    updated_at = now()
where status = 'active'
  and (
    (scope_type = 'feature' and scope_key = 'ai_receptionist')
    or (tenant_id is null and scope_type = 'global' and scope_key = 'managed_voice')
  );

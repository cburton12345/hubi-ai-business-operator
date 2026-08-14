insert into public.billing_plans (
  plan_key,name,monthly_price_cents,included_workspaces,included_brands,included_ai_runs,metadata_json
)
values (
  'calls','Ferocity Calls',4900,1,1,0,
  '{"standaloneEntryProduct":true,"voiceMinutePriceCents":25,"sharedFerocityData":true,"upgradeWithoutMigration":true}'::jsonb
)
on conflict (plan_key) do update
set name=excluded.name,
    monthly_price_cents=excluded.monthly_price_cents,
    metadata_json=public.billing_plans.metadata_json || excluded.metadata_json;

update public.usage_allowance_policies
set included_quantity=0,
    soft_limit_quantity=null,
    hard_limit_quantity=null,
    overage_mode='notify_then_bill',
    overage_unit_price_cents=25,
    status='active',
    metadata_json=metadata_json ||
      '{"managedVoiceOnly":true,"byoBilledByProvider":true,"disclosedOverage":true,"autoBillDisclosedOverage":true,"providerCostCeilingCentsPerMinute":24,"customerMaySetOptionalLimit":true,"plainRule":"Ferocity-managed voice usage is 25 cents per rounded completed minute. Bring-your-own provider charges remain between the customer and that provider."}'::jsonb,
    updated_at=now()
where tenant_id is null and plan_key='calls' and feature_key='ai_receptionist' and unit_type='minute';

insert into public.usage_allowance_policies (
  tenant_id,plan_key,feature_key,unit_type,included_quantity,soft_limit_quantity,
  hard_limit_quantity,overage_mode,overage_unit_price_cents,status,metadata_json
)
select
  null,'calls','ai_receptionist','minute',0,null,null,'notify_then_bill',25,'active',
  '{"managedVoiceOnly":true,"byoBilledByProvider":true,"disclosedOverage":true,"autoBillDisclosedOverage":true,"providerCostCeilingCentsPerMinute":24,"customerMaySetOptionalLimit":true,"plainRule":"Ferocity-managed voice usage is 25 cents per rounded completed minute. Bring-your-own provider charges remain between the customer and that provider."}'::jsonb
where not exists (
  select 1 from public.usage_allowance_policies
   where tenant_id is null and plan_key='calls' and feature_key='ai_receptionist' and unit_type='minute'
);

insert into public.plan_feature_matrix (
  plan_key,feature_key,feature_label,included,limit_label,sort_order,metadata_json
)
values
  ('calls','voice_ai','AI phone answering and approved outbound calls',true,'25 cents per managed voice minute',10,'{"callsPlan":true,"byoSupported":true}'::jsonb),
  ('calls','ai_office_manager','Phone and lead-handling intelligence',true,'Included',20,'{"callsPlan":true}'::jsonb),
  ('calls','intelligent_call_management','Business hours, screening, transfers, and escalation',true,'Included',30,'{"callsPlan":true}'::jsonb),
  ('calls','follow_up_recovery','Missed-call and post-call recovery',true,'Included; delivery provider charges may apply',40,'{"callsPlan":true}'::jsonb),
  ('calls','sms_send','Provider-connected SMS follow-up',true,'Provider connection and consent required',50,'{"callsPlan":true,"providerRequired":true}'::jsonb),
  ('calls','email_send','Email follow-up',true,'Provider connection required',60,'{"callsPlan":true,"providerRequired":true}'::jsonb),
  ('calls','calendar_sync','Availability and appointment coordination',true,'Provider connection optional',70,'{"callsPlan":true}'::jsonb),
  ('calls','byo_credential_vault','Bring your own voice or messaging provider',true,'Included',80,'{"callsPlan":true}'::jsonb)
on conflict (plan_key,feature_key) do update
set feature_label=excluded.feature_label,
    included=excluded.included,
    limit_label=excluded.limit_label,
    sort_order=excluded.sort_order,
    metadata_json=public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at=now();

insert into public.workspace_feature_entitlements (
  tenant_id,feature_key,status,usage_limit,usage_period,metadata_json
)
select
  t.id,m.feature_key,'enabled',null,'monthly',
  m.metadata_json || '{"approvalMode":"enabled","overagePolicy":"allow"}'::jsonb
from public.tenants t
join public.plan_feature_matrix m on m.plan_key='calls' and m.included=true
where coalesce((select s.plan_key from public.billing_subscriptions s where s.tenant_id=t.id),t.plan_key)='calls'
on conflict (tenant_id,feature_key) do update
set status='enabled',
    metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at=now();

insert into public.spend_limits (
  tenant_id,scope_type,scope_key,monthly_provider_cost_cap_cents,
  monthly_customer_charge_cap_cents,concurrent_call_limit,max_call_duration_seconds,
  failed_payment_behavior,status,metadata_json
)
select t.id,'feature','ai_receptionist',null,null,5,1800,'take_message_only','active',
  '{"callsPlan":true,"customerMaySetOptionalLimit":true,"providerCostCeilingCentsPerMinute":24}'::jsonb
from public.tenants t
where coalesce((select s.plan_key from public.billing_subscriptions s where s.tenant_id=t.id),t.plan_key)='calls'
on conflict (tenant_id,scope_type,scope_key) do update
set concurrent_call_limit=greatest(public.spend_limits.concurrent_call_limit,excluded.concurrent_call_limit),
    max_call_duration_seconds=excluded.max_call_duration_seconds,
    failed_payment_behavior=excluded.failed_payment_behavior,
    metadata_json=public.spend_limits.metadata_json || excluded.metadata_json,
    updated_at=now();

-- Ferocity Connect launch safety, packaging, and device entitlements.

insert into public.billing_plans
  (plan_key,name,monthly_price_cents,included_workspaces,included_brands,included_ai_runs,active,metadata_json)
values
  ('ferocity_connect','Ferocity Connect',2900,1,1,100,true,
   '{"standalone":true,"includedDevices":1,"additionalDeviceMonthlyCents":1000,"checkoutMode":"manual_until_certified"}'::jsonb)
on conflict (plan_key) do update set
  name=excluded.name, monthly_price_cents=excluded.monthly_price_cents, active=true,
  metadata_json=public.billing_plans.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix
  (plan_key,feature_key,feature_label,included,limit_label,sort_order,metadata_json)
select requested.plan_key,'sms_send','Ferocity Connect SMS',true,'One paired Android device included',35,
  '{"transport":"ferocity_connect","fairUse":true,"additionalDeviceMonthlyCents":1000}'::jsonb
from unnest(array['ferocity_connect','calls','job_tracker','starter','growth','operator','managed_operator','pro_agency']) requested(plan_key)
join public.billing_plans existing on existing.plan_key=requested.plan_key
on conflict (plan_key,feature_key) do update set
  feature_label=excluded.feature_label,included=true,limit_label=excluded.limit_label,
  metadata_json=public.plan_feature_matrix.metadata_json || excluded.metadata_json;

insert into public.usage_bundles
  (bundle_key,display_name,feature_key,unit_type,included_quantity,price_cents,currency,recurrence,expiration_policy,eligible_plan_keys,status,metadata_json)
values
  ('ferocity_connect_additional_device','Additional Ferocity Connect device','sms_send','device',1,1000,'usd','monthly','period_end',
   array['ferocity_connect','calls','job_tracker','starter','growth','operator','managed_operator','pro_agency'],'available',
   '{"requiresAndroid":true,"doesNotIncludeCarrierCharges":true}'::jsonb)
on conflict (bundle_key) do update set
  display_name=excluded.display_name,price_cents=excluded.price_cents,eligible_plan_keys=excluded.eligible_plan_keys,
  status='available',metadata_json=public.usage_bundles.metadata_json || excluded.metadata_json,updated_at=now();

update public.ferocity_connect_devices
set max_per_minute=least(max_per_minute,2),
    max_per_hour=least(max_per_hour,30),
    max_per_day=least(max_per_day,100),
    metadata_json=metadata_json || '{"launchPacing":"2/min, 30/hour, 100/day"}'::jsonb,
    updated_at=now()
where status <> 'revoked';

update public.tenant_messaging_accounts
set monthly_unit_cap=coalesce(monthly_unit_cap,1500),
    metadata_json=metadata_json || '{"includedDeviceCount":1,"additionalDeviceCount":0,"standaloneMonthlyCents":2900,"additionalDeviceMonthlyCents":1000,"perRecipientHourlyLimit":2,"failureThreshold":5,"quietHoursDefault":"21:00-08:00","notUnlimited":true}'::jsonb,
    updated_at=now()
where provider_key='ferocity_connect' and ownership_mode='customer_owned';

update public.workspace_feature_entitlements e
set status='enabled',usage_limit=null,
    metadata_json=e.metadata_json || '{"transportSafetyLimitsApply":true,"oneConnectDeviceIncluded":true}'::jsonb,
    updated_at=now()
where e.feature_key='sms_send'
  and exists (
    select 1 from public.billing_subscriptions s
    where s.tenant_id=e.tenant_id and s.status in ('trialing','active','past_due','manual','incomplete')
      and s.plan_key in ('ferocity_connect','calls','job_tracker','starter','growth','operator','managed_operator','pro_agency')
  );

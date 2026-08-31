-- Persist the conservative Connect limits for future devices and enforce the
-- account-level controls (not merely descriptive metadata).

alter table public.ferocity_connect_devices
  alter column max_per_minute set default 2,
  alter column max_per_hour set default 30,
  alter column max_per_day set default 100;

update public.tenant_messaging_accounts
set hourly_send_cap=least(coalesce(hourly_send_cap,30),30),
    daily_send_cap=least(coalesce(daily_send_cap,100),100),
    per_recipient_hourly_cap=least(coalesce(per_recipient_hourly_cap,2),2),
    recent_failure_cap=least(coalesce(recent_failure_cap,5),5),
    updated_at=now()
where provider_key='ferocity_connect' and ownership_mode='customer_owned';

insert into public.workspace_feature_entitlements
  (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select s.tenant_id,'sms_send','enabled',null,'monthly',
  '{"category":"Communication","description":"Approved SMS through a paired Android device or another configured provider","approvalMode":"review_required","overagePolicy":"allow_with_review","transportSafetyLimitsApply":true,"oneConnectDeviceIncluded":true,"publicFacing":true}'::jsonb
from public.billing_subscriptions s
where s.status in ('trialing','active','past_due','manual','incomplete')
  and s.plan_key in ('ferocity_connect','calls','job_tracker','starter','growth','operator','managed_operator','pro_agency')
on conflict (tenant_id,feature_key) do update set
  status='enabled',usage_limit=null,usage_period='monthly',
  metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at=now();

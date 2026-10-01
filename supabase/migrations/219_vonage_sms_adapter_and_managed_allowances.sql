-- Vonage is an optional managed SMS transport inside the existing messaging
-- engine. This migration deliberately does not activate live sending: secrets,
-- a sending number, US registration, webhook signing, funding, and a controlled
-- end-to-end test must all be certified first.

insert into public.messaging_providers (
  tenant_id,provider_key,display_name,provider_family,status,supports_sms,supports_mms,
  supports_email,supports_voice,supports_manual_send,supports_inbound_webhook,
  supports_delivery_webhook,requires_registration,metadata_json
)
select t.id,'vonage_sms','Vonage SMS','sms','available',true,false,false,false,false,true,true,true,
  '{"adapterImplemented":true,"certificationRequired":true,"accountUnblockedOwnerReported":true,"messagesApi":"v1"}'::jsonb
from public.tenants t where t.status<>'archived'
on conflict (tenant_id,provider_key) do update set
  display_name=excluded.display_name,provider_family=excluded.provider_family,status=excluded.status,
  supports_sms=true,supports_inbound_webhook=true,supports_delivery_webhook=true,
  requires_registration=true,
  metadata_json=public.messaging_providers.metadata_json || excluded.metadata_json,
  updated_at=now();

insert into public.tenant_messaging_accounts (
  tenant_id,provider_key,ownership_mode,account_label,connection_status,credentials_status,
  live_sending_enabled,inbound_enabled,outbound_enabled,default_channel,
  monthly_unit_cap,monthly_cost_cap_cents,hourly_send_cap,daily_send_cap,
  per_recipient_hourly_cap,recent_failure_cap,metadata_json
)
select t.id,'vonage_sms','ferocity_managed','Ferocity managed Vonage SMS',
  'not_connected','not_configured',false,false,false,'sms',null,null,30,250,2,5,
  '{"requiresA2P":true,"requiresSignedWebhooks":true,"requiresBudgetControls":true,"activationRequiresCertification":true}'::jsonb
from public.tenants t where t.status<>'archived'
on conflict (tenant_id,provider_key,ownership_mode) do update set
  account_label=excluded.account_label,
  hourly_send_cap=least(coalesce(public.tenant_messaging_accounts.hourly_send_cap,excluded.hourly_send_cap),excluded.hourly_send_cap),
  daily_send_cap=least(coalesce(public.tenant_messaging_accounts.daily_send_cap,excluded.daily_send_cap),excluded.daily_send_cap),
  per_recipient_hourly_cap=least(coalesce(public.tenant_messaging_accounts.per_recipient_hourly_cap,excluded.per_recipient_hourly_cap),excluded.per_recipient_hourly_cap),
  recent_failure_cap=least(coalesce(public.tenant_messaging_accounts.recent_failure_cap,excluded.recent_failure_cap),excluded.recent_failure_cap),
  metadata_json=public.tenant_messaging_accounts.metadata_json || excluded.metadata_json,
  updated_at=now();

insert into public.provider_accounts (
  tenant_id,provider_key,display_name,status,credentials_status,ownership_mode,
  live_actions_enabled,metadata_json
)
select t.id,'vonage_sms','Vonage SMS','planned','not_configured','ferocity_managed',false,
  '{"family":"messaging","adapterContract":"ferocity_messaging_provider_v1","liveAdapterReady":false,"approvalState":"account_unblocked","certificationRequired":true,"swappable":true,"supports":["sms","inbound_webhook","delivery_webhook"]}'::jsonb
from public.tenants t where t.status<>'archived'
on conflict (tenant_id,provider_key) do update set
  display_name=excluded.display_name,status=excluded.status,
  metadata_json=public.provider_accounts.metadata_json || excluded.metadata_json,
  updated_at=now();

update public.plan_feature_matrix
set metadata_json=metadata_json || jsonb_build_object(
  'managedSmsIncludedSegments',
  case plan_key
    when 'starter' then 100 when 'growth' then 300 when 'operator' then 1000
    when 'calls' then 100 when 'job_tracker' then 100
    when 'managed_operator' then 1000 when 'pro_agency' then 1000 else 0 end,
  'managedSmsOverageCentsPerSegment',4,
  'connectDeviceIncluded',true,
  'byoProviderUsageBilledDirectly',true
),updated_at=now()
where feature_key='sms_send';

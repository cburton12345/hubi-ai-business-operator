-- Keep TikTok identity, content publishing and advertising as separate grants.
-- Login Kit must never be mistaken for permission to publish or manage spend.

alter table public.publishing_queue drop constraint if exists publishing_queue_target_platform_check;
alter table public.publishing_queue add constraint publishing_queue_target_platform_check
  check (target_platform in ('website','google_business_profile','facebook','instagram','linkedin','tiktok','email','sms','manual'));

insert into public.integration_connections (tenant_id, provider, display_name, status, credentials_status, metadata_json)
select t.id, v.provider, v.display_name, 'planned', 'not_configured', v.metadata
from public.tenants t
cross join (values
  ('tiktok_content','TikTok Content Publishing','{"liveActionsEnabled":false,"permissionBoundary":"content_posting"}'::jsonb),
  ('tiktok_business','TikTok Ads','{"liveActionsEnabled":false,"permissionBoundary":"api_for_business"}'::jsonb)
) v(provider,display_name,metadata)
on conflict (tenant_id,provider) do update set
  display_name=excluded.display_name,
  metadata_json=public.integration_connections.metadata_json || excluded.metadata_json,
  updated_at=now();

update public.provider_connection_lanes
set provider_key='tiktok_business',
    display_name='Customer TikTok Ads',
    connection_status=case when provider_key='tiktok' then 'not_connected' else connection_status end,
    credentials_status=case when provider_key='tiktok' then 'not_configured' else credentials_status end,
    live_actions_enabled=false,
    plain_language_status='TikTok Login is not ad authorization. Connect TikTok API for Business before reporting or campaign management.',
    metadata_json=metadata_json || '{"permissionBoundary":"api_for_business"}'::jsonb,
    updated_at=now()
where capability_key='tiktok_ads' and provider_key='tiktok';

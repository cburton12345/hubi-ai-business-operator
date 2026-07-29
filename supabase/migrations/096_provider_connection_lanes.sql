create table if not exists public.provider_connection_lanes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  capability_key text not null,
  provider_key text not null,
  lane_key text not null
    check (lane_key in ('customer_owned', 'ferocity_managed')),
  display_name text not null,
  connection_status text not null default 'not_connected'
    check (connection_status in ('not_connected', 'available', 'connected', 'needs_attention', 'paused', 'blocked')),
  credentials_status text not null default 'not_configured'
    check (credentials_status in ('not_configured', 'configured', 'expired', 'revoked', 'not_required')),
  live_actions_enabled boolean not null default false,
  source text not null default 'manual'
    check (source in ('manual', 'provider_account', 'env', 'platform_default')),
  plain_language_status text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, capability_key, lane_key)
);

create index if not exists idx_provider_connection_lanes_tenant
  on public.provider_connection_lanes(tenant_id, capability_key, lane_key, connection_status);

alter table public.provider_connection_lanes enable row level security;

drop policy if exists provider_connection_lanes_tenant_operator on public.provider_connection_lanes;
create policy provider_connection_lanes_tenant_operator
on public.provider_connection_lanes
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.provider_connection_lanes (
  tenant_id, capability_key, provider_key, lane_key, display_name, connection_status,
  credentials_status, live_actions_enabled, source, plain_language_status, metadata_json
)
select
  t.id,
  defaults.capability_key,
  defaults.provider_key,
  defaults.lane_key,
  defaults.display_name,
  defaults.connection_status,
  defaults.credentials_status,
  false,
  defaults.source,
  defaults.plain_language_status,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('email', 'email_provider', 'customer_owned', 'Customer email account', 'not_connected', 'not_configured', 'manual', 'Connect the customer sender/domain when they want email to come from their business.', '{"sort":10}'::jsonb),
    ('email', 'resend_shared', 'ferocity_managed', 'Ferocity managed email', 'available', 'not_configured', 'platform_default', 'Ferocity can provide a managed email route after sender/domain setup and approval.', '{"sort":10}'::jsonb),
    ('text_alerts', 'twilio', 'customer_owned', 'Customer SMS account', 'not_connected', 'not_configured', 'manual', 'Optional. Customer-owned SMS can be connected later if they want texting through their own number.', '{"sort":20}'::jsonb),
    ('text_alerts', 'twilio_shared', 'ferocity_managed', 'Ferocity managed alerts', 'available', 'not_required', 'platform_default', 'Ferocity can use app alerts, email, dashboard queues, and manual text drafts before SMS is connected.', '{"sort":20}'::jsonb),
    ('payments', 'stripe', 'customer_owned', 'Customer Stripe', 'not_connected', 'not_configured', 'manual', 'Customer-owned Stripe is the cleanest path for direct invoice payments and customer billing ownership.', '{"sort":30}'::jsonb),
    ('payments', 'stripe_connect', 'ferocity_managed', 'Ferocity managed payments', 'not_connected', 'not_configured', 'platform_default', 'Managed payments require Stripe Connect onboarding, fee disclosure, payout handling, refunds, disputes, and webhook verification.', '{"sort":30}'::jsonb),
    ('website_publishing', 'external_publishing', 'customer_owned', 'Customer website/CMS', 'not_connected', 'not_configured', 'manual', 'Connect the customer website or CMS when Ferocity should prepare or publish approved website updates.', '{"sort":40}'::jsonb),
    ('website_publishing', 'ferocity_hosted_pages', 'ferocity_managed', 'Ferocity hosted growth pages', 'available', 'not_required', 'platform_default', 'Ferocity can draft or host controlled growth pages when the business does not want direct CMS publishing yet.', '{"sort":40}'::jsonb),
    ('google_business_profile', 'google_business_profile', 'customer_owned', 'Customer Google Business Profile', 'not_connected', 'not_configured', 'manual', 'Connect the customer GBP for review monitoring, profile work, and approved posts.', '{"sort":50}'::jsonb),
    ('google_business_profile', 'ferocity_service', 'ferocity_managed', 'Ferocity-assisted setup', 'available', 'not_required', 'platform_default', 'Ferocity can prepare GBP tasks, drafts, and checklists; live publishing still needs the customer account.', '{"sort":50}'::jsonb),
    ('google_ads', 'google_ads', 'customer_owned', 'Customer Google Ads', 'not_connected', 'not_configured', 'manual', 'Connect customer Google Ads for reporting, attribution, and approved campaign work.', '{"sort":60}'::jsonb),
    ('google_ads', 'ferocity_google_ads_manager', 'ferocity_managed', 'Ferocity managed Google Ads', 'not_connected', 'not_configured', 'platform_default', 'Managed ad buying requires Ferocity ad account readiness, customer approval, budgets, and fee rules.', '{"sort":60}'::jsonb),
    ('meta_ads', 'facebook', 'customer_owned', 'Customer Meta/Facebook', 'not_connected', 'not_configured', 'manual', 'Connect customer Meta/Facebook for page, lead, ad, and reporting access.', '{"sort":70}'::jsonb),
    ('meta_ads', 'ferocity_meta_manager', 'ferocity_managed', 'Ferocity managed Meta ads', 'not_connected', 'not_configured', 'platform_default', 'Managed Meta work requires Ferocity ad account readiness, customer approval, budgets, and fee rules.', '{"sort":70}'::jsonb),
    ('tiktok_ads', 'tiktok', 'customer_owned', 'Customer TikTok', 'not_connected', 'not_configured', 'manual', 'Connect customer TikTok for creative, posting, reporting, and approved ad workflows.', '{"sort":80}'::jsonb),
    ('tiktok_ads', 'ferocity_tiktok_manager', 'ferocity_managed', 'Ferocity managed TikTok', 'not_connected', 'not_configured', 'platform_default', 'Managed TikTok ad work requires Ferocity account readiness, customer approval, budgets, and fee rules.', '{"sort":80}'::jsonb),
    ('reddit_ads', 'reddit', 'customer_owned', 'Customer Reddit', 'not_connected', 'not_configured', 'manual', 'Connect customer Reddit for community listening, reporting, and approved ad workflows.', '{"sort":90}'::jsonb),
    ('reddit_ads', 'ferocity_reddit_manager', 'ferocity_managed', 'Ferocity managed Reddit ads', 'not_connected', 'not_configured', 'platform_default', 'Managed Reddit work requires Ferocity account readiness, customer approval, budgets, and fee rules.', '{"sort":90}'::jsonb),
    ('microsoft_ads', 'microsoft_ads', 'customer_owned', 'Customer Microsoft Ads', 'not_connected', 'not_configured', 'manual', 'Connect customer Microsoft Ads for reporting, attribution, and approved campaign work.', '{"sort":100}'::jsonb),
    ('microsoft_ads', 'ferocity_microsoft_ads_manager', 'ferocity_managed', 'Ferocity managed Microsoft Ads', 'not_connected', 'not_configured', 'platform_default', 'Managed Microsoft ad work requires Ferocity account readiness, customer approval, budgets, and fee rules.', '{"sort":100}'::jsonb),
    ('marketplacepro', 'marketplacepro', 'customer_owned', 'MarketplacePro account', 'not_connected', 'not_configured', 'manual', 'Connect MarketplacePro when marketplace leads, offers, traffic, payments, and provider events should flow into Ferocity.', '{"sort":110}'::jsonb),
    ('marketplacepro', 'owner_command_center', 'ferocity_managed', 'Ferocity event receiver', 'available', 'not_required', 'platform_default', 'Ferocity can receive signed owner-operation events once the sender uses the workspace token and URL.', '{"sort":110}'::jsonb)
) as defaults(
  capability_key, provider_key, lane_key, display_name, connection_status, credentials_status,
  source, plain_language_status, metadata_json
)
on conflict (tenant_id, capability_key, lane_key) do nothing;

update public.provider_connection_lanes lane
set connection_status = case
      when account.status = 'connected' and account.credentials_status = 'configured' then 'connected'
      when account.status = 'paused' and account.credentials_status = 'configured' then 'paused'
      when account.status = 'error' then 'needs_attention'
      else lane.connection_status
    end,
    credentials_status = account.credentials_status,
    live_actions_enabled = account.live_actions_enabled,
    source = 'provider_account',
    plain_language_status = case
      when account.status = 'connected' and account.credentials_status = 'configured' then lane.display_name || ' is connected. Live actions still depend on approval controls.'
      when account.status = 'paused' and account.credentials_status = 'configured' then lane.display_name || ' has credentials saved, but live actions are paused.'
      when account.status = 'error' then lane.display_name || ' needs attention before it can be used.'
      else lane.plain_language_status
    end,
    updated_at = now()
from public.provider_accounts account
where account.tenant_id = lane.tenant_id
  and account.provider_key = lane.provider_key;

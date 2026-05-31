insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  defaults.feature_key,
  defaults.status,
  defaults.usage_limit,
  defaults.usage_period,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('ai_generation', 'enabled', 250, 'monthly', '{"category":"AI","description":"AI drafts, summaries, replies, and operator suggestions","approvalMode":"review_required","overagePolicy":"block","plainRule":"Use AI to draft and assist. Stop when the monthly limit is reached.","costed":true,"publicFacing":false}'::jsonb),
    ('seo_autopilot', 'enabled', 150, 'monthly', '{"category":"Marketing","description":"Draft-only SEO pages, blogs, and refreshes","approvalMode":"draft_only","overagePolicy":"block","plainRule":"Create useful drafts only. Publishing stays separate.","costed":true,"publicFacing":false}'::jsonb),
    ('hosted_growth_pages', 'enabled', 150, 'monthly', '{"category":"Marketing","description":"Hosted service and city pages prepared from real business data","approvalMode":"draft_only","overagePolicy":"block","plainRule":"Prepare pages as drafts. Do not publish without review.","costed":true,"publicFacing":true}'::jsonb),
    ('publishing_queue', 'enabled', 300, 'monthly', '{"category":"Marketing","description":"Approval queue for website, GBP, and social publishing","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Nothing public goes out until it passes review.","costed":false,"publicFacing":true}'::jsonb),
    ('sms_send', 'limited', 100, 'monthly', '{"category":"Communication","description":"Customer SMS through Ferocity-managed or customer Twilio routes","approvalMode":"review_required","overagePolicy":"block","plainRule":"Texts need consent, provider setup, and review.","costed":true,"publicFacing":true}'::jsonb),
    ('email_send', 'limited', 500, 'monthly', '{"category":"Communication","description":"Customer email through shared or customer sender routes","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Emails need sender setup, unsubscribe rules, and review.","costed":true,"publicFacing":true}'::jsonb),
    ('review_requests', 'enabled', 500, 'monthly', '{"category":"Reputation","description":"Review requests after completed work and service recovery checks","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Ask for reviews only after the right job moment.","costed":true,"publicFacing":true}'::jsonb),
    ('calendar_sync', 'limited', 250, 'monthly', '{"category":"Scheduling","description":"Calendar sync for callbacks, appointments, and jobs","approvalMode":"review_required","overagePolicy":"block","plainRule":"Sync only after calendars and users are mapped.","costed":true,"publicFacing":false}'::jsonb),
    ('growth_attribution', 'enabled', null, 'monthly', '{"category":"Reporting","description":"Connect leads, jobs, revenue, content, and campaigns","approvalMode":"enabled","overagePolicy":"allow","plainRule":"Track what creates real value.","costed":false,"publicFacing":false}'::jsonb),
    ('follow_up_recovery', 'enabled', 500, 'monthly', '{"category":"Sales","description":"Stale lead, ignored estimate, callback, and invoice follow-up","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Find missed money and prepare the next action.","costed":true,"publicFacing":true}'::jsonb),
    ('payment_collection', 'limited', 250, 'monthly', '{"category":"Payments","description":"Invoice payment requests, manual payment records, Stripe checkout links, and ledger entries","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Prepare collection and ledger records. Send payment links only after review.","costed":true,"publicFacing":true}'::jsonb),
    ('marketplacepro_import', 'limited', 500, 'monthly', '{"category":"Integrations","description":"MarketplacePro activity import into Ferocity","approvalMode":"review_required","overagePolicy":"block","plainRule":"Import marketplace activity without merging the apps.","costed":false,"publicFacing":false}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
on conflict (tenant_id, feature_key) do update
set usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = coalesce(public.workspace_feature_entitlements.usage_period, excluded.usage_period),
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();

insert into public.provider_accounts (
  tenant_id, provider_key, display_name, status, credentials_status, ownership_mode,
  sender_identity, monthly_included_units, overage_policy, metadata_json
)
select
  t.id,
  defaults.provider_key,
  defaults.display_name,
  defaults.status,
  defaults.credentials_status,
  defaults.ownership_mode,
  defaults.sender_identity,
  defaults.monthly_included_units,
  defaults.overage_policy,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('openai', 'OpenAI AI Provider', 'planned', 'configured', 'ferocity_managed', 'Ferocity AI workspace key', 250, 'block', '{"purpose":"AI drafts, summaries, replies, scoring, and operator suggestions. Enforced through ai_generation entitlement."}'::jsonb),
    ('resend_shared', 'Ferocity Shared Email', 'planned', 'not_configured', 'ferocity_managed', 'Ferocity shared sender', 500, 'allow_with_review', '{"purpose":"Early email delivery through platform-managed Resend-style provider"}'::jsonb),
    ('twilio_shared', 'Ferocity Shared SMS', 'planned', 'not_configured', 'ferocity_managed', 'Ferocity shared number pool', 100, 'block', '{"purpose":"Early SMS delivery through platform-managed Twilio-style provider"}'::jsonb)
) as defaults(provider_key, display_name, status, credentials_status, ownership_mode, sender_identity, monthly_included_units, overage_policy, metadata_json)
on conflict (tenant_id, provider_key) do update
set display_name = excluded.display_name,
    monthly_included_units = coalesce(public.provider_accounts.monthly_included_units, excluded.monthly_included_units),
    overage_policy = coalesce(public.provider_accounts.overage_policy, excluded.overage_policy),
    metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('starter', 'ai_generation', 'AI Assistance', true, 'Controlled monthly drafting and suggestions', 80, '{"serviceControl":true}'::jsonb),
  ('starter', 'seo_autopilot', 'SEO Drafts', true, 'Draft-only SEO assets', 90, '{"serviceControl":true}'::jsonb),
  ('starter', 'hosted_growth_pages', 'Hosted Growth Pages', true, 'Draft pages only until reviewed', 100, '{"serviceControl":true}'::jsonb),
  ('growth', 'sms_send', 'SMS Follow-Up', true, 'Review-required sending', 110, '{"serviceControl":true}'::jsonb),
  ('growth', 'email_send', 'Email Follow-Up', true, 'Review-required sending', 120, '{"serviceControl":true}'::jsonb),
  ('growth', 'review_requests', 'Review Requests', true, 'Review flow and request queue', 130, '{"serviceControl":true}'::jsonb),
  ('operator', 'payment_collection', 'Payment Collection', true, 'Invoice payment requests and ledger tracking', 135, '{"serviceControl":true}'::jsonb),
  ('operator', 'calendar_sync', 'Calendar Sync', true, 'Provider-ready calendar sync', 140, '{"serviceControl":true}'::jsonb),
  ('operator', 'marketplacepro_import', 'MarketplacePro Import', true, 'Optional bridge import', 150, '{"serviceControl":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

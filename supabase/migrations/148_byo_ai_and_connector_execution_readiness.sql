alter table public.provider_integration_requests
  drop constraint if exists provider_integration_requests_capability_category_check;

alter table public.provider_integration_requests
  add constraint provider_integration_requests_capability_category_check
  check (capability_category in (
    'ai_text', 'sms', 'voice', 'video', 'image', 'email', 'storage',
    'payments', 'accounting', 'calendar', 'advertising', 'other'
  ));

insert into public.provider_connection_lanes (
  tenant_id, capability_key, provider_key, lane_key, display_name,
  connection_status, credentials_status, live_actions_enabled, source,
  plain_language_status, metadata_json
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
    (
      'ai_text', 'openai_byok', 'customer_owned', 'Customer OpenAI account',
      'not_connected', 'not_configured', 'manual',
      'Optional advanced connection for selected drafting and extraction work. Customer provider billing stays with the customer.',
      '{"sort":22,"advanced":true,"restrictedWorkloads":true,"proprietaryOrchestrationExcluded":true}'::jsonb
    ),
    (
      'ai_text', 'openai_managed', 'ferocity_managed', 'Ferocity managed AI',
      'available', 'not_configured', 'platform_default',
      'Ferocity provides protected AI for owner decisions, customer-facing agents, and ordinary product workflows within plan safeguards.',
      '{"sort":22,"protectedOrchestration":true}'::jsonb
    )
) as defaults(
  capability_key, provider_key, lane_key, display_name, connection_status,
  credentials_status, source, plain_language_status, metadata_json
)
on conflict (tenant_id, capability_key, lane_key) do nothing;

update public.provider_accounts
set ownership_mode = 'workspace'
where provider_key = 'openai_byok';

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
select
  p.plan_key,
  'byo_ai',
  'Bring your own AI account',
  p.plan_key in ('starter', 'growth', 'operator', 'managed_operator', 'pro_agency'),
  case
    when p.plan_key in ('starter', 'growth', 'operator', 'managed_operator', 'pro_agency')
      then 'Advanced: selected drafting and extraction work'
    else 'Available with a paid plan'
  end,
  209,
  '{"advanced":true,"providerCostBilledByCustomer":true,"protectedOrchestrationExcluded":true}'::jsonb
from public.billing_plans p
on conflict (plan_key, feature_key) do update
set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
  updated_at = now();

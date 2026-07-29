insert into public.billing_plans (
  plan_key,
  name,
  monthly_price_cents,
  included_workspaces,
  included_brands,
  included_ai_runs,
  active,
  metadata_json
)
values (
  'managed_operator',
  'Managed Operator',
  0,
  10,
  50,
  10000,
  true,
  '{"customPricing":true,"manualCheckout":true,"managedService":true,"publicPricing":true,"description":"Managed Ferocity setup, monitoring, AI action review, growth tuning, and owner escalation path. Requires written terms before billing."}'::jsonb
)
on conflict (plan_key) do update
set name = excluded.name,
    included_workspaces = excluded.included_workspaces,
    included_brands = excluded.included_brands,
    included_ai_runs = excluded.included_ai_runs,
    active = true,
    metadata_json = public.billing_plans.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('managed_operator', 'managed_ferocity_operations', 'Managed Ferocity Operations', true, 'Custom managed review and setup path', 20, '{"managedService":true,"manualTermsRequired":true}'::jsonb),
  ('managed_operator', 'ai_generation', 'Core AI Guidance', true, 'Higher managed usage with review', 80, '{"serviceControl":true,"coreAi":true,"managedService":true}'::jsonb),
  ('managed_operator', 'ai_monitoring_briefing', 'AI Monitoring And Briefing', true, 'Managed owner escalation path', 121, '{"managedService":true,"ownerEscalation":true}'::jsonb),
  ('managed_operator', 'content_studio', 'Content Studio', true, 'Managed drafts and review queue', 205, '{"marketingOs":true,"managedService":true}'::jsonb),
  ('managed_operator', 'revenue_growth_engine', 'Revenue Growth Engine', true, 'Managed source-to-revenue review', 230, '{"revenue":true,"managedService":true}'::jsonb),
  ('managed_operator', 'ad_launch_kits', 'Ad Launch Kits', true, 'Managed funnel and launch kit preparation', 241, '{"marketingOs":true,"managedService":true}'::jsonb),
  ('managed_operator', 'usage_rebilling', 'Usage And Managed-Service Billing', true, 'Approved managed-service charges queue to invoice', 252, '{"billing":true,"approvalRequired":true,"managedService":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

insert into public.rebilling_markup_policies (
  tenant_id,
  plan_key,
  fee_key,
  fee_family,
  fee_label,
  applies_when,
  fee_type,
  percentage_bps,
  flat_fee_cents,
  monthly_cap_cents,
  included,
  required,
  status,
  disclosure,
  metadata_json
)
values (
  null,
  'managed_operator',
  'managed_operator_service_fee',
  'managed_service',
  'Managed Operator service terms',
  'The customer asks Ferocity to set up, monitor, review, tune, or operate Ferocity on their behalf.',
  'custom',
  0,
  0,
  null,
  false,
  false,
  'available',
  'Managed Operator uses custom written terms. Provider costs, ad spend, payment processing, rendered media, and special implementation work must be disclosed before live use.',
  '{"publicPricing":true,"manualPlan":"managed_operator","managedService":true}'::jsonb
)
on conflict (tenant_id, plan_key, fee_key) do update
set fee_label = excluded.fee_label,
    applies_when = excluded.applies_when,
    fee_type = excluded.fee_type,
    status = excluded.status,
    disclosure = excluded.disclosure,
    metadata_json = public.rebilling_markup_policies.metadata_json || excluded.metadata_json;

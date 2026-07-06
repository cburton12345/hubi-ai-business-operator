alter table public.service_estimates
  add column if not exists payment_terms text,
  add column if not exists deposit_required_cents integer not null default 0,
  add column if not exists acceptance_notes text;

insert into public.billing_plans (plan_key, name, monthly_price_cents, included_workspaces, included_brands, included_ai_runs, metadata_json)
values
  (
    'job_tracker',
    'Job Tracker',
    3900,
    1,
    1,
    25,
    '{"stripeConnected": false, "simpleMode": true, "leadLimit": 75, "formsLimit": 1, "ferocityBranding": true}'::jsonb
  )
on conflict (plan_key) do update
set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  included_workspaces = excluded.included_workspaces,
  included_brands = excluded.included_brands,
  included_ai_runs = excluded.included_ai_runs,
  active = true,
  metadata_json = public.billing_plans.metadata_json || excluded.metadata_json;

do $$
begin
  if to_regclass('public.plan_feature_matrix') is not null then
    insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
    values
      ('job_tracker', 'simple_job_tracker', 'Simple Job Tracker', true, 'Jobs, bids, material lists, people payments, and basic invoices', 40, '{"simpleMode":true}'::jsonb),
      ('job_tracker', 'job_money_tracker', 'Jobs & Money', true, 'Bid totals, job costs, and money left per job', 45, '{"simpleMode":true}'::jsonb),
      ('job_tracker', 'basic_customer_records', 'Customer Records', true, 'Simple customers tied to bids and jobs', 50, '{"simpleMode":true}'::jsonb),
      ('job_tracker', 'basic_invoice_tracking', 'Basic Invoice Tracking', true, 'Manual invoice/payment notes, no automated collection', 55, '{"simpleMode":true}'::jsonb)
    on conflict (plan_key, feature_key) do update set
      feature_label = excluded.feature_label,
      included = excluded.included,
      limit_label = excluded.limit_label,
      sort_order = excluded.sort_order,
      metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
  end if;
end $$;

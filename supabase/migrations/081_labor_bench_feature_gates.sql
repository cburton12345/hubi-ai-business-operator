insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
from public.tenants t
cross join (
  values
    (
      'labor_staffing_requests',
      'enabled',
      25,
      'monthly',
      '{"category":"Operations","description":"Owner worker and subcontractor requests.","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Owners can request help; placement/contact still requires approval.","publicFacing":false}'::jsonb
    ),
    (
      'labor_worker_intake',
      'enabled',
      100,
      'monthly',
      '{"category":"Operations","description":"Public worker availability submissions.","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Workers can submit availability; owner reviews before matching/contact.","publicFacing":true}'::jsonb
    ),
    (
      'labor_match_suggestions',
      'enabled',
      50,
      'monthly',
      '{"category":"Operations","description":"AI/manual worker match suggestions for owner approval.","approvalMode":"review_required","overagePolicy":"block","plainRule":"Ferocity can suggest matches, but owner approves contact and placement.","publicFacing":false,"manualServiceRisk":true}'::jsonb
    )
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
select defaults.plan_key, defaults.feature_key, defaults.feature_label, defaults.included, defaults.limit_label, defaults.sort_order, defaults.metadata_json
from (
  values
  ('job_tracker', 'labor_staffing_requests', 'Worker Requests', true, 'Small monthly request limit', 182, '{"laborBench":true}'::jsonb),
  ('starter', 'labor_staffing_requests', 'Worker Requests', true, 'More monthly requests', 183, '{"laborBench":true}'::jsonb),
  ('operator', 'labor_staffing_requests', 'Worker Requests', true, 'Higher request limits', 184, '{"laborBench":true}'::jsonb),
  ('job_tracker', 'labor_worker_intake', 'Worker Availability Intake', true, 'Basic public intake', 185, '{"laborBench":true}'::jsonb),
  ('starter', 'labor_worker_intake', 'Worker Availability Intake', true, 'More worker submissions', 186, '{"laborBench":true}'::jsonb),
  ('operator', 'labor_worker_intake', 'Worker Availability Intake', true, 'Higher worker submission limits', 187, '{"laborBench":true}'::jsonb),
  ('starter', 'labor_match_suggestions', 'Labor Match Suggestions', true, 'Limited matching', 188, '{"laborBench":true,"approvalRequired":true}'::jsonb),
  ('operator', 'labor_match_suggestions', 'Labor Match Suggestions', true, 'More matching and operations visibility', 189, '{"laborBench":true,"approvalRequired":true}'::jsonb),
  ('pro_agency', 'labor_match_suggestions', 'Labor Bench / Placement Support', true, 'Higher limits and implementation support', 190, '{"laborBench":true,"approvalRequired":true,"manualService":true}'::jsonb)
) as defaults(plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
where exists (select 1 from public.billing_plans p where p.plan_key = defaults.plan_key)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

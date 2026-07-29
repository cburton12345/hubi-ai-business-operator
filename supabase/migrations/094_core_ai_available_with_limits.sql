insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'ai_generation', 'Core AI guidance', true, 'Limited setup guidance and safe drafts', 80, '{"serviceControl":true,"coreAi":true}'::jsonb),
  ('job_tracker', 'ai_generation', 'Core AI guidance', true, 'Limited setup guidance and safe drafts', 80, '{"serviceControl":true,"coreAi":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

update public.workspace_feature_entitlements
set status = 'enabled',
    metadata_json = metadata_json || '{"coreAi":true,"plainRule":"Core AI can draft, summarize, and guide. Customer-facing actions still follow approval and usage limits."}'::jsonb,
    updated_at = now()
where feature_key = 'ai_generation'
  and status in ('limited', 'disabled');

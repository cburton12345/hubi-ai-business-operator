update public.plan_feature_matrix
set feature_label = 'Connected Systems',
    limit_label = 'Owner-level cross-platform event registry',
    metadata_json = metadata_json || '{"displayName":"Connected Systems","previousLabel":"LifeOps Connections"}'::jsonb,
    updated_at = now()
where feature_key = 'lifeops_connections';

update public.owner_platform_connections
set platform_name = 'Personal Ops',
    notes = 'Private personal ops and owner reminders. Kept separate from business connected systems.',
    metadata_json = metadata_json || '{"displayName":"Personal Ops","previousLabel":"Personal LifeOps"}'::jsonb,
    updated_at = now()
where platform_key = 'personal-lifeops';

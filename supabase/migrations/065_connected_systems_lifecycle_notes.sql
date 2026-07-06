update public.plan_feature_matrix
set metadata_json = metadata_json || '{"lifecycleControls":["planned","connected","paused","needs_attention","archived"],"disconnectMeaning":"Paused systems stop owner event intake but keep history.","archiveMeaning":"Archived systems are hidden from active Connected Systems lists."}'::jsonb,
    updated_at = now()
where feature_key = 'lifeops_connections';

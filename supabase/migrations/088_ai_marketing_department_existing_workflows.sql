update public.ai_agent_workflows
set
  agent_name = 'AI Marketing Department',
  plain_goal = 'Recommend campaigns and prepare useful marketing drafts from services, areas, proof, reviews, capacity, stale leads, and lead sources.',
  metadata_json = metadata_json || '{"plainName":"Create demand","department":"marketing","usesBusinessInfo":true,"usesMarketingMemory":true}'::jsonb,
  updated_at = now()
where agent_key = 'seo_marketing_agent';

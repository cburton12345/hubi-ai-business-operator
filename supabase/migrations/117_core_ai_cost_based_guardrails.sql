-- Core Ferocity commands are part of the product, not a consumable credit.
-- Provider-backed AI remains protected by token-cost budgets in the AI service.
update public.workspace_feature_entitlements
set usage_limit = null,
    metadata_json =
      metadata_json
      - 'overagePolicy'
      - 'plainRule'
      || '{
        "costed": true,
        "costProtection": "provider_budget",
        "overagePolicy": "allow",
        "plainRule": "Everyday AI commands, drafts, summaries, and guidance are included. Protect provider cost with token-cost budgets rather than an arbitrary request count."
      }'::jsonb,
    updated_at = now()
where feature_key = 'ai_generation';

update public.plan_feature_matrix
set feature_label = 'Ferocity AI Engine',
    limit_label = 'Everyday AI commands and drafting included',
    metadata_json = metadata_json || '{"coreAi":true,"costProtection":"provider_budget","requestQuota":false}'::jsonb,
    updated_at = now()
where feature_key = 'ai_generation';

update public.provider_accounts
set metadata_json = metadata_json || '{
  "family": "voice_orchestrator",
  "adapterContract": "ferocity_voice_agent_v1",
  "liveAdapterReady": true,
  "productDataOwnedBy": "ferocity",
  "swappable": true
}'::jsonb,
    updated_at = now()
where provider_key = 'vapi_voice';

update public.provider_accounts
set metadata_json = metadata_json || '{
  "family": "voice_orchestrator",
  "adapterContract": "ferocity_voice_agent_v1",
  "liveAdapterReady": false,
  "productDataOwnedBy": "ferocity",
  "swappable": true,
  "candidatePriority": "evaluate_for_natural_conversation"
}'::jsonb,
    updated_at = now()
where provider_key = 'retell_voice';

update public.voice_provider_routes
set metadata_json = metadata_json || '{
  "adapterContract": "ferocity_voice_agent_v1",
  "providerIndependent": true,
  "switchRequiresPause": true,
  "ferocityOwnsBusinessState": true
}'::jsonb,
    plain_language_status = case
      when live_actions_enabled then plain_language_status
      else 'Choose a preferred and fallback voice adapter. Ferocity keeps business state outside the provider, and live calling remains off until the selected adapter is configured, tested, and activated.'
    end,
    updated_at = now()
where route_family = 'voice_orchestrator';

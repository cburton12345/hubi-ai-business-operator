update public.provider_accounts
set metadata_json = metadata_json || '{
  "adapterContract": "ferocity_voice_agent_v1",
  "liveAdapterReady": true,
  "supports": [
    "assistant_sync",
    "phone_binding",
    "outbound_calls",
    "authenticated_webhooks",
    "transcripts",
    "post_call_analysis"
  ]
}'::jsonb,
    updated_at = now()
where provider_key = 'retell_voice';

create table if not exists public.voice_provider_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  route_family text not null
    check (route_family in ('telephony', 'sip', 'speech_to_text', 'text_to_speech', 'realtime_llm', 'voice_orchestrator')),
  primary_provider_key text not null,
  fallback_provider_key text,
  status text not null default 'planned'
    check (status in ('planned', 'not_connected', 'configured', 'ready', 'active', 'paused', 'needs_attention')),
  required_env_vars text[] not null default '{}'::text[],
  plain_language_status text not null,
  live_actions_enabled boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, route_family)
);

create index if not exists idx_voice_provider_routes_tenant
  on public.voice_provider_routes(tenant_id, route_family, status);

alter table public.voice_provider_routes enable row level security;

drop policy if exists voice_provider_routes_tenant_operator on public.voice_provider_routes;
create policy voice_provider_routes_tenant_operator
on public.voice_provider_routes
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.provider_accounts (
  tenant_id, provider_key, display_name, status, credentials_status, ownership_mode,
  live_actions_enabled, metadata_json
)
select
  t.id,
  defaults.provider_key,
  defaults.display_name,
  'planned',
  'not_configured',
  defaults.ownership_mode,
  false,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    ('twilio_voice', 'Twilio Voice / Phone Numbers', 'workspace', '{"family":"telephony","supports":["phone_numbers","pstn_calls","sip_forwarding","webhooks"],"recommendedUse":"phone numbers, call routing, and optional SIP handoff","liveAdapterReady":false}'::jsonb),
    ('sip_trunk', 'SIP Trunk / Existing Phone System', 'workspace', '{"family":"sip","supports":["sip_forwarding","existing_phone_systems"],"recommendedUse":"forward calls from an existing carrier or PBX into the office-manager voice stack","liveAdapterReady":false}'::jsonb),
    ('openai_realtime', 'OpenAI Realtime', 'workspace', '{"family":"realtime_llm","supports":["realtime_conversation","speech_understanding","voice"],"recommendedUse":"low-latency AI conversation when account and budget are ready","liveAdapterReady":false}'::jsonb),
    ('deepgram_stt', 'Deepgram Speech-To-Text', 'workspace', '{"family":"speech_to_text","supports":["transcription","streaming_stt"],"recommendedUse":"listening/transcription fallback or primary STT provider","liveAdapterReady":false}'::jsonb),
    ('elevenlabs_tts', 'ElevenLabs Text-To-Speech', 'workspace', '{"family":"text_to_speech","supports":["voice_generation","branded_voice"],"recommendedUse":"premium voice output when approved","liveAdapterReady":false}'::jsonb),
    ('cartesia_tts', 'Cartesia Text-To-Speech', 'workspace', '{"family":"text_to_speech","supports":["low_latency_voice","voice_generation"],"recommendedUse":"low-latency voice output option","liveAdapterReady":false}'::jsonb),
    ('openai_tts', 'OpenAI Text-To-Speech', 'workspace', '{"family":"text_to_speech","supports":["voice_generation"],"recommendedUse":"OpenAI voice output fallback or default when approved","liveAdapterReady":false}'::jsonb),
    ('vapi_voice', 'Vapi Voice Orchestration', 'workspace', '{"family":"voice_orchestrator","supports":["voice_agent_orchestration","provider_switching"],"recommendedUse":"optional orchestration layer for telephony, STT, TTS, and LLM","liveAdapterReady":false}'::jsonb),
    ('retell_voice', 'Retell Voice Orchestration', 'workspace', '{"family":"voice_orchestrator","supports":["voice_agent_orchestration","call_monitoring"],"recommendedUse":"optional production voice-agent orchestration provider","liveAdapterReady":false}'::jsonb)
) as defaults(provider_key, display_name, ownership_mode, metadata_json)
on conflict (tenant_id, provider_key) do update
set display_name = excluded.display_name,
    metadata_json = public.provider_accounts.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.voice_provider_routes (
  tenant_id, brand_id, route_family, primary_provider_key, fallback_provider_key,
  status, required_env_vars, plain_language_status, live_actions_enabled, metadata_json
)
select
  t.id,
  null,
  defaults.route_family,
  defaults.primary_provider_key,
  defaults.fallback_provider_key,
  'planned',
  defaults.required_env_vars,
  defaults.plain_language_status,
  false,
  defaults.metadata_json
from public.tenants t
cross join (
  values
    (
      'telephony',
      'twilio_voice',
      'sip_trunk',
      array['VOICE_PROVIDER','VOICE_API_KEY','VOICE_WEBHOOK_SECRET','VOICE_PHONE_NUMBER','VOICE_MONTHLY_BUDGET_CENTS']::text[],
      'Use Twilio Voice or another phone provider for numbers, forwarding, call webhooks, and SIP handoff. Live calls stay disabled until configured.',
      '{"examples":["Twilio Voice","SIP trunk","existing business number forwarding"]}'::jsonb
    ),
    (
      'speech_to_text',
      'openai_realtime',
      'deepgram_stt',
      array['VOICE_PROVIDER','VOICE_API_KEY','VOICE_WEBHOOK_SECRET']::text[],
      'Use OpenAI Realtime or Deepgram for listening/transcription. Pick a fallback so calls can degrade safely instead of failing silently.',
      '{"examples":["OpenAI Realtime","Deepgram STT"]}'::jsonb
    ),
    (
      'text_to_speech',
      'openai_tts',
      'elevenlabs_tts',
      array['VOICE_PROVIDER','VOICE_API_KEY','VOICE_MONTHLY_BUDGET_CENTS']::text[],
      'Use OpenAI, ElevenLabs, or Cartesia for speaking. Premium voices require budget caps and approval.',
      '{"examples":["OpenAI TTS","ElevenLabs","Cartesia"]}'::jsonb
    ),
    (
      'realtime_llm',
      'openai_realtime',
      null,
      array['VOICE_PROVIDER','VOICE_API_KEY','VOICE_MONTHLY_BUDGET_CENTS']::text[],
      'Use the AI service layer for the realtime conversation brain. Provider-specific calls should stay behind the voice adapter.',
      '{"examples":["OpenAI Realtime","future realtime models"]}'::jsonb
    ),
    (
      'voice_orchestrator',
      'vapi_voice',
      'retell_voice',
      array['VOICE_PROVIDER','VOICE_API_KEY','VOICE_WEBHOOK_SECRET']::text[],
      'Optional orchestration provider for switching telephony, STT, TTS, and LLM providers without rewriting Ferocity.',
      '{"examples":["Vapi","Retell","future orchestration provider"]}'::jsonb
    )
) as defaults(route_family, primary_provider_key, fallback_provider_key, required_env_vars, plain_language_status, metadata_json)
where not exists (
  select 1
  from public.voice_provider_routes route
  where route.tenant_id = t.id
    and route.brand_id is null
    and route.route_family = defaults.route_family
);

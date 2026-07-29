insert into public.ai_provider_configs (
  provider_key, display_name, provider_family, status, default_model,
  supports_text, supports_json, supports_vision, supports_image, supports_video, supports_voice,
  cost_category, priority, config_json
)
values
  ('vapi_voice', 'Vapi Voice Orchestration', 'voice_orchestrator', 'planned', null, false, false, false, false, false, true, 'premium_voice', 20, '{"purpose":"First recommended live AI receptionist adapter; can orchestrate telephony, voice, model, tools, and webhooks."}'::jsonb),
  ('retell_voice', 'Retell Voice Orchestration', 'voice_orchestrator', 'planned', null, false, false, false, false, false, true, 'premium_voice', 30, '{"purpose":"Second live AI receptionist adapter; strong production voice-agent and monitoring fit."}'::jsonb),
  ('twilio_voice', 'Twilio Voice', 'telephony', 'planned', null, false, false, false, false, false, true, 'premium_voice', 40, '{"purpose":"Phone numbers, call routing, PSTN, SIP handoff, and telephony webhooks."}'::jsonb),
  ('sip_trunk', 'SIP Trunk', 'telephony', 'planned', null, false, false, false, false, false, true, 'premium_voice', 45, '{"purpose":"Advanced bring-your-own existing phone system or SIP carrier route."}'::jsonb),
  ('openai_realtime', 'OpenAI Realtime', 'realtime_voice', 'planned', null, true, true, false, false, false, true, 'premium_voice', 50, '{"purpose":"Realtime listening/conversation brain for low-latency phone calls."}'::jsonb),
  ('deepgram_stt', 'Deepgram Speech-To-Text', 'speech_to_text', 'planned', null, false, false, false, false, false, true, 'premium_voice', 60, '{"purpose":"Streaming transcription/listening fallback or primary STT provider."}'::jsonb),
  ('openai_tts', 'OpenAI Text-To-Speech', 'text_to_speech', 'planned', null, false, false, false, false, false, true, 'premium_voice', 70, '{"purpose":"Voice rendering for call responses or marketing voiceovers."}'::jsonb),
  ('elevenlabs_tts', 'ElevenLabs Text-To-Speech', 'text_to_speech', 'planned', null, false, false, false, false, false, true, 'premium_voice', 80, '{"purpose":"Premium voice rendering for office manager speech or marketing voiceovers."}'::jsonb),
  ('cartesia_tts', 'Cartesia Text-To-Speech', 'text_to_speech', 'planned', null, false, false, false, false, false, true, 'premium_voice', 90, '{"purpose":"Low-latency voice rendering option."}'::jsonb)
on conflict (provider_key) do update
set display_name = excluded.display_name,
    provider_family = excluded.provider_family,
    supports_voice = excluded.supports_voice,
    cost_category = excluded.cost_category,
    priority = excluded.priority,
    config_json = public.ai_provider_configs.config_json || excluded.config_json,
    updated_at = now();

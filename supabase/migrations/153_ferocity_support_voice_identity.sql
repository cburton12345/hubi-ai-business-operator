-- Correct the legacy internal Ferocity brand seed and prepare the first
-- Ferocity-owned support number without enabling live calls before testing.
update public.brands
set domain = 'ferocity.live',
    email = 'support@ferocity.live',
    business_model = 'software',
    industry = 'AI business operating system',
    vertical = 'service_business_software',
    description = 'AI operating system that helps service businesses run customer service, operations, growth, and administrative work.',
    primary_goal = 'Help business owners understand Ferocity, start successfully, and get useful support without unnecessary complexity.',
    risk_profile = 'normal',
    updated_at = now()
where tenant_id = '11111111-1111-4111-8111-111111111111'
  and slug = 'ferocity';

insert into public.office_manager_profiles (
  tenant_id, brand_id, status, display_name, role_summary, default_tone,
  autonomy_mode, interruption_style, escalation_rules_json,
  industry_playbooks_json, guardrails_json, memory_rules_json,
  provider_preferences_json, metadata_json
)
select
  b.tenant_id,
  b.id,
  'ready',
  'Ferocity Support',
  'AI support and sales receptionist for Ferocity. Help callers understand the platform, capture complete support or sales context, guide safe next steps, and create a clear human handoff when needed.',
  'warm, capable, concise, patient, and natural',
  'approval_required',
  'natural',
  '[
    "Escalate account access, security, privacy, billing disputes, cancellation requests, legal concerns, threats, emergencies, angry callers, and low-confidence answers.",
    "Never ask a caller to repeat information already captured in the same conversation.",
    "When a human is unavailable, take a complete message with the caller name, business, callback number, email when offered, reason for calling, urgency, and requested outcome."
  ]'::jsonb,
  '["service_business_software","saas_support","sales_intake","customer_success"]'::jsonb,
  '[
    "Clearly say you are Ferocity''s AI support assistant if asked or when disclosure is appropriate.",
    "Never request passwords, complete payment-card numbers, API keys, authentication codes, Social Security numbers, or banking credentials.",
    "Never claim an integration, payment, deployment, campaign, call, message, or workflow is complete unless Ferocity has verified evidence.",
    "Do not promise refunds, credits, legal outcomes, security guarantees, provider approval, or exact implementation dates.",
    "Do not make purchases, change subscriptions, publish content, launch advertising spend, or modify customer systems during a support call."
  ]'::jsonb,
  '[
    "Remember approved business preferences and prior support context without exposing one customer''s information to another.",
    "Treat authentication, billing, security, and provider credentials as sensitive."
  ]'::jsonb,
  '{"voice":["retell_voice"],"llm":"ferocity_ai_service","fallback":"owner_queue"}'::jsonb,
  '{
    "source":"ferocity_support_voice_setup",
    "liveVoice":false,
    "voiceGreeting":"Thank you for calling Ferocity. I''m Ferocity''s AI support assistant. How can I help you today?",
    "voiceLanguages":["English"],
    "voiceCallGoals":[
      "Understand whether the caller needs product help, account support, onboarding, sales information, or a human.",
      "Answer verified questions about Ferocity in plain language.",
      "Capture a qualified sales or demo request without pressuring the caller.",
      "Create a complete support handoff with urgency and next step."
    ],
    "voiceCustomInstructions":[
      "Ferocity is an AI operating system for service businesses. It helps run work rather than merely organizing tasks.",
      "Use support@ferocity.live as the safe support follow-up address.",
      "If the caller asks about a feature whose live provider connection cannot be verified, explain that availability depends on the business plan and connected provider."
    ]
  }'::jsonb
from public.brands b
where b.tenant_id = '11111111-1111-4111-8111-111111111111'
  and b.slug = 'ferocity'
on conflict (tenant_id, brand_id) do update
set status = excluded.status,
    display_name = excluded.display_name,
    role_summary = excluded.role_summary,
    default_tone = excluded.default_tone,
    autonomy_mode = excluded.autonomy_mode,
    interruption_style = excluded.interruption_style,
    escalation_rules_json = excluded.escalation_rules_json,
    industry_playbooks_json = excluded.industry_playbooks_json,
    guardrails_json = excluded.guardrails_json,
    memory_rules_json = excluded.memory_rules_json,
    provider_preferences_json = excluded.provider_preferences_json,
    metadata_json = public.office_manager_profiles.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.office_manager_channel_configs (
  tenant_id, brand_id, profile_id, channel_key, provider_key, status,
  live_actions_enabled, inbound_enabled, outbound_enabled, recording_enabled,
  transcript_enabled, consent_required, approval_mode, fallback_route,
  setup_notes, metadata_json
)
select
  p.tenant_id, p.brand_id, p.id, 'phone', 'retell_voice', 'configured',
  false, false, false, false, true, true, 'approval_required', 'owner_queue',
  'Retell and the Ferocity support number are configured. Keep live calls off until the signed webhook and first real call are verified.',
  '{"source":"ferocity_support_voice_setup","phoneNumber":"+18882566005"}'::jsonb
from public.office_manager_profiles p
join public.brands b on b.id = p.brand_id
where p.tenant_id = '11111111-1111-4111-8111-111111111111'
  and b.slug = 'ferocity'
on conflict (tenant_id, brand_id, channel_key) do update
set profile_id = excluded.profile_id,
    provider_key = excluded.provider_key,
    status = excluded.status,
    live_actions_enabled = false,
    inbound_enabled = false,
    outbound_enabled = false,
    recording_enabled = false,
    transcript_enabled = true,
    consent_required = true,
    approval_mode = excluded.approval_mode,
    fallback_route = excluded.fallback_route,
    setup_notes = excluded.setup_notes,
    metadata_json = public.office_manager_channel_configs.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.telephony_numbers (
  tenant_id, brand_id, provider_key, number_mode, phone_number, display_name,
  provider_resource_id, status, inbound_enabled, outbound_enabled,
  recording_default_enabled, transcript_default_enabled, compliance_status,
  routing_json, metadata_json
)
select
  b.tenant_id, b.id, 'retell_voice', 'ferocity_managed', '+18882566005',
  'Ferocity Support', '+18882566005', 'active', false, false, false, true,
  'needs_review',
  '{"inboundWebhook":"https://ferocity.live/api/integrations/voice-ai/inbound","eventWebhook":"https://ferocity.live/api/integrations/voice-ai/webhook","fallback":"owner_queue"}'::jsonb,
  '{"source":"retell_purchase","providerTelephony":"twilio","purchasedAt":"2026-07-30"}'::jsonb
from public.brands b
where b.tenant_id = '11111111-1111-4111-8111-111111111111'
  and b.slug = 'ferocity'
on conflict (tenant_id, phone_number) do update
set brand_id = excluded.brand_id,
    provider_key = excluded.provider_key,
    display_name = excluded.display_name,
    provider_resource_id = excluded.provider_resource_id,
    status = excluded.status,
    inbound_enabled = false,
    outbound_enabled = false,
    recording_default_enabled = false,
    transcript_default_enabled = true,
    compliance_status = excluded.compliance_status,
    routing_json = public.telephony_numbers.routing_json || excluded.routing_json,
    metadata_json = public.telephony_numbers.metadata_json || excluded.metadata_json,
    updated_at = now();

update public.provider_accounts
set display_name = 'Ferocity-managed Retell',
    status = 'paused',
    credentials_status = 'configured',
    ownership_mode = 'ferocity_managed',
    live_actions_enabled = false,
    metadata_json = metadata_json || jsonb_build_object(
      'brandId', '22222222-2222-4222-8222-222222222206',
      'phoneNumber', '+18882566005',
      'managedFor', 'ferocity_support',
      'configuredAt', now()
    ),
    updated_at = now()
where tenant_id = '11111111-1111-4111-8111-111111111111'
  and provider_key = 'retell_voice';

update public.voice_provider_routes
set primary_provider_key = 'retell_voice',
    fallback_provider_key = null,
    status = 'configured',
    live_actions_enabled = false,
    plain_language_status = 'Retell is configured for Ferocity support. Live calling remains off until the first signed-webhook call is verified.',
    metadata_json = metadata_json || '{"source":"ferocity_support_voice_setup","phoneNumber":"+18882566005"}'::jsonb,
    updated_at = now()
where tenant_id = '11111111-1111-4111-8111-111111111111'
  and route_family = 'voice_orchestrator';

insert into public.spend_limits (
  tenant_id, scope_type, scope_key, monthly_provider_cost_cap_cents,
  monthly_customer_charge_cap_cents, concurrent_call_limit,
  max_call_duration_seconds, failed_payment_behavior, status, metadata_json
)
values (
  '11111111-1111-4111-8111-111111111111',
  'feature',
  'ai_receptionist',
  5000,
  500000,
  2,
  900,
  'pause_paid_ai',
  'active',
  '{"source":"ferocity_support_voice_setup","internalSupportLine":true,"reviewAfterFirstTenCalls":true}'::jsonb
)
on conflict (tenant_id, scope_type, scope_key) do update
set monthly_provider_cost_cap_cents = excluded.monthly_provider_cost_cap_cents,
    monthly_customer_charge_cap_cents = excluded.monthly_customer_charge_cap_cents,
    concurrent_call_limit = excluded.concurrent_call_limit,
    max_call_duration_seconds = excluded.max_call_duration_seconds,
    failed_payment_behavior = excluded.failed_payment_behavior,
    status = excluded.status,
    metadata_json = public.spend_limits.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.receptionist_setup_checklists (
  tenant_id, brand_id, setup_key, status, business_basics_status,
  call_behavior_status, routing_status, scheduling_status, phone_number_status,
  test_status, activation_status, launch_notes, metadata_json
)
select
  b.tenant_id, b.id, 'ferocity_support', 'ready_to_test', 'complete',
  'complete', 'in_progress', 'not_started', 'complete', 'not_started',
  'not_started',
  'The support identity, Retell account, number, prompt, storage policy, and budget limits are prepared. Verify a real call and owner handoff before activation.',
  '{"source":"ferocity_support_voice_setup","phoneNumber":"+18882566005","recordingDefault":false}'::jsonb
from public.brands b
where b.tenant_id = '11111111-1111-4111-8111-111111111111'
  and b.slug = 'ferocity'
on conflict (tenant_id, brand_id, setup_key) do update
set status = excluded.status,
    business_basics_status = excluded.business_basics_status,
    call_behavior_status = excluded.call_behavior_status,
    routing_status = excluded.routing_status,
    scheduling_status = excluded.scheduling_status,
    phone_number_status = excluded.phone_number_status,
    test_status = excluded.test_status,
    activation_status = excluded.activation_status,
    launch_notes = excluded.launch_notes,
    metadata_json = public.receptionist_setup_checklists.metadata_json || excluded.metadata_json,
    updated_at = now();

# AI Office Manager / Voice AI

## Product Decision

Ferocity should not build a narrow phone bot. Voice is one interface into the same Ferocity AI operating system that already sees leads, customers, jobs, estimates, invoices, reminders, reviews, marketing, workforce, owner events, and business knowledge.

The module name in the app is **AI Office Manager**. Voice AI is a channel inside it.

## Current Gap

Ferocity already has:

- AI Workforce and command routing
- Business Info / business memory
- Owner Command Center
- Automation Timeline
- Action Queue
- Leads, jobs, estimates, invoices, payments, reviews, proof, scheduling, team, and marketing modules
- Provider-gated email, SMS, push, calendar, ads, publishing, and payment readiness
- AI usage tracking and cost controls

Missing before this work:

- A specific office-manager profile/personality/control layer
- Provider-agnostic voice/channel configuration
- Cross-channel conversation session model
- Memory facts tied to office/customer context
- AI office-manager action requests with approval/escalation
- Performance metrics for calls, appointments, revenue, owner time saved, and escalations
- A clear in-app surface that explains this is not live until voice/telephony providers are connected

## Architecture

### Core Principle

The AI Office Manager never becomes a duplicate CRM, duplicate scheduler, duplicate payment system, or duplicate marketing tool.

It routes work into existing Ferocity systems:

- Leads and customers
- Jobs and schedule
- Estimates and invoices
- Cash collection
- Review requests
- Proof capture
- Marketing OS
- Authority Engine
- Owner Command Center
- Automation Timeline
- Action Queue

### Provider-Agnostic Channels

Supported channel model:

- Phone / voice
- SMS
- Email
- Website chat
- Owner command
- App push / dashboard

Provider families should be swappable:

- Telephony: Twilio Voice, SIP trunk / existing phone system, future provider
- Speech-to-text: OpenAI Realtime, Deepgram, provider-defined fallback
- Text-to-speech: OpenAI, ElevenLabs, Cartesia, provider-defined fallback
- Realtime AI: OpenAI Realtime, future realtime models through the Ferocity AI service layer
- Voice orchestration: Vapi, Retell, future orchestration provider
- Email/SMS/chat: existing provider lanes

Voice routing is intentionally split by family:

- `telephony`: how calls enter Ferocity
- `speech_to_text`: how Ferocity listens/transcribes
- `text_to_speech`: how Ferocity speaks
- `realtime_llm`: the realtime conversation brain
- `voice_orchestrator`: optional provider that can bundle or switch the above

Each route can have a primary provider and fallback provider. The first seeded stack is:

- Telephony: `twilio_voice`, fallback `sip_trunk`
- Listening: `openai_realtime`, fallback `deepgram_stt`
- Speaking: `openai_tts`, fallback `elevenlabs_tts`
- Realtime brain: `openai_realtime`
- Orchestration: `vapi_voice`, fallback `retell_voice`

### Safety

Live calls, live customer messages, payment actions, ad spend, public publishing, and material ordering stay behind:

- Plan gates
- Provider readiness
- Workspace approval rules
- Confidence thresholds
- Escalation rules
- Audit logs

### What We Learned From Current Voice AI Leaders

Retell, Vapi, and Bland emphasize fast deployment, low-latency voice agents, interruptions, monitoring, and call-center scale. The consistent lesson is that voice quality alone is not enough. The real value comes when the agent can act in real systems, keep context, hand off safely, and avoid robotic conversational patterns.

Ferocity’s advantage should be closed-loop business context: the office manager can see the real lead/job/invoice/review/workforce/marketing state instead of only answering a phone script.

Sources checked:

- Retell AI: production voice agents, monitoring, scale
- Vapi: provider orchestration, latency, voice infrastructure
- Bland AI: high-volume AI call center positioning and task execution

## MVP Implemented Locally

- `office_manager_profiles`
- `office_manager_channel_configs`
- `office_manager_conversation_sessions`
- `office_manager_conversation_turns`
- `office_manager_memory_facts`
- `office_manager_action_requests`
- `office_manager_performance_metrics`
- Provider lane rows for `voice_ai`
- Provider account rows for Twilio Voice, SIP trunk, OpenAI Realtime, Deepgram, OpenAI TTS, ElevenLabs, Cartesia, Vapi, and Retell
- `voice_provider_routes` for primary/fallback telephony, listening, speaking, realtime AI, and orchestration
- Feature gate and pricing matrix rows for `ai_office_manager`
- `/app/office-manager` dashboard
- Swappable voice stack display on `/app/office-manager`
- Setup action that creates default profile, channels, memory, readiness action, metrics seed, and timeline event

## What Still Needs Keys / Providers

- Live telephony provider such as Twilio Voice or SIP trunk
- Voice AI/realtime provider such as OpenAI Realtime
- Speech-to-text provider such as Deepgram if not bundled
- Text-to-speech provider such as ElevenLabs, Cartesia, or OpenAI
- Optional orchestration provider such as Vapi or Retell
- Call recording/transcription compliance configuration
- Phone number ownership/forwarding decision
- Consent language and state-specific call recording rules

## Launch Truth

Available now:

- Office Manager configuration and readiness dashboard
- Provider readiness tracking
- Cross-channel session/action/memory schema
- Approval-first action queue foundation
- Metrics model
- Existing Ferocity systems that the office manager will orchestrate

Not live yet:

- Answering real phone calls
- Live voice synthesis
- Live speech recognition
- Automatic customer calls
- Telephony routing

# Ferocity Provider-Independent Phone System

## Product rule

Customers choose how their existing business calls should reach Ferocity. They do not choose telecom infrastructure unless they deliberately open Advanced settings.

The default path is:

1. Keep the public business number.
2. Forward calls to a Ferocity answering number.
3. Test the AI receptionist and human transfer.
4. Upgrade to a direct connection later without changing the public number.

Voice activation is independent of messaging. Missing SMS credentials or A2P
registration never block a voice-only receptionist launch; texting is an
optional connection that can be added later.

## Layers

### Customer connection

`phone_connections` stores the business owner's intent:

- `keep_number_forwarding`
- `keep_number_full`
- `new_ferocity_number`
- `bring_own_provider`

This record contains the public business number, requested capabilities, human handoff number, and setup status. It does not require a provider to be chosen for the three normal customer paths.

### Phone provider

`PhoneProvider` owns phone-network operations:

- create and port numbers
- configure forwarding
- place, answer, and transfer calls
- send SMS and MMS
- verify and normalize provider webhooks

Provider-specific credentials, request formats, signatures, and resource IDs stay inside adapters registered with `registerPhoneProvider()`.

Adding a provider must not change phone onboarding, call records, CRM logic, scheduling, authority rules, billing rules, or customer workflows.

### Voice engine

The existing `VoiceAgentProvider` adapters remain low-level infrastructure for assistant synchronization, provider connections, outbound calls, and webhook normalization.

`VoiceAgent` is the business-facing contract:

- start and stop conversations
- transfer to a human
- summarize calls
- schedule appointments
- execute Ferocity workflows

`ProviderBackedVoiceAgent` translates that contract to the selected voice engine. Ferocity owns prompts, business facts, permissions, call records, summaries, leads, appointments, workflows, and follow-up state.

### Industry and business profile

`buildVoiceAgentSystemPrompt()` creates the canonical behavior profile before any
voice adapter is called. It combines:

- the tenant's assigned industry knowledge and verification guidance
- business name, AI agent name, greeting, tone, and supported languages
- call goals and business-specific instructions
- human-escalation topics and safety guardrails

The same profile is sent through the selected voice-engine adapter, so changing
Vapi, Retell, OpenAI Realtime, or a future engine does not change Ferocity's
industry knowledge or business rules. Owners edit these fields in Office
Manager; provider IDs and raw credentials remain in Advanced settings.

### Ferocity workflow

Normalized call events enter Ferocity's existing receptionist pipeline. That pipeline owns:

- call inbox and history
- lead creation and qualification
- appointment requests
- transfer and follow-up state
- transcript and recording policy
- customer lifecycle automation
- usage metering and billing

Providers never own the canonical business workflow.

## Extension rule

To add a new phone provider:

1. Implement `PhoneProvider`.
2. Register the adapter.
3. Add its encrypted credential labels and webhook verification.
4. Add capability and contract tests.
5. Complete an authorized test number and test call.

To add a new voice engine:

1. Implement `VoiceAgentProvider`.
2. Register the adapter in the voice-engine registry.
3. Wrap it with `ProviderBackedVoiceAgent`.
4. Verify assistant sync, signed webhooks, transfer, transcript, summary, and billing events.

No core CRM, scheduling, marketing, service, or billing code should require provider-specific branching.

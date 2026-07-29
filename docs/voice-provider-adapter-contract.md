# Voice Provider Adapter Contract

Ferocity voice providers must plug into the Office Manager without changing CRM, jobs, billing, usage, or customer records.

## Current Adapter Seam

- Interface: `src/lib/providers/interfaces.ts`
- Registry: `src/lib/providers/voice-adapters.ts`
- Live adapter: `vapi_voice`
- Live adapter: `retell_voice`
- Telephony remains separate: Twilio Voice, SIP, forwarded numbers, or future carriers can feed an orchestration adapter without becoming Ferocity's conversational brain.

The setup, test, verification, activation, deactivation, and webhook paths dispatch through this contract. Provider-specific API URLs, resource IDs, credentials, payloads, and signature rules stay inside the adapter.

## Adapter Responsibilities

Each live voice adapter must normalize:

- Assistant creation/update
- Managed phone-number or call routing references
- Inbound call webhooks
- Outbound call initiation, if enabled
- Call status
- Caller/called numbers
- Provider call ID
- Provider event ID
- Duration
- Transcript/recording references
- Safe provider errors
- Provider usage and cost

## Ferocity Responsibilities

Provider adapters do not own business records. Ferocity owns:

- Tenant/workspace authorization
- Office Manager profile and rules
- Customer/lead/job/task/action records
- Call inbox records
- Transcript and recording metadata
- Usage metering
- Billing policies
- Approval gates
- Spend limits
- Audit logs
- Provider selection and fallback preference
- Portable prompts, authority rules, memories, summaries, and workflow state

## Live Provider Checklist

Before enabling a provider:

1. Add server-only env vars.
2. Verify webhook signatures.
3. Resolve tenant from trusted provider resource IDs.
4. Make webhook processing idempotent.
5. Record `provider_webhook_events`.
6. Upsert `receptionist_calls`.
7. Meter usage into `usage_meter_events`.
8. Respect spend limits and failed-payment behavior.
9. Keep outbound calls and messages disabled until consent rules are complete.
10. Add failure-path tests.

## Launch Truth

Ferocity is not a Vapi product. Vapi is the first completed adapter because it gives Ferocity a working provider-independent execution path today. The adapter creates or updates a provider assistant, assigns the configured number only at activation, places explicitly authorized calls, verifies tenant webhook authentication, resolves the tenant from trusted provider resources, and normalizes events into Ferocity records.

Vapi stays inactive until the workspace saves every required secret, synchronizes the assistant, completes an explicitly consented test call, accepts the compliance attestation, and activates the provider. The number is assigned to the assistant only during activation. Archiving a Vapi credential immediately pauses the provider route and number.

Retell is a first-class preferred/fallback candidate and now implements the same assistant sync, verification, number binding, authorized call, authenticated webhook, transcript, and analysis contract. It may become the recommended default if real Ferocity call testing confirms better conversation quality, reliability, and economics. Ferocity-managed voice remains unavailable until its separate provider credentials, compliance, budget, and operational readiness are complete.

Switching providers must not require changes to CRM records, jobs, leads, call history, customer memory, authority rules, business prompts, usage policies, or the Office Manager UI. A live provider must be paused before its route can be replaced.

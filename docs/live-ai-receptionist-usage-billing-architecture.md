# Live AI Receptionist And Usage Billing Architecture

## Existing Ferocity Architecture

Ferocity already has the right base to become a multi-tenant AI operating system instead of a standalone phone bot:

- Multi-tenant workspaces through `tenants`, `tenant_users`, brands, roles, and RLS.
- Existing CRM/service records: leads, customers, estimates, jobs, invoices, payments, reviews, proof, tasks, reminders, and operator timeline events.
- AI Workforce, Office Manager, Owner Command Center, Automation Timeline, Action Queue, Business Info, Growth, Marketing OS, and Service Ops.
- Provider accounts, customer-owned vs Ferocity-managed provider lanes, credential vault, OAuth placeholders, webhooks, Resend, Stripe, push notifications, MarketplacePro, and owner events.
- AI service abstraction and AI usage tracking for model requests.
- Stripe subscription billing, usage charge queueing, rebilling/markup policy tables, managed-payment policy groundwork, and pricing matrix rows.

The missing production foundation was not another AI tool. It was the call object model, managed-number model, provider webhook idempotency model, generalized usage meter, plan allowances, bundles, and spend controls for expensive live provider usage.

## What Already Exists

- `office_manager_*` tables for profile, channels, sessions, turns, memory, action requests, and performance metrics.
- `voice_provider_routes` for telephony, STT, TTS, realtime AI, and orchestration primary/fallback choices.
- Provider account rows for Twilio Voice, SIP trunk, OpenAI Realtime, Deepgram, OpenAI TTS, ElevenLabs, Cartesia, Vapi, and Retell.
- `/app/office-manager` dashboard with the swappable voice stack visible.
- `/api/integrations/voice-ai/webhook` safe webhook stub.
- `ai_usage_events`, `ai_budget_policies`, and AI provider configs.
- Stripe subscription and usage-charge foundation.

## Added In This Phase

Migration: `supabase/migrations/110_live_receptionist_usage_billing.sql`

New tenant-scoped tables:

- `provider_webhook_events`: verified/idempotent provider webhook ledger.
- `telephony_numbers`: Ferocity-managed, forwarded, customer-owned, BYO Twilio, or SIP numbers.
- `receptionist_calls`: normalized call inbox records linked to customers, leads, jobs, and Office Manager sessions.
- `receptionist_call_events`: status timeline for each call.
- `receptionist_call_transcripts`: consent-aware transcript records.
- `receptionist_call_recordings`: consent-aware recording pointers.
- `usage_meter_events`: generalized billable usage across phone minutes, SMS, email, AI tokens, images, videos, storage, and future units.
- `usage_allowance_policies`: plan/tenant configurable included usage and overage behavior.
- `usage_bundles`: configurable minute, video, and AI-credit bundle catalog.
- `usage_bundle_purchases`: tenant bundle balances.
- `spend_limits`: per-tenant/provider/feature/user safety caps.

Code:

- `src/lib/providers/interfaces.ts`: provider-neutral interfaces for voice orchestration, telephony, STT, TTS, LLM, video, image, SMS, and email.
- `src/lib/usage/billing-calculator.ts`: separates provider cost from customer charge and applies markup/minimum pricing.
- `src/lib/usage/billing-calculator.test.ts`: verifies billable overage, included usage, gross profit, margin, and idempotency-key stability.

## Retell vs Vapi

Ferocity must not choose its product architecture based on either provider. Vapi and Retell are replaceable execution adapters behind the same Ferocity-owned contract.

Vapi is the first completed adapter because its flexibility made it practical to validate the abstraction. Retell remains a strong candidate for the recommended production default because of its reputation for natural phone conversations and voice-agent operations. That preference must be decided by Ferocity-specific call-quality, reliability, latency, feature, and cost testing rather than hard-coded assumptions.

1. Keep Vapi available as a working BYO adapter.
2. Retell adapter implemented through the same contract; complete real-account comparative call testing.
3. Choose preferred and fallback providers per workspace or managed policy.
4. Keep Twilio Voice and SIP as telephony options, not the mandatory conversational AI.
5. Preserve Ferocity-owned prompts, tools, authority, records, and workflows when switching.

## Integration Points

- AI Workforce / Office Manager: receptionist setup, behavior, memory, escalation, call handling.
- Today / Attention: unresolved calls, urgent leads, failed calls, missed callbacks, owner handoffs.
- Customers: call history and transcripts by customer.
- Jobs: call/action history by job.
- Growth / Marketing OS: post-job videos and voiceovers through provider-neutral media generation.
- Billing: usage, included allowance, overage, bundles, usage statements, failed-payment behavior.
- Admin: provider priority, fallback, cost rules, margin, health, errors, and usage profitability.

## Safety Rules

- Every table is tenant-scoped and RLS-protected.
- Provider webhooks must resolve tenant from verified provider resources, not blindly from request body.
- Duplicate provider events must use `provider_webhook_events` and `usage_meter_events` idempotency keys.
- Live calls, recordings, transcripts, outbound messages, scheduling, pricing, refunds, legal commitments, and payment actions remain behind provider readiness, consent, plan limits, and approval rules.
- Ferocity and H4R must use separate provider accounts, numbers, credentials, webhook secrets, usage records, compliance profiles, and billing.

## Usage Billing Model

The usage engine stores:

- Provider cost
- Customer charge
- Unit type
- Feature
- Provider
- Billing period
- Source resource
- Idempotency key
- Status

Customer price is computed separately from provider cost using configurable policies:

- Provider cost plus fixed markup
- Provider cost times markup percentage
- Minimum customer unit price
- Plan or tenant overrides
- Bundle/prepaid behavior

The customer should see included usage, remaining usage, overage estimates, projected bill, bundle balance, and upgrade/add-on options. Internal provider cost and gross margin belong in admin views only.

## External Requirements Still Needed

- Vapi or Retell account and API key.
- Ferocity-owned voice provider configuration, separate from H4R.
- Phone-number purchase/forwarding decision.
- Call recording and AI disclosure language.
- State-specific consent/compliance review.
- Provider webhook signatures for chosen provider.
- Real overage prices after provider costs are confirmed.
- Stripe metered billing or invoice-item sync activation for live usage.
- Video provider key such as Veo/OpenAI media/Runway/Kling when live rendering is desired.

## Phased Implementation Plan

1. Foundation: complete. Provider interfaces, call tables, usage meter, allowances, bundles, spend limits, docs, and tests.
2. Receptionist UI: add guided setup for business basics, call behavior, routing, scheduling, phone number, test, and activate.
3. Call inbox: show calls, transcripts, summaries, outcomes, follow-up status, and customer/job links.
4. First live provider: Vapi adapter implemented behind the provider-neutral contract for assistant config, number assignment, authenticated inbound webhook normalization, call summaries, and test/outbound calls.
5. Ferocity actions: secure tools for customer lookup/create, lead capture, appointment request, callback, task, owner notification, and follow-up drafts.
6. Usage billing: record live minutes/messages/provider costs into `usage_meter_events`, display AI Usage page, and queue approved Stripe usage charges.
7. Retell/Twilio/SIP: Retell voice-agent adapter implemented; keep Twilio/BYO/SIP as advanced telephony paths and complete real-account failover testing.
8. Video/voiceover: route post-job video and voiceover rendering through the same provider and usage engine.
9. Hardening: load tests, webhook replay tests, tenant-isolation tests, failure simulations, abuse controls, compliance documentation, and admin profitability dashboards.

## Current Launch Truth

The architecture is now ready for a live provider adapter. Ferocity still does not answer real phone calls until a provider is chosen, credentials are configured, compliance is reviewed, and the adapter is implemented and tested.

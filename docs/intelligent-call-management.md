# Intelligent call management

## Purpose

Ferocity protects the owner's attention while keeping important customers, emergencies, and sales opportunities from being missed. Call-routing policy belongs to Ferocity. Connected phone and voice providers only normalize events and execute the resulting decision.

## Architecture

The implementation extends the existing receptionist and provider-adapter stack:

1. A phone or voice adapter normalizes an inbound event.
2. The existing receptionist call record stores the call, summary, transcript, customer, lead, and provider references.
3. Ferocity classifies the call and resolves the active handling mode, attention state, schedule, customer rules, and remembered preferences.
4. A canonical decision is stored in `call_management_decisions` and returned to the provider path.
5. The call inbox presents context and owner choices. Provider execution remains gated by the connected adapter's real capabilities.

No parallel call ledger, CRM, workflow engine, or provider configuration was added.

## Supported behavior

- AI first, owner first, simultaneous ring, important-only, and AI-unless-requested strategies
- Business-hours, after-hours, weekend, vacation, busy, driving, on-job, focus, meeting, lunch, and emergency-only behavior
- Custom modes with transfer categories, importance threshold, opportunity-value threshold, and schedule
- Emergency, urgent, sales, existing-customer, VIP, warranty, supplier, employee, spam, and unknown priorities
- Context and screening summaries before a transfer
- Accept, decline, voicemail, return-to-AI, employee transfer, and callback responses
- One-time, customer, workflow, user, and organization preference scopes
- Customer no-AI preference precedence
- Provider-neutral webhook responses for future adapters

## Safety and truthfulness

- A routing decision is not reported as executed until a connected provider performs it.
- The current owner-response path records `awaiting_connected_provider` when no live adapter execution is available.
- Spam cannot override into an owner interruption.
- Emergency classification cannot be weakened by a remembered routine-call preference.
- Existing connected provider settings are preserved when the Office Manager is prepared again.

## Remaining external activation

Live transfer, voicemail, and call-control execution require a connected phone/voice adapter with the corresponding capability. Provider credentials and carrier approval are activation dependencies, not missing product architecture.

## Verification

- Focused deterministic decision tests
- Full TypeScript, lint, unit-test, RLS, build, UI-quality, and provider smoke checks
- Local authenticated UI review before production deployment

The frontend must not be deployed until the owner explicitly authorizes it.

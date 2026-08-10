# Owner Conversational Operating Layer Audit

## Decision

The proposed owner-calling capability fits Ferocity, but it must extend the existing AI Office Manager and Authority controls. A separate voice database, sales pipeline, approval engine, or task system would create contradictory state and unacceptable security risk.

## Existing systems reused

- `owner_daily_briefings` already stores daily business summaries.
- `office_manager_conversation_sessions` and turns already provide provider-independent conversation history.
- `office_manager_action_requests` already provides the Office Manager's review and task queue.
- `owner_ai_decisions` already records AI triage and recommendations.
- `scoped_saved_preferences` already supports organization, workflow, user, customer, job, and one-time preferences.
- `live_action_policies`, consent records, suppressions, provider routes, and `outbound_action_queue` already guard external communications.
- `owner_attention_states` and call-handling modes already represent owner availability and interruption preferences.
- Retell and Vapi already implement the shared voice-agent provider interface.
- Revenue follow-up sequences and `follow_up_workflows` already support continued estimate, callback, nurturing, invoice, review, referral, and reactivation work.
- The verified sales-callback tool already creates a real callback event and writes the outcome into Ferocity.

## Missing before this change

1. No private, authenticated owner voice session distinct from a public receptionist call.
2. No typed action contract shared by voice, text, and in-app owner conversations.
3. No durable audit record joining the original instruction, interpretation, approval, result, provider, and relevant Ferocity records.
4. No owner briefing opt-in record with encrypted destination, quiet hours, interruption limits, and verification state.
5. No Retell tool endpoint that rejected public calls and required an authenticated owner session before business changes.
6. No Office Manager view showing owner briefing enrollment and recent conversational actions.

## Implemented now

- Added encrypted, opt-in owner briefing preferences with a configurable daily call ceiling. The ceiling is optional protection, not a customer-facing promise about included minutes.
- Added expiring owner authentication sessions tied to authorized tenant users and provider call IDs.
- Added typed conversational action audit events with idempotency, risk, confirmation, before/result fields, provider identity, and reversibility metadata.
- Added a provider-independent conversational action schema for messages, calls, tasks, decisions, approvals, contact preferences, schedule changes, estimate changes, and pausing automation.
- Added explicit consequence and confirmation rules. External contact requires approval. Pricing, schedule, automation, and broad approvals require a second confirmation.
- Added guarded SMS/email queueing that reuses live-action policies, provider routing, consent, and suppression records.
- Added a signed Retell owner-action endpoint that still refuses the action unless the provider call maps to a live private owner session.
- Added an outbound owner-briefing service that requires an encrypted verified destination, a separate owner assistant ID, an active provider route, quiet-hour checks, attention-state checks, duplicate suppression, and a configurable daily call ceiling.
- Added Office Manager panels for owner briefings and conversational decision outcomes.
- Added a customer-facing Office Manager setup flow for encrypted phone enrollment, voice/text preferences, quiet hours, daily interruption limits, voicemail/retry behavior, and inline verification.
- Added six-digit destination verification with HMAC-hashed codes, ten-minute expiry, five-attempt lockout, three-send-per-hour throttling, provider idempotency, and tenant-scoped audit records.
- Security-message bodies and full destinations are redacted from Ferocity message history while the real values are used only for delivery.
- Standard-trust calls can discuss verified records and create low-risk internal work. External and high-impact actions require a current strong owner verification session in addition to their normal approval rules.
- Added real execution bridges for internal tasks, workflow pauses, supported contact preferences, and confirmed draft-estimate repricing. These write to the existing Ferocity task, workflow, saved-preference, and estimating records.
- Added call-scoped briefing context through the provider-independent outbound call interface. Retell receives the context as documented string-only dynamic variables.
- Added a separate private-owner Retell provisioning script. It does not alter or add owner-control tools to the public receptionist.
- Added tests for risk boundaries, strong-auth boundaries, unsupported commands, security-message redaction, provider signature failure, public-call rejection, idempotent tool identity, call-scoped context, and overnight quiet hours.

## Deliberately not claimed complete

- A separate private owner Retell assistant has a guarded provisioning script but has not been provisioned in the live provider account yet. The public Ferocity sales/receptionist agent must never gain owner-control tools.
- Verification delivery requires a live tenant SMS route. A workspace without one remains safely pending instead of pretending enrollment succeeded.
- Job rescheduling and outbound AI contact calls remain prepared actions until customer/crew notification and provider execution can complete end to end. They are not partially executed.
- Draft estimate repricing is live behind second confirmation. Sent or approved estimates are intentionally blocked until estimate revisions are supported, preventing silent changes to an accepted price.
- SMS owner conversations require a connected provider and inbound identity/session binding.
- A post-call text recap requires the same consent and provider checks as any other outbound message.
- Voice biometrics are intentionally not used. A known phone number by itself is not sufficient authentication for high-impact actions.

## Sales follow-up conclusion

Ferocity already has the correct sales foundation: shared leads, qualification, estimate follow-up, callbacks, nurture sequences, consent, stop-on-response, action queues, appointments, and human escalation. The next work is to expose those existing records and actions to a private sales voice agent through the same conversational action contract—not build another sales funnel.

## Activation order

1. Run the prepared private-owner provisioning script against the intended live Retell workspace and verify that the public assistant is unchanged.
2. Apply migrations 173 and 174, then enroll and verify one real owner destination through the authenticated app.
3. Certify one private owner briefing with read-only discussion and internal task/decision recording.
4. Certify one strongly authenticated external message through the guarded queue.
5. Certify workflow pause, supported contact preference, and draft-estimate repricing against disposable test records.
6. Add the job-rescheduling bridge only with customer/crew notification completion and rollback-safe failure reporting.

This sequence gives Ferocity the differentiator without letting a public caller, a spoofed number, a model misunderstanding, or one provider failure control a customer's business.

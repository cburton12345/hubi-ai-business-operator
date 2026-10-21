# Ferocity autonomous incoming-lead loop certification — October 6, 2026

## Scope

This tranche connects existing Ferocity capabilities into one background-operated incoming-lead loop. It does not add another dashboard and does not loosen consent, provider, approval, scheduling, or capability-trust controls.

## Implemented loop

1. A lead enters through the existing public lead or booking ingress.
2. The scheduled business automation scores it without waiting for a page view.
3. Normalized email/phone identity links repeat submissions to the canonical relationship.
4. Qualified leads match or create the appropriate customer; the canonical opportunity and communication state are created or refreshed idempotently.
5. One immediate contextual response workflow is prepared. Exact duplicate submissions within 15 minutes do not create a second response; a later or materially different request still advances as legitimate re-engagement.
6. Consent, suppression, service entitlements, live-action policy, provider health, rate/cost limits, quiet hours, and the capability trust envelope determine whether a message sends automatically or stops safely.
7. A successful send advances the authoritative lead and conversation state. Transient provider failures retry at most twice with bounded backoff under the same live policy; other failures require review.
8. No-response recovery now runs in the normal business loop, stops on reply/booking/sale/opt-out, and retains the existing frequency caps.
9. Verified inbound SMS and email stop pending outreach immediately. Ferocity prepares a grounded reply; it auto-queues only when confidence is at least 85%, no consequential ambiguity is detected, and an explicit live no-approval policy exists.
10. Customer-requested appointment windows are checked against appointments, jobs, visits, and connected-calendar events. Conflict-free requests can book only under an explicit live scheduling policy; conflicts remain requested and create one owner exception.

## Evidence

- Rollback-only certification executed the real reconciliation and appointment SQL against the production schema without persisting data or contacting a provider.
- Lead scenario: original inquiry, exact duplicate, legitimate returning request, and no-contact malformed lead.
- Verified results: two related submissions linked, one customer, two authoritative opportunities, four communication threads, two initial response workflows, one incomplete-lead owner exception.
- Appointment scenario: one conflict-free request booked and its owner request resolved; one overlapping request remained pending and produced one conflict exception.
- Focused tests passed on October 6, 2026: 7 files / 23 tests covering contextual responses, stop-on-reply persistence, authorized sends, capability/policy denial, provider failure metadata, bounded retry, SMS/email inbound reply handling, authoritative state advancement, and lifecycle frequency/stop safeguards.
- TypeScript, targeted ESLint, and `git diff --check` passed.
- The complete local predeploy gate passed: public/provider/capability truth guards, UI and architecture guards, zero pending migrations, 211 Vitest files / 789 tests, seven Marketplace worker tests, TypeScript, full ESLint, the optimized production build, and the document-runtime artifact check.

## Safety and remaining release evidence

- No external customer message was sent.
- No test record survived the rollback transaction.
- No migration or deployment occurred.
- The certification proves Ferocity's authoritative appointment state and conflict checks; it does not claim that an external calendar event was written. External-calendar write certification remains separate.
- A real scheduled production smoke through public ingress remains required after an explicitly authorized release. It must use a dedicated Ferocity-controlled test workspace/contact and verify the scheduled worker rather than manually invoking the UI.

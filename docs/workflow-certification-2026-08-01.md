# Workflow Certification — 2026-08-01

## Executive answer

The previous 39-workflow check verified that required pages, handlers, services, and database objects were connected in source. It did **not** prove that all 39 workflows completed end-to-end against live third-party providers. This certification separates four different evidence levels so a wiring check is never presented as a completed live test.

- **Executed:** a reversible workflow was actually run and its database/result state was asserted.
- **Behavior tested:** automated tests exercised decisions, validation, safety, and failure paths.
- **Wiring verified:** source integration exists, but the full external journey has not yet run.
- **Post-deploy certification:** needs a deployed callback URL, real provider account, handset, payment, or public destination.

## Certification matrix

| # | Workflow | Evidence now | Remaining certification |
|---:|---|---|---|
| 1 | Growth funnel → qualification | Behavior tested | Production observation |
| 2 | Qualification → lead scoring | Behavior tested | Production observation |
| 3 | Qualified lead → follow-up | Wiring verified | Real delivery and reply |
| 4 | Construction intelligence → owner action | Behavior tested | Production observation |
| 5 | Authority link intelligence → owner action | Behavior tested | Production observation |
| 6 | Scheduled automation execution | Wiring verified | Deployed scheduler/background worker |
| 7 | Owner command front door | Behavior tested | Production observation |
| 8 | Public website chat | **Executed end-to-end locally** | Deployed smoke |
| 9 | Customer lifecycle automation | Wiring verified | Real lifecycle event journey |
| 10 | AI phone receptionist | Behavior tested | Real Retell handset call and webhook |
| 11 | Premium video generation | Wiring verified | One real Veo render and retrieval |
| 12 | Bring-your-own provider request | Wiring verified | Real provider request journey |
| 13 | Guarded adapter factory | Behavior tested | Production observation |
| 14 | Bring-your-own AI credentials | Behavior tested | One real tenant credential call |
| 15 | Connector runtime | Behavior tested | Provider-specific OAuth/API calls |
| 16 | Industry knowledge modules | Behavior tested | Production observation |
| 17 | Referral attribution | Wiring verified | Real referral conversion |
| 18 | Service operating kernel | Behavior tested | Production observation |
| 19 | Scheduling and dispatch | Behavior tested, including invalid/missing visit inputs | Real dispatcher journey |
| 20 | Field completion gates | Behavior tested, including rejected forms/signatures | Real employee-app journey |
| 21 | Offline sync | Wiring verified | Device offline/reconnect test |
| 22 | Pricebook estimate | Behavior tested | Real estimate acceptance/payment |
| 23 | Memberships | Wiring verified | Real renewal lifecycle |
| 24 | Customer portal | Wiring verified | Deployed authenticated journey |
| 25 | Inventory ledger | Wiring verified | Real receive/use/adjust cycle |
| 26 | Inbound STOP/opt-out | Behavior tested | Real SMS provider callback |
| 27 | Imports | Wiring verified | Representative customer export files |
| 28 | Stop-on-response scheduling | Wiring verified | Real inbound response |
| 29 | Purchase receipt capture | Wiring verified | Real image/document ingestion |
| 30 | Accounting/tax export | Wiring verified | Accountant-format acceptance |
| 31 | Messaging cost controls | Behavior tested | Real provider send/cost reconciliation |
| 32 | Storage quota controls | Wiring verified | Limit-boundary upload test |
| 33 | Reporting and analytics | Wiring verified | Production data reconciliation |
| 34 | Demo flows | Behavior tested | Deployed browser smoke |
| 35 | Provider promotions | **Executed with rollback** | Production observation |
| 36 | Calendar connections | Behavior tested | Real Google/Microsoft OAuth round trip |
| 37 | Google Business Profile | Behavior tested | Real OAuth and owned-location action |
| 38 | Invoice → review request | **Executed with rollback** | Real invoice payment and review destination |
| 39 | Service-platform mappings | Behavior tested | Real Jobber/other approved OAuth sync |

## Live workflow health

The production database currently reports 54 active AI-agent workflow definitions across 6 workspaces and 9 agent roles. The audit found two abandoned records still marked `running` after interrupted processes. Migration `166_ai_agent_run_lifecycle.sql` was applied to expire those records and prevent more than one queued/running record per workflow. Runtime code now expires stale runs before scheduled or manual execution and refuses duplicate active runs.

After the repair:

- Stuck AI-agent runs: 0
- Active workflows missing their next run: 0
- Active workflows whose last run is failed: 0
- Due outbound actions: 0
- Failed or blocked outbound actions in the audit window: 0
- Active sequences without steps: 0
- Active enrollments without a sequence: 0

## Executed evidence

- Public chat: synthetic visitor message → lead → conversation → AI reply → guarded human handoff → owner event; all asserted and test data removed.
- AI command smoke: passed.
- Beta workflow smoke: passed after fixing local environment loading.
- Receptionist-call smoke: passed with rollback.
- Provider-promotion smoke: passed with rollback.
- Labor workflow smoke: passed and cleaned.
- Customer-path smoke: workspace, grader, seeded sources/forms, lead, owner events, paid-plan enforcement, live Stripe Checkout creation/expiration, and cleanup passed.
- Scheduling and field-completion regression tests cover missing data, invalid time ranges, rejected required forms, missing customer signatures, and successful completion.

## Required post-deploy certification

These are deliberately not called complete yet:

1. Scheduled/background execution on the deployed runtime.
2. One real Retell handset call, including webhook, transcript/summary, cost record, transfer/escalation, and failure handling.
3. One real Veo render and retrieval.
4. Real OAuth round trips for each launch provider that has approved the application.
5. Real SMS send, reply, opt-out, and callback behavior.
6. Real review request after exact public review destinations exist.
7. Real subscription webhook plus tenant Stripe Connect invoice payment/payout.

No frontend or application deployment was performed during this audit.

## Golden business loop conductor added locally

Ferocity now has one durable, evidence-backed conductor for the core service-business journey. It reuses the existing lead, qualification, estimate, job, visit, invoice, payment, job-cost, review, proof, marketing, authority, provider, consent, and action-policy systems.

The conductor tracks these handoffs in order:

1. Demand source recorded
2. Lead captured
3. Lead qualified
4. Estimate prepared
5. Estimate accepted
6. Work scheduled
7. Work completed
8. Invoice issued
9. Payment received
10. Job margin recorded
11. Review requested
12. Approved proof repurposed
13. Growth loop restarted

It does not infer success from the presence of a later record. If an invoice and payment exist but qualification was never evidenced, the later facts remain visible as handoff gaps and the loop is not certified.

### Reliability and safety behavior

- Every loop and stage has a tenant-scoped idempotency key.
- A loop can be paused or resumed without changing the underlying business records.
- Stage failures use bounded exponential retry metadata and dead-letter after the configured maximum.
- Certification never sends a message, places a call, publishes content, launches an ad, or creates a charge.
- Live actions continue through the existing service gates, action policies, provider routing, consent/suppression checks, spend controls, and emergency stops.
- One tenant's loop failure is contained by the existing per-tenant automation worker isolation.
- Completed jobs can prepare private proof-capture links without contacting the customer.
- Only approved proof with explicit marketing permission can become review-ready content drafts.
- Generated proof content remains behind existing review and publishing controls.

### New implementation surfaces

- `supabase/migrations/169_certified_golden_business_loop.sql`
- `src/lib/business-loop/golden-loop.ts`
- `src/lib/business-loop/sync-golden-loop.ts`
- `src/lib/business-loop/business-loop-control.ts`
- `src/app/api/business-loop/certification/route.ts`
- Scheduled business automation now evaluates the loop for each tenant after its native operational and provider queues run.

### What remains post-deploy

This implementation makes the handoffs observable and testable; it does not manufacture third-party proof. Final production certification still requires a controlled real journey with an attributed lead, a real accepted estimate, a real scheduled/completed visit, a low-dollar invoice payment, a real review request, customer-approved proof, and an approved/published growth asset. Provider-specific lanes must be certified separately because a working native loop does not prove Retell, Twilio, Stripe, Google, Meta, or another provider account is configured correctly.

### Activation result

Database migrations 167 through 170 were validated inside a rolled-back transaction and then applied successfully. The internal workspace was evaluated without executing live actions:

- 4 real existing lead journeys were enrolled idempotently.
- 4 leads were scored through the shared automated qualification service.
- 3 journeys now correctly wait at **Estimate prepared**.
- 1 journey correctly waits at **Lead qualified**.
- 0 false handoff gaps were reported.
- 0 loops were falsely marked complete.
- 0 live messages, calls, publications, ads, or charges were triggered.
- 25 provider-account records and 7 live-action policies are visible to the readiness report; only 2 provider accounts are currently both connected and credentialed.
- Golden-loop certification remains `not_tested` until a real controlled journey supplies all 13 pieces of evidence.

The final workflow health pass found one abandoned timed-out AI run. The existing stale-run reaper expired it, leaving 0 stuck runs and an overall `healthy` workflow status. The failed historical run remains visible rather than being erased.

The provider-readiness pass also found that `SECURITY_HMAC_KEY` had not been configured. A new high-entropy server-only key was generated and stored locally plus in Netlify's production, deploy-preview, and branch-deploy contexts. The key was never printed. Netlify correctly reports that the new value will take effect on the next authorized deploy; no deploy was performed here. Provider readiness now reports launch truth as OK. Meta, TikTok, Yahoo, optional Twilio SMS, and live voice remain explicit optional warnings rather than false launch promises.

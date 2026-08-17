# Ferocity Predeploy Certification — Items 6–10

Status: deployed to production and post-deploy certified on 2026-08-16. Migrations 185 and 186 are applied. Automatic Ferocity Earn settlement remains deliberately disabled pending the first controlled billing certification.

## 6. External call-log bridges

Implemented and certified locally:

- One provider-independent call-log contract for HighLevel, HubSpot, Jobber, Housecall Pro, and ServiceTitan.
- Native HighLevel contact-note and HubSpot call-engagement adapters.
- Signed bridge fallback for supported incumbent platforms without approved native access.
- Explicit tenant enablement; connecting a provider never silently enables write-back.
- One queue record per tenant, connection, and call, with a stable idempotency key.
- Bounded retry schedule, five-attempt dead-letter handling, safe errors, and provider-failure isolation.
- Canonical call, transcript, recording, and outcome remain in Ferocity. Transcripts are off by default for external handoff.
- Automated tests cover delivery, retry delay, dead-lettering, signed payloads, native adapters, contract validation, and idempotent enqueue.
- A read-only `call-log:readiness` command now reports enabled bridges, credential readiness, deliveries, and open dead letters without exposing secrets.

Live-account truth:

- No tenant currently has an external call-log bridge enabled, so there is no honest real-account delivery certification yet.
- The expired Jobber and TikTok QA authorizations require account reauthorization; neither is treated as a certified live bridge.
- Ferocity continues to function independently. Optional CRM handoff remains off until a tenant connects and deliberately enables it.

## 7. Money journey and Ferocity Earn

Proven now:

- Stripe Connect reports card payments and payouts active, no outstanding requirements, and no database drift.
- The existing certification payment link is recorded as paid for $1.00.
- Manual invoice payments require a unique idempotency key instead of relying on a time-window heuristic.
- Earn enrollment is explicit and prospective; fixed plans remain available and a fixed subscription cannot overlap an active Earn enrollment.
- Earn attribution, integer-cent calculation, tax/exclusion handling, refunds, chargebacks, credits, disputes, corrections, statements, and settlement scheduling have automated invariant coverage.
- Privileged Earn accounting functions are revoked from public, anonymous, and authenticated RPC use and limited to trusted server execution.
- Pending migrations pass rollback-only validation.

Deliberate release gate:

- Earn’s actual external monthly collection is not enabled. It stays gated until migration 186 is applied and a controlled Stripe settlement, failure, retry, dispute, and refund certification succeeds.
- The settlement runner now creates idempotent automatic Stripe invoices and reconciles paid, failed, and void webhook outcomes, but its environment gate remains off until that controlled certification.
- No tenant was enrolled and no historical payment was assessed.

## 8. Complete growth loop

The isolated Ferocity QA workspace is formally certified through all 13 stages:

1. Demand source recorded.
2. Lead captured.
3. Lead qualified.
4. Estimate prepared.
5. Estimate accepted.
6. Work scheduled.
7. Work completed.
8. Invoice issued.
9. Payment received.
10. Margin recorded.
11. Review requested.
12. Proof repurposed.
13. Growth restarted.

Result: 13 passed, 0 failed, 0 handoff gaps. The fixture is labeled QA-only and triggered no live contact, dispatch, charge, review send, or publication.

## 9. Launch pressure, isolation, and recovery

- Local production runtime pressure test: 120 requests, concurrency 12, zero failures, p95 433 ms, p99 527 ms.
- Current database health: 8 of 60 connections in use, zero due actions, zero recent failed actions, zero recent errors, and zero active capacity alerts.
- Invalid Stripe and voice-provider webhooks were rejected while `/health` and the homepage remained available.
- Workflow health: 54 active agent workflows, no missing next runs, no recent failed runs, no stuck runs, and no failed/blocked actions in the prior 24 hours.
- RLS verification covers tenant-table isolation and sensitive-table grants.
- Dependency audit is clean after updating the vulnerable transitive `nanoid` package.
- The current production site passed read-only route smoke checks for public, authentication, app-protection, health, and public-intake paths.

## 10. Truth, UI, secrets, and migration audit

- Public claim guard corrected two loose claims: routine actions now require business authorization, and follow-ups are described as prepared rather than falsely sent.
- Provider truth guard passes for all 30 providers and distinguishes certified, connectable, approval-blocked, limited, planned, and fallback-only capabilities.
- UI guard passes across 243 routes and 221 component files.
- Feature integration guard passes for 42 connected workflows.
- Public company/name leak guard passes.
- No tracked environment file or recognized live secret pattern was found in the repository scan.
- Production build includes the new Earn workspace route.
- The built-in demo walkthrough exists, but the final replacement video remains deliberately marked unapproved.

## Production release completed

- Production deploy `6a828bf2ee2b64c1f628ae34` is live at `https://ferocity.live`.
- The deploy rebuilt successfully, including 76 generated static pages and the Netlify server/background functions.
- Live route smoke passed for the homepage, features, automations, integrations, website connection, demo, guided tour, pricing, start, signup, install, business health score, login, reset, health, protected app redirect, and public worker intake.
- Desktop (1440x900) and mobile (390x844) visual checks passed with no horizontal overflow or browser console errors on the homepage, demo, pricing, start, and SMS opt-in journeys.
- Canonicals resolve to `ferocity.live`; public pages checked do not contain `noindex` or an `X-Robots-Tag: noindex` header.
- `robots.txt` allows the public marketing site while protecting `/app`, `/api`, and authenticated routes. `sitemap.xml` is live with 20 public URLs.
- Invalid Stripe and voice webhooks remain isolated: they are rejected while the health endpoint and homepage continue returning 200.
- Stripe Connect remains fully connected for card acceptance and payouts, with no current or past-due requirement groups.
- Retell remains connected with a valid agent, phone number, inbound webhook, outbound agent, and live-action/compliance readiness.
- Production capacity is healthy: 10 of 60 database connections, zero due outbound actions, zero recent failed actions, zero recent application errors, and zero active capacity alerts.
- Workflow, provider-truth, public-claim, feature-integration, and call-log readiness checks all pass.

## Remaining optional/live-account gates

These do not block the core production release, but they must remain truthful:

1. Reauthorize Jobber or TikTok only when those optional connections are needed.
2. Enable and certify the first real customer CRM call-log bridge before calling that provider’s write-back live. No bridge is currently enabled, and there are no open dead letters.
3. Complete the controlled Earn settlement certification before enabling automatic external settlement. The QA workspace has no Stripe billing customer and the production database currently has no platform subscription customer with a stored Stripe customer reference, so there is no legitimate charge target yet. `FEROCITY_EARN_SETTLEMENT_ENABLED` remains `false` in production.
4. Approve a final demo video before replacing the current truthful fallback.

## Release conclusion

The core production release is live and certified. Core Ferocity, Stripe Connect, Retell, the full business loop, tenant isolation, failure containment, public claims, responsive public journeys, and the production build are verified. Optional external CRM write-back and automatic Earn collection remain visibly gated until a real connected account exists and can be certified without fabricating data or risking an unrelated customer.

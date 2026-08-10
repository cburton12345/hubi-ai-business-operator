# Ferocity Final Bombardment Readiness Audit

Date: 2026-08-01

## Decision

Ferocity is **engineering-ready for a controlled launch**. It is **not yet honest to call the live platform bombardment-ready** until the current release is deployed and the hosting, database, and transactional-email ceilings are moved to launch-appropriate paid capacity or placed under immediate owner-approved upgrade authority.

This is an activation gap, not a reason to redesign the product.

## Verified Now

- Production build passes across 67 generated pages.
- TypeScript and lint pass.
- 71 test files and 242 tests pass.
- Public-data and company-name leak guard passes.
- UI quality guard passes across 225 routes, 204 component files, and 60 unique All Tools destinations.
- Feature wiring guard passes for 39 connected workflows.
- Production-readiness check passes for 167 migrations and 92 required files.
- RLS, tenant-table coverage, and sensitive-table grant checks pass against the live database.
- Live database capacity is healthy: 7 of 60 connections, zero due outbound actions, zero failed actions in the last hour, zero recent errors, and zero active capacity alerts at audit time.
- Workflow health is clean: 54 active agent workflows, no missing next-run timestamps, no failed active workflows, no stuck agent runs, and no broken follow-up sequence relationships.
- Stripe live subscriptions can read all five configured prices.
- Resend accepts the configured key and reports `ferocity.live` verified.
- OpenAI accepts the configured key and the current text model is reachable.
- A paid, capped 12-second Sora launch render completed, was usage-metered, downloaded successfully, and produced a valid 1280x720 MP4. This verifies the managed OpenAI video lane independently of the not-yet-deployed customer UI.
- Netlify production contains the staged security-tokenization key, video configuration and caps, Stripe secrets, email key, database CA certificate, Meta login configuration, and TikTok credentials.
- The live health endpoint returns HTTP 200.

## Launch-Critical Activation Work

1. Deploy the owner-approved release once. The current live site does not yet contain the new status page, capacity controls, public messaging, OAuth callback behavior, or the rest of this release candidate.
2. Upgrade Supabase from Free/Nano to at least Pro/Micro before driving a major launch. This adds production-appropriate compute and backup posture.
3. Upgrade Netlify from the hard-limit Free plan to a paid plan with an owner-approved recharge ceiling before intentionally buying traffic.
4. Confirm the production Resend account and move beyond any free daily-send ceiling before high-volume onboarding or password recovery.
5. Run the post-deploy customer-path, auth, Stripe, webhook, automation-dispatch, and route smoke tests.
6. Perform one real Retell call and verify transcript, summary, tenant routing, cost recording, and escalation.
7. Complete reporting-only OAuth certification for each provider that has finished provider-side review. Unsupported providers must continue to show a truthful unavailable or pending state.

## Failure Isolation Already Present

- Bounded database pools.
- Bounded tenant and agent batches.
- Tenant-level automation isolation.
- Expiring global capacity lease.
- Provider deadlines and retry rules.
- Queue, error, and connection thresholds.
- Status and emergency fallback pages in the release candidate.
- Per-tenant provider credentials and spend controls.
- Human approval boundaries for protected actions.
- Emergency shutdown and live-action gates.

## Go-Live Standard

Do not describe the platform as ready for a customer surge merely because the local suite passes. The correct launch signal is:

1. paid capacity active;
2. release deployed successfully;
3. production migrations and secrets confirmed;
4. post-deploy smoke tests green;
5. live monitoring quiet;
6. rollback and customer-status communication available.

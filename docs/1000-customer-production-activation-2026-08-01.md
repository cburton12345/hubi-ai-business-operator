# Ferocity production activation gate for the first 1,000 customers

Status: engineering preparation and the non-deploy closeout are complete for a controlled launch; paid-capacity changes, controlled live certification, and deployment are intentionally pending.

This document separates code readiness from provider-account readiness. It contains no credentials, payment details, recovery codes, or customer-private data.

## Completed now

- The full local test suite passes: 64 files and 226 tests.
- TypeScript, ESLint, the Next.js production build, and the Netlify local production build pass.
- The production build generates 67 static pages.
- Netlify bundles the short scheduled dispatcher and the 15-minute background automation worker.
- Production database migrations `163_runtime_capacity_leases.sql` and `164_platform_capacity_monitoring.sql` are applied.
- Post-migration RLS, tenant-table coverage, and sensitive-table grants pass.
- Production Supabase custom SMTP is configured through Resend for `hello@ferocity.live`.
- Supabase's auth email rate limit is raised from 30 to 100 messages per hour.
- Production environment values are staged for bounded database pooling, AI concurrency, tenant batching, agent batching, and tenant concurrency.
- Nothing in this release candidate has been deployed.
- The latest read-only production capacity check is healthy at 10 of 60 database connections (16.7 percent), zero due outbound actions, zero failed or blocked actions in the last hour, two error events in the last 15 minutes, and zero active capacity alerts.
- A separate production-only security HMAC secret plus existing Google, Meta, Reddit, and Microsoft OAuth configuration are staged in Netlify and will take effect only after the owner-authorized deployment.

## Account capacity found

### Supabase

- Current organization plan: Free.
- Current compute: Nano/shared, with 500 MB RAM.
- Recent observed infrastructure was not saturated, but memory was already approximately 53-59 percent before launch traffic.
- The Free plan has no production support guarantee and is not the appropriate launch posture for an application expected to acquire paying customers quickly.
- Recommended launch minimum: Pro at $25/month with the included Micro instance. This provides 1 GB RAM, up to 200 pooled connections, 100,000 monthly active users, 8 GB database disk, 250 GB egress, and daily backups retained for seven days.
- Upgrade compute beyond Micro only from measured connection pressure, memory, slow-query, and queue-backlog data. Do not guess or market artificial customer limits.
- Point-in-time recovery is optional later; the current minimum is Pro daily backups plus a separately tested logical/export recovery procedure.

### Netlify

- Current team plan: credit-based Free.
- Included capacity: 300 credits per month with a hard limit.
- Auto top-up: unavailable/off on Free.
- Payment method: none on the Netlify team.
- This can stop service when the credit ceiling is reached, so it is not acceptable for the intended launch.
- Recommended launch minimum: credit-based Pro, starting at $20/month with 3,000 credits and auto recharge. Personal is cheaper but is not the recommended posture for a production SaaS targeting rapid growth.
- Set a conservative recharge alert/budget, monitor function and bandwidth consumption daily during launch week, and raise the ceiling from evidence.

### Resend

- Supabase custom SMTP is enabled and a controlled password-recovery test to an existing Ferocity auth account was delivered through Resend. A direct SMTP control message using the same credential was also delivered.
- The production API credential is valid, and Resend's API reports `ferocity.live` as verified in `us-east-1`.
- The latest 20 API-visible messages all used the `ferocity.live` domain: 19 were delivered and one bounced. This proves the credential and domain have been used successfully; it does not prove the newly saved Supabase SMTP path.
- The `ferocityflow1@gmail.com` Google login opens a separate empty Resend workspace, so it is not the owner of the production credential/domain. No replacement key was created.
- The production credential's account and billing plan remain unidentified and must be recovered before launch so billing, quota, deliverability, and key rotation can be managed.
- The Supabase auth path is proven. Sustained quota and billing ownership remain unverified until the owning Resend workspace is recovered.
- If it is Free, the documented limit is 100 messages per day and 3,000 per month. That is not enough for a rapid 1,000-customer launch even though Supabase permits 100 auth emails per hour.
- Recommended launch minimum: a paid Resend plan with verified domain health, sufficient monthly volume, and usage alerts. Raise the Supabase hourly limit only after the provider plan supports it.

## Deployment and certification sequence

1. Owner approves the Supabase Pro purchase.
2. Owner approves the Netlify Pro purchase and an explicit auto-recharge ceiling.
3. Recover the Resend workspace that owns the verified `ferocity.live` domain, verify its plan, and upgrade if required.
4. Controlled Supabase password-recovery and direct SMTP messages were delivered to the existing Ferocity Outlook account on 2026-08-01. The owner may optionally inspect inbox placement and the rendered recovery template.
5. The Netlify personal access token pasted into chat was replaced with a 90-day token, stored in the local Netlify CLI profile, and revoked. CLI identity, team access, site linkage, and account API access passed after revocation. The replacement expires on 2026-10-30 and must be rotated before that date.
6. Deploy the release candidate once, only after the owner explicitly authorizes deployment.
7. Run public, authenticated-read, tenant-isolation, webhook-idempotency, and preview load checks.
8. Run one controlled production test for Stripe, Retell, BYO Twilio, Jobber, calendar, Google Business Profile, Veo, and each advertising provider that has completed its provider-side approval.
9. Keep unavailable providers labeled as setup-required or BYO; do not advertise them as live merely because an adapter exists.

## Upgrade-before-interruption policy

- System Health shows the latest database connection pressure, due work, recent failures, recent errors, and every active platform-capacity alert.
- Database: watch at 50 percent, prepare/approve the next plan at 70 percent, and treat 85 percent as urgent.
- Netlify credits: review at 50 percent of the monthly allowance and upgrade before 75 percent on a hard-limited plan.
- Resend: review at 50 percent of the daily or monthly quota and upgrade before 75 percent or before a planned signup campaign.
- Managed voice, video, messaging, and advertising accounts: warn when projected prepaid funding reaches 14 days and escalate urgently at seven days. Continue service while usable funding remains. Pause only the affected managed service if funds are depleted, payment fails, or an owner-approved spending cap is reached; the rest of Ferocity remains available.
- A sudden sustained action backlog, provider 429 response, or rising error count can trigger an earlier upgrade even when account counts are low.
- Ferocity does not purchase external plans autonomously. System Health provides the alert, evidence, recommended action, and direct billing link so the owner can approve the purchase immediately.

## Launch acceptance criteria

- No provider, tenant, or automation failure can exhaust the whole platform worker pool.
- Database connections remain below 70 percent in normal operation and below 85 percent during controlled peaks.
- Due actions do not grow continuously across two worker intervals.
- No duplicate payment, message, call, campaign, invoice, or job is created by webhook retries.
- Signup, login, password recovery, checkout, subscription activation, tenant invoice payment, and customer portal access all pass in production.
- Capacity alerts are visible to operators and include a clear corrective action.
- Provider balances, quotas, and payment failures generate alerts before a customer-facing outage.
- A customer sees a truthful fallback when a provider is unavailable; unrelated Ferocity capabilities continue working.

## Honest launch decision

The application release candidate is engineering-ready for an owner-approved, controlled launch on the current plans. It is not ready for an immediate 1,000-customer traffic push without first responding to the upgrade triggers because Supabase and Netlify are hard-limited Free plans, Resend billing ownership is unverified, and the live certification matrix still contains real calls, emails, renders, OAuth connections, and payment flows that cannot be proven by a local build.

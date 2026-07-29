# Ferocity Security Hardening Audit

Date: 2026-07-28

## Executive Result

Ferocity now has materially stronger application-layer protection for authentication, tenant authorization, secrets, public abuse, webhooks, server-side request forgery, browser security, and Stripe funds flow.

No responsible audit can claim a system is "unhackable" or assign 100/100 security from source review alone. Production readiness also depends on deployment configuration, identity controls, backups, monitoring, incident response, provider settings, and independent penetration testing.

## Remediated

### Authentication and authorization

- Removed the behavior that granted emergency super-admin access when no application session existed.
- Protected workspace selection from unauthenticated enumeration.
- Removed admin-token login through URL query parameters.
- Replaced the raw admin cookie value with a domain-separated SHA-256 verifier.
- Added timing-safe token and cookie comparisons.
- Limited the emergency admin cookie to two hours with secure, HTTP-only, same-site, high-priority settings.
- Added database-backed rate limits to password and emergency-admin login.
- Raised new local password hashes to PBKDF2-SHA-512 with 210,000 iterations and opportunistically upgrades older hashes after a successful login.

### Secrets and tokenization

- Customer-owned provider credentials use AES-256-GCM authenticated encryption.
- Credential encryption now rejects undersized keys.
- Credential fingerprints use keyed HMAC instead of raw SHA-256.
- Public abuse identifiers are HMAC-pseudonymized; raw IP addresses are not stored in the rate-limit table.
- Production public rate limiting fails closed when `SECURITY_HMAC_KEY` is absent.
- A separate production `SECURITY_HMAC_KEY` has been stored as a secret in the Ferocity Netlify project. It will become active with the next authorized deployment.
- Secrets remain server-side; browser-safe Supabase values are kept separate from the service-role key.

This is tokenization/pseudonymization for security identifiers and encryption for provider secrets. Ordinary customer records are not replaced by reversible tokens at the application layer; they rely on encrypted provider storage, tenant isolation, and access control. If Ferocity later stores regulated payment or identity data directly, a dedicated tokenization scope and data-retention design is required. Card data must continue to be collected by Stripe-hosted surfaces so Ferocity does not handle raw card numbers.

### Tenant and database protection

- Enhanced the RLS verifier so every public tenant-scoped table must have RLS enabled.
- Revoked direct `anon` and `authenticated` access to:
  - `app_sessions`
  - `user_password_credentials`
  - `tenant_provider_credentials`
  - `provider_webhook_events`
  - `public_request_rate_limits`
- Applied migrations 135 through 137 to the live Supabase database.
- Verified RLS and sensitive-table grants after migration.

### Public cost and abuse protection

- Added persistent per-window limits to public AI chat, lead intake, and the business grader.
- Limited the grader to 5 requests/hour, chat to 20 requests/hour per form/fingerprint, and lead intake to 30 requests/hour.
- Identifiers are pseudonymous and bounded before database storage.

### Network and browser protection

- Public website import checks DNS results and blocks private/reserved IPv4 and IPv6 targets.
- Every redirect is revalidated, with at most five redirects.
- Imports have an 8-second timeout plus content-length and streamed-body limits.
- Added CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, permissions policy, cross-origin opener/resource policies, and disabled DNS prefetch.
- Restricted application return paths and stopped trusting forwarded host headers for canonical redirects.

### Webhooks and Stripe

- Stripe webhook signatures accept key rotation safely while enforcing timestamp tolerance.
- Stripe events are recorded for replay protection; duplicate deliveries return success without repeating processing.
- Managed invoice payment uses direct charges, not destination charges.
- Connect onboarding uses Accounts v2, full Stripe Dashboard, Stripe as fees collector, Stripe as losses collector, and explicit application fees.
- Connected-account creation and onboarding links use idempotency keys.
- Legacy v1/Express account records are not silently reused by the v2 integration.
- Stripe Connect remains feature-flagged off until live setup is complete.

## Verification Completed

- TypeScript typecheck: passed.
- ESLint: passed.
- Unit/security tests: 26 files and 93 tests passed.
- Production dependency audit: 0 known vulnerabilities.
- RLS verification: passed.
- Production readiness schema/file checks: passed through migration 137.
- Repository secret-pattern scan: no Stripe keys, AWS keys, PEM private keys, or similar secret patterns found.
- Stripe subscription configuration: five live prices readable and the webhook secret configured.

## Required Before Enabling Live Stripe Connect

1. ~~The account owner completes Stripe's live identity-verification task.~~ Complete.
2. ~~Confirm the live integration choices in Stripe.~~ Complete.
3. ~~Configure and verify an Accounts v2 thin-event destination for `/api/integrations/stripe-connect/webhook` and store its dedicated `STRIPE_V2_WEBHOOK_SECRET`.~~ Complete; live signed delivery passed.
4. Complete one test connected-account onboarding with the full Dashboard.
5. Exercise payment, refund, dispute, requirement-update, and payout-failure handling.
6. Confirm fee disclosure and platform terms.
7. Only then set `FEROCITY_MANAGED_PAYMENTS_ENABLED=true`.

Basic live Ferocity subscription billing is separate and already configured. These blockers apply to customer businesses processing through Ferocity Connect.

## Remaining Operational Security Work

### Must complete before broad customer launch

- Require MFA for Netlify, Supabase, Stripe, email, DNS/domain, GitHub, and any provider administrator accounts.
- Remove shared emergency-admin use from normal operations; rotate the token and keep it as break-glass access only.
- Confirm Supabase point-in-time recovery or daily backups and perform a restore drill.
- Configure provider-side spend alerts and hard caps wherever offered.
- Configure alerting for repeated login failures, permission failures, webhook signature failures, cost-limit rejections, and critical app errors.
- Create an incident-response runbook with owner, contact tree, containment steps, evidence preservation, customer notification decision path, and secret-rotation checklist.
- Perform an independent authenticated penetration test against a non-production environment, then retest remediations.

### Important next hardening

- Add bot protection/WAF rules at the edge for public AI and intake endpoints.
- Add application-level field encryption or dedicated tokenization only for newly identified high-risk personal data; do not indiscriminately encrypt fields needed for search and operations.
- Add automatic retention/deletion schedules for logs, uploads, expired sessions, webhook receipts, and imported documents.
- Add malware scanning and signed, expiring download URLs when customer file uploads become public-facing.
- Reduce emergency-admin scope further by requiring reauthentication for billing, credentials, exports, and destructive operations.
- Add dependency-update automation and a regular security patch window.

## Known Accepted/Deferred Findings

- `npm audit` reports nine high-severity findings in development-only ESLint/minimatch tooling. The production dependency tree has zero findings. The suggested automated fixes require incompatible major-version changes, so they should be handled in a tested toolchain upgrade rather than forced into this launch batch.
- DNS rebinding remains a theoretical risk in the website importer because DNS validation and the HTTP connection are separate operations. The current controls substantially reduce common SSRF risk; pinning the validated address at connection time would close the remaining gap.
- The CSP permits inline script/style behavior required by the current Next.js application. A nonce-based CSP is a worthwhile future improvement.
- The production HMAC secret is configured and masked in Netlify, and the hardened build is deployed.

## Security Release Decision

- Safe to continue local/pre-deploy verification: yes.
- Safe to deploy the hardened application after the release gate and user authorization: yes, with the operational checklist tracked.
- Safe to enable Ferocity managed Stripe Connect today: no; identity verification and webhook delivery are complete, but a controlled connected-account onboarding/payment/refund test and final fee disclosure still remain.
- Safe to claim "unhackable" or "100% secure": no.

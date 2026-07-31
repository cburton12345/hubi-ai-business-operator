# Ferocity Final Launch Execution

Date started: 2026-07-30

This is the single launch-closeout checklist. An item is complete only when its pass criteria are supported by a real check. Do not store credentials, payment information, recovery codes, or customer-private data here.

## Guardrails

- Preserve existing functionality and tenant isolation.
- Do not create duplicate provider, messaging, billing, compliance, or autonomy systems.
- Do not launch advertising spend without an explicit budget and final transaction confirmation.
- Do not expose secrets in source, logs, screenshots, or documentation.
- Do not claim a provider is live merely because environment variables exist.
- Deploy the frontend once, after the pre-deploy checks pass.

## 1. Google Veo

- [ ] Confirm the Ferocity Google AI Studio project has a usable paid API key.
- [ ] Confirm the selected Veo model is available to that project.
- [ ] Store the key only in Netlify production secrets.
- [ ] Set the production video provider and model to Google Veo.
- [ ] Preserve global and per-workspace monthly provider-cost caps.
- [ ] Preserve profitable customer pricing above provider cost.
- [ ] Verify usage rebilling remains enabled and Stripe-backed.
- [ ] Run one short, low-cost controlled render.
- [ ] Confirm the job can be refreshed and the completed video can be retrieved inside Ferocity.

Pass criteria: one completed Veo render, metered usage record, enforced cost approval, and no secret exposure.

## 2. Advertising Providers

### Google Ads and YouTube

- [ ] Verify production OAuth client, callback, developer token, and login customer mapping.
- [ ] Complete one real OAuth connection.
- [ ] Confirm reporting access without creating or modifying campaigns.
- [ ] Confirm YouTube inventory is available through the Google Ads lane.

### Meta

- [ ] Verify production app credentials and Business Login configuration.
- [ ] Complete one real OAuth connection.
- [ ] Confirm page/ad reporting access without publishing or spending.

### TikTok

- [ ] Confirm production app credentials and callback.
- [ ] Resolve the advertising-agreement restriction.
- [ ] Finish billing readiness without launching a campaign.
- [ ] Complete one real OAuth connection.
- [ ] Confirm account/reporting access without spending.

### Reddit

- [ ] Verify production OAuth credentials and callback.
- [ ] Complete one real OAuth connection.
- [ ] Confirm read/reporting access without posting or spending.

### Microsoft Ads

- [ ] Verify production OAuth credentials, callback, and developer token.
- [ ] Complete one real OAuth connection.
- [ ] Confirm reporting access without campaign or budget changes.

### Optional Networks

- [ ] Record Snapchat as optional/unavailable or connect it if account readiness is recoverable.
- [ ] Record Yahoo/native ads as optional/unavailable unless a verified provider account exists.
- [ ] Record GA4 property mapping as post-launch unless a verified property ID exists.

Pass criteria: supported launch networks can authenticate and read authorized data; unsupported networks are labeled honestly; no campaign spend occurs.

## 3. Retell Voice

- [x] Retell production key configured.
- [x] Ferocity support number purchased and assigned.
- [x] Signed webhook and provider adapter configured.
- [x] Provider cap, concurrency limit, and maximum call duration configured.
- [ ] Place one real inbound call.
- [ ] Verify AI greeting and support behavior.
- [ ] Verify transcript and call summary ingestion.
- [ ] Verify webhook signature handling and tenant routing.
- [ ] Verify cost/funding records update.
- [ ] Verify human escalation behavior without enabling unsafe actions.

Pass criteria: one real call completes and appears in Ferocity with correct routing, transcript/summary, cost tracking, and escalation behavior.

## 4. Autonomy

- [x] Provider connection remains separate from execution authority.
- [x] Low-risk internal autonomy is the recommended new-customer default.
- [x] Hands-Free authority is available for separately authorized channels.
- [x] Consent, suppression, provider readiness, cost caps, and emergency shutdowns remain enforced.
- [x] Financial authority and meaningful spend remain protected.
- [ ] Decide and apply the appropriate preset to each existing owner-controlled workspace.
- [ ] Verify the Autopilot and advanced Controls interfaces locally.
- [ ] Verify an automatic low-risk workflow and an approval-required protected workflow.

Pass criteria: routine reversible work can run automatically, protected actions cannot bypass controls, and existing workspaces have an intentional owner-selected mode.

## 5. Pre-Deploy Quality Gate

- [x] Typecheck passes.
- [x] Lint passes.
- [x] Unit tests pass: 51 files / 179 tests.
- [x] Production build passes.
- [x] Confirm all required migrations are applied.
- [x] Confirm production environment readiness by deploy context.
- [x] Confirm no secrets are tracked by Git.
- [x] Review the final diff for duplicate UI, awkward internal language, and unrelated changes.
- [x] Confirm the exact deploy scope.

## 6. Production Deployment and Smoke Tests

- [ ] Commit/package the intended source state.
- [ ] Deploy the frontend once to the existing Ferocity Netlify site.
- [ ] Verify deployment reaches a successful terminal state.
- [ ] Verify public landing page, pricing, signup, login, password recovery, and mobile layout.
- [ ] Verify Stripe subscription checkout and webhook readiness without making an unnecessary purchase.
- [ ] Verify tenant invoice/deposit payment link flow.
- [ ] Verify employee/TZS access isolation.
- [ ] Verify owner/admin portfolio isolation.
- [ ] Verify provider integration pages show truthful readiness states.
- [ ] Verify Retell, OAuth callbacks, inbound email, push, owner events, and MarketplacePro health.
- [ ] Run final production smoke and route crawl.
- [ ] Record any post-launch optional work separately.

Pass criteria: production is reachable, core acquisition/payment/operations paths work, tenant access is isolated, connected providers are truthful, and no critical smoke test fails.

## Known Owner/Provider Checkpoints

These are not technical excuses; they are actions that third-party providers may require the account owner to perform:

- Payment-method confirmation or funding.
- Identity, phone, email, or business verification.
- CAPTCHA.
- Creating or revealing a persistent API key.
- Accepting a provider-specific advertising agreement.
- Completing a real phone call from an external handset.

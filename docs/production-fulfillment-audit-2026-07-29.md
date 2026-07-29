# Production Fulfillment Audit

Date: July 29, 2026

## Launch conclusion

Ferocity's local application and provider integrations are substantially more complete than the currently deployed production version. Public launch should wait for one controlled deploy and post-deploy smoke test.

The checkout code fails closed when Stripe is unavailable. It does not create a fake success or activate an unpaid workspace.

## Production configuration completed

- Added the verified live Stripe secret to Netlify's production context.
- Added a new canonical Stripe webhook endpoint covering 18 subscription, payment, dispute, payout, transfer, and connected-account events.
- Stored the canonical Stripe signing secret in Netlify's production context.
- Added the required connected-account Stripe webhook for direct tenant invoice charges and staged its dedicated signing secret.
- Generated and stored a new cryptographically random `SECURITY_HMAC_KEY`.
- Confirmed all three values are stored as protected production variables.
- No frontend or production deployment was performed.

These values require a new deployment before the live site can use them.

## Provider truth

| Capability | Current truth |
| --- | --- |
| Ferocity subscriptions | Live Stripe credentials and all five prices pass local API tests. Production configuration is staged for the next deploy. |
| Stripe webhooks | A canonical platform endpoint and a separate connected-account endpoint are enabled. Two older overlapping platform endpoints remain enabled and should be disabled after the canonical endpoints pass production delivery tests. |
| OpenAI text | Production key can reach the configured model. |
| Email | Resend accepts the production key and `ferocity.live` is verified. |
| Retell billing | Pay As You Go is active with a $10 credit balance and 20-call concurrency. |
| Retell operations | No agent, phone number, tenant credentials, or live route is active. Do not sell live AI calling yet. |
| Automatic SMS | No managed Twilio sender is active. Manual/native SMS and email fallbacks remain available. |
| Premium video | Provider, model, pricing, and cost caps exist. The OpenAI key is the supported credential fallback; a paid render still needs a controlled live test after deployment. |
| Customer invoice payments | Stripe-hosted tenant onboarding, payout-bank setup, direct-charge Checkout, connected-account webhooks, invoice reconciliation, ledger updates, and tenant/account binding checks exist locally. The feature flag remains off until a controlled connected-account test and deployment. |
| Database and storage | Supabase is active; all 150 migrations and tenant-isolation checks pass. |

## Required post-deploy tests

1. Submit each public subscription plan through Stripe Checkout without completing payment, then expire the sessions.
2. Complete one controlled low-value purchase and confirm workspace provisioning, subscription state, onboarding email, and cancellation lifecycle.
3. Confirm canonical webhook deliveries return HTTP 200.
4. Confirm both the platform and connected-account Stripe webhook deliveries return HTTP 200, then disable the two older overlapping platform endpoints.
5. Verify rate limiting uses the new production HMAC key.
6. Create and test one Retell agent and number before enabling or selling managed live voice.
7. Run one paid OpenAI video render only after confirming the configured cost caps and customer price.
8. Complete one controlled tenant Stripe onboarding, direct invoice payment, refund, and failed-payment test before enabling `FEROCITY_MANAGED_PAYMENTS_ENABLED`.

## Sales boundary

Until those tests pass:

- Subscription checkout may be described as staged for the next release, not live.
- Voice should be described as configurable or bring-your-own, not immediately active.
- Premium video should be described as briefs and provider-ready generation with rendering activated only after provider validation.
- Automatic SMS should remain optional and disabled unless a tested customer-owned or managed provider is connected.

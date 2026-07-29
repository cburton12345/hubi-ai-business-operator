# Connector execution audit — July 29, 2026

## Decision

Ferocity must never equate saved credentials, an OAuth start URL, or a database
row with a working connector. Every connection is now classified as:

1. **Executable adapter** — production code can perform or receive the provider
   operation and has an authentication/verification path.
2. **Working native fallback** — the business goal works through Ferocity
   without a provider API, such as portable accounting exports, private calendar
   feeds, approved publishing packages, or manual text handoff.
3. **Setup only** — planning and provider demand can be recorded, but the
   connector cannot be marked ready or offered a dead Connect button.

This classification is enforced in the server action, not merely displayed in
the UI.

## Executable now

- Email through the existing provider registry and managed Resend route.
- Customer-owned Twilio messaging.
- Retell and Vapi voice adapters behind the common voice interface.
- Stripe billing and Stripe Connect onboarding/webhooks.
- Premium video through the existing video adapter and cost controls.
- MarketplacePro signed inbound events.
- Supabase authentication/data infrastructure.
- Signed inbound webhook framework.

## Working native fallback

- Accounting: CSV tax, profit-and-loss, invoice, vendor-bill, and ledger exports.
- Calendar: private revocable iCalendar feeds.
- Website/social publishing: reviewable export packages and Ferocity-hosted
  growth pages.
- Texting without a provider: native/manual message handoff plus email and app
  notifications.

## Setup-only provider surfaces

Google Business Profile/Ads/Search Console/Analytics, Meta, TikTok, Reddit,
Microsoft Ads, Yahoo/native ads, and review-platform APIs currently have setup
metadata or OAuth scaffolding but not complete execution adapters. Ferocity now:

- labels these as **Adapter not enabled**;
- prevents **Mark ready** on the server;
- hides dead OAuth Connect buttons;
- offers **Request adapter** so demand is tracked;
- retains working drafts, exports, hosted pages, internal attribution, and
  manual review paths.

These providers should be built one at a time from demonstrated customer demand,
with token refresh, health checks, normalized reads/writes, idempotency,
provider-specific permission scopes, and revocation tests.

## BYO AI

Customer-owned OpenAI is implemented as an Advanced connection:

- credential stored in the tenant-encrypted vault;
- real read-only verification against the OpenAI models endpoint;
- customer owns provider billing;
- only selected drafting, setup guidance, receipt extraction, field-log
  extraction, and funnel work may use the customer key;
- owner-command decisions and public website chat remain on Ferocity-managed AI;
- a selected BYO account never silently fails over to Ferocity-paid AI;
- BYO usage is visible but records zero Ferocity provider cost.

The model receives task instructions and business context required for those
allowed jobs, so the UI explicitly warns that the customer's provider may retain
task content under that account's data settings. Ferocity does not send its
complete orchestration layer or protected decision engines through BYO AI.

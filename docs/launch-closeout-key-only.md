# Launch Closeout: Key-Only Remaining Work

The target state is not "every external platform is magically connected." The target state is:

- Ferocity works locally and builds cleanly.
- Every major feature has a real page, action path, setup path, or honest readiness state.
- Anything requiring outside accounts is clearly gated by provider connection, approval, plan, consent, and usage controls.
- No public page promises live posting, live ad spend, live customer messaging, or live payment collection unless the account is connected.
- Users can start without every key and add capabilities in pieces.

## Must Be Done In Code

- Public pages explain Ferocity clearly.
- App dashboard routes people to the next action.
- Business Gap Scan shows what is ready, missing, blocked, or waiting for connection.
- AI Workforce accepts plain-English commands and routes to existing tools.
- Marketing OS can create campaign plans, launch kits, graphic jobs, and video briefs.
- Action Queue gates customer sends, publishing, review requests, calendar actions, and provider actions.
- System Health and Feature Readiness show honest setup status.
- Integrations show customer-owned and Ferocity-managed lanes separately.
- Payments distinguish subscriptions, customer-owned Stripe, and managed Stripe Connect.
- Reset password uses Supabase auth when Supabase public keys are present.
- Push, email, Stripe, OpenAI, owner events, MarketplacePro, and provider-readiness scripts can be checked without exposing secrets.

## Allowed To Remain Key-Only

- Google/GBP OAuth credentials and API approval.
- Meta/Facebook credentials and permissions.
- TikTok credentials and permissions.
- Reddit credentials and permissions.
- Microsoft Ads credentials and developer token.
- Yahoo/native ads credentials.
- Optional Twilio SMS.
- Premium video rendering provider such as Veo, Runway, Kling, OpenAI media, or another approved media provider. OpenAI Video is the first live adapter. Keep rendering disabled until the provider key/model, explicit activation, global and per-workspace cost caps, provider cost per second, profitable customer price per second, and usage billing are configured. Briefs continue to work without them.
- Customer-owned accounts that must be connected by the customer.

## Native, Not Account-Blocked

- Accounting works through Ferocity records and portable invoice, vendor-bill,
  expense, and ledger CSV exports. QuickBooks OAuth is optional.
- Scheduling works in Ferocity and can publish a private, revocable iCalendar
  feed. Google/Microsoft OAuth is optional for two-way edits.
- Service areas and route clusters use ZIP, city/state, radius, and stored
  coordinates. A commercial mapping provider is optional for road-network
  travel-time optimization.

## Not Allowed To Remain Vague

- "Coming soon" with no setup path.
- "Auto-post" without explaining approval, connected accounts, and live-action settings.
- "Payment collection" without explaining Stripe/Connect readiness and fees.
- "AI runs the business" without showing controls and limits.
- Dead buttons or routes that crash.

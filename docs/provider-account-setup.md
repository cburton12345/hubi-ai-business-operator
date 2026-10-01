# Ferocity Provider Account Setup

Goal: get Ferocity ready for real marketing, reporting, creative, and customer-growth workflows without pretending live provider access exists before each account is connected and tested.

Use `ferocityflow@outlook.com` as the primary contact/admin email where the provider asks for one.

Also check [ad-credit-promotion-tracker.md](./ad-credit-promotion-tracker.md) before creating ad accounts or launching spend.

## Live App URL

- Production app: `https://ferocity.live`
- Local app: `http://localhost:3000`

Use production callback URLs for provider apps unless the provider explicitly allows local development callbacks.

## Provider Apps To Create

### Reddit

- Reddit Ads business developer applications: `https://ads.reddit.com/business/d21eafb7-3d8c-4003-bf58-65752ec24c5b/developer-applications`
- App name: `Ferocity`
- Account: `u/ferocityflow1`, owned by `ferocityflow1@gmail.com`
- Business ID: `d21eafb7-3d8c-4003-bf58-65752ec24c5b`
- Ad account: `jbzubtotitvi`
- Account status: the business and advertiser account exist. Developer/API approval is not verified, and the Ferocity production adapter is not enabled.
- Description: `AI operating system for business marketing, lead follow-up, campaign planning, and reporting.`
- About URL: `https://ferocity.live`
- Redirect URI: `https://ferocity.live/api/integrations/reddit/oauth/callback`
- Primary contact: `ferocityflow1@gmail.com` (saved September 24, 2026)
- Needed env vars:
  - `REDDIT_CLIENT_ID`
  - `REDDIT_CLIENT_SECRET`
  - `REDDIT_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/reddit/oauth/callback`
- First safe scope/use: read-only ad reporting after developer access and OAuth are approved.
- Promo check: Reddit Ads has shown spend/get ad-credit offers. Confirm the current official signup offer before creating the ads account.
- Do not enable: posting, replies, campaign creation, or spend without review gates and account approval.

### Platform app and Ferocity marketing-account separation

Ferocity uses the same customer authorization path internally that it gives every tenant, but the assets stay separated:

1. **Ferocity platform app:** owns OAuth client configuration, provider review, callbacks, webhook infrastructure, and server-side secrets.
2. **Ferocity internal workspace:** connects through the normal tenant OAuth flow so the customer experience is continuously dogfooded.
3. **Ferocity marketing identity and ad account:** owns public posts, comments, campaigns, billing, and budgets. A marketing-account enforcement issue must not automatically become a platform-wide credential failure.

Use separate provider assets, least-privilege roles, budgets, and revocation boundaries wherever the provider supports them. A second public profile is not automatically required; do not create fake identities or duplicate accounts merely to simulate isolation. Never ask ordinary customers for the platform app's client ID, secret, developer token, webhook secret, or developer approval.

Organic community participation stays usefulness-first and approval-gated: discover relevant conversations, read current community rules, prepare a specific helpful response, disclose affiliation when relevant, and publish only from the intended business identity. Do not automate mass comments, generic praise, artificial friend/follower activity, repetitive links, or engagement designed to masquerade as an unaffiliated customer.

### Google

Use one Google Cloud project if possible.

- Google Cloud credentials page: `https://console.cloud.google.com/apis/credentials`
- Google Business Profile API: `https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com`
- As of September 9, 2026, new Google Ads API access is managed through the Google Cloud project's Google Ads API Overview rather than a new developer-token application. Keep any legacy token only for backward compatibility while Google completes the transition.
- App name: `Ferocity`
- Authorized redirect URI: `https://ferocity.live/api/integrations/google/oauth/callback`
- Needed env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/google/oauth/callback`
  - optional legacy `GOOGLE_ADS_DEVELOPER_TOKEN` during Google's compatibility period
  - `GA4_PROPERTY_ID` when analytics is ready
- First safe scopes/use:
  - Google Business Profile: draft and reporting first
  - Search Console: readonly SEO data
  - Analytics: readonly traffic/conversion data
  - Google Ads: reporting first
- Promo check: Google Ads promos vary by country, recipient, and signup path. Confirm the active official new-advertiser offer before creating the account.
- Do not enable: GBP publishing, ad creation, or budget edits without approval gates.

### Meta / Facebook

- Meta developers apps page: `https://developers.facebook.com/apps/`
- App name: `Ferocity`
- OAuth redirect URI: `https://ferocity.live/api/integrations/meta/oauth/callback`
- Needed env vars:
  - `META_APP_ID`
  - `META_APP_SECRET`
  - `META_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/meta/oauth/callback`
  - `META_BUSINESS_LOGIN_CONFIG_ID`
- First safe use: page/ad reporting and draft preparation.
- Promo check: Meta ad credits are usually account-specific or invitation-specific. Check Business Manager billing and account notifications before spend.
- Do not enable: page posting, replies, campaign creation, or ad spend without approval gates.

### TikTok

- TikTok developer apps: `https://developers.tiktok.com/`
- TikTok Business API portal: `https://business-api.tiktok.com/portal`
- App name: `Ferocity`
- Business Center created: `Ferocity`
- Business Center ID: `7666569313026654224`
- Ad account created: `Ferocity Ads`
- Ad account ID: `7666569270685155345`
- Company ID: `7666568910602339073`
- Email attached: `f***w@outlook.com`
- Phone attached: `+1****5984`
- Payment setup: active card ending `8793`, `$10.00` cash balance, and `$20.00` auto-recharge below `$10.00` were confirmed September 22, 2026. Do not launch TikTok spend until provider approval, conversion tracking, and Ferocity budget gates are verified.
- Ads Manager reported **Good to go** on September 22, 2026; the earlier advertising-agreement warning is no longer the current account state.
- Promo page reachable after verification at `/i18n/account/payment_promotion?aadvid=7666569270685155345`, but it currently shows `0.00 USD` available ad credit and no coupon rows.
- OAuth redirect URI: `https://ferocity.live/api/integrations/tiktok/oauth/callback`
- TikTok Content Posting redirect URI: `https://ferocity.live/api/integrations/tiktok_content/oauth/callback`
- TikTok API for Business redirect URI: `https://ferocity.live/api/integrations/tiktok-business/oauth/callback`
- Needed env vars:
  - `TIKTOK_CLIENT_KEY`
  - `TIKTOK_CLIENT_SECRET`
  - `TIKTOK_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/tiktok/oauth/callback`
  - `TIKTOK_CONTENT_REDIRECT_URI=https://ferocity.live/api/integrations/tiktok_content/oauth/callback`
  - `TIKTOK_BUSINESS_APP_ID=...`
  - `TIKTOK_BUSINESS_APP_SECRET=...`
  - `TIKTOK_BUSINESS_REDIRECT_URI=https://ferocity.live/api/integrations/tiktok-business/oauth/callback`

TikTok permission boundary:

- `tiktok` is Login Kit and basic profile identity only.
- `tiktok_content` uses TikTok for Developers Content Posting scopes. Public Direct Post requires TikTok's audit; unaudited clients are private-only.
- `tiktok_business` uses the separate TikTok API for Business developer app for advertisers, reporting, and campaign operations.
- A connected Login Kit account must never mark TikTok Ads or publishing ready.
- Campaign creation is approval-gated and creates campaigns disabled. Activation, ad groups, creatives, and spend remain separate controlled actions.
- Production OAuth check on September 4, 2026: client key, callback, credential-encryption key, and client secret are present. Fresh authorization completed for the isolated QA workspace and readiness verified `ferocity78` with encrypted token storage. Account-recovery note: the developer account uses `ferocityflow@outlook.com`, while the `ferocity78` consumer profile is reached with **Continue with Google** using `ferocityflow1@gmail.com`; do not use ordinary TikTok password recovery for that profile.
- First safe use: short-form creative briefs, scripts, captions, content calendars, and reporting after account access is approved.
- Promo check: TikTok ad credits vary by region, advertiser account, and signup path. The signup page showed `Get up to USD 6000 ads credit for new account`, but the live Ads Manager promotions page currently shows no available credit. Treat the promo as unclaimed/unconfirmed until the agreement warning is resolved and TikTok shows an actual coupon row or redeemable credit.
- Do not enable: posting, creator actions, campaign creation, or ad spend without approval gates.

### Microsoft Ads

- Microsoft Entra app registrations: `https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`
- Microsoft Advertising developer portal: `https://developers.ads.microsoft.com/`
- App name: `Ferocity`
- Redirect URI: `https://ferocity.live/api/integrations/microsoft/oauth/callback`
- Needed env vars:
  - `MICROSOFT_CLIENT_ID`
  - `MICROSOFT_CLIENT_SECRET`
  - `MICROSOFT_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/microsoft/oauth/callback`
  - `MICROSOFT_ADS_DEVELOPER_TOKEN`
- First safe use: reporting first.
- Promo check: Microsoft Advertising has an official consultation/new-customer ad-credit path. Confirm eligibility before creating or funding the account.
- Do not enable: campaign creation or budget edits without approval gates.

### Yahoo / Native Ads

- Yahoo developer apps: `https://developer.yahoo.com/apps/`
- App name: `Ferocity`
- Redirect URI: `https://ferocity.live/api/integrations/yahoo/oauth/callback`
- Needed env vars:
  - `YAHOO_CLIENT_ID`
  - `YAHOO_CLIENT_SECRET`
  - `YAHOO_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/yahoo/oauth/callback`
- First safe use: attribution/reporting once the exact native ads provider is confirmed.
- Promo check: confirm whether Yahoo/native ads is being run through Microsoft Advertising, Yahoo directly, or another native network before expecting credits.

### Calendar / Email OAuth Later

Resend is already the launch email path. Gmail/Outlook/Microsoft 365 monitoring is a later provider phase unless OAuth apps are created and security review is complete.

- Calendar redirect URI: `https://ferocity.live/api/integrations/calendar/oauth/callback`
- Needed env vars:
  - `CALENDAR_PROVIDER`
  - `CALENDAR_CLIENT_ID`
  - `CALENDAR_CLIENT_SECRET`
  - `CALENDAR_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/calendar/oauth/callback`

### AI Office Manager Voice

The AI Office Manager can run as an app/email/manual-draft workflow before live voice is connected. Live phone answering needs a voice provider, number routing, consent/recording rules, approval gates, and a monthly budget.

- Supported provider families:
  - Phone routing: Twilio Voice, SIP trunk / existing phone system, future provider
  - Listening: OpenAI Realtime or Deepgram
  - Speaking: OpenAI, ElevenLabs, Cartesia, or future TTS provider
  - Realtime brain: OpenAI Realtime or future realtime provider through the AI service layer
  - Orchestration: Vapi, Retell, or future provider
- Ferocity stores these as separate provider accounts and voice routes, so the phone provider, listening provider, speaking provider, and realtime provider can be swapped without rebuilding the office manager.
- Voice webhook URL: `https://ferocity.live/api/integrations/voice-ai/webhook`
- Local test URL: `http://localhost:3000/api/integrations/voice-ai/webhook`
- Needed env vars:
  - `VOICE_PROVIDER`
  - `VOICE_API_KEY`
  - `VOICE_WEBHOOK_SECRET`
  - `VOICE_PHONE_NUMBER`
  - `VOICE_MONTHLY_BUDGET_CENTS`
- Optional split-provider env vars:
  - `VOICE_TELEPHONY_PROVIDER`
  - `VOICE_TELEPHONY_API_KEY`
  - `SIP_TRUNK_PROVIDER`
  - `SIP_TRUNK_API_KEY`
  - `VOICE_STT_PROVIDER`
  - `VOICE_STT_API_KEY`
  - `VOICE_TTS_PROVIDER`
  - `VOICE_TTS_API_KEY`
  - `VOICE_REALTIME_PROVIDER`
  - `VOICE_REALTIME_API_KEY`
  - `VOICE_FALLBACK_PROVIDER`
- First safe use:
  - inbound call summary
  - transcript storage
  - owner handoff
  - appointment or follow-up task draft
- Do not enable:
  - outbound calling
  - recorded call playback
  - live appointment booking
  - live payment collection
  - live customer promises

Keep live voice actions off until the provider test proves signature verification, transcript handling, consent wording, escalation rules, and budget limits.

### Vonage managed SMS

Vonage reported the Ferocity account unblocked on September 20, 2026. That removes the account hold; it does not by itself certify US production messaging.

- Adapter: Vonage Messages API v1 behind Ferocity's existing provider-independent messaging engine.
- Status webhook: `https://ferocity.live/api/messaging/webhooks/vonage`
- Inbound webhook: `https://ferocity.live/api/messaging/webhooks/vonage`
- Required server-only variables:
  - `VONAGE_API_KEY`
  - `VONAGE_API_SECRET`
  - `VONAGE_FROM_NUMBER`
  - `VONAGE_SIGNATURE_SECRET`
  - `VONAGE_MESSAGES_API_URL=https://api.nexmo.com`
  - `ENABLE_VONAGE_SMS_SENDS=true` only after controlled certification
- Required provider work before activation:
  1. Fund the account intentionally and set a conservative provider budget.
  2. Obtain or attach the sending number.
  3. Complete the applicable US A2P 10DLC or toll-free verification path.
  4. Enable signed Messages API webhooks and copy the signature secret into server environment configuration.
  5. Apply migration `219_vonage_sms_adapter_and_managed_allowances.sql`.
  6. Certify outbound, inbound, delivered, rejected, STOP, HELP, duplicate callback, retry, and emergency-pause behavior.
  7. Only then activate the workspace `vonage_sms` messaging account and routing rule.

Provider packaging is intentionally simple: the messaging features are part of Ferocity; one Ferocity Connect Android device remains included in monthly plans; managed hosted SMS has a plan allowance and then a disclosed per-segment overage; BYO SMS and Connect carrier usage are billed by the customer's provider/carrier rather than again by Ferocity.

## What Ferocity Can Do Before Provider Apps Are Approved

- Business Grader
- Website scan/setup plan
- Lead capture/source tracking
- Review-ready SEO/content drafts
- Photo ad briefs
- Review graphics
- Before/after graphic jobs
- Short video scripts and shot lists
- Campaign calendar drafts
- Push/email owner alerts
- Manual export and review queues
- AI Office Manager queues, owner commands, office follow-up plans, and voice-ready intake logs

## What Waits For Provider Approval

- Live Reddit/Meta/Google/Microsoft/Yahoo reporting
- Live Google Business Profile publishing
- Live page/social posting
- Live ad creation
- Budget changes
- Automated replies
- Direct publishing to a customer's external website/CMS
- AI video provider submission
- Live AI phone answering and outbound voice actions

## After Each Provider App Is Created

1. Add the client ID/secret and redirect URI to Netlify environment variables.
2. Add the same values to local `.env.local` for local testing when appropriate.
3. Run:
   - `npm run provider:check`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
4. Open `/app/integrations`.
5. Click the provider connect button.
6. Confirm Ferocity marks the connection as configured/connected.
7. Keep live actions in review mode until a real account test passes.

## What Codex Can And Cannot Do

Codex can prepare Ferocity, generate the callback URLs, update local env placeholders, write docs, test readiness, and wire the app after keys are supplied.

Codex cannot bypass provider security blocks, CAPTCHA, email verification, phone verification, legal/business verification, payment profile setup, or any screen where the provider requires the account owner to personally accept terms.

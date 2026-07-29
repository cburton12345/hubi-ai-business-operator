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

- Create app page: `https://www.reddit.com/prefs/apps`
- If Reddit blocks the browser with network security, use a normal browser/device/network and the same values below.
- App name: `Ferocity`
- Description: `AI operating system for business marketing, lead follow-up, campaign planning, and reporting.`
- About URL: `https://ferocity.live`
- Redirect URI: `https://ferocity.live/api/integrations/reddit/oauth/callback`
- Primary contact: `ferocityflow@outlook.com`
- Needed env vars:
  - `REDDIT_CLIENT_ID`
  - `REDDIT_CLIENT_SECRET`
  - `REDDIT_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/reddit/oauth/callback`
- First safe scope/use: community research and ad reporting.
- Promo check: Reddit Ads has shown spend/get ad-credit offers. Confirm the current official signup offer before creating the ads account.
- Do not enable: posting, replies, campaign creation, or spend without review gates and account approval.

### Google

Use one Google Cloud project if possible.

- Google Cloud credentials page: `https://console.cloud.google.com/apis/credentials`
- Google Business Profile API: `https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com`
- Google Ads developer token usually starts from Google Ads API Center inside the Google Ads account.
- App name: `Ferocity`
- Authorized redirect URI: `https://ferocity.live/api/integrations/google/oauth/callback`
- Needed env vars:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/google/oauth/callback`
  - `GOOGLE_ADS_DEVELOPER_TOKEN` when ads are ready
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
- Payment setup: incomplete. Do not launch TikTok spend until billing is intentionally connected and budget gates are verified.
- Account warning still seen in Ads Manager after phone/email verification on July 25, 2026: `Your advertising agreement is not effective yet or has already expired. No new ads can be delivered. Please contact the sales team.`
- Promo page reachable after verification at `/i18n/account/payment_promotion?aadvid=7666569270685155345`, but it currently shows `0.00 USD` available ad credit and no coupon rows.
- OAuth redirect URI: `https://ferocity.live/api/integrations/tiktok/oauth/callback`
- Needed env vars:
  - `TIKTOK_CLIENT_KEY`
  - `TIKTOK_CLIENT_SECRET`
  - `TIKTOK_OAUTH_REDIRECT_URI=https://ferocity.live/api/integrations/tiktok/oauth/callback`
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

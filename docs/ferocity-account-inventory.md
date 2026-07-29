# Ferocity Account Inventory

This is the safe account map. It should track where accounts live, which email/admin identity is likely used, what Ferocity needs from each provider, and where secrets should be stored.

Do not put passwords, API keys, tokens, recovery codes, bank details, or private customer information in this file.

Use local private notes in `.private/ferocity-account-vault.md` and a real password manager or Windows Credential Manager for actual login secrets.

## Primary Ferocity Identity

| Purpose | Current best-known value | Notes |
| --- | --- | --- |
| Public domain | `https://ferocity.live` | Production public domain. |
| Primary contact email | `ferocityflow@outlook.com` | Use where providers ask for a business/admin contact. |
| Google account observed | `ferocityflow1@gmail.com` | Used during Google setup in browser session. Confirm before relying on it. |
| Netlify site | `ferocityflo` | Project for Ferocity production. |
| Supabase project | `puvpgebitzvyqbdnnlyz` | Ferocity Supabase project id. |

## Provider Account Status

| Provider | Likely login/admin | Ferocity status | Needed env vars | Secret storage location |
| --- | --- | --- | --- | --- |
| Supabase | Owner account, project `puvpgebitzvyqbdnnlyz` | Configured | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | Host env vars / password manager |
| Netlify | Ferocity team/site `ferocityflo` | Configured | deploy/build env vars | Netlify env vars / password manager |
| Resend | `ferocity.live` domain | Verified | `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `FEROCITY_NOTIFY_EMAIL`, optional inbound secret | Netlify env vars / password manager |
| Stripe | Ferocity Stripe account | Subscriptions configured enough for live testing | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, plan price ids, optional Connect vars | Netlify env vars / password manager |
| OpenAI | Ferocity/project key | Reachable | `AI_PROVIDER`, `AI_MODEL`, `OPENAI_API_KEY` | Netlify env vars / password manager |
| Push notifications | Ferocity VAPID keys | Configured | `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT` | Netlify env vars / password manager |
| Owner Command Center | Ferocity internal token | Configured | `OWNER_COMMAND_CENTER_TOKEN` | Netlify env vars / password manager |
| MarketplacePro bridge | Ferocity webhook secret | Configured | `MARKETPLACEPRO_WEBHOOK_SECRET` | Netlify env vars / password manager |
| Reddit | Account/app created enough for readiness | Configured | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_OAUTH_REDIRECT_URI` | Netlify env vars / password manager |
| Microsoft | Account/app configured enough for readiness | Configured | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_OAUTH_REDIRECT_URI`, `MICROSOFT_ADS_DEVELOPER_TOKEN` | Netlify env vars / password manager |
| Google / GBP | `ferocityflow1@gmail.com` observed | Configured | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GA4_PROPERTY_ID` | Netlify env vars / password manager |
| Meta / Facebook | Meta Developers app `Ferocity` under Ferocity Operations | Configured in Netlify production env | `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` | Netlify env vars / password manager |
| Premium video rendering | Needs provider selection | Safe defaults set; live rendering disabled | `VIDEO_PROVIDER`, `VIDEO_API_KEY`, `VIDEO_MODEL`, `VIDEO_RENDERING_ENABLED`, `VIDEO_MONTHLY_BUDGET_CENTS` | Netlify env vars / password manager |
| TikTok | Outlook account, Business Center `7666569313026654224`, ad account `7666569270685155345` | Ads Manager created; phone/email attached; payment incomplete; promotions page shows `$0.00`; account agreement warning shown; API app keys still needed | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_OAUTH_REDIRECT_URI` | Create app/API access, resolve agreement/billing readiness, then Netlify env vars / password manager |
| Yahoo | Not important for first launch unless desired | Missing app keys | `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_OAUTH_REDIRECT_URI` | Create app, then Netlify env vars / password manager |
| Twilio | Optional, not launch-blocking | Not required | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ENABLE_TWILIO_SMS_SENDS` | Add only if SMS is intentionally enabled |

## Callback URLs

| Provider | Callback URL |
| --- | --- |
| Google | `https://ferocity.live/api/integrations/google/oauth/callback` |
| Meta | `https://ferocity.live/api/integrations/meta/oauth/callback` |
| Reddit | `https://ferocity.live/api/integrations/reddit/oauth/callback` |
| TikTok | `https://ferocity.live/api/integrations/tiktok/oauth/callback` |
| Microsoft | `https://ferocity.live/api/integrations/microsoft/oauth/callback` |
| Yahoo | `https://ferocity.live/api/integrations/yahoo/oauth/callback` |
| Owner events | `https://ferocity.live/api/owner-command-center/events` |

## Where To Put New Keys

1. Put production keys in Netlify environment variables.
2. Put local testing keys in `.env.local`.
3. Put customer-owned provider secrets in Ferocity's encrypted credential vault, not repo docs.
4. Record only the provider/account status here.
5. Run `npm run readiness` after adding keys.

## Private Notes

Use `.private/ferocity-account-vault.md` for local-only notes such as:

- Which password manager item holds the login.
- Which email account owns the provider.
- Which phone number or authenticator app is used for 2FA.
- Account creation status.
- Recovery process notes.

That file is ignored by git.

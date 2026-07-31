# Ferocity Environment Key Checklist

This is the plain checklist for adding keys without hunting through code.

## Can keys be added later without a deploy?

Usually yes.

If the provider route and env var names already exist, set the env vars in Netlify/Supabase/Render and restart or redeploy only if the host requires it. You do not need a code change just to paste a new key.

A code change is needed when Ferocity does not yet have:

- the provider route
- the env var name
- the OAuth redirect handler
- the webhook receiver
- the UI card
- the permission and safety checks

## Core app

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_ACCESS_TOKEN`
- `CREDENTIAL_ENCRYPTION_KEY`
- `SECURITY_HMAC_KEY`
- `FEROCITY_APP_URL`

## AI

- `AI_PROVIDER`
- `AI_MODEL`
- `OPENAI_API_KEY`

## Stripe

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_STARTER`
- `STRIPE_PRICE_ID_GROWTH`
- `STRIPE_PRICE_ID_OPERATOR`
- `STRIPE_PRICE_ID_AI_GROWTH_REPORT`
- `FEROCITY_MANAGED_PAYMENTS_ENABLED`
- `FEROCITY_MANAGED_PAYMENT_FEE_BPS`

## Email

- `EMAIL_PROVIDER`
- `EMAIL_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `FEROCITY_NOTIFY_EMAIL`

## Push notifications

- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_VAPID_SUBJECT`

## Owner command center

- `OWNER_COMMAND_CENTER_TOKEN`

Send events to:

`https://ferocity.live/api/owner-command-center/events`

Use:

`Authorization: Bearer <OWNER_COMMAND_CENTER_TOKEN>`

## Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GA4_PROPERTY_ID`

Redirect:

`https://ferocity.live/api/integrations/google/oauth/callback`

## Meta

- `META_APP_ID`
- `META_APP_SECRET`
- `META_OAUTH_REDIRECT_URI`
- `META_BUSINESS_LOGIN_CONFIG_ID`

## Premium Video Rendering

- `VIDEO_PROVIDER`
- `VIDEO_API_KEY` (optional provider-specific override; OpenAI video can reuse `OPENAI_API_KEY`)
- `VIDEO_MODEL`
- `VIDEO_RENDERING_ENABLED`
- `VIDEO_MONTHLY_BUDGET_CENTS`

Use `VIDEO_PROVIDER=google_veo` with `VIDEO_MODEL=veo-3.1-lite-generate-preview` for the lowest-cost managed Veo route, or `VIDEO_PROVIDER=openai_video` for the existing OpenAI route. Keep `VIDEO_RENDERING_ENABLED=false` and `VIDEO_MONTHLY_BUDGET_CENTS=0` until a paid media provider, cost controls, and approval rules are ready. Ferocity can still create video scripts, storyboards, scene plans, hooks, platform variants, and provider briefs without submitting premium renders.

Redirect:

`https://ferocity.live/api/integrations/meta/oauth/callback`

## Reddit

- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_OAUTH_REDIRECT_URI`

Redirect:

`https://ferocity.live/api/integrations/reddit/oauth/callback`

## TikTok

- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_OAUTH_REDIRECT_URI`

Redirect:

`https://ferocity.live/api/integrations/tiktok/oauth/callback`

## Microsoft Ads

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_OAUTH_REDIRECT_URI`
- `MICROSOFT_ADS_DEVELOPER_TOKEN`

Redirect:

`https://ferocity.live/api/integrations/microsoft/oauth/callback`

## Yahoo Ads

- `YAHOO_CLIENT_ID`
- `YAHOO_CLIENT_SECRET`
- `YAHOO_OAUTH_REDIRECT_URI`

Redirect:

`https://ferocity.live/api/integrations/yahoo/oauth/callback`

## MarketplacePro

- `MARKETPLACEPRO_WEBHOOK_SECRET`

## Worker/automation jobs

- `AI_WORKFORCE_CRON_TOKEN`

## Rule

No key should be committed to Git. Use host environment variables or the encrypted customer credential vault.

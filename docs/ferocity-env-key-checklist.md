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
- `MCP_ALLOWED_HOSTS` (exact comma-separated MCP request hosts; proposed production value `api.ferocity.live,ferocity.live`)

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
- `FEROCITY_EARN_SETTLEMENT_ENABLED` (leave `false` until controlled Stripe Earn settlement certification passes)
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

Use `VIDEO_PROVIDER=google_veo` with `VIDEO_MODEL=veo-3.1-lite-generate-preview` for the lowest-cost managed launch route. Do not start new production work on `openai_video`: OpenAI marks the current Videos API for shutdown on September 24, 2026. Keep `VIDEO_RENDERING_ENABLED=false` and `VIDEO_MONTHLY_BUDGET_CENTS=0` until a paid media provider, cost controls, and approval rules are ready. Ferocity can still create video scripts, storyboards, scene plans, hooks, platform variants, and provider briefs without submitting premium renders. See `docs/NATIVE_AI_VIDEO_GENERATION.md`.

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
- `TIKTOK_CONTENT_REDIRECT_URI`
- `TIKTOK_BUSINESS_APP_ID`
- `TIKTOK_BUSINESS_APP_SECRET`
- `TIKTOK_BUSINESS_REDIRECT_URI`

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

## Homes4Rent bridge

- `H4R_SMS_BRIDGE_SECRET` — shared server-to-server HMAC secret; despite the historical name, it signs the H4R SMS, status, operator, and document-intelligence bridge requests.
- `H4R_DOCUMENT_ORIGIN` — exact HTTPS origin of H4R's Supabase project. Lease analysis accepts short-lived private `h4r-documents` signed URLs only from this origin.
- `H4R_CONTEXT_URL` — H4R's signed, read-only `ferocity-brain-context` endpoint. It returns aggregate operating context without tenant PII, ledger rows, payment credentials, document contents, or signature evidence.
- `H4R_OPERATOR_URL`
- `H4R_OPERATOR_MODE`

H4R separately stores `FEROCITY_LEASE_ANALYSIS_URL` and the same bridge secret as `FEROCITY_SMS_BRIDGE_SECRET`. None of these values belongs in browser code.

## Worker/automation jobs

- `AI_WORKFORCE_CRON_TOKEN`
- `AUTOMATION_TENANT_BATCH_SIZE` — maximum workspaces selected per scheduled run; default `50`, hard maximum `250`.
- `AUTOMATION_AGENT_BATCH_SIZE` — maximum due AI-workforce jobs selected after tenant processing; default `50`, hard maximum `250`.
- `AUTOMATION_TENANT_CONCURRENCY` — workspaces processed concurrently; default `2`, hard maximum `4`.
- `AUTOMATION_GOAL_PLAN_BATCH_SIZE` — due persistent outcomes planned per workspace/run; default `8`, hard maximum `25`.
- `AUTOMATION_GOAL_PLANNING_CONCURRENCY` — plans reasoned concurrently inside one workspace; default `2`, hard maximum `3` so aggregate work remains below the global AI concurrency guard.
- `AUTOMATION_GOAL_STEP_BATCH_SIZE` — due persistent-outcome steps advanced per workspace/run; default `50`, hard maximum `100`.

## Rule

No key should be committed to Git. Use host environment variables or the encrypted customer credential vault.

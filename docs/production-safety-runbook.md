# Production Safety Runbook

## Environment Variable Policy

- `DATABASE_URL`: server-only database connection string. Store in Render runtime secrets and local secret storage only.
- `ADMIN_ACCESS_TOKEN`: temporary admin access token. Use a long unique value and rotate before each external customer beta batch.
- `NEXT_PUBLIC_SUPABASE_URL`: browser-safe Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: browser-safe anon key. Do not use it for privileged server operations.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only privileged key. Store in Render runtime secrets only.
- `OPENAI_API_KEY`: optional server-only key for real AI provider calls.
- `STRIPE_SECRET_KEY`: server-only Stripe key for checkout and the billing portal.
- `STRIPE_WEBHOOK_SECRET`: server-only Stripe webhook signing secret.
- `STRIPE_PRICE_ID_STARTER`: Stripe recurring price for Starter.
- `STRIPE_PRICE_ID_GROWTH`: Stripe recurring price for Growth.
- `STRIPE_PRICE_ID_OPERATOR`: Stripe recurring price for Operator.
- `EMAIL_PROVIDER`: email provider selector, currently `resend` for live sending.
- `EMAIL_API_KEY`: server-only email API key.
- `EMAIL_FROM_ADDRESS`: verified sender address.
- `EMAIL_REPLY_TO_ADDRESS`: verified inbound/reply address.
- `RESEND_INBOUND_WEBHOOK_SECRET`: server-only secret for inbound Resend webhooks.
- `FEROCITY_APP_URL`: canonical production URL, normally `https://ferocity.live`.
- `OWNER_COMMAND_CENTER_TOKEN`: server-only bearer token for owner operations events from connected systems.

## Before Customer Beta

- Rotate any shared database passwords that were exposed outside the deployment platform.
- Confirm `ADMIN_ACCESS_TOKEN` is long, unique, and stored only in Render.
- Confirm `DATABASE_URL` is stored only in Render or local secret storage.
- Confirm `OPENAI_API_KEY` is configured only if real AI provider calls are desired.
- Confirm Netlify environment variables match the production env checklist.
- Confirm Supabase migrations have been applied before depending on new database constraints.
- Run `npm run prod:check`.
- Run `npm run db:verify-rls` against the target database.
- Run `npm run launch:smoke` locally before deployment against local start or preview.
- Run `npm run launch:smoke` after deployment with `FEROCITY_SMOKE_URL=https://ferocity.live`.
- Run `npm run owner:smoke:marketplacepro`, `npm run owner:smoke:4bid`, and `npm run owner:smoke:guardiansignal` after production env is confirmed.

## Migration Review Process

1. Migrations must be additive or forward-fix only once applied.
2. New workspace tables must include `tenant_id`, indexes for workspace lookups, RLS enabled, and workspace role policies.
3. External API tables must start disconnected and manual-first.
4. Run `npm run typecheck`, `npm test`, and `npm run build` before pushing.

## Migration Rollback / Forward Fix

1. Stop the Render service if a migration causes startup failure.
2. Inspect the failing migration name from Render logs.
3. Apply a targeted forward-fix migration instead of editing already-applied migration files.
4. Redeploy after the fix migration is committed.

## Database Backup Plan

- Enable Supabase daily backups before paid launch.
- Export schema before major migration batches.
- Record deploy id, commit hash, and migration range for every launch.
- Keep a manual export of customer workspace data before destructive changes.
- Use `/app/exports` to create a workspace JSON package before offboarding or risky account changes.

## Error Handling

- Public lead API failures are logged to `app_error_events`.
- Use Netlify deploy logs and function logs for runtime stack traces.
- Treat repeated `critical` or `error` events as beta blockers.
- Review `/app/safety` and `/app/alerts` after every production deploy.

## Secret Rotation

1. Rotate database password in Supabase.
2. Update Netlify `DATABASE_URL`.
3. Trigger deploy only after local checks pass.
4. Verify `/login`, `/`, and one protected route.
5. Rotate admin token and invalidate old shared copies.

## RLS And Isolation Verification

- `npm run db:verify-rls` verifies that an authorized workspace user can read the workspace and an unrelated auth subject cannot.
- Unit tests cover workspace access helpers and permission gates.
- New workspace tables must follow the existing RLS pattern before they are marked complete.

## API Validation And Rate Limiting

- Public lead input is validated with Zod schemas.
- Public lead submissions run honeypot, suspicious text, legal consent, legal disclaimer, contact-info, and per-IP rate-limit checks.
- Validation and rate-limit behavior are covered by unit tests.

## Audit Logs

- Important admin actions write `activity_logs`, approval audit events, or lead events.
- Review notes, brand access changes, lead status changes, assignment, qualification, routing, and AI review actions must remain auditable.

## Supabase Usage Monitoring

- Review Supabase database size, connection usage, API usage, and backup status weekly during beta.
- Alert on repeated app errors, form failures, AI fallback usage, and pending exports from `/app/alerts`.
- Keep workspace data exports manual until object storage and secure download expiry are added.

## Security Review Before External Customers

- Confirm no auto-publishing, auto-budget changes, public review responses, SMS sending, billing changes, or destructive page actions are enabled.
- Confirm all user-facing workspace language says workspace or organization.
- Confirm service-role keys are server-only and never exposed to browser bundles.
- Confirm external integrations remain placeholders until explicit connection phases.
- Confirm Stripe customer portal opens only from `/app/billing` for signed-in users.
- Confirm `/reset-password` sends Supabase recovery links to `/reset-password/update`.
- Confirm Resend inbound webhook secret is configured before enabling inbound routing.
- Confirm MarketplacePro revenue/traffic migration is applied before accepting `payments` or `traffic_events`.

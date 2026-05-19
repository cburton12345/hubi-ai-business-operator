# Production Safety Runbook

## Before Customer Beta

- Rotate any shared database passwords that were exposed outside the deployment platform.
- Confirm `ADMIN_ACCESS_TOKEN` is long, unique, and stored only in Render.
- Confirm `DATABASE_URL` is stored only in Render or local secret storage.
- Confirm `OPENAI_API_KEY` is configured only if real AI provider calls are desired.
- Confirm Render deploy runs `npm run start:render` so migrations apply before app start.

## Migration Rollback

1. Stop the Render service if a migration causes startup failure.
2. Inspect the failing migration name from Render logs.
3. Apply a targeted forward-fix migration instead of editing already-applied migration files.
4. Redeploy after the fix migration is committed.

## Backup Checklist

- Enable Supabase daily backups before paid launch.
- Export schema before major migration batches.
- Record deploy id, commit hash, and migration range for every launch.
- Keep a manual export of customer workspace data before destructive changes.

## Error Handling

- Public lead API failures are logged to `app_error_events`.
- Use Render logs for runtime stack traces.
- Treat repeated `critical` or `error` events as beta blockers.

## Secret Rotation

1. Rotate database password in Supabase.
2. Update Render `DATABASE_URL`.
3. Trigger deploy.
4. Verify `/login`, `/`, and one protected route.
5. Rotate admin token and invalidate old shared copies.

# Ferocity Domain And Rename Runbook

Use this when you are ready to move the public deployment from the current legacy Hubi URL/repo naming to Ferocity.

## Current State

- Product-facing app copy says Ferocity.
- `package.json` and `render.yaml` use `ferocity-ai-business-operator`.
- Current GitHub remote and Render URL still contain the old Hubi slug.
- Existing cookie names still use the old slug for session compatibility.

## Rename GitHub Repository

1. Open GitHub repository settings.
2. Rename `hubi-ai-business-operator` to the desired Ferocity slug.
3. Update local remote:

```powershell
git remote set-url origin https://github.com/cburton12345/ferocity-ai-business-operator.git
```

4. Update in-app runbook links in `src/app/app/runbooks/page.tsx`.

## Rename Render Service / URL

1. Open the Render service settings.
2. Rename the service to `ferocity-ai-business-operator`.
3. If Render creates a new default URL, update `scripts/render-smoke.mjs`.
4. Trigger a deploy and run `npm run render:smoke`.

## Add Custom Domain

1. Pick the production host, for example `app.ferocity.ai`.
2. Add the custom domain to Render.
3. Add DNS records exactly as Render provides.
4. Wait for TLS certificate issuance.
5. Set `RENDER_SMOKE_URL` to the custom domain for smoke checks.
6. Update OAuth callback URLs for Google, Meta, calendar, Stripe webhooks, Twilio callbacks, and review provider webhooks.

## Do Not Break Existing Users

- Keep legacy cookies until after all active sessions naturally expire.
- Keep the old webhook header fallback for at least one release.
- Do not remove legacy URL references until the custom domain has passed smoke tests.

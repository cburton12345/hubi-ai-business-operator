# Phase 52 Non-Key Hardening

Phase 52 completes the non-credential setup work before live provider connections.

## What Changed

- Added `/app/credentials` to show configured and missing provider env vars without exposing secrets.
- Added integration status controls so providers can be planned, paused, or marked ready while live actions remain off by default.
- Expanded `.env.example` and `render.yaml` with all known provider credential slots.
- Added a Ferocity domain and rename runbook for GitHub, Render, custom domain, DNS, smoke checks, and callback URL updates.
- Strengthened Render smoke checks to verify provider callback stubs respond intentionally.

## Phase 1 Check

The remembered Phase 1 item was the first Render preview/deploy verification path. It is now complete in the roadmap:

- Render blueprint validated.
- GitHub repo fetchability confirmed.
- Supabase runtime secrets present in Render.
- Live deploy triggered and smoke-tested.

## Still Credential-Bound

- Stripe
- Google Business Profile
- Facebook / Meta
- Google Ads
- Search Console
- Analytics
- Email provider
- SMS provider
- Review platform
- Calendar provider

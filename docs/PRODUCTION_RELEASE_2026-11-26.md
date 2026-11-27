# Ferocity production release — 2026-11-26

## Published artifact

- Site: `418ea625-bb2f-45cc-951c-33b231147ab8` (`ferocityflo`)
- Production deploy: `6b07f1c44648849c8b4b039a`
- Immutable URL: `https://6b07f1c44648849c8b4b039a--ferocityflo.netlify.app`
- Canonical URL: `https://ferocity.live`
- Base Git commit: `78f478f8401d3826f86b78947aba6f22e2170b9b`
- Reviewed changed-file fingerprint: `3a1209b8a3d2e2f693228b6808353006ecfc871641abe408e6db59fb75a551fc`
- Netlify API confirmed the deploy `ready` and published.

## Scope

- Simplified MarketplacePro operating path inside Ferocity.
- First-class Opportunities and Network navigation.
- Phone-or-email plus password sign-in with ambiguous phone matches rejected.
- Existing trusted-device continuity retained.
- English and Spanish field-team sign-in copy verified.
- Existing audited worker time and balance workflows preserved.

## Release evidence

- Full `npm run predeploy:local` passed.
- 370 Vitest files / 1,555 tests passed.
- Marketplace worker: 15/15 tests passed.
- Data API grants, migration rollback validation, provider/capability/UI/integration guards, TypeScript, ESLint, 130-route optimized build, and document-runtime artifact verification passed.
- Production-context Netlify build completed with the Next.js adapter and all scheduled/background functions.
- Immutable draft `6b07ef7874139de8b14e3331` passed smoke checks before production publication.
- Live `/`, `/login`, Spanish field login, `/health`, and `/api/health/supabase` returned HTTP 200.
- Both live health endpoints reported `ok: true`; Supabase reported `ready`.
- Protected MarketplacePro integration routing returned the expected authentication redirect.
- Live English and Spanish sign-in HTML contains the phone-or-email control.

## Database and provider state

- No production database migration was required or applied for this release.
- No provider write, customer communication, billing action, DNS change, or credential rotation occurred.
- Authenticated owner/worker task completion remains ordinary live-use acceptance, not a release blocker for the verified public and authentication boundaries above.

## Emergency fallback incident

- The scheduled uptime workflow first observed `https://ferocity.live/emergency.html` returning HTTP 404 on November 26 after the same probe had passed earlier that day. `/health` and `/status` continued returning HTTP 200; this was degraded incident resilience, not a full application outage.
- `public/emergency.html` remained present in source. The release process now copies the dependency-free fallback into the direct `.next` publish output, verifies the final `.netlify/static` bundle byte-for-byte, and verifies the Next.js server handler before publication.
- The uptime workflow now validates the fallback's HTML content and identity markers, preventing an unrelated 200 response or generic error document from being reported as healthy.
- Future production publication must use a Netlify build-backed release. Publishing a raw, unverified directory is not an authorized Ferocity release path.

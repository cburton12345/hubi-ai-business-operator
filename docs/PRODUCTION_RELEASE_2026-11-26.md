# Ferocity production releases — 2026-11-26 to 2026-11-27

## 2026-11-27 verified release

### Published artifact

- Site: `418ea625-bb2f-45cc-951c-33b231147ab8` (`ferocityflo`)
- Production deploy: `6b0936f9c61b12dc48e26fbe`
- Immutable URL: `https://6b0936f9c61b12dc48e26fbe--ferocityflo.netlify.app`
- Canonical URL: `https://ferocity.live`
- Published Git commit: `b56bbcc` (`Serve local brand images without runtime optimizer`)
- Feature/release base: `aebde06` plus commits `e60c91f`, `b3f2273`, `152d55b`, and `78f478f`
- Previous verified production baseline: `6b07f1c44648849c8b4b039a`
- Netlify API confirmed deploy `6b0936f9c61b12dc48e26fbe` is `ready` and is the site's published deploy.

### Recovery evidence

- Fresh encrypted production backup:
  `C:\Users\schem\Documents\Ferocity Backups\Encrypted\ferocity-puvpgebitzvyqbdnnlyz-20261127T073138Z-af96c8277324d7cf0c93014fa798e91a`
- Supabase project: `puvpgebitzvyqbdnnlyz`
- Archive SHA-256: `82ceaadd8f6f985eb7168c1a3b941ff14030ffc2440180205da9f29d85517a87`
- Manifest SHA-256: `55158b2316b21c42afa534228365e1b48f08923dfd62725911b81c3d839c6879`
- Manifest signature and authenticated restore verification passed before migration.

### Database changes and postconditions

- Applied `293_trusted_device_sessions` atomically; source SHA-256:
  `79bcaf2b28803018566012a850207f61c23746704c49bd9cf02d8c9785838874`.
- Applied `294_offline_workforce_actions` atomically; source SHA-256:
  `3068d0758f03f62e28282310679db67c6808bd6542f008e0f2774a505e7e2946`.
- Production ledger contains both versions.
- Verified 9 required columns, 4 required indexes, and 3 validated session constraints.
- Session postflight: 45 total, 5 active, 0 null absolute expiries, and 0 expiries beyond the hard ceiling.
- Offline idempotency postflight: 0 duplicate expense, worker-payment, or location-ping mutation groups.

### Build and live verification

- Full `npm run predeploy:local` passed before publication: 371 Vitest files / 1,562 tests, 15 Marketplace Worker tests, migration rollback validation, TypeScript, ESLint, production build, and 149 document-runtime traces.
- Production-context Netlify build passed with Netlify CLI 27.20.1, Netlify Build 37.8.0, and Next runtime 5.16.9.
- The final bundle contains the verified independent emergency page, 370 Next static assets, 20 packaged functions, and a non-empty Next server handler.
- Live `/`, English login, Spanish field login, `/status`, `/health`, `/api/health/supabase`, and `/emergency.html` return HTTP 200.
- Browser validation confirmed the hydrated English and Spanish sign-in layouts render correctly.
- All 15 frontend resources referenced by the checked pages return HTTP 200; no page references the failing Netlify image-optimizer route.
- `/app/operations-workforce` redirects unauthenticated users to login; an unauthenticated POST to `/api/workforce/mobile-actions` returns HTTP 401.
- `/health` reports `ok: true` and Supabase `ready`; the direct Supabase health endpoint reports `ready`.
- CSP and HSTS are present on the checked public pages.

### Publication incident and permanent release correction

- Deploy `6b0933a7a5b9b443c892cfcf` was immediately rejected because the default `--no-build` publication included server functions but omitted generated static CSS and JavaScript. Live checks caught the failure before certification.
- Fix-forward deploy `6b09361b999f20164401ec26` published the explicit verified `.netlify/static` and `.netlify/functions` outputs and restored all CSS and JavaScript resources.
- The same-origin Netlify image optimizer still failed for local brand images, including on the previous production baseline. Commit `b56bbcc` disables that unnecessary runtime hop globally; the final build serves the original local brand assets directly.
- Authorized manual production publication for this project must specify both generated outputs: `--dir .netlify/static --functions .netlify/functions`. A raw `.next` publish or a default `--no-build` publish without those paths is not an accepted release path.
- The strengthened GitHub uptime workflow remains source-only until its branch is merged; the live fallback URL and identity markers were independently verified in this release.

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

## Next release candidate

- Local commit `32c5b0e` hardens emergency-fallback packaging and monitoring on top of the offline workforce and flexible-location candidate.
- The complete current-tree `npm run predeploy:local` gate passes: all public/provider/capability/UI/integration guards, explicit Data API grants, rollback-only validation of migrations 282–294 against the retained disposable PostgreSQL target, 371 Vitest files / 1,562 tests, 15 Marketplace Worker tests, TypeScript, full ESLint, the optimized production build, and document-runtime verification across 149 server traces.
- The Netlify production-context bundle check passes with `@netlify/plugin-nextjs` 5.16.9 and proves byte-identical emergency fallback content plus a non-empty Next.js server handler.
- This candidate and migration 294 are not deployed. Current production still returns HTTP 404 for `/emergency.html`; `/health` and `/status` return HTTP 200.

## Database and provider state

- No production database migration was required or applied for this release.
- No provider write, customer communication, billing action, DNS change, or credential rotation occurred.
- Authenticated owner/worker task completion remains ordinary live-use acceptance, not a release blocker for the verified public and authentication boundaries above.

## Emergency fallback incident

- The scheduled uptime workflow first observed `https://ferocity.live/emergency.html` returning HTTP 404 on November 26 after the same probe had passed earlier that day. `/health` and `/status` continued returning HTTP 200; this was degraded incident resilience, not a full application outage.
- `public/emergency.html` remained present in source. The release process now copies the dependency-free fallback into the direct `.next` publish output, verifies the final `.netlify/static` bundle byte-for-byte, and verifies the Next.js server handler before publication.
- The uptime workflow now validates the fallback's HTML content and identity markers, preventing an unrelated 200 response or generic error document from being reported as healthy.
- Future production publication must use a Netlify build-backed release. Publishing a raw, unverified directory is not an authorized Ferocity release path.

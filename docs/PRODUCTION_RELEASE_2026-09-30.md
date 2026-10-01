# Ferocity Production Release — 2026-09-30

## Release identity

- Application checkpoint: `4f2e5e5` (`Checkpoint Ferocity platform expansion and agent handoff`)
- Netlify site: `418ea625-bb2f-45cc-951c-33b231147ab8`
- Published deploy: `6abdd92700612aa0337e5c46`
- Production URL: `https://ferocity.live`
- Release authorization: owner explicitly said `do front end deploy`

## Database

- Validated and applied `232_listing_syndication_connectors.sql`.
- Production migration runner reported migrations 001-231 already applied.
- RLS verification passed after migration 232.

## Verification

- Full `npm run predeploy:local` passed before the checkpoint: 703 Vitest tests, Marketplace worker tests, typecheck, lint, production build, migration validation, and repository-specific public/provider/capability/UI/architecture guards.
- A Netlify draft of the exact checkpoint built and published successfully.
- Draft smoke checks passed for `/`, `/pricing`, `/ask-ferocity`, `/integrations`, `/health`, and `/api/health/supabase`.
- The verified draft was promoted unchanged to production.
- Production smoke checks returned HTTP 200 for the same public and health routes.
- The X Ads OAuth start route returned HTTP 307 to `/login` for an unauthenticated request, confirming the route loaded without a configuration failure.

## Configuration correction

- Corrected the protected Netlify production value for `X_ADS_OAUTH_REDIRECT_URI` to `https://ferocity.live/api/integrations/x_ads/oauth/callback`.
- Netlify masks protected values during local production-context builds. The successful draft was built with an explicit non-secret callback override and then promoted through Netlify's deploy API, preserving the verified artifact.

## Known non-blocking warning

- Next.js continues to emit the existing `unpdf/dist/pdfjs.mjs` dynamic-dependency warning. Compilation and deployment complete successfully.

## Post-release public-copy recovery

- Audited every database-controlled public copy slot: `home_hero`, `home_final_cta`, `demo_hero`, and `pricing_hero`.
- Found one regression: a September 23 `home_hero` override replaced the researched September 28 headline and changed the primary CTA from the embedded homepage chat to `/demo`.
- Published the reviewed canonical values for all four slots with actor `codex:approved-public-copy-recovery-2026-09-30` and wrote published revision records.
- Restored homepage headline: `Your business shouldn't stop when you stop looking at it.`
- Restored primary CTA: `Give Ferocity an outcome` → `#ask-ferocity`.
- Verified the production page after cache revalidation: canonical headline visible, direct-chat CTA present, chat anchor present, and the real Ferocity chat experience rendered.
- No additional frontend deployment was required for this recovery.

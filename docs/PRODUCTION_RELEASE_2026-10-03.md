# Ferocity production release — October 3, 2026

## Release identity

- Production site: `https://ferocity.live`
- Netlify site ID: `418ea625-bb2f-45cc-951c-33b231147ab8`
- Netlify deploy ID: `6ac1c5c68a52875e00f91705`
- Unique deploy URL: `https://6ac1c5c68a52875e00f91705--ferocityflo.netlify.app`
- Deploy state: `ready`
- Published: October 3, 2026 at approximately 8:23 PM America/Los_Angeles
- Base Git commit: `cc8816f`; the production artifact also contains the preserved, intentional working-tree changes documented in the handoff.

## Included work

- Ask Ferocity is promoted into the public homepage hero, with the full conversation immediately following and the owner command-center example repositioned as supporting proof.
- Public Ask Ferocity language now moves from diagnosis through economics/context, practical path, actual Ferocity execution, and an explicit next action.
- The authenticated Ferocity composer remains available while reviewing conversation history and accepts the expanded financial-document formats.
- Receipt, statement, Cash App, deposit/income, tax-printing, property/unit allocation, and structured-file ingestion work is included.
- Structured financial imports support CSV, TSV, TXT, XML, OFX, QFX, QBO, and XLSX alongside PDF and receipt images.
- Unified POS sales, tenders, invoice/payment/ledger/inventory effects, returns, and printable sale details are included.
- The X Ads persisted-certification/provider-token work present in the release remains read-first; no advertising writes or spend were enabled.
- Next.js is patched to 16.3.6. Production dependency audit reported zero vulnerabilities.

## Database state

- Production migrations are applied through `234_receipt_structured_file_storage.sql`.
- Migration 233 adds the unified POS sale and return schema with tenant RLS.
- Migration 234 keeps the receipt source bucket private and adds the explicit structured-financial-file MIME allowlist.
- `npm run db:validate:migrations` reported zero pending migrations.
- `npm run db:verify-rls` passed.
- `npm run receipt-intelligence:readiness` passed with eight eligible workspaces and eight active receipt aliases.

## Release gates and production evidence

- `npm run predeploy:local` passed: public/provider/capability/UI/integration guards, 191 test files with 713 tests, 7 Marketplace worker tests, migration validation, typecheck, lint, and production build.
- Netlify production-context build and function packaging passed using the validated local environment. The existing non-fatal `unpdf/pdfjs` dynamic-dependency warning remains.
- Netlify deployed 13 functions and reported the production deploy `ready`.
- `npm run launch:smoke` passed against `https://ferocity.live` for the public site, demo, pricing, signup, health, password reset, protected-app redirect, and public worker intake.
- `npm run public-chat:smoke` passed against production and removed its test lead/conversation/event records.
- Direct checks returned 200 for `/`, `/ask-ferocity`, `/login`, and `/health`; `/app/pos` and `/app/expenses` correctly redirected unauthenticated requests to login.
- The live homepage response contains the new Ask Ferocity hero, conversation CTA, and conversation-to-coordinated-work proof section.
- All 13 homepage CSS/JavaScript assets and the optimized Ferocity brand image returned 200 from production.
- A visual browser check confirmed the styled desktop layout and brand image; the browser console reported no warnings or errors.

## Operational notes

- The first attempted production deploy, `6ac19a4adedefababd759212`, was invalid: a manual `.next` upload omitted the adapter-managed static assets and image-routing configuration. Production was immediately restored to the last known-good release while the deployment path was corrected. That invalid deploy remains only in Netlify history and is not published.
- The underlying build failure was caused by `X_ADS_OAUTH_REDIRECT_URI` being incorrectly marked as a Netlify secret even though it is a public OAuth callback. Netlify masked it during local production-context builds and Ferocity's environment validation correctly rejected the placeholder. The variable was deleted and recreated as non-secret site configuration; validation was not weakened.
- Deploy `6ac1c5c68a52875e00f91705` was built through the normal Netlify Next.js adapter, certified first at its unique preview URL, and then promoted unchanged to production.
- The production artifact contains intentional uncommitted working-tree changes. Netlify can restore this deploy, but Git does not yet contain an exact reviewed checkpoint of the released source.
- No campaign, advertisement, public post, message blast, advertising spend, billing method, or other provider write was launched by this release.
- H4R owner account provisioning is separate from the deploy: the owner-level Operator account is active, manual/no-live-billing, and external actions remain gated.

# Ferocity production release — October 8, 2026

## Release identity

- Production site: `https://ferocity.live`
- Production deploy ID: `6ac8444a6860a0fb5ddce6e3`
- Certified draft deploy ID: `6ac843899beaadfeca7a0d6e`
- Netlify site ID: `418ea625-bb2f-45cc-951c-33b231147ab8`
- Source branch: `codex-preserve-ferocity-latest`
- Release type: manual atomic Netlify production deploy from the reviewed working tree

Because this is a manual release on a Git-connected site, a later production-branch deployment can replace it. Compare the deploy ID and this record before assuming a later Git deploy contains the same source state.

## Included work

- Ask Ferocity whole-business command understanding, retained goals, multi-goal progression, owner-review outcome evidence, contextual artifact links, and honest customer-versus-subscriber behavior.
- Worker-scoped English/Spanish Ask Ferocity using the same assignments, visits, punch lists, and evidence while excluding owner financial and unrelated-work context.
- Receipt, statement, tax-packet, independent-review, full-page coverage, structured-file, print, and download repairs.
- Shared H4R document-intelligence and operating-brain source contracts without moving authoritative H4R lease, payment, ledger, signature, or tenant state into Ferocity.
- POS, inventory-cost, return/invoice, purchasing, receiving, vendor-bill reconciliation, membership exhaustion, customer-portal rate-limit, and idempotency repairs.
- Provider readiness now reports canonical capability truth rather than treating credential presence as live operational access.
- Retell transfer configuration and readiness improvements. Outbound calling remains disabled.

## Database state

- Production migrations through `248_commerce_portal_integrity.sql` are applied.
- Migration validation reports zero pending migrations.
- RLS and sensitive-grant verification passes.

## Verification evidence

- Complete predeploy gate passed before release: 241 Vitest files / 912 tests, seven Marketplace worker tests, public/provider/capability/UI/architecture guards, migration validation, TypeScript, ESLint, optimized 122-page Next.js build, and document-runtime artifact verification.
- A deployment-only defect was caught in the first draft attempt: two Vitest files under `netlify/functions` were being discovered as serverless functions. They were consolidated into `src/lib/automation/netlify-background-functions.test.ts`; the three focused tests and TypeScript pass. The corrected deploy manifest registers only runtime functions, and both former test-function URLs return 404 in production.
- Preserved December 2025 statement certification read the complete December 1–31 range in both passes: 144 transactions, 129 debits, 15 credits, two transfers, and identical aggregate totals. Repeated-looking rows correctly keep the document in human review. No stored document was changed and no expense was posted.
- Certified draft returned 200 for `/`, `/login`, `/ask-ferocity`, and `/health`; protected owner/employee routes returned the expected canonical login redirects.
- Production returned the same expected responses. The two former test-function paths return 404.
- Desktop and 390×844 visual checks on both draft and production show styled, readable pages with Ask Ferocity prominent and no raw-HTML/CSS failure.

## Remaining human/provider evidence

- Retell has a configured number, inbound webhook, fallback agent, transfer number, and transfer tool, but no qualifying real inbound call exists in the latest 30-day window. Place one real handset call to the configured Ferocity number, then run `npm run retell:callback:readiness -- --certify`. Do not mark fresh callback certification complete before that evidence exists.
- The current legitimate identity still lacks secure access to the H4R Supabase project required for H4R-side runtime activation. Do not reuse the previously exposed personal access token.
- Provider approval/account-connection limitations remain exactly as recorded in `docs/customer-marketing-connector-readiness.md`; this release did not launch ads, spend money, publish campaigns, or enable unauthorized provider writes.
- Real owner-account statement review/posting and role-scoped authenticated task journeys remain operational verification work. The release does not convert repeated-looking financial rows into approved expenses automatically.

## Safety outcome

- No campaign, advertising spend, paid service, provider write, outbound call, public post, or material external commitment was made.
- Production publication was explicitly authorized by the owner with `do front end deploy`.

## Post-release runtime evidence

- Two production mailbox schedules completed successfully at the expected cadence: one inbox synchronized, 25 messages examined, and zero failures in each run.
- Four consecutive corrected production business-automation runs completed across eight workspaces with zero tenant failures. The first observed invocation immediately after release still used the prior bundle and failed on the already-repaired `server-only` import; all later observed invocations used the corrected artifact and passed.
- H4R's additive aggregate context view and signed read-only Edge Function are now live and independently verified. The shared secret and `H4R_CONTEXT_URL` are staged in Ferocity's Netlify production environment, but Netlify requires a new Ferocity deploy before the already-published runtime can consume those values. That later deploy has not been authorized in this post-release step.

## Post-release data repair and private mobile release

- All twelve preserved 2025 Cash App statements in the `burtonchristopher125@gmail.com` H4R workspace were reprocessed in place from checksum-verified original private files. May had been uploaded later than the original eleven-file set and was recovered separately after its failed import left it labeled `other` with zero transactions. The guarded repairs created 1,995 review-only rows: 1,783 debits, 212 credits, and 21 transfers. They posted zero expenses and changed no original file or H4R authoritative ledger record.
- The complete 2025 view now contains 1,762 non-transfer debit expense candidates and 223 non-transfer deposits from 46 distinct unresolved payer/source labels across all twelve months. None is yet matched to an H4R tenant, so neither “two tenants paid” nor “46 tenants paid” is a supported conclusion.
- Eleven stale independent-review records that had passed empty extraction output were invalidated and returned to reviewer-unavailable/human-review-required state. Classification review remains evidence gathering; it cannot determine tax deductibility or silently post/assign records.
- The next-source Ask Ferocity evidence contract was tightened to report year-specific expense/deposit counts, distinct unresolved source labels, authoritative assignments, and missing statement months. This source-only clarification is tested but was not deployed in this post-release repair.
- Ferocity Connect `1.1.0` (`versionCode 4`) passed Android tests, lint, release assembly, APK signature verification, and signing-certificate continuity against `1.0.2`. The private release was published; `1.0.2` was retired. The paired Samsung still needs the owner to install/open `1.1.0` so a fresh device heartbeat can be observed.
- This post-release work changed production data and the private APK release record only. It did not deploy the Ferocity frontend.

## Post-release document-project hardening

- Production migration 249 adds document projects, upload batches, and per-file outcomes with RLS. The H4R 2025 evidence was backfilled into one project with separate original-eleven and later-May batches; no source document, transaction, expense, or H4R authoritative record was changed.
- Read-only production certification proves 12 distinct private-source hashes, all 12 months, 1,995 transactions, 1,762 non-transfer project expense candidates, 212 project deposits, 21 separated transfers, and zero failed or unresolved batch items.
- Source now preserves project/batch scope in printable expense and deposit packets, CSV export, and missing-month coverage. It also prevents statement-row review from silently using the global frontier model and enforces a per-document review cap.
- Receipt-intelligence readiness, RLS verification, migration validation, targeted tests, TypeScript, and targeted ESLint pass.

## Document-project frontend release

- The owner explicitly authorized `do front end deploy`. The complete local release gate passed 241 Vitest files / 917 tests, seven Marketplace Worker tests, provider/public/capability/UI/architecture guards, zero-pending migration validation, TypeScript, full ESLint, the optimized 122-page build, and document-runtime artifact verification.
- Draft deploy `6ac843899beaadfeca7a0d6e` passed the full launch and render smoke suites before production publication. Production deploy `6ac8444a6860a0fb5ddce6e3` was then published atomically to `https://ferocity.live`.
- Production launch and render smoke suites passed after publication. Public pages and health return 200; owner, expenses, tax-print, deposit-print, and CSV routes enforce authentication; the two former accidental test-function paths remain 404.
- The deployed release includes document projects/batches, later-upload separation, scoped expense/deposit print and CSV paths, the H4R context environment activation staged before the release, and the statement-review cost guard. No campaign, advertising spend, provider write, outbound call, or paid commitment occurred.

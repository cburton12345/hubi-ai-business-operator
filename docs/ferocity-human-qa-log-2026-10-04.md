# Ferocity QA and remediation record — 2026-10-04

## Scope

Targeted remediation of confirmed human-QA findings. This was not a broad rebuild. Production was not deployed or changed.

## Completed

- Ask Ferocity now accepts attachment-only requests and creates a truthful effective command.
- Receipt/chat files upload directly to the private Supabase bucket with short-lived signed upload tokens. File bytes no longer traverse Netlify Functions, whose buffered binary request ceiling is below the advertised 15 MB file size.
- Prepared uploads are bound to the authenticated tenant, storage reservation, bucket, path, and byte count before processing.
- Files process independently and results retain original file names and indices through partial failures.
- Failed files remain selected; successful files are removed. Successful identical retries reuse the existing document hash instead of repeating OCR/extraction.
- Expense import and chat submission expose pending/progress states and suppress repeat submits.
- Sensitive original-document and full-workspace-export downloads now require explicit API permissions and return non-revealing denial/not-found responses.
- Operations/workforce mutations now require explicit role permissions. Worker/assignment references used by the affected actions are tenant-validated.
- POS sale and return failures now preserve form input, show safe actionable errors, and retain atomic rollback/idempotency.
- Message retries use stable per-attempt idempotency keys, update retry ancestry/counters, and disable repeat clicks while pending.
- Approval decisions update only records still in `pending`; concurrent later decisions cannot overwrite the first.
- Growth-baseline forms reject blank/malformed numbers instead of coercing them to zero, preserve entries on failure, and show inline status.
- POS return-overage failures now preserve the typed reason as well as item quantities.
- Attachment-only Ask Ferocity turns receive authoritative ingestion context, never ask for an already received file again, and use a deterministic completion response with a direct Receipts & Expenses next action instead of an unrelated clarification.
- Receipt and expense review now renders eight document cards per page, preserves search across page navigation, clamps invalid page values safely, and no longer mounts every review form in one enormous mobile document.
- Shared admin queues now render a responsive empty state without forcing an empty 860px table and horizontal scrolling.

## Verification evidence

- Focused regression suite before runtime certification: 10 files, 38 tests passed.
- Full `npm run predeploy:local`: passed.
  - Public/provider/capability/UI/integration guards passed.
  - Pending migration validation passed with 0 pending migrations.
  - Latest post-runtime-remediation Vitest: 197 files, 743 tests passed.
  - Marketplace worker: 7 tests passed.
  - TypeScript, ESLint, and production Next.js build passed.
- Production build retained the existing non-fatal `unpdf` dynamic-dependency warning.

## Authenticated local runtime certification

- Direct private upload passed with synthetic 5 MB and 15 MB-minus-1 KB PNG files. Both produced preserved, reviewable document records.
- A 15 MB-plus-1-byte file was rejected client-side with the correct filename-specific limit message.
- The maximum 25-file batch completed 25/25 in approximately five minutes with sequential live progress, repeat-submit suppression, and partial results appearing during the run.
- Re-importing an exact batch file did not increase the document count and returned the existing record as `already imported`.
- An interrupted Ask Ferocity turn still preserved the successfully processed 5 MB document; the later exact-file retry did not duplicate processing.
- Ask Ferocity attachment-only regression passed after remediation: the UI reported completion, named the already-imported file, and linked directly to Receipts & Expenses without requesting another upload or generic clarification.
- POS insufficient-stock certification passed: the sale was rejected atomically, the error named the inventory item, no sale appeared, and all sale inputs remained available for correction.
- POS return-overage certification passed: the overage was rejected, no return was recorded, and both quantity and reason remained entered after remediation.
- Owner-authorized original-document access passed and resolved through a short-lived private signed URL.
- Ask Ferocity at 390x844 remained usable with the composer prominent; Shift+Enter produced a two-line value without submitting.
- Receipts & Expenses, Approval Queue, Workspace Performance, and Point of Sale were exercised at a 390x844 viewport. None produced page-level horizontal overflow; reports and POS remained readable and operable.
- The first Receipts & Expenses page rendered 8 of 27 cards with clear `Page 1 of 4` navigation; page 2 rendered the next 8, and search plus an out-of-range page safely resolved to the last matching page while preserving the search query.
- The empty Approval Queue now renders without a table or clipped `No records yet` message at the mobile breakpoint.
- Focused post-remediation verification: 3 test files / 8 tests passed and `tsc --noEmit` passed.
- Post-mobile-remediation full `npm run predeploy:local` passed: all guards, 197 test files / 743 tests, 7 Marketplace worker tests, TypeScript, ESLint, and the production build. The existing non-fatal `unpdf` dynamic-dependency warning remains unchanged.

## Runtime certification still required before release

- Exercise viewer/operator/admin/owner denial/allow behavior for the remediated mutations and downloads.
- Complete keyboard-only interaction certification for expense import, approvals, reports, and POS. Narrow/mobile layout passed locally for those surfaces.
- Repeat the authenticated runtime matrix against a deploy preview before production promotion; local browser certification is not deploy-preview certification.

## Release status

- Source and local release gate: ready.
- Local authenticated runtime certification: passed for uploads, deduplication, Ask Ferocity attachment closure, POS failures, owner document access, and Ask Ferocity mobile/keyboard behavior.
- Deploy-preview and multi-role certification: pending.
- Production frontend: unchanged. Do not deploy without the owner's exact phrase `do front end deploy`.
- No advertising spend, campaign launch, public post, provider write, billing change, or external commitment occurred.

## Remaining wider QA backlog

Continue the capability matrix beyond this confirmed-defect batch. Every high-value workflow still needs happy-path, failure, retry/idempotency, interruption/resume, tenant isolation, role enforcement, accessibility, mobile, and completion-evidence certification. The capability ledger remains the truth source; route existence is not production certification.

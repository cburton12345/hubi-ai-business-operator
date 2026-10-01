# Receipt & Expense Intelligence

## What is implemented

Ferocity now has a product-neutral document intelligence kernel plus a Ferocity adapter. It preserves the original private file, extracts normalized bookkeeping fields and line items, scores field confidence, proposes allocations from live workspace context, detects likely duplicates, routes uncertain work to review, and posts approved expenses into the existing `operations_expenses` ledger used by job costing, profitability, dashboards, and reports.

The user workflow is at `/app/expenses`. It accepts camera capture, single or batch file selection, and drag/drop of up to 25 documents at once. Each document is processed independently, so a failed file does not discard successful imports. The existing signed Resend inbound webhook now recognizes `receipts+{workspace-slug}@ferocity.live`, downloads supported attachments from Resend's one-hour signed URLs, and routes them through the same batch engine. A separate signed multipart endpoint at `/api/document-intelligence/import/email` remains available for other inbound providers.

The 25-item limit is a file limit, not a page or charge limit. One multi-page bank or card statement counts as one file. Ferocity preserves that statement once, reads mixed digital and scanned pages, extracts up to 500 transactions in page order, and presents debits as separate expense candidates. Credits, likely account transfers, and possible duplicates are excluded by default. A reviewer can correct each selected charge's category and allocation target before posting it individually to Money; the statement total is never posted as one expense. PDF processing is capped at 25 pages per file so the AI cannot silently skip an unbounded statement; longer PDFs or statements above 500 transactions must be split.

Image documents use vision extraction. Digital PDF pages are text-extracted locally. Scanned/image-only pages are rendered privately in the server runtime and sent through the same vision extraction and normalization path, including mixed PDFs that contain both page types. Pages are grouped in order in bounded five-page AI requests. Private signed URLs and rendered page data are never written to AI audit metadata; the original private document remains the durable source.

## Shared boundary

Reusable code lives in `src/lib/document-intelligence`:

- `types.ts` is the consumer contract.
- `extract.ts` performs provider-managed document understanding.
- `normalize.ts` produces stable product-neutral fields.
- Statement transaction extraction and normalization preserve transaction dates, posted dates, descriptions, merchants, references, debit/credit direction, running balances, categories, transfer evidence, confidence, and a stable duplicate fingerprint.
- `deduplicate.ts` performs exact and business-field duplicate scoring.
- `allocate.ts` provides deterministic allocation scoring, while `allocate-with-ai.ts` reasons across live targets and validates every answer against the supplied candidate set.
- `workflow.ts` coordinates storage, extraction, review, duplicate detection, and audit events.
- `ferocity-adapter.ts` is the only place that reads Ferocity jobs/customers/workers/crews/assets or posts to Ferocity Money.
- `h4r-adapter.ts` is the ready-to-wire H4R target/category adapter; H4R supplies database readers and its canonical-ledger writer.

The database kernel is migration `211_shared_document_expense_intelligence.sql`; statement transaction storage is migration `213_statement_transaction_intelligence.sql`. Generic allocation rows and statement allocation references use string target types/refs; they intentionally do not foreign-key into Ferocity's job schema.

## Safety behavior

- Original files live in the existing private `receipt-expense-assets` bucket.
- Every processed decision produces an audit event.
- Automatic posting is off by default.
- When enabled, both extraction and allocation must clear the workspace threshold.
- Exact and probable duplicates always stop for explicit review.
- Missing vendor, total, date, or low confidence always stops for review.
- Approved Ferocity documents create one existing `operations_expenses` record and retain generic allocation detail for future accounting exports.

## Email ingestion contract

Set `DOCUMENT_INGEST_SECRET` in the server environment. The inbound provider sends a multipart `POST` with `Authorization: Bearer <secret>` and:

- `workspaceId` (required UUID)
- `attachment` (required file)
- `messageId` (recommended for traceability)
- `bodyText` (optional OCR/context fallback)

## H4R adapter

H4R should reuse the shared service rather than copy extraction logic. Its adapter supplies targets such as `property`, `unit`, `tenant`, `lease`, `maintenance`, `capex`, `utility`, `tax`, `insurance`, `supplies`, and `rental_overhead`. It then maps approved normalized documents into H4R's canonical property expense ledger. See the desktop handoff note for the concrete sequence.

## Still external/configuration work

- Migrations 211–213 are applied in production. Run `npm run receipt-intelligence:readiness` for a read-only check of the schema, RLS, private storage bucket, feature entitlement, workspace receipt aliases, and statement transaction storage.
- `DOCUMENT_INGEST_SECRET` is stored as a secret-scoped production Netlify variable and will become available to the deployed runtime on the next authorized deploy.
- Confirm the existing Resend receiving domain/webhook remains active after deployment. Workspace receipt aliases are already provisioned and new workspaces receive one automatically.
- Perform a real photographed-receipt, multi-page digital statement, fully scanned statement, and mixed text/scanned statement certification after the next authorized deploy.
- Approved expenses already flow through `operations_expenses` into Ferocity's existing expense/tax accounting CSV. A provider-specific direct accounting sync can be added when a provider is selected without changing the document engine.

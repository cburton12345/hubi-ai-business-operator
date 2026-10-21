# Receipt & Expense Intelligence

## What is implemented

Ferocity now has a product-neutral document intelligence kernel plus a Ferocity adapter. It preserves the original private file, extracts normalized bookkeeping fields and line items, scores field confidence, proposes allocations from live workspace context, detects likely duplicates, routes uncertain work to review, and posts approved expenses into the existing `operations_expenses` ledger used by job costing, profitability, dashboards, and reports.

High-risk document work also uses Ferocity's Independent AI Review contract. Statements, low-confidence documents, arithmetic discrepancies, and documents at or above $10,000 require deterministic checks and a separately configured reviewer model. The reviewer rereads the original PDF/image/text independently. Ferocity stores field/transaction disagreements in `ai_independent_reviews`, shows them beside the source document, and requires human confirmation when the reviewer is unavailable or disagrees. A reviewer model must be explicitly configured with `AI_MODEL_REVIEWER` and must differ from the primary extraction model; otherwise the work remains review-required rather than being mislabeled verified.

The user workflow is at `/app/expenses`. It accepts camera capture, single or batch file selection, and drag/drop of up to 25 documents at once. Each document is processed independently, so a failed file does not discard successful imports. The existing signed Resend inbound webhook now recognizes `receipts+{workspace-slug}@ferocity.live`, downloads supported attachments from Resend's one-hour signed URLs, and routes them through the same batch engine. A separate signed multipart endpoint at `/api/document-intelligence/import/email` remains available for other inbound providers.

Every browser selection creates an explicit import batch before bytes are uploaded. Each selected filename receives one terminal outcome: imported, reused from an existing checksum-matched source, or failed; a processing outcome remains visible as unresolved until reconciled. A batch can stay separate or belong to a named document project such as a tax year, property, job, or customer. Project/batch scope flows through the document list, missing-month warning, separate expense and deposit print packets, and expense CSV export. Reusing an existing source links evidence without duplicating its private file.

The same tenant-isolated importer accepts CSV, TSV, XLSX, XML, OFX, QFX, QBO, and plain-text downloads. Structured files are decoded directly and then normalized through the transaction engine; they are never routed through image OCR. Google Sheets can use its CSV/XLSX download until a separately authorized live Sheets connection is configured. H4R is one private workspace use case, not a client-visible product mode: other tenants receive the generic import, reconciliation, review, and reporting capability without access to H4R records or terminology.

The 25-item limit is a file limit, not a page or charge limit. One multi-page bank or card statement counts as one file. Ferocity preserves that statement once, reads mixed digital and scanned pages, extracts up to 500 transactions in page order, and presents debits as separate expense candidates. Credits, likely account transfers, and possible duplicates are excluded by default. A reviewer can correct each selected charge's category and allocation target before posting it individually to Money; the statement total is never posted as one expense. PDF processing is capped at 25 pages per file so the AI cannot silently skip an unbounded statement; longer PDFs or statements above 500 transactions must be split.

Image documents use vision extraction. Digital PDF pages are text-extracted locally. Scanned/image-only pages are rendered privately in the server runtime and sent through the same vision extraction and normalization path, including mixed PDFs that contain both page types. Pages are grouped in order in bounded five-page AI requests. Private signed URLs and rendered page data are never written to AI audit metadata; the original private document remains the durable source.

## Shared boundary

Reusable code lives in `src/lib/document-intelligence`:

- `types.ts` is the consumer contract.
- `extract.ts` performs provider-managed document understanding.
- `pdf-pages.ts` is the shared, source-preserving PDF text/page-rendering kernel used by financial and lease adapters.
- `lease-analysis.ts` performs lease-specific term, clause, and field-location analysis with deterministic checks and a distinct-model review. It never accepts fields or signs documents.
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
- Statement arithmetic/row integrity and receipt subtotal/tax/fee/tip/discount arithmetic are checked deterministically.
- A second model never silently averages a disagreement with the primary model. Differences remain visible and block automatic approval.
- Human approval and independent-model review are separate audit states. Critical statements require human confirmation even when both models agree.
- Approved Ferocity documents create one existing `operations_expenses` record and retain generic allocation detail for future accounting exports.

## Email ingestion contract

Set `DOCUMENT_INGEST_SECRET` in the server environment. The inbound provider sends a multipart `POST` with `Authorization: Bearer <secret>` and:

- `workspaceId` (required UUID)
- `attachment` (required file)
- `messageId` (recommended for traceability)
- `bodyText` (optional OCR/context fallback)

## H4R adapter

H4R should reuse the shared service rather than copy extraction logic. Its adapter supplies targets such as `property`, `unit`, `tenant`, `lease`, `maintenance`, `capex`, `utility`, `tax`, `insurance`, `supplies`, and `rental_overhead`. It then maps approved normalized documents into H4R's canonical property expense ledger. See the desktop handoff note for the concrete sequence.

Lease reuse is now a separate purpose adapter over the same PDF kernel. Ferocity migration `239_shared_lease_document_intelligence.sql` stores purpose-specific analyses and untrusted field suggestions; H4R's adapter preserves its own document/lease authority and requires confirm/reject review before copying a suggestion into `lease_fields`. The active cross-product plan and dated gates are in `docs/SHARED_DOCUMENT_INTELLIGENCE_ROLLOUT_2026-10-07.md`.

For an owner who operates H4R through the Ferocity dashboard, no separate H4R OCR screen is required. Create the rental portfolio as a Ferocity customer with locations, record buildings as customer assets using asset type `property` or `rental-property`, and record units as assets using `unit` or `rental-unit`. Receipts & Expenses exposes those records as property/unit allocation targets, retains the selected asset and parent-property metadata on the posted expense, and continues to use Ferocity's review-first Money ledger and tax export. A direct H4R ledger adapter remains optional for a future separately deployed H4R interface.

Cash App and similar payment-account statements preserve both money-out debits and money-in credits. Transfers are excluded from income and expense treatment, but a `Payment received` row with a named payer remains a money-in deposit even if a model guesses that the word `payment` implies a card or own-account transfer. Reviewers classify credits such as rent, reimbursements, refunds, owner contributions, and refundable security deposits separately; security deposits are never presumed to be rental income. Reports provide distinct printable property-expense and deposit packets, each with an unresolved section and links to the preserved source statement.

### October 8, 2026 H4R statement repair

All twelve preserved 2025 Cash App PDFs in the owner workspace were reprocessed in place after the PDF runtime repair. The May file had been uploaded later than the first eleven-file set and was initially mislabeled `other` with zero transactions; a targeted checksum-verified repair recovered it on October 8. The twelve PDFs produced 1,995 transaction rows: 1,783 debits, 212 credits, and 21 transfer-classified rows. Including eleven older 2025 screenshot-derived rows, the year view contains 1,762 non-transfer debit expense candidates and 223 non-transfer deposit rows across all twelve months. The deposits contain 46 distinct payer/source labels, but none are yet authoritatively matched to an H4R tenant; Ferocity must present them as unresolved sources, not as 46 confirmed tenants or only two paid tenants.

The repair retained the original private bytes, verified their stored lengths and SHA-256 hashes, updated the existing document records in place, and created review-only child rows. It posted zero expenses, changed no original file, and did not modify H4R's authoritative payment or tenant ledger. Prior independent-review records that had incorrectly passed empty extraction output were invalidated and returned to human-review-required state. Scheduled classification review may add evidence, but it must not decide tax deductibility or silently assign a payer to a tenant.

Row-level two-model classification is cost-bounded. It does not inherit the global frontier reviewer: `AI_MODEL_STATEMENT_REVIEWER` must be deliberately configured to a model distinct from the primary row classifier. `AI_STATEMENT_CLASSIFICATION_REVIEW_MAX_ROWS_PER_DOCUMENT` defaults to 10 and is clamped to 1–50. Once reached, remaining ambiguous rows stay human-review-required rather than consuming unbounded scheduled-model usage.

## Financial workpaper readiness contract

`src/lib/document-intelligence/financial-workpaper-readiness.ts` is the canonical completion gate for financial-document work. Expense print, deposit print, expense CSV, and Ask Ferocity use the same result. A packet may always be printed as draft evidence after at least one source is preserved, but it may say `Ready for preparer review` only after all applicable source, reconciliation, duplicate, transfer, assignment, and review gates pass. Ferocity never claims that a workpaper is a filed return, tax determination, or complete merely because both models returned the same output.

Source blockers include unresolved upload-batch files, unverified or missing annual statement periods, failed or empty extraction, failed/omitted pages, and statement rows that do not reconcile to printed money-in, money-out, and fee controls. Review blockers include possible duplicates, transfers posted or included as income/expense, formula/proximity/income-weighted property assignments, unavailable or disagreeing independent review, missing human confirmation for high-impact sources, unassigned expenses, and unclassified deposits.

Statement review no longer preselects every non-transfer row. The owner selects only rows that have a supported category and assignment. Unselected or unassigned rows remain visible in review and are not posted, excluded, or converted to general overhead as a side effect of confirming other rows. An explicit owner selection records `assignmentEvidence: owner_confirmed`; inferred merchant-location suggestions remain suggestions until confirmed. Merchant city/state may narrow questions but never proves which property incurred a cost.

The readiness response returns one prioritized next action, so Ask Ferocity can request the minimum missing evidence rather than sending the owner through generic feature navigation. Regression coverage includes missing months, empty/partial extraction despite model agreement, unsafe transfer treatment, unresolved duplicates, unsupported formula allocations, unresolved property/deposit decisions, and unavailable independent review.

## Still external/configuration work

- Migrations through `249_document_intelligence_batches.sql`, including 211–213 and 234–236, are applied in production. Run `npm run receipt-intelligence:readiness` for a read-only check of the schema, RLS, private storage bucket, feature entitlement, workspace receipt aliases, transaction storage, review evidence, batch/project storage, and the required migration set.
- Migration 234 extends the same private source-evidence bucket with an explicit allowlist for CSV, TSV, TXT, XML, OFX, QFX, QBO, and XLSX. The upload service canonicalizes these MIME types by approved extension because bank and payment-provider downloads frequently omit or mislabel the browser MIME value.
- `DOCUMENT_INGEST_SECRET` is stored as a secret-scoped production Netlify variable and will become available to the deployed runtime on the next authorized deploy.
- Confirm the existing Resend receiving domain/webhook remains active after deployment. Workspace receipt aliases are already provisioned and new workspaces receive one automatically.
- Perform a real photographed-receipt, multi-page digital statement, fully scanned statement, and mixed text/scanned statement certification after the next authorized deploy.
- Approved expenses already flow through `operations_expenses` into Ferocity's existing expense/tax accounting CSV. A provider-specific direct accounting sync can be added when a provider is selected without changing the document engine.

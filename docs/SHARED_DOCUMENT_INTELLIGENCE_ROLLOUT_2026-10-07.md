# Shared document intelligence rollout

Status date: October 7, 2026
Owner: Ferocity platform
Rule: this is an active near-term delivery plan, not an indefinite idea list.

## Product contract

Ferocity has one source-preserving document intelligence layer. Receipts, statements, leases, contracts, forms, work orders, estimates, invoices, inspection records, provider attachments, and future product documents use the same foundations:

1. Preserve the original private file, source product/workspace/document identity, MIME type, byte count, and SHA-256.
2. Analyze every supported page and report attempted, readable, failed, and omitted pages.
3. Normalize results into a purpose-specific adapter; do not force lease data into expense fields.
4. Run deterministic checks and a genuinely distinct reviewer model for important or critical work.
5. Show disagreement and missing coverage. Never silently average models or call unavailable review “passed.”
6. Keep extracted terms and field locations advisory until an authorized human or policy confirms them.
7. Return a durable result reference and a direct review destination to the originating product.
8. Never let document analysis itself send, sign, publish, spend, post money, or make a legal decision.
9. Keep the originating product authoritative. Ferocity intelligence is an overlay and adapter—not permission to duplicate or redesign the product's mature schema, ledger, payment flow, identity model, or signing state.

For Homes4Rent, the existing lease feature is the product being improved. Ferocity reads the preserved H4R document and business context, returns analysis and advisory field candidates, and lets H4R apply confirmed candidates through its own lease workflow. H4R remains authoritative for the lease, tenant, property/unit, rent and payment accounting, notices, signatures, and completed documents.

This document covers the document-intelligence slice only. It is one implementation of the broader companion-product rule: Ferocity's full operating brain—shared context, memory, reasoning, goals, planning, workflows, permissions, approvals, integrations, exceptions, measurement, and learning—should improve H4R and every connected product through their authoritative adapters.

## Current implementation milestone — source complete before release

- [x] Expense PDF extraction uses the reusable PDF page reader/renderer.
- [x] Lease terms, clauses, normalized field coordinates, page coverage, deterministic checks, and independent review use the shared Ferocity engine.
- [x] Ferocity has a signed, replay-protected, idempotent H4R lease-analysis endpoint with a strict private-storage origin allowlist, checksum verification, 15 MB bound, and no URL persistence.
- [x] Ferocity extends the existing document tables rather than creating a separate OCR platform. Migration `239_shared_lease_document_intelligence.sql` keeps analyses and untrusted field suggestions distinct from approved work.
- [x] H4R has an additive analysis/suggestion schema, an authenticated Edge Function adapter, and explicit confirm/reject conversion into its existing `lease_fields` table.
- [x] H4R's document vault offers Analyze lease / Review fields and never auto-sends or auto-signs.
- [ ] Apply both reviewed migrations, configure the two server-only endpoints/origins, deploy both runtimes, and complete real-PDF certification. These are release actions, not source gaps.

## Near-term delivery gates

These dates are target gates. A gate moves only for an evidenced blocker and must be re-dated in this file; it must not be silently moved to “later.”

### Gate 1 — H4R lease review certification by October 14, 2026

- Apply Ferocity migration 239 and H4R migration `202610071430_ferocity_lease_document_intelligence.sql` after exact target review.
- Configure `H4R_DOCUMENT_ORIGIN`, `FEROCITY_LEASE_ANALYSIS_URL`, and the already shared bridge secret in server-only environments.
- Certify one digital lease, one scanned lease, one mixed lease, one incorrect H4R-vs-PDF rent/date mismatch, and one over-limit/partial-page failure.
- Confirm direct navigation: uploaded document -> analysis -> terms/coverage/disagreement -> field decisions -> existing lease field editor.
- Confirm repeated requests reuse the same document/analysis and do not duplicate confirmed fields.
- Keep actual delivery and legally binding e-sign disabled until the signing ceremony, consent, identity, audit, completed-PDF sealing, and void/decline paths pass their own certification.

### Gate 2 — native Ferocity contracts/forms by October 21, 2026

- Add adapters for estimates, work orders, onboarding forms, vendor documents, and customer contracts using the same analysis tables and field-suggestion states.
- Add conventional review pages and chat deep links so “done” work opens at the result, not at a generic dashboard.
- Add purpose-specific deterministic checks and reviewer prompts; do not reuse financial comparisons for legal/operational forms.
- Certify PDF download/print, original-vs-generated provenance, version history, and approval audit evidence.

### Gate 3 — all connected-product and provider document paths by October 31, 2026

Inventory every connected integration against the contract below. Each row must be marked `not_applicable`, `read_ready`, `review_ready`, or `write_certified`; absence is not success.

| Consumer/integration family | Required adapter outcome |
| --- | --- |
| Homes4Rent | Leases/addenda, notices, inspections, tenant documents, and owner expense evidence preserve H4R authority and return to the exact H4R record. |
| Ferocity CRM / sales / jobs | Estimates, proposals, work orders, intake forms, photos, warranties, and completion records link to customer/job/project and open at the reviewed result. |
| Ferocity Money / POS / purchasing | Receipts, statements, invoices, purchase orders, supplier documents, deposits, and tax packets retain existing review/posting controls. |
| MarketplacePro and suppliers | Vendor quotes, product sheets, purchase evidence, insurance/certification files, and supplier attachments remain source-linked and approval-gated. |
| Service platforms | Jobber and later service-platform attachments import with provider account, external record ID, checksum, permissions, and a safe return/deep link. |
| Communications | Email, messaging, and Ferocity Connect attachments enter the same intake contract; messages are never sent merely because an attachment was analyzed. |
| Storage/productivity providers | Google Drive, OneDrive/SharePoint, Dropbox, Box, Sheets/Excel exports, and supported structured files retain provider identity/version and do not become anonymous copies. |
| Accounting/payment providers | QuickBooks/Xero/payment-provider evidence maps to canonical transactions only after duplicate, transfer, direction, and human-review rules pass. |
| Growth/advertising providers | Creative briefs, invoices, exports, and policy evidence may be analyzed; analysis never publishes ads or commits spend. BYO advertiser accounts remain provider-authoritative. |
| External AI providers | OpenAI, Anthropic, Gemini, xAI, or specialized reviewers operate through the same redacted context, usage accounting, permissions, and audit contract. No provider receives private source files unless its configured policy allows it. |

Gate 3 acceptance requires an automated registry check that fails when a document-capable connected integration lacks a declared adapter state, review destination, and source-evidence policy.

## E-signing boundary and next build

OCR/AI improves uploading, term extraction, mismatch detection, and field placement. It does not by itself make e-signing production-ready. The next signing milestone must extend the existing H4R `leases`, `lease_signers`, `lease_fields`, `lease_documents`, and `lease_signature_events` tables and certify:

- signer-specific, expiring access; consent and intent; authentication appropriate to risk;
- exact document-version hash shown to each signer;
- ordered signing, initials/signatures, decline, void, resend, expiration, and owner correction paths;
- immutable event evidence (time, signer, document hash, request metadata) and a sealed completed PDF;
- downloadable/printable originals and completed copies with unambiguous property/unit/lease labels;
- no AI placement or extracted term treated as accepted until a person confirms it.

Target: implementation begins immediately after Gate 1 evidence, with source certification targeted for October 28, 2026. Production release remains separately authorized.

## Handoff rule

Every session touching OCR, imports, provider attachments, document generation, or signing must update this file when it changes an adapter's truth. If work is incomplete, record the exact missing gate, owner/external blocker, and next executable step. “Future,” “later,” and “eventually” without a dated gate are not valid statuses.

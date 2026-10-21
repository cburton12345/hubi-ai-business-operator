# Ferocity next 50 operational-integrity checks

Date: October 17, 2026
Release state: local/source verification only; not deployed; migrations 250–261 remain in the pending release batch.

Current result: 47 `LOCAL PASS`, one `ACTIVE`, one `PROVIDER`, and one `RELEASE`. After the inventory-cost closure, the complete local release gate passes with 284 test files / 1,170 tests, seven marketplace-worker tests, TypeScript, full ESLint, an optimized 124-page production build, 44 provider-truth records, 22 high-risk capability contracts, 312 route checks, 48 architecture assertions, rollback validation of migrations 250–261, and document-runtime verification across 143 server traces.

`LOCAL PASS` means the invariant is implemented and covered locally. It does not mean production was exercised. `ACTIVE` means Ferocity now enforces part of the outcome but material coverage remains. `RELEASE` and `PROVIDER` require controlled external evidence.

| # | Status | Operational integrity check |
|---:|---|---|
| 1 | LOCAL PASS | Provider cumulative refunds record only the previously unrecorded delta. |
| 2 | LOCAL PASS | Manual refunds require one exact payment identity. |
| 3 | LOCAL PASS | Provider refunds require an exact invoice/provider/payment binding. |
| 4 | LOCAL PASS | Conflicting Stripe metadata and authoritative payment bindings fail closed. |
| 5 | LOCAL PASS | A refund cannot exceed the remaining amount on its payment. |
| 6 | LOCAL PASS | Refund retries are idempotent across provider, billing, and POS paths. |
| 7 | LOCAL PASS | One POS return can reconcile across multiple payments on the same invoice. |
| 8 | LOCAL PASS | A multi-payment refund fails before writing when total refundable cash is insufficient. |
| 9 | LOCAL PASS | Refunds correct invoice paid balance and payment status atomically. |
| 10 | LOCAL PASS | Refunds reverse Ferocity Earn through the canonical adjustment function. |
| 11 | LOCAL PASS | Write-offs are bounded to the actual collectible invoice balance. |
| 12 | LOCAL PASS | Full write-offs stop pending invoice follow-ups and outbound collection actions. |
| 13 | LOCAL PASS | Stripe disputes persist against the authoritative payment and invoice. |
| 14 | LOCAL PASS | Active/lost disputes suppress collection scans, requests, and dashboards. |
| 15 | LOCAL PASS | The outbound sender rechecks disputes immediately before delivery. |
| 16 | LOCAL PASS | Revenue consumers use payment amount less successful refunds. |
| 17 | LOCAL PASS | Job cost is proportioned across split payments instead of duplicated per payment. |
| 18 | LOCAL PASS | Duplicate return lines are aggregated before quantity enforcement. |
| 19 | LOCAL PASS | POS cannot return more units than remain sold. |
| 20 | LOCAL PASS | Restocked returns preserve the captured sale-time inventory cost. |
| 21 | LOCAL PASS | Unpaid POS returns create a bounded invoice credit without fabricating a refund. |
| 22 | LOCAL PASS | Paid POS returns use the canonical multi-payment refund allocator. |
| 23 | LOCAL PASS | POS stock is row-locked and cannot be oversold by a completed sale. |
| 24 | LOCAL PASS | Manual stock adjustments use a unique idempotency key and cannot double-apply on resubmit. |
| 25 | LOCAL PASS | Inventory-to-job display joins are tenant-bound. |
| 26 | LOCAL PASS | Purchase receiving requires an active exact same-workspace inventory match. |
| 27 | LOCAL PASS | Purchase receipt destinations must be active locations in the same workspace. |
| 28 | LOCAL PASS | Purchase receiving cannot exceed the ordered remainder. |
| 29 | LOCAL PASS | Receipt stock movements preserve the purchase-order unit cost. |
| 30 | LOCAL PASS | Re-entering a bill number cannot rewrite approved/exported/paid accounting history. |
| 31 | LOCAL PASS | Manual vendor-bill status changes follow bounded transitions and cannot claim exported/paid. |
| 32 | LOCAL PASS | Purchasing no longer creates a QuickBooks queue when no certified worker exists. |
| 33 | LOCAL PASS | Accounting invoice CSV excludes drafts and voids. |
| 34 | LOCAL PASS | Vendor-bill CSV includes only approved/exported/paid records. |
| 35 | PROVIDER | Real QuickBooks OAuth, mapping, provider writes, replay, and reconciliation are not implemented; reviewed CSV remains the honest path. |
| 36 | LOCAL PASS | Visit completion rechecks requirements inside one database transaction. |
| 37 | LOCAL PASS | Required/rejected field forms block completion. |
| 38 | LOCAL PASS | Configured customer-signature requirements block completion until evidence exists. |
| 39 | LOCAL PASS | Visit, work order, job, readiness evidence, and operating event complete atomically. |
| 40 | ACTIVE | Configurable completion forms can require notes/photos, but full live time/material/offline evidence acceptance remains open. |
| 41 | LOCAL PASS | New customer portal bearer links are stored as SHA-256 hashes, not readable tokens. |
| 42 | LOCAL PASS | Migration 258 backfills hashes for existing links without a rollback-breaking plaintext cutover. |
| 43 | LOCAL PASS | Portal link rotation invalidates the prior hash and displays the new secret only once. |
| 44 | LOCAL PASS | Disabled or expired portal access fails closed. |
| 45 | LOCAL PASS | Portal requests and messages are separately rate-limited using the token hash. |
| 46 | LOCAL PASS | Portal request/message retries are idempotent and do not duplicate operating events. |
| 47 | LOCAL PASS | A database failure cannot redirect to a false portal-success message. |
| 48 | LOCAL PASS | The customer portal excludes draft invoices. |
| 49 | LOCAL PASS | Paid/written-off/disputed invoices cannot expose an inappropriate payment link. |
| 50 | RELEASE | Live portal rotation, old-link continuity, revocation, role isolation, mobile behavior, and real payment-link acceptance still require controlled production certification. |

## What remains after these 50 checks

- Apply and certify migrations 250–261 in the deliberate release procedure; migration 258 specifically needs old-link continuity and rotated-link invalidation proof, migration 259 needs a controlled signed change-order acceptance, and migrations 260–261 need both inventory postflights plus browser acceptance.
- Certify the locally completed change-order lifecycle in a real browser/customer session, including accepted-link gating, approval/rejection, schedule propagation, forecast-cost visibility, draft-invoice amendment, and the issued-invoice reminder path.
- Certify the locally completed opening-stock, purchase-receipt, POS, transfer, reservation, consumption, release, count, supplier-return/vendor-credit, and unequal job/property split workflows in a controlled migration-backed browser session.
- Implement a real QuickBooks provider worker only after OAuth, customer/company mapping, sandbox writes, conflict ownership, replay, and accounting approval rules pass. Until then, CSV is the supported accounting path.
- Certify schedule changes, worker reassignment/conflicts, customer confirmation, provider calendar reconciliation, offline field mutations, and full field evidence on released code.
- Certify the complete customer portal lifecycle: estimate acceptance/signature, appointment changes, payment, documents, membership benefits, review/referral, token rotation, and recovery.
- Complete the broader open ledger: real document packets, email/text/Connect, Retell handset proof, provider OAuth recovery, MCP handshake, tenant-isolation adversarial tests, unified health/canaries, backup/restore, accessibility, and post-release observation.

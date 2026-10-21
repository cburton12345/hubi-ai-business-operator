# Companion-product operating brain

Status: Ferocity snapshot schema applied; H4R runtime pending, October 7, 2026

## Canonical rule

Ferocity's entire operating brain may improve a connected first-party, companion, or provider product: shared context, memory, reasoning, goals, planning, AI workforce coordination, permissions, approvals, exception handling, measurement, and learning.

The connected product remains authoritative for its domain records and workflows. Ferocity does not gain write authority merely because it can read context. It executes only a declared action through the product's existing idempotent, audited, approval-safe adapter.

## Runtime contract

`src/lib/integrations/companion-product-contract.ts` declares, per product:

- authoritative domains/resources;
- minimized context modes;
- allowed read, preparation, execution, or authoritative-system-only actions;
- risk, idempotency, and approval requirements;
- direct actions Ferocity must never perform.

`companion_product_context_snapshots` stores immutable, minimized aggregate snapshots. It is context and change evidence—not a shadow system of record. Record-level exceptions use the existing owner-event and persistent-goal pathways.

## Homes4Rent adapter

H4R remains authoritative for properties, units, tenants, applications, leases, rent/payment ledgers, collections, notices, documents, communications, provider state, signatures, and completed legal records.

The read-only H4R context adapter exposes aggregate counts and totals only. It explicitly excludes tenant PII, payment credentials, ledger rows, document contents, and signature evidence. Detailed owner-relevant exceptions continue through the existing H4R owner-event bridge.

Ferocity uses the aggregate context to:

- inform Ask Ferocity and AI command understanding;
- show the authoritative companion product in Business Info;
- detect material collection, urgent-owner, and provider-health changes;
- create or resolve stable workspace-domain operating goals;
- keep working through existing H4R adapters without copying H4R records.

Protected mutations remain prohibited: direct ledger balance edits, payment posting/reversal, rent/late-fee calculation changes, marking leases signed, changing signature evidence, screening/legal determinations, tenant deletion, identity replacement, and provider credential writes.

## Source components

Ferocity:

- `src/lib/integrations/companion-product-contract.ts`
- `src/lib/integrations/h4r/brain-context.ts`
- `src/lib/integrations/h4r/goal-observation.ts`
- `src/lib/automation/run-business-automation.ts`
- `src/lib/business-brain/get-business-brain.ts`
- `src/app/app/ai-workforce/actions.ts`
- migration `240_companion_product_context_snapshots.sql`

Homes4Rent:

- migration `202610071600_ferocity_brain_context_view.sql`
- Edge Function `ferocity-brain-context`
- existing `ferocity-owner-alert-bridge` and `ferocity-autonomous-operator`

## Release/configuration boundary

Ferocity migration 240 was applied to production on October 7, 2026 after the full local release gate passed. RLS and sensitive-grant verification passed afterward. No Ferocity frontend was deployed. H4R runtime activation still requires:

1. Restore legitimate secure CLI/dashboard access to H4R Supabase project `dsuupbnnbgtiunexozgn`. The current CLI session is unauthorized, the browser identity has no project access, and no usable secure H4R credential is available in the active process. A previously used Supabase personal access token appeared in recorded task command output and must be rotated rather than reused.
2. Review/apply the additive H4R aggregate-view migration.
3. Deploy the H4R `ferocity-brain-context` function.
4. Configure Ferocity `H4R_CONTEXT_URL` and the existing shared HMAC secret; no browser receives them.
5. Run read-only certification against a mapped test workspace and compare every aggregate with authoritative H4R views.
6. Prove unchanged snapshots deduplicate, state changes create new evidence, cleared states resolve the same durable goal, invalid/mismatched context is rejected, and no protected H4R table is written.
7. Only then include the adapter in a separately authorized Ferocity/H4R release.

## Adoption rule for every connected product

Every future adapter must declare the same authority, context, action, idempotency, approval, evidence, and forbidden-mutation fields before its data enters Ferocity's brain. Reusing Ferocity's intelligence never justifies duplicating or rewriting the product's mature domain system.

This is scheduled work, not an indefinite backlog:

- By October 14, 2026: certify the H4R read-only context path and protected-mutation checks in a mapped non-production workspace.
- By October 21, 2026: inventory every connected first-party/provider product against the companion-product contract and record missing context, actions, approvals, idempotency, and evidence.
- By October 31, 2026: require a declared contract for every integration allowed to contribute context or receive actions; integrations that cannot meet the contract remain read-only or disabled.

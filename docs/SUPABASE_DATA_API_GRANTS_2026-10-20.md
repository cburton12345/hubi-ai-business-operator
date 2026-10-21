# Supabase public-schema Data API grants

Last verified: October 20, 2026

## Production result

- Ferocity migrations 250–266 were applied to the canonical production database on October 20, 2026.
- Independent RLS verification found that the policy-derived baseline in migration 266 had restored direct client mutation grants on historically server-only tables. No frontend artifact using the pending schema had been deployed.
- Additive migration 267 restored every historical server-only boundary, including credential, session, webhook, platform-capacity, H4R bridge, conversation-memory, and internal-event tables. The committed migration 266 was not rewritten.
- RLS verification and every available foundation, revenue-ledger, customer-money, portal-security, change-order, inventory-location, and inventory-cost postflight pass. The production migration ledger has zero pending files through 267.

Supabase begins requiring explicit Data API grants for public-schema tables created on or after October 30, 2026. Existing production tables retain their grants, but new migrations, preview branches, new projects, and local database resets can otherwise produce `permission denied` failures. RLS and table grants are separate controls.

Official notice: <https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically>

## Ferocity

- Migrations 250, 251, 252, 255, 256, 260, 261, and 265 revoke defaults and explicitly grant only the required Data API roles.
- Server-only tables grant table access only to `service_role`.
- Tenant/operator tables grant CRUD to `authenticated` and `service_role`; RLS remains authoritative.
- Migration 266 rebuilds the ordinary historical access baseline for fresh projects, preview branches, and resets. Migration 267 then reapplies every historical server-only exception; both are required and ordered parts of a fresh/reset database.
- `scripts/validate-public-data-api-grants.mjs` blocks future migration 250+ tables that omit an explicit grant or revocation. It runs in `predeploy:local` before rollback migration validation.
- Production has explicit Data API grants through migration 267, with server-only boundaries independently reverified.

## Other products inspected

| Product | Database path | Local repair |
| --- | --- | --- |
| MarketplacePro | Supabase/PostgREST | Explicit least-privilege grants and revocations added for eight labor tables; prebuild guard added. |
| Alive | Supabase/PostgREST | Explicit revocations and authenticated/service-role grants added for emergency contacts, app configuration, wearable connections, and OAuth state. |
| Diamond Homes | Supabase/PostgREST | Explicit table grants added; anonymous signing remains RPC-only; default `PUBLIC` execution on security-definer signing RPCs is revoked. |
| Owner slashboard | Supabase/PostgREST | Explicit admin/service grants added for owner operation events; helper-function execution is no longer implicitly public; prebuild guard added. |
| Homes4Rent | Separate authoritative workspace | Owner sent the provider notice to the H4R chat. No competing edit was made from Ferocity. That workspace must verify its canonical migrations independently. |
| 4bid | Prisma/direct PostgreSQL | No Supabase Data API dependency was found in the canonical workspace, so this specific change does not apply. |

Repository-wide discovery under `C:\Users\schem\Documents\Codex` found no other canonical SQL source creating `public` tables outside Ferocity, MarketplacePro, Alive, Diamond Homes, the owner slashboard, and H4R-generated output folders.

## Release boundary

These are source repairs only. No migration, database reset, preview-branch creation, environment change, DNS change, or frontend deployment was performed. Each product must run its normal migration and release process in its own authoritative project after review.

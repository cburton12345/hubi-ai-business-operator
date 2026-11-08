# MarketplacePro owner-pilot inbound delivery v1

Status: local implementation checkpoint only. Disabled by default. Migration 269 must be reviewed and applied through the normal release process before this receiver can operate. This document does not authorize deployment, credential creation, a provider write, or customer rollout.

## Boundary

MarketplacePro remains authoritative for public marketplace, matcher, worker-profile, and sourcing records. Ferocity accepts only explicitly mapped inbound activity for an owner-pilot connection. A MarketplacePro matcher profile, labor-pool row, suggestion, or match is evidence, not an operational Ferocity worker or assignment. Promotion into the operations workforce requires a later explicit, consent-aware, audited workflow.

The receiver does not trust a tenant ID in the payload. It resolves the tenant and brand through exactly one server-managed `marketplacepro_owner_pilot_enrollments` row joined to its connection and a brand owned by the same tenant. Zero and multiple matches return the same pre-authentication failure. There is no newest-tenant fallback. Migration 269 enforces at most one enrolled MarketplacePro account per tenant for this pilot and adds a composite `(brand_id, tenant_id)` foreign key. Migration application fails explicitly if an existing connection has a cross-tenant brand; it never remaps or deletes that row.

## Required connection configuration

The selected connection must have:

- `profile_mode = 'ferocity_connected'`
- `connection_status = 'connected'`
- `sync_status = 'ready'`
- a non-null `brand_id`
- one server-managed `marketplacepro_owner_pilot_enrollments` row with `enabled = true`
- enrollment `contract_version = '2026-10-22.v1'`
- enrollment `credential_label` naming one configured `tenant_provider_credentials` row
- a unique enrolled source account and tenant; a customer-writable setting cannot enable the pilot

The credential row must use `provider_key = 'marketplacepro'`, `credential_kind = 'webhook_secret'`, `status = 'configured'`, and `metadata_json.connectionId` equal to the selected connection ID. Its value stays encrypted in the existing credential vault. This checkpoint does not create or configure that credential.

Paused, `needs_attention`, `not_connected`, `sync_paused`, and `revoked` connections cannot receive deliveries. The connection, enrollment, exact tenant/account/brand/profile mapping, contract version, and exact credential row/version used for authentication are locked and revalidated in the same transaction as the inbox claim and domain writes.

## Delivery contract

Each POST to the parallel `/api/integrations/marketplacepro/v1/events`, `/v1/leads`, or `/v1/status` route sends the exact UTF-8 JSON body:

```json
{
  "version": "2026-10-22.v1",
  "deliveryId": "stable-unique-delivery-id",
  "source": { "accountId": "required-marketplace-account-id" },
  "occurredAt": "2026-10-22T12:00:00.000Z",
  "kind": "event",
  "payload": {}
}
```

`kind` is respectively `event`, `lead`, or `lead_status` and is checked against the fixed route. `deliveryId`, `source.accountId`, `kind`, `occurredAt`, and payload remain unchanged across retries. `occurredAt` is bounded separately from authentication time (up to 90 days old and no more than five minutes in the future). The sender refreshes only the authentication timestamp/signature and sends:

- `x-marketplacepro-timestamp`: current Unix time in seconds
- `x-marketplacepro-signature`: `v1=` followed by lowercase HMAC-SHA256 hex

The HMAC input is five newline-separated fields:

```text
2026-10-22.v1
<timestamp>
<deliveryId>
<sourceAccountId>
<sha256-hex-of-exact-raw-body>
```

Signatures older or newer than five minutes are rejected. A v1 route never falls back to the legacy token after an invalid HMAC. Bodies are streamed into a 128 KiB maximum before parsing; strings, records, nesting, and stored metadata are separately bounded. Both legacy and v1 routes use the existing public-request limiter at 120 attempts per five minutes per fingerprint.

The existing non-v1 URLs remain a distinct legacy compatibility path for the current sender. They continue accepting the rotating global shared token but now require `marketplaceAccountId`, exactly one matching connection, and tenant-scoped status lookup. They fail closed for paused, revoked, or unready mappings. This compatibility path has no stable delivery ID and is not certified as duplicate-safe; it is not equivalent to v1.

## Idempotency and retries

Migration 269 adds `marketplacepro_delivery_inbox`, uniquely keyed by `(connection_id, delivery_id)`. The inbox claim, domain writes, and success marker run in one PostgreSQL transaction. A savepoint rolls back partial domain writes while retaining a failed attempt record. Retrying the same delivery ID and same body can claim the failed row; changing the body under the same ID is a conflict. Concurrent duplicates serialize on the unique key and do not create duplicate domain work.

Terminal success responses include matching top-level `ok`, `code` (`processed` or `replayed`), `contractVersion`, `deliveryId`, `kind`, `sourceAccountId`, and `payloadDigest`. A `202 in_progress` response returns the same correlation tuple but is non-terminal and must be retried. Event delivery also upserts a stable `owner_command_events` record in the transaction. The existing business-automation pass can later scan pending owner events and record goal observations idempotently, but that scan requires a separate eligible `owner_platform_connections` row. Provisioning that row is not part of this checkpoint and may still be planned; the receiver does not claim the follow-on runs immediately or automatically.

## Coordinated MarketplacePro sender changes

The current MarketplacePro Netlify helper sends a raw shared token and an unversioned generic payload. It is not compatible with this v1 receiver, and its generic example does not satisfy the bounded event, lead, or status payload schema. Before any pilot, MarketplacePro must select the correct domain contract, generate a stable delivery ID, include immutable `occurredAt`, wrap the payload in the v1 envelope, sign the exact body with the connection-bound secret, preserve the delivery ID/body on retry, refresh only the header timestamp/signature, require a terminal receipt, and stop dual-sending the same activity through both paths.

No live integration should be claimed until both repositories are updated, migration 269 is reviewed/applied, an owner connection and vaulted credential are explicitly configured, and a non-production end-to-end certification passes.

There is intentionally no customer-facing or public enrollment endpoint. A trusted owner-only provisioning workflow for `marketplacepro_owner_pilot_enrollments` is not implemented and is a blocking prerequisite. Legacy `needs_attention` behavior also remains uncertified; both legacy and v1 currently require `connected` plus `ready`, and that gate must not be relaxed without live-state evidence.

## Later shared-file decision

`src/lib/env.ts` and `.env.example` remain unchanged because they are shared-file boundaries for this checkpoint. The global secret is now described only as legacy compatibility; it is not v1 readiness evidence. A later coordinated cleanup may remove those variables only after the old sender is retired.

## Disposable local database fixtures

After the separately owned local Supabase environment is ready and migration 269 has been applied there, run the SQL/RLS fixture with `psql` against that disposable local database:

```text
psql "$FEROCITY_LOCAL_TEST_DATABASE_URL" -f supabase/marketplacepro_delivery_inbox_fixture.sql
```

Then run the two-session unique-claim concurrency fixture:

```text
FEROCITY_LOCAL_TEST_DATABASE_URL="$FEROCITY_LOCAL_TEST_DATABASE_URL" node_modules/tsx/dist/cli.mjs scripts/test-marketplacepro-delivery-inbox-local.ts
```

Both fixtures use fixed synthetic UUIDs. The SQL fixture verifies server-only RLS/grants, two-tenant delivery isolation, same-tenant brand ownership, composite identity constraints, and the one-enrollment-per-tenant rule inside a rollback. The Node fixture uses the real SQL store to exercise concurrent claims, brand/revocation/credential races, savepoint rollback, and retry, then cleans up its exact synthetic tenant. The runner does not load `.env` files and refuses every database hostname except `localhost`, `127.0.0.1`, or loopback IPv6. It does not apply migrations or start Docker/Supabase.

The companion PGlite test applies the actual migration to an in-memory PostgreSQL-compatible schema and proves the brand constraint, migration preflight failure, one-account rule, RLS, and grants. That synthetic schema test has run successfully. The real two-session PostgreSQL concurrency fixture remains unexecuted until the separately owned local environment supplies `FEROCITY_LOCAL_TEST_DATABASE_URL`.

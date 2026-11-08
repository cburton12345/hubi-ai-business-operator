import pg from "pg";
import type {
  MarketplaceProDeliveryConnection,
  MarketplaceProDeliveryEnvelope,
} from "../src/lib/integrations/marketplacepro-delivery";

const connectionString = process.env.FEROCITY_LOCAL_TEST_DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("FEROCITY_LOCAL_TEST_DATABASE_URL is required; this script never loads repository env files.");
}

const parsed = new URL(connectionString);
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!localHosts.has(parsed.hostname)) {
  throw new Error("Refusing to run MarketplacePro inbox tests against a non-local database host.");
}

// The production store reads DATABASE_URL through the normal database adapter.
// Bind it only after the loopback-host guard and before dynamically importing it.
process.env.DATABASE_URL = connectionString;
process.env.DATABASE_POOL_MAX = "3";

const { executeMarketplaceProDeliveryOnce } = await import(
  "../src/lib/integrations/marketplacepro-delivery-store"
);

const fixture = {
  tenantId: "26900000-0000-4000-8000-000000000111",
  brandId: "26900000-0000-4000-8000-000000000121",
  connectionId: "26900000-0000-4000-8000-000000000131",
  credentialId: "26900000-0000-4000-8000-000000000141",
  credentialUpdatedAt: "2026-10-22T11:00:00.000Z",
};

const connection: MarketplaceProDeliveryConnection = {
  id: fixture.connectionId,
  tenantId: fixture.tenantId,
  brandId: fixture.brandId,
  sourceAccountId: "fixture-concurrency-account",
  profileMode: "ferocity_connected",
  connectionStatus: "connected",
  syncStatus: "ready",
  pilotEnabled: true,
  contractVersion: "2026-10-22.v1",
  credentialLabel: "fixture-signing-secret",
};

function envelope(deliveryId: string): MarketplaceProDeliveryEnvelope {
  return {
    version: "2026-10-22.v1",
    deliveryId,
    source: { accountId: connection.sourceAccountId },
    occurredAt: "2026-10-22T12:00:00.000Z",
    kind: "event",
    payload: { marketplaceTable: "offers", marketplaceObjectId: deliveryId },
  };
}

const admin = new pg.Client({ connectionString });

async function cleanup() {
  await admin.query("delete from public.tenants where id = $1", [fixture.tenantId]).catch(() => undefined);
}

async function recordSyntheticDomainWrite(
  query: Parameters<typeof executeMarketplaceProDeliveryOnce>[1] extends (query: infer Query) => Promise<unknown> ? Query : never,
  objectId: string,
) {
  await query(
    `insert into public.marketplacepro_sync_events (
       tenant_id, brand_id, connection_id, event_type, direction,
       marketplace_object_id, sync_status, payload_json
     ) values ($1, $2, $3, 'connection_check', 'internal', $4, 'processed', '{}'::jsonb)`,
    [fixture.tenantId, fixture.brandId, fixture.connectionId, objectId],
  );
  return { objectId };
}

try {
  await admin.connect();
  const preflight = await admin.query("select to_regclass('public.marketplacepro_delivery_inbox') as inbox");
  if (!preflight.rows[0]?.inbox) throw new Error("Migration 269 is not applied in the local test database.");

  await cleanup();
  await admin.query(
    "insert into public.tenants (id, name, slug) values ($1, 'MPP Concurrency Fixture', 'mpp-concurrency-fixture')",
    [fixture.tenantId],
  );
  await admin.query(
    "insert into public.brands (id, tenant_id, name, slug, business_model) values ($1, $2, 'MPP Concurrency Brand', 'mpp-concurrency-brand', 'marketplace')",
    [fixture.brandId, fixture.tenantId],
  );
  await admin.query(
    `insert into public.marketplacepro_connections (
       id, tenant_id, brand_id, marketplace_account_id, profile_mode, connection_status, sync_status
     ) values ($1, $2, $3, $4, 'ferocity_connected', 'connected', 'ready')`,
    [fixture.connectionId, fixture.tenantId, fixture.brandId, connection.sourceAccountId],
  );
  await admin.query(
    `insert into public.tenant_provider_credentials (
       id, tenant_id, provider_key, credential_label, credential_kind, status,
       encrypted_secret, encryption_iv, encryption_tag, metadata_json, updated_at
     ) values ($1, $2, 'marketplacepro', $3, 'webhook_secret', 'configured',
       'fixture-ciphertext', 'fixture-iv', 'fixture-tag', jsonb_build_object('connectionId', $4), $5::timestamptz)`,
    [
      fixture.credentialId,
      fixture.tenantId,
      connection.credentialLabel,
      fixture.connectionId,
      fixture.credentialUpdatedAt,
    ],
  );
  await admin.query(
    `insert into public.marketplacepro_owner_pilot_enrollments (
       connection_id, tenant_id, source_account_id, enabled, contract_version,
       credential_label, configured_at
     ) values ($1, $2, $3, true, $4, $5, now())`,
    [
      fixture.connectionId,
      fixture.tenantId,
      connection.sourceAccountId,
      connection.contractVersion,
      connection.credentialLabel,
    ],
  );

  const revokedEnvelope = envelope("fixture-revoked-race-delivery");
  const revokedInput = {
    connection,
    envelope: revokedEnvelope,
    payloadDigest: "c".repeat(64),
    credentialLabel: connection.credentialLabel,
    credentialId: fixture.credentialId,
    credentialUpdatedAt: fixture.credentialUpdatedAt,
  };
  await admin.query(
    "update public.marketplacepro_connections set connection_status = 'revoked' where id = $1",
    [fixture.connectionId],
  );
  const revokedRace = await executeMarketplaceProDeliveryOnce(
    revokedInput,
    (query) => recordSyntheticDomainWrite(query, revokedEnvelope.deliveryId),
  );
  if (revokedRace.state !== "authorization_changed") {
    throw new Error("Revoked connection was not rejected during transactional revalidation.");
  }
  await admin.query(
    "update public.marketplacepro_connections set connection_status = 'connected' where id = $1",
    [fixture.connectionId],
  );

  await admin.query(
    "update public.tenant_provider_credentials set status = 'revoked' where id = $1",
    [fixture.credentialId],
  );
  const credentialRace = await executeMarketplaceProDeliveryOnce(
    { ...revokedInput, envelope: envelope("fixture-credential-race-delivery") },
    (query) => recordSyntheticDomainWrite(query, "fixture-credential-race-delivery"),
  );
  if (credentialRace.state !== "authorization_changed") {
    throw new Error("Revoked signing credential was not rejected during transactional revalidation.");
  }
  await admin.query(
    "update public.tenant_provider_credentials set status = 'configured' where id = $1",
    [fixture.credentialId],
  );

  await admin.query(
    "update public.marketplacepro_connections set brand_id = null where id = $1",
    [fixture.connectionId],
  );
  const brandRace = await executeMarketplaceProDeliveryOnce(
    { ...revokedInput, envelope: envelope("fixture-brand-race-delivery") },
    (query) => recordSyntheticDomainWrite(query, "fixture-brand-race-delivery"),
  );
  if (brandRace.state !== "authorization_changed") {
    throw new Error("Changed tenant/brand mapping was not rejected during transactional revalidation.");
  }
  await admin.query(
    "update public.marketplacepro_connections set brand_id = $2 where id = $1",
    [fixture.connectionId, fixture.brandId],
  );

  const concurrentEnvelope = envelope("fixture-concurrent-delivery");
  const concurrentInput = {
    connection,
    envelope: concurrentEnvelope,
    payloadDigest: "d".repeat(64),
    credentialLabel: connection.credentialLabel,
    credentialId: fixture.credentialId,
    credentialUpdatedAt: fixture.credentialUpdatedAt,
  };
  const concurrentResults = await Promise.all([
    executeMarketplaceProDeliveryOnce(concurrentInput, (query) => recordSyntheticDomainWrite(query, concurrentEnvelope.deliveryId)),
    executeMarketplaceProDeliveryOnce(concurrentInput, (query) => recordSyntheticDomainWrite(query, concurrentEnvelope.deliveryId)),
  ]);
  const concurrentStates = concurrentResults.map((result) => result.state).sort();
  if (JSON.stringify(concurrentStates) !== JSON.stringify(["processed", "replayed"])) {
    throw new Error("Concurrent claims did not resolve to exactly one processed delivery and one replay.");
  }
  const concurrentWrites = await admin.query(
    "select count(*)::int as count from public.marketplacepro_sync_events where connection_id = $1 and marketplace_object_id = $2",
    [fixture.connectionId, concurrentEnvelope.deliveryId],
  );
  if (concurrentWrites.rows[0]?.count !== 1) throw new Error("Concurrent delivery created duplicate domain writes.");

  const retryEnvelope = envelope("fixture-partial-failure-delivery");
  const retryInput = {
    connection,
    envelope: retryEnvelope,
    payloadDigest: "e".repeat(64),
    credentialLabel: connection.credentialLabel,
    credentialId: fixture.credentialId,
    credentialUpdatedAt: fixture.credentialUpdatedAt,
  };
  const failed = await executeMarketplaceProDeliveryOnce(retryInput, async (query) => {
    await recordSyntheticDomainWrite(query, retryEnvelope.deliveryId);
    throw new Error("synthetic partial failure");
  });
  if (failed.state !== "failed") throw new Error("Partial-failure attempt was not retained as failed.");
  const writesAfterFailure = await admin.query(
    "select count(*)::int as count from public.marketplacepro_sync_events where connection_id = $1 and marketplace_object_id = $2",
    [fixture.connectionId, retryEnvelope.deliveryId],
  );
  if (writesAfterFailure.rows[0]?.count !== 0) throw new Error("Savepoint rollback retained a partial domain write.");

  const retried = await executeMarketplaceProDeliveryOnce(
    retryInput,
    (query) => recordSyntheticDomainWrite(query, retryEnvelope.deliveryId),
  );
  if (retried.state !== "processed") throw new Error("Failed delivery could not be retried with the same delivery ID.");
  const writesAfterRetry = await admin.query(
    "select count(*)::int as count from public.marketplacepro_sync_events where connection_id = $1 and marketplace_object_id = $2",
    [fixture.connectionId, retryEnvelope.deliveryId],
  );
  if (writesAfterRetry.rows[0]?.count !== 1) throw new Error("Retry did not produce exactly one domain write.");

  console.log("MarketplacePro migration-269 local concurrency and retry fixture passed.");
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown local fixture failure.";
  throw new Error(`MarketplacePro migration-269 local fixture failed: ${message}`);
} finally {
  await cleanup().catch(() => undefined);
  await admin.end().catch(() => undefined);
}

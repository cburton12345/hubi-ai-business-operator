import type { QueryResultRow } from "pg";
import { decryptSecret } from "@/lib/credentials/credential-vault";
import { queryPostgresRequired, withPostgresTransactionResult } from "@/lib/db/postgres";
import type {
  MarketplaceProDeliveryConnection,
  MarketplaceProDeliveryEnvelope,
  MarketplaceProDeliveryExecution,
} from "@/lib/integrations/marketplacepro-delivery";

export type MarketplaceProQuery = <Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
) => Promise<{ rows: Row[] } | null>;

type ConnectionRow = {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  marketplace_account_id: string;
  profile_mode: string;
  connection_status: string;
  sync_status: string;
  enabled: boolean;
  contract_version: string;
  credential_label: string;
};

type LegacyConnectionRow = Omit<ConnectionRow, "enabled" | "contract_version" | "credential_label">;

type CredentialRow = {
  id: string;
  encrypted_secret: string;
  encryption_iv: string;
  encryption_tag: string;
  updated_at: string;
};

type InboxRow = {
  id: string;
  payload_digest: string;
  processing_status: "processing" | "processed" | "failed";
  processing_started_at: string;
  result_json: Record<string, unknown> | null;
};

export async function findMarketplaceProDeliveryConnections(sourceAccountId: string) {
  const result = await queryPostgresRequired<ConnectionRow>(
    `
    select connection.id, connection.tenant_id, connection.brand_id,
           connection.marketplace_account_id, connection.profile_mode,
           connection.connection_status, connection.sync_status,
           enrollment.enabled, enrollment.contract_version, enrollment.credential_label
    from public.marketplacepro_owner_pilot_enrollments enrollment
    join public.marketplacepro_connections connection on connection.id = enrollment.connection_id
    join public.brands brand
      on brand.id = connection.brand_id and brand.tenant_id = connection.tenant_id
    where enrollment.source_account_id = $1
    order by connection.id
    limit 2
    `,
    [sourceAccountId],
    "marketplacepro-delivery-connection-resolution",
  );
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    sourceAccountId: row.marketplace_account_id,
    profileMode: row.profile_mode,
    connectionStatus: row.connection_status,
    syncStatus: row.sync_status,
    pilotEnabled: row.enabled,
    contractVersion: row.contract_version,
    credentialLabel: row.credential_label,
  })) satisfies MarketplaceProDeliveryConnection[];
}

export async function findMarketplaceProLegacyConnections(sourceAccountId: string) {
  const result = await queryPostgresRequired<LegacyConnectionRow>(
    `
    select connection.id, connection.tenant_id, connection.brand_id,
           connection.marketplace_account_id, connection.profile_mode,
           connection.connection_status, connection.sync_status
    from public.marketplacepro_connections connection
    join public.brands brand
      on brand.id = connection.brand_id and brand.tenant_id = connection.tenant_id
    where connection.marketplace_account_id = $1
    order by connection.id
    limit 2
    `,
    [sourceAccountId],
    "marketplacepro-legacy-exact-connection-resolution",
  );
  return result.rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    brandId: row.brand_id,
    sourceAccountId: row.marketplace_account_id,
    profileMode: row.profile_mode,
    connectionStatus: row.connection_status,
    syncStatus: row.sync_status,
    pilotEnabled: false,
    contractVersion: "legacy.shared-token",
    credentialLabel: "legacy-global-secret",
  })) satisfies MarketplaceProDeliveryConnection[];
}

export async function executeMarketplaceProLegacyDelivery(
  connection: MarketplaceProDeliveryConnection,
  apply: (query: MarketplaceProQuery) => Promise<Record<string, unknown>>,
) {
  const transaction = await withPostgresTransactionResult(async (client) => {
    const locked = await client.query<LegacyConnectionRow>(
      `
      select connection.id, connection.tenant_id, connection.brand_id,
             connection.marketplace_account_id, connection.profile_mode,
             connection.connection_status, connection.sync_status
      from public.marketplacepro_connections connection
      join public.brands brand
        on brand.id = connection.brand_id and brand.tenant_id = connection.tenant_id
      where connection.id = $1
      for update of connection, brand
      `,
      [connection.id],
    );
    const current = locked.rows[0];
    if (
      !current ||
      current.tenant_id !== connection.tenantId ||
      current.brand_id !== connection.brandId ||
      current.marketplace_account_id !== connection.sourceAccountId ||
      current.profile_mode !== "ferocity_connected" ||
      current.connection_status !== "connected" ||
      current.sync_status !== "ready" ||
      !current.brand_id
    ) {
      return { ok: false as const, code: "authorization_changed" };
    }
    const query: MarketplaceProQuery = async <Row extends QueryResultRow>(text: string, values: unknown[] = []) => {
      return client.query<Row>(text, values);
    };
    return { ok: true as const, result: await apply(query) };
  });
  if (!transaction.ok) return { ok: false as const, code: "delivery_failed" };
  return transaction.value;
}

export async function getMarketplaceProDeliverySigningCredential(
  connection: MarketplaceProDeliveryConnection,
  credentialLabel: string,
) {
  const result = await queryPostgresRequired<CredentialRow>(
    `
    select id, encrypted_secret, encryption_iv, encryption_tag, updated_at::text
    from public.tenant_provider_credentials
    where tenant_id = $1
      and provider_key = 'marketplacepro'
      and credential_label = $2
      and credential_kind = 'webhook_secret'
      and status = 'configured'
      and metadata_json ->> 'connectionId' = $3
      and encrypted_secret is not null
      and encryption_iv is not null
      and encryption_tag is not null
    order by updated_at desc
    limit 1
    `,
    [connection.tenantId, credentialLabel, connection.id],
    "marketplacepro-delivery-signing-credential",
  );
  const row = result.rows[0];
  if (!row) return null;
  const secret = decryptSecret({
    encryptedSecret: row.encrypted_secret,
    encryptionIv: row.encryption_iv,
    encryptionTag: row.encryption_tag,
  });
  if (!secret) return null;
  return {
    id: row.id,
    secret,
    updatedAt: row.updated_at,
  };
}

export async function executeMarketplaceProDeliveryOnce(
  input: {
    connection: MarketplaceProDeliveryConnection;
    envelope: MarketplaceProDeliveryEnvelope;
    payloadDigest: string;
    credentialLabel: string;
    credentialId: string;
    credentialUpdatedAt: string;
  },
  apply: (query: MarketplaceProQuery) => Promise<Record<string, unknown>>,
): Promise<MarketplaceProDeliveryExecution> {
  const transaction = await withPostgresTransactionResult(async (client) => {
    const lockedConnection = await client.query<ConnectionRow>(
      `
      select connection.id, connection.tenant_id, connection.brand_id,
             connection.marketplace_account_id, connection.profile_mode,
             connection.connection_status, connection.sync_status,
             enrollment.enabled, enrollment.contract_version, enrollment.credential_label
      from public.marketplacepro_owner_pilot_enrollments enrollment
      join public.marketplacepro_connections connection on connection.id = enrollment.connection_id
      join public.brands brand
        on brand.id = connection.brand_id and brand.tenant_id = connection.tenant_id
      where enrollment.connection_id = $1
      for update of enrollment, connection, brand
      `,
      [input.connection.id],
    );
    const current = lockedConnection.rows[0];
    const unchanged = Boolean(
      current &&
      current.id === input.connection.id &&
      current.tenant_id === input.connection.tenantId &&
      current.brand_id === input.connection.brandId &&
      current.marketplace_account_id === input.envelope.source.accountId &&
      current.profile_mode === "ferocity_connected" &&
      current.connection_status === "connected" &&
      current.sync_status === "ready" &&
      current.enabled &&
      current.contract_version === input.envelope.version &&
      current.credential_label === input.credentialLabel
    );
    if (!unchanged) return { state: "authorization_changed" } as const;

    const credential = await client.query<{ id: string }>(
      `
      select id
      from public.tenant_provider_credentials
      where tenant_id = $1
        and provider_key = 'marketplacepro'
        and credential_label = $2
        and credential_kind = 'webhook_secret'
        and status = 'configured'
        and metadata_json ->> 'connectionId' = $3
        and id = $4
        and updated_at = $5::timestamptz
      limit 1
      for update
      `,
      [
        input.connection.tenantId,
        input.credentialLabel,
        input.connection.id,
        input.credentialId,
        input.credentialUpdatedAt,
      ],
    );
    if (!credential.rows[0]) return { state: "authorization_changed" } as const;

    const inserted = await client.query<{ id: string }>(
      `
      insert into public.marketplacepro_delivery_inbox (
        tenant_id, connection_id, source_account_id, delivery_id, contract_version,
        delivery_kind, occurred_at, payload_digest, processing_status, attempt_count, processing_started_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, 'processing', 1, now())
      on conflict (connection_id, delivery_id) do nothing
      returning id
      `,
      [
        input.connection.tenantId,
        input.connection.id,
        input.envelope.source.accountId,
        input.envelope.deliveryId,
        input.envelope.version,
        input.envelope.kind,
        input.envelope.occurredAt,
        input.payloadDigest,
      ],
    );

    let inboxId = inserted.rows[0]?.id;
    if (!inboxId) {
      const existing = await client.query<InboxRow>(
        `
        select id, payload_digest, processing_status, processing_started_at, result_json
        from public.marketplacepro_delivery_inbox
        where connection_id = $1 and delivery_id = $2
        for update
        `,
        [input.connection.id, input.envelope.deliveryId],
      );
      const row = existing.rows[0];
      if (!row || row.payload_digest !== input.payloadDigest) return { state: "conflict" } as const;
      if (row.processing_status === "processed") {
        return { state: "replayed", result: row.result_json ?? {} } as const;
      }
      if (
        row.processing_status === "processing" &&
        Date.now() - new Date(row.processing_started_at).getTime() < 5 * 60_000
      ) {
        return { state: "in_progress" } as const;
      }
      inboxId = row.id;
      await client.query(
        `
        update public.marketplacepro_delivery_inbox
        set processing_status = 'processing', attempt_count = attempt_count + 1,
            processing_started_at = now(), processed_at = null,
            last_error_code = null, last_error_message = null, updated_at = now()
        where id = $1
        `,
        [inboxId],
      );
    }

    await client.query("savepoint marketplacepro_delivery_domain");
    const query: MarketplaceProQuery = async <Row extends QueryResultRow>(text: string, values: unknown[] = []) => {
      return client.query<Row>(text, values);
    };
    try {
      const result = await apply(query);
      await client.query(
        `
        update public.marketplacepro_delivery_inbox
        set processing_status = 'processed', processed_at = now(), result_json = $2::jsonb,
            last_error_code = null, last_error_message = null, updated_at = now()
        where id = $1
        `,
        [inboxId, JSON.stringify(result)],
      );
      return { state: "processed", result } as const;
    } catch (error) {
      await client.query("rollback to savepoint marketplacepro_delivery_domain");
      await client.query(
        `
        update public.marketplacepro_delivery_inbox
        set processing_status = 'failed', last_error_code = 'domain_apply_failed',
            last_error_message = $2, updated_at = now()
        where id = $1
        `,
        [inboxId, error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery failure."],
      );
      return { state: "failed", retryable: true } as const;
    }
  });

  if (!transaction.ok) return { state: "failed", retryable: true };
  return transaction.value;
}

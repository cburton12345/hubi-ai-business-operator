import { URL } from "node:url";
import { Client } from "pg";
import { decryptSecret, encryptSecret } from "../src/lib/credentials/credential-vault";

type Args = { apply: boolean; rotateSecret: boolean };

function parseArgs(argv: string[]): Args {
  const known = new Set(["--apply", "--plan", "--rotate-secret"]);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  if (argv.includes("--apply") && argv.includes("--plan")) {
    throw new Error("Choose either --plan or --apply.");
  }
  if (argv.includes("--rotate-secret") && !argv.includes("--apply")) {
    throw new Error("--rotate-secret requires --apply.");
  }
  return { apply: argv.includes("--apply"), rotateSecret: argv.includes("--rotate-secret") };
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function uuid(name: string) {
  const value = required(name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${name} must be a UUID.`);
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = required("DATABASE_URL");
  const ca = required("SUPABASE_CA_PEM").replace(/\\n/g, "\n");
  const tenantId = uuid("MARKETPLACEPRO_OWNER_PILOT_TENANT_ID");
  const brandId = uuid("MARKETPLACEPRO_OWNER_PILOT_BRAND_ID");
  const sourceAccountId = required("MARKETPLACEPRO_OWNER_PILOT_SOURCE_ACCOUNT_ID");
  const signingSecret = required("MARKETPLACEPRO_OWNER_PILOT_SIGNING_SECRET");
  const credentialLabel = process.env.MARKETPLACEPRO_OWNER_PILOT_CREDENTIAL_LABEL?.trim()
    || "marketplacepro-owner-pilot-v1";
  const hostname = new URL(databaseUrl).hostname;
  if (!hostname.endsWith(".supabase.com") && !hostname.endsWith(".supabase.co")) {
    throw new Error("DATABASE_URL must use an approved Supabase hostname.");
  }
  if (sourceAccountId.length > 200 || credentialLabel.length > 120) {
    throw new Error("Owner-pilot identifiers exceed database limits.");
  }
  if (signingSecret.length < 32) throw new Error("Signing secret must be at least 32 characters.");

  const encrypted = encryptSecret(signingSecret);
  if (!encrypted) throw new Error("CREDENTIAL_ENCRYPTION_KEY is missing or too short.");
  const roundTrip = decryptSecret({
    encryptedSecret: encrypted.encryptedSecret,
    encryptionIv: encrypted.encryptionIv,
    encryptionTag: encrypted.encryptionTag,
  });
  if (roundTrip !== signingSecret) throw new Error("Credential encryption round-trip failed.");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { ca, rejectUnauthorized: true, servername: hostname },
  });
  await client.connect();
  const stream = client.connection.stream as typeof client.connection.stream & {
    authorized?: boolean;
    authorizationError?: string;
  };
  if (stream.authorized !== true || stream.authorizationError) {
    throw new Error("Database TLS connection is not authorized.");
  }

  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'; set local statement_timeout = '30s'");
    if (!args.apply) await client.query("set transaction read only");
    const lockClause = args.apply ? "for update" : "";

    const identity = await client.query<{ tenant_id: string; brand_id: string; owner_user_id: string | null }>(
      `
      select tenant.id tenant_id, brand.id brand_id, tenant.owner_user_id
      from public.tenants tenant
      join public.brands brand on brand.tenant_id = tenant.id
      where tenant.id = $1 and brand.id = $2
        and tenant.status = 'active' and brand.status = 'active'
      `,
      [tenantId, brandId],
    );
    if (identity.rowCount !== 1) throw new Error("Exact active tenant/brand identity was not found.");
    const ownerUserId = identity.rows[0].owner_user_id;

    const connectionMatches = await client.query<{ id: string; tenant_id: string; brand_id: string }>(
      `
      select id, tenant_id, brand_id
      from public.marketplacepro_connections
      where marketplace_account_id = $1
      order by id
      ${lockClause}
      `,
      [sourceAccountId],
    );
    if (connectionMatches.rowCount && connectionMatches.rowCount > 1) {
      throw new Error("Multiple MarketplacePro connections match the source account.");
    }
    const existingConnection = connectionMatches.rows[0];
    if (existingConnection && (existingConnection.tenant_id !== tenantId || existingConnection.brand_id !== brandId)) {
      throw new Error("The source account is already bound to a different tenant or brand.");
    }

    const credential = await client.query<{ id: string }>(
      `
      select id
      from public.tenant_provider_credentials
      where tenant_id = $1 and provider_key = 'marketplacepro' and credential_label = $2
      ${lockClause}
      `,
      [tenantId, credentialLabel],
    );
    const enrollment = await client.query<{ connection_id: string; source_account_id: string }>(
      `
      select connection_id, source_account_id
      from public.marketplacepro_owner_pilot_enrollments
      where tenant_id = $1 or source_account_id = $2
      order by connection_id
      ${lockClause}
      `,
      [tenantId, sourceAccountId],
    );
    if (enrollment.rowCount && enrollment.rowCount > 1) {
      throw new Error("Conflicting owner-pilot enrollments already exist.");
    }

    if (!args.apply) {
      await client.query("rollback");
      console.log(JSON.stringify({
        mode: "plan",
        tlsAuthorized: true,
        identityVerified: true,
        existingConnection: Boolean(existingConnection),
        existingCredential: credential.rowCount === 1,
        existingEnrollment: enrollment.rowCount === 1,
        wouldRotateSecret: args.rotateSecret,
      }));
      return;
    }

    const connection = existingConnection
      ? await client.query<{ id: string }>(
          `
          update public.marketplacepro_connections
          set profile_mode = 'ferocity_connected', connection_status = 'connected', sync_status = 'ready',
              settings_json = settings_json || $2::jsonb, metadata_json = metadata_json || $3::jsonb,
              updated_at = now()
          where id = $1
          returning id
          `,
          [
            existingConnection.id,
            JSON.stringify({ contractVersion: "2026-10-22.v1", mode: "owner_pilot" }),
            JSON.stringify({ purpose: "contractor_network", sourceAccountId }),
          ],
        )
      : await client.query<{ id: string }>(
          `
          insert into public.marketplacepro_connections (
            tenant_id, brand_id, marketplace_account_id, profile_mode,
            connection_status, sync_status, settings_json, metadata_json
          ) values ($1, $2, $3, 'ferocity_connected', 'connected', 'ready', $4::jsonb, $5::jsonb)
          returning id
          `,
          [
            tenantId,
            brandId,
            sourceAccountId,
            JSON.stringify({ contractVersion: "2026-10-22.v1", mode: "owner_pilot" }),
            JSON.stringify({ purpose: "contractor_network", sourceAccountId }),
          ],
        );
    const connectionId = connection.rows[0].id;

    if (credential.rowCount === 0) {
      await client.query(
        `
        insert into public.tenant_provider_credentials (
          tenant_id, provider_key, credential_label, credential_kind, status,
          secret_preview, secret_fingerprint, encrypted_secret, encryption_iv, encryption_tag,
          last_verified_at, rotation_due_at, created_by_user_id, updated_by_user_id, metadata_json
        ) values (
          $1, 'marketplacepro', $2, 'webhook_secret', 'configured',
          $3, $4, $5, $6, $7, now(), now() + interval '180 days', $8, $8, $9::jsonb
        )
        `,
        [
          tenantId,
          credentialLabel,
          encrypted.secretPreview,
          encrypted.secretFingerprint,
          encrypted.encryptedSecret,
          encrypted.encryptionIv,
          encrypted.encryptionTag,
          ownerUserId,
          JSON.stringify({ connectionId, sourceAccountId, contractVersion: "2026-10-22.v1" }),
        ],
      );
    } else if (args.rotateSecret) {
      await client.query(
        `
        update public.tenant_provider_credentials
        set credential_kind = 'webhook_secret', status = 'configured',
            secret_preview = $3, secret_fingerprint = $4, encrypted_secret = $5,
            encryption_iv = $6, encryption_tag = $7, encryption_version = 'aes-256-gcm:v1',
            last_verified_at = now(), rotation_due_at = now() + interval '180 days',
            updated_by_user_id = $8,
            metadata_json = metadata_json || $9::jsonb, updated_at = now()
        where tenant_id = $1 and provider_key = 'marketplacepro' and credential_label = $2
        `,
        [
          tenantId,
          credentialLabel,
          encrypted.secretPreview,
          encrypted.secretFingerprint,
          encrypted.encryptedSecret,
          encrypted.encryptionIv,
          encrypted.encryptionTag,
          ownerUserId,
          JSON.stringify({ connectionId, sourceAccountId, contractVersion: "2026-10-22.v1" }),
        ],
      );
    }

    if (enrollment.rowCount === 1 && enrollment.rows[0].connection_id !== connectionId) {
      throw new Error("Existing enrollment points to a different connection.");
    }
    await client.query(
      `
      insert into public.marketplacepro_owner_pilot_enrollments (
        connection_id, tenant_id, source_account_id, enabled, contract_version,
        credential_label, configured_by_user_id, configured_at, metadata_json
      ) values ($1, $2, $3, true, '2026-10-22.v1', $4, $5, now(), $6::jsonb)
      on conflict (connection_id) do update set
        enabled = true, contract_version = excluded.contract_version,
        credential_label = excluded.credential_label,
        configured_by_user_id = excluded.configured_by_user_id,
        configured_at = now(), metadata_json = marketplacepro_owner_pilot_enrollments.metadata_json || excluded.metadata_json,
        updated_at = now()
      `,
      [
        connectionId,
        tenantId,
        sourceAccountId,
        credentialLabel,
        ownerUserId,
        JSON.stringify({ purpose: "contractor_network", provisionedBy: "owner-controlled-release" }),
      ],
    );

    const verified = await client.query<{ connection_count: number; credential_count: number; enrollment_count: number }>(
      `
      select
        (select count(*)::int from public.marketplacepro_connections
         where id = $1 and tenant_id = $2 and brand_id = $3 and marketplace_account_id = $4
           and profile_mode = 'ferocity_connected' and connection_status = 'connected' and sync_status = 'ready') connection_count,
        (select count(*)::int from public.tenant_provider_credentials
         where tenant_id = $2 and provider_key = 'marketplacepro' and credential_label = $5
           and credential_kind = 'webhook_secret' and status = 'configured'
           and metadata_json ->> 'connectionId' = $1::text) credential_count,
        (select count(*)::int from public.marketplacepro_owner_pilot_enrollments
         where connection_id = $1 and tenant_id = $2 and source_account_id = $4
           and enabled and contract_version = '2026-10-22.v1' and credential_label = $5) enrollment_count
      `,
      [connectionId, tenantId, brandId, sourceAccountId, credentialLabel],
    );
    const counts = verified.rows[0];
    if (counts.connection_count !== 1 || counts.credential_count !== 1 || counts.enrollment_count !== 1) {
      throw new Error("Post-provision verification failed.");
    }
    await client.query("commit");
    console.log(JSON.stringify({
      mode: "apply",
      tlsAuthorized: true,
      connectionId,
      connectionReady: true,
      encryptedCredentialConfigured: true,
      enrollmentEnabled: true,
      secretRotated: credential.rowCount === 0 || args.rotateSecret,
    }));
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }));
  process.exitCode = 1;
});

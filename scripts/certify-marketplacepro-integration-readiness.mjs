import fs from "node:fs";
import pg from "pg";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (process.env[key]) continue;
    process.env[key] = line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

loadEnv(".env.local");
loadEnv(".env");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const databaseOnly = process.argv.includes("--database-only");

function normalizedHttpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function checkLiveMarketplaceProHealth(baseUrl, secret) {
  if (databaseOnly) return { checked: false, skipped: "database_only" };
  if (!baseUrl || !secret)
    return { checked: false, skipped: "missing_certification_credentials" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${baseUrl}/.netlify/functions/network-health`,
      {
        headers: { "x-marketplace-network-secret": secret },
        redirect: "error",
        signal: controller.signal,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return {
        checked: true,
        ok: false,
        status: response.status,
        error: "invalid_json_response",
      };
    }
    return {
      checked: true,
      ok: response.ok && payload.ok === true,
      status: response.status,
      configured: payload.configured ?? null,
      counts: payload.counts ?? null,
      alerts: Array.isArray(payload.alerts) ? payload.alerts : [],
      failures: Array.isArray(payload.failures) ? payload.failures : [],
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      status: null,
      error:
        error instanceof Error && error.name === "AbortError"
          ? "timeout"
          : "request_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const requiredMigrations = [
  "269_marketplacepro_delivery_inbox",
  "282_marketplacepro_contractor_network_events",
  "283_marketplacepro_workforce_timeline_family",
  "284_marketplacepro_contractor_object_links",
];
const requiredTables = [
  "marketplacepro_connections",
  "marketplacepro_owner_pilot_enrollments",
  "marketplacepro_delivery_inbox",
  "marketplacepro_sync_events",
  "marketplacepro_object_links",
  "marketplacepro_lead_links",
];

const client = new pg.Client({
  application_name: "ferocity_marketplacepro_readiness",
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? undefined
    : { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("begin read only");
  await client.query("set local statement_timeout='30s'");
  let queryQueue = Promise.resolve();
  const queuedQuery = (...args) => {
    const next = queryQueue.then(() => client.query(...args));
    queryQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const [
    transaction,
    migrations,
    relations,
    connectionRows,
    deliveryRows,
    syncRows,
    linkRows,
    security,
  ] = await Promise.all([
    queuedQuery("show transaction_read_only"),
    queuedQuery(
      "select version from public.schema_migrations where version=any($1::text[]) order by version",
      [requiredMigrations],
    ),
    queuedQuery(
      `select c.relname as table_name, c.relrowsecurity as rls_enabled
           from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=any($1::text[])`,
      [requiredTables],
    ),
    queuedQuery(
      `select tenant.slug as workspace_slug,
                connection.connection_status, connection.sync_status, connection.profile_mode,
                connection.last_sync_at::text,
                enrollment.enabled, enrollment.contract_version, enrollment.configured_at::text,
                (brand.tenant_id=connection.tenant_id) as brand_tenant_matches,
                count(credential.id)::int as configured_credentials
           from public.marketplacepro_connections connection
           join public.tenants tenant on tenant.id=connection.tenant_id
           left join public.brands brand on brand.id=connection.brand_id
           left join public.marketplacepro_owner_pilot_enrollments enrollment
             on enrollment.connection_id=connection.id and enrollment.tenant_id=connection.tenant_id
           left join public.tenant_provider_credentials credential
             on credential.tenant_id=connection.tenant_id
            and credential.provider_key='marketplacepro'
            and credential.credential_kind='webhook_secret'
            and credential.credential_label=enrollment.credential_label
            and credential.status='configured'
            and credential.metadata_json->>'connectionId'=connection.id::text
            and credential.encrypted_secret is not null
            and credential.encryption_iv is not null
            and credential.encryption_tag is not null
          group by tenant.slug,connection.id,enrollment.connection_id,brand.tenant_id
          order by tenant.slug`,
    ),
    queuedQuery(
      `select processing_status,count(*)::int as rows,max(updated_at)::text as latest,
                count(*) filter (
                  where processing_status='processing' and processing_started_at<now()-interval '10 minutes'
                )::int as stuck,
                count(*) filter (
                  where processing_status='failed' and updated_at>=now()-interval '24 hours'
                )::int as failed_last_24h
           from public.marketplacepro_delivery_inbox
          group by processing_status order by processing_status`,
    ),
    queuedQuery(
      `select sync_status,count(*)::int as rows,max(created_at)::text as latest
           from public.marketplacepro_sync_events
          group by sync_status order by sync_status`,
    ),
    queuedQuery(
      `select sync_status,count(*)::int as rows,max(updated_at)::text as latest
           from public.marketplacepro_object_links
          group by sync_status order by sync_status`,
    ),
    queuedQuery(
      `select
          (select count(*)::int from public.marketplacepro_connections connection
            join public.brands brand on brand.id=connection.brand_id
           where brand.tenant_id<>connection.tenant_id) as cross_tenant_brand_links,
          (select count(*)::int from information_schema.role_table_grants
           where table_schema='public'
             and table_name=any($2::text[])
             and grantee in ('anon','authenticated')
             and privilege_type in ('INSERT','UPDATE','DELETE')) as browser_mutation_grants,
          (select count(*)::int from pg_catalog.pg_constraint constraint_row
            join pg_catalog.pg_class relation on relation.oid=constraint_row.conrelid
            join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
           where namespace.nspname='public'
             and relation.relname=any($1::text[])
             and not constraint_row.convalidated) as unvalidated_constraints`,
      [
        requiredTables,
        [
          "marketplacepro_delivery_inbox",
          "marketplacepro_owner_pilot_enrollments",
        ],
      ],
    ),
  ]);

  const applied = new Set(migrations.rows.map((row) => row.version));
  const relationMap = new Map(
    relations.rows.map((row) => [row.table_name, row]),
  );
  const blockers = [];
  if (transaction.rows[0]?.transaction_read_only !== "on") {
    blockers.push("Certification transaction was not read-only.");
  }
  for (const migration of requiredMigrations) {
    if (!applied.has(migration))
      blockers.push(`Required migration is not applied: ${migration}.`);
  }
  for (const table of requiredTables) {
    const relation = relationMap.get(table);
    if (!relation) blockers.push(`Required table is missing: ${table}.`);
    else if (!relation.rls_enabled) blockers.push(`RLS is disabled: ${table}.`);
  }
  if (connectionRows.rows.length === 0)
    blockers.push("No MarketplacePro connection is configured.");
  if (
    !connectionRows.rows.some(
      (row) =>
        row.connection_status === "connected" &&
        row.sync_status === "ready" &&
        row.profile_mode === "ferocity_connected" &&
        row.enabled === true &&
        row.contract_version === "2026-10-22.v1" &&
        row.configured_at &&
        row.brand_tenant_matches === true &&
        row.configured_credentials === 1,
    )
  ) {
    blockers.push(
      "No connection has the complete enabled owner-pilot contract and signing credential.",
    );
  }
  const stuckDeliveries = deliveryRows.rows.reduce(
    (sum, row) => sum + row.stuck,
    0,
  );
  const recentFailures = deliveryRows.rows.reduce(
    (sum, row) => sum + row.failed_last_24h,
    0,
  );
  if (stuckDeliveries > 0)
    blockers.push(`${stuckDeliveries} delivery inbox row(s) are stuck.`);
  if (recentFailures > 0)
    blockers.push(
      `${recentFailures} delivery inbox row(s) failed in the last 24 hours.`,
    );
  const securityRow = security.rows[0];
  if (securityRow.cross_tenant_brand_links > 0)
    blockers.push("Cross-tenant brand links exist.");
  if (securityRow.browser_mutation_grants > 0)
    blockers.push("Browser roles have MarketplacePro mutation grants.");
  if (securityRow.unvalidated_constraints > 0)
    blockers.push("MarketplacePro constraints remain unvalidated.");

  const networkBaseUrl = normalizedHttpsOrigin(
    process.env.MARKETPLACEPRO_NETWORK_BASE_URL?.trim() ?? "",
  );
  const phoneBaseUrl = normalizedHttpsOrigin(
    process.env.MARKETPLACEPRO_PHONE_INTAKE_BASE_URL?.trim() ?? "",
  );
  const environment = {
    networkBaseUrlConfigured: Boolean(networkBaseUrl),
    networkSecretConfigured: Boolean(
      process.env.MARKETPLACEPRO_NETWORK_SECRET?.trim(),
    ),
    phoneBaseUrlConfigured: Boolean(phoneBaseUrl),
    phoneSecretConfigured: Boolean(
      process.env.MARKETPLACEPRO_PHONE_INTAKE_SECRET?.trim(),
    ),
  };
  for (const [key, configured] of Object.entries(environment)) {
    if (!configured)
      blockers.push(`Release environment readiness is missing: ${key}.`);
  }

  const liveHealth = await checkLiveMarketplaceProHealth(
    networkBaseUrl ?? phoneBaseUrl,
    process.env.MARKETPLACEPRO_CERTIFICATION_HEALTH_SECRET?.trim() ?? "",
  );
  if (!databaseOnly) {
    if (!liveHealth.checked) {
      blockers.push(
        "Live MarketplacePro health was not checked with a dedicated certification credential.",
      );
    } else if (!liveHealth.ok) {
      const missing = Object.entries(liveHealth.configured ?? {})
        .filter(([, configured]) => configured !== true)
        .map(([key]) => key);
      blockers.push(
        missing.length > 0
          ? `Live MarketplacePro runtime configuration is incomplete: ${missing.join(", ")}.`
          : `Live MarketplacePro health failed${liveHealth.status ? ` with HTTP ${liveHealth.status}` : ""}.`,
      );
    }
  }

  const output = {
    certified: blockers.length === 0,
    checkedAt: new Date().toISOString(),
    connections: connectionRows.rows,
    deliveries: deliveryRows.rows,
    syncEvents: syncRows.rows,
    objectLinks: linkRows.rows,
    environment,
    liveHealth,
    security: securityRow,
    blockers,
  };
  console.log(JSON.stringify(output, null, 2));
  await client.query("rollback");
  if (blockers.length > 0) process.exitCode = 1;
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}

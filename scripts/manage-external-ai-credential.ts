import { createExternalAiCredential, externalAiScopeCatalog, revokeExternalAiCredential } from "../src/lib/mcp/credentials";
import { queryPostgres } from "../src/lib/db/postgres";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string) {
  const value = option(name)?.trim();
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

async function resolveContext() {
  const tenant = required("tenant");
  const userEmail = required("user").toLowerCase();
  const actorEmail = (option("actor") ?? userEmail).trim().toLowerCase();
  const result = await queryPostgres<{ tenant_id: string; user_id: string; actor_id: string }>(
    `select tenant.id as tenant_id,authorized.id as user_id,actor.id as actor_id
     from public.tenants tenant
     join public.users authorized on lower(authorized.email)=$2
     join public.users actor on lower(actor.email)=$3
     where (tenant.id::text=$1 or tenant.slug=$1) and tenant.status in ('active','trial') limit 1`,
    [tenant, userEmail, actorEmail],
  );
  const row = result?.rows[0];
  if (!row) throw new Error("The workspace or user could not be resolved.");
  return row;
}

async function main() {
  const command = process.argv[2];
  if (command === "list") {
    const { tenant_id } = await resolveContext();
    const result = await queryPostgres(
      `select id,provider_key as "providerKey",label,token_prefix as "tokenPrefix",scopes,status,
         expires_at as "expiresAt",last_used_at as "lastUsedAt",created_at as "createdAt"
       from public.external_ai_credentials where tenant_id=$1 order by created_at desc`,
      [tenant_id],
    );
    console.log(JSON.stringify(result?.rows ?? [], null, 2));
    return;
  }
  if (command === "revoke") {
    const context = await resolveContext();
    const revoked = await revokeExternalAiCredential({ tenantId: context.tenant_id, credentialId: required("credential"), actorUserId: context.actor_id });
    if (!revoked) throw new Error("The credential was not active or the actor is not authorized.");
    console.log(JSON.stringify({ revoked: true }));
    return;
  }
  if (command !== "create" && command !== "rotate") {
    throw new Error("Use create, rotate, revoke, or list.");
  }
  const context = await resolveContext();
  const scopes = required("scopes").split(",").map((scope) => scope.trim());
  const unsupported = scopes.filter((scope) => !externalAiScopeCatalog.includes(scope as (typeof externalAiScopeCatalog)[number]));
  if (unsupported.length) throw new Error(`Unsupported scopes: ${unsupported.join(", ")}`);
  const days = Number(option("days") ?? 90);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days must be an integer from 1 to 365.");
  const rotatedFromId = command === "rotate" ? required("credential") : null;
  if (!rotatedFromId && option("consent-ack") !== "yes") {
    throw new Error("Creating a credential requires --consent-ack yes after the workspace owner authorizes external AI data sharing.");
  }
  const created = await createExternalAiCredential({
    tenantId: context.tenant_id,
    authorizedUserId: context.user_id,
    actorUserId: context.actor_id,
    providerKey: option("provider") ?? "generic_mcp",
    label: required("label"),
    scopes,
    expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
    rotatedFromId,
    consentAcknowledged: !rotatedFromId,
  });
  console.log(JSON.stringify({
    ...created,
    warning: "Copy the token into the approved client now. Ferocity cannot display it again.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Credential operation failed.");
  process.exitCode = 1;
});

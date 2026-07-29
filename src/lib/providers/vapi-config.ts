import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";

export type VapiConfiguration = {
  apiKey: string;
  phoneNumberId: string | null;
  phoneNumber: string | null;
  webhookSecret: string | null;
  webhookCredentialId: string | null;
};

export async function resolveVapiConfiguration(tenantId: string, requireLiveActions = false) {
  const accountResult = await queryPostgres<{
    status: string;
    credentials_status: string;
    live_actions_enabled: boolean;
  }>(
    `
    select status, credentials_status, live_actions_enabled
    from public.provider_accounts
    where tenant_id = $1 and provider_key = 'vapi_voice'
    limit 1
    `,
    [tenantId]
  );
  const account = accountResult?.rows[0];
  const statusAllowsConfiguration = requireLiveActions
    ? account?.status === "connected"
    : ["connected", "paused", "error"].includes(account?.status ?? "");
  if (
    !account
    || account.credentials_status !== "configured"
    || !statusAllowsConfiguration
    || (requireLiveActions && !account.live_actions_enabled)
  ) {
    return null;
  }

  const secrets = await resolveTenantProviderSecrets(tenantId, "vapi_voice");
  const apiKey = secretByAliases(secrets, ["api_key", "vapi_api_key"], "api_key");
  if (!apiKey) return null;
  return {
    apiKey,
    phoneNumberId: secretByAliases(secrets, ["phone_number_id", "vapi_phone_number_id"]),
    phoneNumber: secretByAliases(secrets, ["phone_number", "vapi_phone_number"]),
    webhookSecret: secretByAliases(secrets, ["webhook_secret", "vapi_webhook_secret"], "webhook_secret"),
    webhookCredentialId: secretByAliases(secrets, ["webhook_credential_id", "vapi_webhook_credential_id"])
  } satisfies VapiConfiguration;
}

export async function resolveVapiWebhookTenant(assistantId: string | null, phoneNumberId: string | null) {
  if (!assistantId && !phoneNumberId) return null;
  const result = await queryPostgres<{ tenant_id: string }>(
    `
    select tenant_id
    from (
      select tenant_id, 0 as priority
      from public.provider_accounts
      where provider_key = 'vapi_voice'
        and $1::text is not null
        and metadata_json->>'assistantId' = $1
      union all
      select tenant_id, 1 as priority
      from public.telephony_numbers
      where provider_key = 'vapi_voice'
        and $2::text is not null
        and provider_resource_id = $2
    ) mapped
    order by priority
    limit 1
    `,
    [assistantId, phoneNumberId]
  );
  return result?.rows[0]?.tenant_id ?? null;
}

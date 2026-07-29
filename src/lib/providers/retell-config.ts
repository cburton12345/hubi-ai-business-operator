import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";

export type RetellConfiguration = {
  apiKey: string;
  webhookApiKey: string;
  phoneNumber: string;
  voiceId: string;
};

export async function resolveRetellConfiguration(tenantId: string, requireLiveActions = false) {
  const accountResult = await queryPostgres<{
    status: string;
    credentials_status: string;
    live_actions_enabled: boolean;
  }>(
    `
    select status, credentials_status, live_actions_enabled
    from public.provider_accounts
    where tenant_id = $1 and provider_key = 'retell_voice'
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

  const secrets = await resolveTenantProviderSecrets(tenantId, "retell_voice");
  const apiKey = secretByAliases(secrets, ["api_key", "retell_api_key"]);
  const webhookApiKey = secretByAliases(
    secrets,
    ["webhook_api_key", "retell_webhook_api_key"]
  );
  const phoneNumber = secretByAliases(secrets, ["phone_number", "retell_phone_number"]);
  const voiceId = secretByAliases(secrets, ["voice_id", "retell_voice_id"]) ?? "retell-Cimo";
  if (!apiKey || !webhookApiKey || !phoneNumber) return null;
  return { apiKey, webhookApiKey, phoneNumber, voiceId } satisfies RetellConfiguration;
}

export async function resolveRetellWebhookTenant(agentId: string | null, phoneNumber: string | null) {
  if (!agentId && !phoneNumber) return null;
  const result = await queryPostgres<{ tenant_id: string }>(
    `
    select tenant_id
    from (
      select tenant_id, 0 as priority
      from public.provider_accounts
      where provider_key = 'retell_voice'
        and $1::text is not null
        and metadata_json->>'assistantId' = $1
      union all
      select tenant_id, 1 as priority
      from public.telephony_numbers
      where provider_key = 'retell_voice'
        and $2::text is not null
        and phone_number = $2
    ) mapped
    order by priority
    limit 1
    `,
    [agentId, phoneNumber]
  );
  return result?.rows[0]?.tenant_id ?? null;
}

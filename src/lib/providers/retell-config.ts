import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

export type RetellConfiguration = {
  apiKey: string;
  webhookApiKey: string;
  phoneNumber: string | null;
  voiceId: string;
};

export async function resolveRetellConfiguration(tenantId: string, requireLiveActions = false) {
  const accountResult = await queryPostgres<{
    status: string;
    credentials_status: string;
    live_actions_enabled: boolean;
    ownership_mode: string;
  }>(
    `
    select status, credentials_status, live_actions_enabled, ownership_mode
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
  const managed = account.ownership_mode === "ferocity_managed";
  const managedNumberResult = managed
    ? await queryPostgres<{ phone_number: string }>(
        `
        select phone_number
        from public.telephony_numbers
        where tenant_id = $1
          and provider_key = 'retell_voice'
          and number_mode = 'ferocity_managed'
          and status in ('provisioning', 'active', 'paused')
        order by case status when 'active' then 0 when 'provisioning' then 1 else 2 end, updated_at desc
        limit 1
        `,
        [tenantId]
      )
    : null;
  const managedPhoneNumber = managedNumberResult?.rows[0]?.phone_number ?? null;
  const apiKey =
    secretByAliases(secrets, ["api_key", "retell_api_key"])
    ?? (managed ? env.RETELL_API_KEY : null);
  // Retell signs webhook payloads with the account API key. It does not issue a
  // separate webhook-signing secret, so verification must use the same resolved
  // tenant credential that authenticates Retell API requests.
  const webhookApiKey = apiKey;
  const phoneNumber =
    secretByAliases(secrets, ["phone_number", "retell_phone_number"])
    ?? (managed ? managedPhoneNumber ?? env.VOICE_PHONE_NUMBER ?? null : null);
  const voiceId = secretByAliases(secrets, ["voice_id", "retell_voice_id"]) ?? "retell-Cimo";
  if (!apiKey || !webhookApiKey) return null;
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
        and $1 in (
          metadata_json->>'assistantId',
          metadata_json->>'outboundAssistantId',
          metadata_json->>'ownerVoiceAssistantId'
        )
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

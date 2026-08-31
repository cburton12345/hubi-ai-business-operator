import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

export type RetellConfiguration = {
  apiKey: string;
  webhookApiKey: string;
  phoneNumber: string | null;
  voiceId: string;
  callbackStatus: "untested" | "certified" | "degraded" | "blocked" | "not_required";
  inboundEnabled: boolean;
  outboundEnabled: boolean;
};

type RetellAccountType = "internal" | "customer" | "agency" | "partner";

function normalizedPhoneNumber(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

export function selectRetellPhoneNumber(input: {
  accountType: RetellAccountType;
  ownershipMode: string;
  secretPhoneNumber: string | null;
  assignedPhoneNumber: string | null;
  platformPhoneNumber: string | null;
}) {
  const platformNumber = normalizedPhoneNumber(input.platformPhoneNumber);
  const secretNumber = normalizedPhoneNumber(input.secretPhoneNumber);
  const secretIsSharedPlatformNumber = Boolean(
    secretNumber && platformNumber && secretNumber === platformNumber
  );

  // The Ferocity platform tenant may use the shared support line. Customer,
  // agency, and partner workspaces must have a number that belongs to their
  // workspace so callers can safely call back into the correct business.
  if (input.accountType === "internal") {
    return input.secretPhoneNumber ?? input.assignedPhoneNumber ?? input.platformPhoneNumber;
  }
  if (input.secretPhoneNumber && !secretIsSharedPlatformNumber) return input.secretPhoneNumber;
  return input.assignedPhoneNumber;
}

export async function resolveRetellConfiguration(tenantId: string, requireLiveActions = false) {
  const accountResult = await queryPostgres<{
    status: string;
    credentials_status: string;
    live_actions_enabled: boolean;
    ownership_mode: string;
    account_type: RetellAccountType;
  }>(
    `
    select a.status, a.credentials_status, a.live_actions_enabled, a.ownership_mode, t.account_type
    from public.provider_accounts a
    join public.tenants t on t.id = a.tenant_id
    where a.tenant_id = $1 and a.provider_key = 'retell_voice'
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
  const secretPhoneNumber = secretByAliases(secrets, ["phone_number", "retell_phone_number"]);
  const numberResult = await queryPostgres<{
    phone_number: string;
    callback_status: RetellConfiguration["callbackStatus"];
    inbound_enabled: boolean;
    outbound_enabled: boolean;
  }>(
        `
        select phone_number, callback_status, inbound_enabled, outbound_enabled
        from public.telephony_numbers
        where tenant_id = $1
          and provider_key = 'retell_voice'
          and ($2::text is null or phone_number = $2)
          and ($3::boolean is false or number_mode = 'ferocity_managed')
          and status in ('provisioning', 'active', 'paused')
        order by case status when 'active' then 0 when 'provisioning' then 1 else 2 end, updated_at desc
        limit 1
        `,
        [tenantId, secretPhoneNumber, managed]
      );
  const assignedNumber = numberResult?.rows[0] ?? null;
  const apiKey =
    secretByAliases(secrets, ["api_key", "retell_api_key"])
    ?? (managed ? env.RETELL_API_KEY : null);
  // Retell signs webhook payloads with the account API key. It does not issue a
  // separate webhook-signing secret, so verification must use the same resolved
  // tenant credential that authenticates Retell API requests.
  const webhookApiKey = apiKey;
  const phoneNumber = selectRetellPhoneNumber({
    accountType: account.account_type,
    ownershipMode: account.ownership_mode,
    secretPhoneNumber,
    assignedPhoneNumber: assignedNumber?.phone_number ?? null,
    platformPhoneNumber: managed ? env.VOICE_PHONE_NUMBER ?? null : null
  });
  const voiceId = secretByAliases(secrets, ["voice_id", "retell_voice_id"]) ?? "retell-Cimo";
  if (!apiKey || !webhookApiKey) return null;
  return {
    apiKey,
    webhookApiKey,
    phoneNumber,
    voiceId,
    callbackStatus: assignedNumber?.callback_status ?? "untested",
    inboundEnabled: assignedNumber?.inbound_enabled === true,
    outboundEnabled: assignedNumber?.outbound_enabled === true
  } satisfies RetellConfiguration;
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

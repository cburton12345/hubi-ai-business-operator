import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

export type TwilioSmsConfiguration = {
  ownershipMode: "customer_owned" | "ferocity_managed";
  accountSid: string;
  authUsername: string;
  authPassword: string;
  webhookAuthToken: string;
  fromNumber: string | null;
  messagingServiceSid: string | null;
};

type AccountRow = {
  ownership_mode: "customer_owned" | "ferocity_managed";
  connection_status: string;
  credentials_status: string;
  live_sending_enabled: boolean;
  outbound_enabled: boolean;
  provider_account_ref: string | null;
  metadata_json: Record<string, unknown> | null;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function activeSmsNumber(tenantId: string) {
  const result = await queryPostgres<{ phone_number: string }>(
    `
    select phone_number
    from public.tenant_phone_numbers
    where tenant_id = $1
      and provider_key in ('twilio', 'twilio_sms')
      and status = 'active'
      and outbound_enabled = true
      and sms_enabled = true
    order by case number_mode when 'customer_owned' then 0 when 'ferocity_managed' then 1 else 2 end, updated_at desc
    limit 1
    `,
    [tenantId]
  );
  return result?.rows[0]?.phone_number ?? null;
}

async function customerOwnedConfiguration(tenantId: string, account: AccountRow) {
  const secrets = [
    ...(await resolveTenantProviderSecrets(tenantId, "twilio")),
    ...(await resolveTenantProviderSecrets(tenantId, "twilio_sms"))
  ];
  const accountSid =
    secretByAliases(secrets, ["account_sid", "twilio_account_sid"], "account_sid")
    ?? account.provider_account_ref;
  const apiKeySid = secretByAliases(secrets, ["api_key_sid", "twilio_api_key_sid"]);
  const apiKeySecret = secretByAliases(secrets, ["api_key_secret", "twilio_api_key_secret"]);
  const authToken = secretByAliases(secrets, ["auth_token", "twilio_auth_token"], "auth_token");
  const fromNumber =
    secretByAliases(secrets, ["from_number", "phone_number", "twilio_from_number"])
    ?? await activeSmsNumber(tenantId);
  const messagingServiceSid =
    secretByAliases(secrets, ["messaging_service_sid", "twilio_messaging_service_sid"])
    ?? text(account.metadata_json?.messagingServiceSid);

  if (!accountSid || !authToken || (!apiKeySid && !authToken) || (!apiKeySecret && !authToken) || (!fromNumber && !messagingServiceSid)) {
    return null;
  }

  return {
    ownershipMode: "customer_owned",
    accountSid,
    authUsername: apiKeySid ?? accountSid,
    authPassword: apiKeySecret ?? authToken!,
    webhookAuthToken: authToken,
    fromNumber,
    messagingServiceSid
  } satisfies TwilioSmsConfiguration;
}

function managedConfiguration(): TwilioSmsConfiguration | null {
  if (
    env.ENABLE_TWILIO_SMS_SENDS !== "true"
    || !env.TWILIO_ACCOUNT_SID
    || !env.TWILIO_AUTH_TOKEN
    || !env.TWILIO_FROM_NUMBER
  ) {
    return null;
  }
  return {
    ownershipMode: "ferocity_managed",
    accountSid: env.TWILIO_ACCOUNT_SID,
    authUsername: env.TWILIO_ACCOUNT_SID,
    authPassword: env.TWILIO_AUTH_TOKEN,
    webhookAuthToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_FROM_NUMBER,
    messagingServiceSid: null
  };
}

export async function resolveTwilioSmsConfiguration(tenantId: string, requireLiveActions = true) {
  const result = await queryPostgres<AccountRow>(
    `
    select ownership_mode, connection_status, credentials_status, live_sending_enabled,
           outbound_enabled, provider_account_ref, metadata_json
    from public.tenant_messaging_accounts
    where tenant_id = $1
      and provider_key in ('twilio', 'twilio_sms')
      and ownership_mode in ('customer_owned', 'ferocity_managed')
      and (
        ($2::boolean = true and connection_status = 'active' and live_sending_enabled = true and outbound_enabled = true)
        or
        ($2::boolean = false and connection_status in ('configured', 'active', 'paused'))
      )
    order by case ownership_mode when 'customer_owned' then 0 else 1 end
    `,
    [tenantId, requireLiveActions]
  );

  for (const account of result?.rows ?? []) {
    if (account.ownership_mode === "customer_owned" && account.credentials_status === "configured") {
      const customer = await customerOwnedConfiguration(tenantId, account);
      if (customer) return customer;
    }
    if (account.ownership_mode === "ferocity_managed" && account.credentials_status === "configured") {
      const managed = managedConfiguration();
      if (managed) return managed;
    }
  }
  return null;
}

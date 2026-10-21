import { queryPostgres } from "@/lib/db/postgres";
import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";

export const refreshableProviderKeys = [
  "google_calendar",
  "google_business_profile",
  "google_ads",
  "youtube",
  "search_console",
  "analytics",
  "microsoft_ads",
  "microsoft_calendar",
  "gmail_mailbox",
  "microsoft_mailbox",
  "jobber",
  "tiktok",
] as const;

export type RefreshableProviderKey = (typeof refreshableProviderKeys)[number];

type DueCredentialConnection = {
  tenant_id: string;
  provider_key: RefreshableProviderKey;
};

export type ProviderCredentialRefreshOutcome = {
  provider: RefreshableProviderKey;
  status: "refreshed" | "failed";
  reason?: "reauthorization_required" | "refresh_failed";
};

export type ProviderCredentialMaintenanceResult = {
  checked: number;
  refreshed: number;
  failed: number;
  outcomes: ProviderCredentialRefreshOutcome[];
};

type CredentialMaintenanceDependencies = {
  findDue: (tenantId: string, limit: number) => Promise<DueCredentialConnection[]>;
  refresh: (tenantId: string, provider: RefreshableProviderKey) => Promise<string>;
  recordOutcome: (
    tenantId: string,
    outcome: ProviderCredentialRefreshOutcome,
  ) => Promise<void>;
};

function failureReason(error: unknown): ProviderCredentialRefreshOutcome["reason"] {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("reauthoriz") ||
    message.includes("invalid_grant") ||
    message.includes("revoked")
    ? "reauthorization_required"
    : "refresh_failed";
}

async function findDueCredentials(tenantId: string, limit: number) {
  const result = await queryPostgres<DueCredentialConnection>(
    `select distinct access.tenant_id, access.provider_key
       from public.tenant_provider_credentials access
       join public.provider_accounts account
         on account.tenant_id=access.tenant_id
        and account.provider_key=access.provider_key
       join public.tenant_provider_credentials refresh
         on refresh.tenant_id=access.tenant_id
        and refresh.provider_key=access.provider_key
        and refresh.credential_label='oauth_refresh_token'
        and refresh.status='configured'
      where access.tenant_id=$1
        and access.credential_label='oauth_access_token'
        and access.status='configured'
        and access.provider_key=any($2::text[])
        and account.status in ('connected','ready','active')
        and account.credentials_status='configured'
        and (access.rotation_due_at is null or access.rotation_due_at <= now()+interval '15 minutes')
        and (
          account.metadata_json->>'lastCredentialMaintenanceStatus' is distinct from 'failed'
          or account.metadata_json->>'credentialMaintenanceFailureReason' is distinct from 'refresh_failed'
          or nullif(account.metadata_json->>'lastCredentialMaintenanceAt','')::timestamptz <= now()-interval '30 minutes'
        )
      order by access.provider_key
      limit $3`,
    [tenantId, refreshableProviderKeys, limit],
  );
  return result?.rows ?? [];
}

async function recordCredentialRefreshOutcome(
  tenantId: string,
  outcome: ProviderCredentialRefreshOutcome,
) {
  await queryPostgres(
    `update public.provider_accounts
        set credentials_status=case
              when $3='refreshed' then 'configured'
              when $4='reauthorization_required' then 'expired'
              else credentials_status
            end,
            metadata_json=metadata_json || jsonb_build_object(
              'lastCredentialMaintenanceAt', now(),
              'lastCredentialMaintenanceStatus', $3,
              'credentialMaintenanceFailureReason', case when $3='failed' then $4 else null end
            ),
            updated_at=now()
      where tenant_id=$1 and provider_key=$2`,
    [tenantId, outcome.provider, outcome.status, outcome.reason ?? null],
  );
}

const defaultDependencies: CredentialMaintenanceDependencies = {
  findDue: findDueCredentials,
  refresh: getFreshProviderAccessToken,
  recordOutcome: recordCredentialRefreshOutcome,
};

export async function refreshDueProviderCredentialsForTenant(
  tenantId: string,
  options: {
    limit?: number;
    dependencies?: CredentialMaintenanceDependencies;
  } = {},
): Promise<ProviderCredentialMaintenanceResult> {
  const dependencies = options.dependencies ?? defaultDependencies;
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 8), 25));
  const due = await dependencies.findDue(tenantId, limit);
  const outcomes: ProviderCredentialRefreshOutcome[] = [];

  for (const connection of due) {
    let outcome: ProviderCredentialRefreshOutcome;
    try {
      await dependencies.refresh(tenantId, connection.provider_key);
      outcome = { provider: connection.provider_key, status: "refreshed" };
    } catch (error) {
      outcome = {
        provider: connection.provider_key,
        status: "failed",
        reason: failureReason(error),
      };
    }

    outcomes.push(outcome);
    try {
      await dependencies.recordOutcome(tenantId, outcome);
    } catch {
      // Refresh success/failure remains authoritative. Maintenance metadata is best-effort.
    }
  }

  return {
    checked: outcomes.length,
    refreshed: outcomes.filter((outcome) => outcome.status === "refreshed").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
  };
}

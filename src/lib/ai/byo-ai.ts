import { resolveTenantProviderSecrets, secretByAliases } from "@/lib/credentials/resolve-tenant-provider-secrets";
import { queryPostgres } from "@/lib/db/postgres";
import { managedModelForRunType } from "@/lib/ai/model-routing";

export type AiExecutionConfiguration = {
  providerKey: "openai" | "openai_byok";
  model: string;
  apiKey: string | null;
  baseUrl: string;
  ownershipMode: "ferocity_managed" | "workspace";
};

function managedOpenAiBaseUrl() {
  const configured = process.env.OPENAI_BASE_URL?.trim().replace(/\/$/, "");
  if (!configured) return "https://api.openai.com/v1";
  return configured.endsWith("/v1") ? configured : `${configured}/v1`;
}

const byoEligibleRunTypes = new Set([
  "construction_field_log",
  "growth_funnel_strategy",
  "receipt_vision_extraction",
  "setup_guidance",
  "weekly_marketing_plan"
]);

const protectedFerocityRunTypes = new Set([
  "owner_command_event_triage",
  "public_website_chat_reply"
]);

export function isByoAiEligibleRunType(runType: string) {
  if (protectedFerocityRunTypes.has(runType)) return false;
  return byoEligibleRunTypes.has(runType);
}

export function managedAiConfiguration(
  requestType: "json" | "vision_json",
  runType = "default"
): AiExecutionConfiguration {
  return {
    providerKey: "openai",
    model: managedModelForRunType({ runType, requestType }),
    apiKey: process.env.OPENAI_API_KEY ?? null,
    baseUrl: managedOpenAiBaseUrl(),
    ownershipMode: "ferocity_managed"
  };
}

export async function resolveAiExecutionConfiguration(input: {
  tenantId: string;
  runType: string;
  requestType: "json" | "vision_json";
}) {
  const managed = managedAiConfiguration(input.requestType, input.runType);
  if (!isByoAiEligibleRunType(input.runType)) return managed;

  const accountResult = await queryPostgres<{
    status: string;
    credentials_status: string;
    live_actions_enabled: boolean;
    ownership_mode: string;
  }>(
    `
    select status, credentials_status, live_actions_enabled, ownership_mode
    from public.provider_accounts
    where tenant_id = $1 and provider_key = 'openai_byok'
    limit 1
    `,
    [input.tenantId]
  );
  const account = accountResult?.rows[0];
  if (
    !account
    || account.status !== "connected"
    || account.credentials_status !== "configured"
    || account.live_actions_enabled !== true
    || account.ownership_mode !== "workspace"
  ) {
    return managed;
  }

  const secrets = await resolveTenantProviderSecrets(input.tenantId, "openai_byok");
  const apiKey = secretByAliases(secrets, ["api_key", "openai_api_key"], "api_key");
  const requestedModel = secretByAliases(secrets, ["model", "model_name"]);
  const model = requestedModel && /^[a-zA-Z0-9._:-]{2,100}$/.test(requestedModel)
    ? requestedModel
    : managed.model;

  return {
    providerKey: "openai_byok" as const,
    model,
    apiKey,
    baseUrl: "https://api.openai.com/v1" as const,
    ownershipMode: "workspace" as const
  };
}

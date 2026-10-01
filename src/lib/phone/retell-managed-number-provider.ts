import { resilientFetch } from "@/lib/http/resilient-fetch";
import type { ProviderContext, ProviderResult } from "@/lib/providers/interfaces";
import { resolveRetellConfiguration } from "@/lib/providers/retell-config";

export type ManagedNumberBinding = {
  inboundAssistantId: string;
  outboundAssistantId: string;
  inboundWebhookUrl: string;
  nickname: string;
  areaCode?: string | null;
};

type RetellNumberBody = {
  phone_number?: string;
  phone_number_type?: string;
  message?: string;
  error?: string;
};

function safeProvider() {
  return process.env.RETELL_NUMBER_PROVIDER === "twilio" ? "twilio" : "telnyx";
}

export function buildRetellNumberBindingPayload(binding: ManagedNumberBinding) {
  return {
    inbound_agents: [{ agent_id: binding.inboundAssistantId, weight: 1 }],
    outbound_agents: [{ agent_id: binding.outboundAssistantId, weight: 1 }],
    inbound_webhook_url: binding.inboundWebhookUrl,
    nickname: binding.nickname.slice(0, 100)
  };
}

export function buildRetellManagedNumberPayload(binding: ManagedNumberBinding) {
  const areaCode = Number(binding.areaCode);
  return {
    ...buildRetellNumberBindingPayload(binding),
    number_provider: safeProvider(),
    country_code: "US",
    toll_free: false,
    ...(Number.isInteger(areaCode) && areaCode >= 200 && areaCode <= 999 ? { area_code: areaCode } : {})
  };
}

async function request(apiKey: string, path: string, method: "POST" | "PATCH" | "DELETE", payload?: Record<string, unknown>) {
  const response = await resilientFetch(`https://api.retellai.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  // Number purchases are not safely replayable without reconciling the remote
  // inventory first. The lifecycle worker handles review/retry deliberately.
  }, { timeoutMs: 15_000, retries: 0 });
  const body = response.status === 204
    ? null
    : await response.json().catch(() => null) as RetellNumberBody | null;
  return { response, body };
}

function failure(status: number, body: RetellNumberBody | null): ProviderResult<never> {
  const detail = (body?.message ?? body?.error ?? "").slice(0, 180);
  return {
    ok: false,
    errorCategory: status === 401 ? "provider_authentication" : status === 402 ? "provider_funding" : status === 429 ? "provider_rate_limit" : "provider_error",
    safeMessage: `Retell managed-number request failed with HTTP ${status}${detail ? `: ${detail}` : "."}`,
    retryable: status === 429 || status >= 500
  };
}

export async function provisionRetellManagedNumber(
  context: ProviderContext,
  binding: ManagedNumberBinding
): Promise<ProviderResult<{ phoneNumber: string; providerResourceId: string; providerType: string | null }>> {
  if (!context.liveActionsEnabled) {
    return { ok: false, errorCategory: "live_actions_disabled", safeMessage: "Managed number provisioning is disabled.", retryable: false };
  }
  const configuration = await resolveRetellConfiguration(context.tenantId, false);
  if (!configuration?.apiKey) {
    return { ok: false, errorCategory: "provider_not_configured", safeMessage: "Retell credentials are not configured for this workspace.", retryable: false };
  }
  const result = await request(configuration.apiKey, "/create-phone-number", "POST", buildRetellManagedNumberPayload(binding));
  const phoneNumber = result.body?.phone_number;
  if (!result.response.ok || !phoneNumber) return failure(result.response.status, result.body);
  return {
    ok: true,
    data: { phoneNumber, providerResourceId: phoneNumber, providerType: result.body?.phone_number_type ?? null }
  };
}

export async function configureRetellManagedNumber(
  context: ProviderContext,
  phoneNumber: string,
  binding: ManagedNumberBinding,
  mode: "active" | "restricted"
): Promise<ProviderResult<{ configured: boolean }>> {
  if (!context.liveActionsEnabled) {
    return { ok: false, errorCategory: "live_actions_disabled", safeMessage: "Managed number configuration is disabled.", retryable: false };
  }
  const configuration = await resolveRetellConfiguration(context.tenantId, false);
  if (!configuration?.apiKey) {
    return { ok: false, errorCategory: "provider_not_configured", safeMessage: "Retell credentials are not configured for this workspace.", retryable: false };
  }
  const payload = mode === "active"
    ? buildRetellNumberBindingPayload(binding)
    : {
        inbound_agents: [{ agent_id: binding.inboundAssistantId, weight: 1 }],
        outbound_agents: [],
        inbound_webhook_url: binding.inboundWebhookUrl,
        nickname: `${binding.nickname} — payment recovery`.slice(0, 100)
      };
  const result = await request(configuration.apiKey, `/update-phone-number/${encodeURIComponent(phoneNumber)}`, "PATCH", payload);
  if (!result.response.ok) return failure(result.response.status, result.body);
  return { ok: true, data: { configured: true } };
}

export async function releaseRetellManagedNumber(
  context: ProviderContext,
  phoneNumber: string
): Promise<ProviderResult<{ released: boolean }>> {
  if (!context.liveActionsEnabled) {
    return { ok: false, errorCategory: "live_actions_disabled", safeMessage: "Managed number release is disabled.", retryable: false };
  }
  const configuration = await resolveRetellConfiguration(context.tenantId, false);
  if (!configuration?.apiKey) {
    return { ok: false, errorCategory: "provider_not_configured", safeMessage: "Retell credentials are not configured for this workspace.", retryable: false };
  }
  if (configuration.phoneNumber !== phoneNumber) {
    return { ok: false, errorCategory: "number_ownership_mismatch", safeMessage: "Ferocity refused to release a number that is not assigned to this workspace.", retryable: false };
  }
  const result = await request(configuration.apiKey, `/delete-phone-number/${encodeURIComponent(phoneNumber)}`, "DELETE");
  if (!result.response.ok && result.response.status !== 404) return failure(result.response.status, result.body);
  return { ok: true, data: { released: true } };
}

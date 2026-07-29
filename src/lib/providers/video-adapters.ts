import { env } from "@/lib/env";
import type {
  ProviderContext,
  ProviderResult,
  ProviderUsage,
  VideoGenerationProvider
} from "@/lib/providers/interfaces";

type OpenAiVideoJob = {
  id?: string;
  status?: string;
  progress?: number;
  seconds?: string | number;
  size?: string;
  model?: string;
  error?: { code?: string; message?: string } | null;
};

export type ManagedVideoConfiguration = {
  providerKey: "openai_video";
  apiKey: string;
  model: string;
  globalMonthlyBudgetCents: number;
  workspaceMonthlyBudgetCents: number;
  providerCostCentsPerSecond: number;
  customerPriceCentsPerSecond: number;
};

export function getManagedVideoAccessConfiguration() {
  const provider = env.VIDEO_PROVIDER?.trim().toLowerCase();
  const apiKey = env.VIDEO_API_KEY ?? env.OPENAI_API_KEY;
  if (!["openai", "openai_video"].includes(provider ?? "") || !apiKey || !env.VIDEO_MODEL) {
    return null;
  }
  return {
    providerKey: "openai_video" as const,
    apiKey,
    model: env.VIDEO_MODEL
  };
}

function positiveNumber(value: string | undefined) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getManagedVideoConfiguration(): ManagedVideoConfiguration | null {
  const access = getManagedVideoAccessConfiguration();
  const enabled = env.VIDEO_RENDERING_ENABLED?.trim().toLowerCase() === "true";
  const globalMonthlyBudgetCents = positiveNumber(env.VIDEO_MONTHLY_BUDGET_CENTS);
  const workspaceMonthlyBudgetCents = positiveNumber(env.VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS);
  const providerCostCentsPerSecond = positiveNumber(env.VIDEO_PROVIDER_COST_CENTS_PER_SECOND);
  const customerPriceCentsPerSecond = positiveNumber(env.VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND);

  if (
    !enabled
    || !access
    || !globalMonthlyBudgetCents
    || !workspaceMonthlyBudgetCents
    || !providerCostCentsPerSecond
    || !customerPriceCentsPerSecond
    || customerPriceCentsPerSecond <= providerCostCentsPerSecond
  ) {
    return null;
  }

  return {
    providerKey: "openai_video",
    apiKey: access.apiKey,
    model: access.model,
    globalMonthlyBudgetCents,
    workspaceMonthlyBudgetCents,
    providerCostCentsPerSecond,
    customerPriceCentsPerSecond
  };
}

function safeProviderError(status: number, body: OpenAiVideoJob) {
  if (status === 401 || status === 403) return "The video provider rejected its credentials.";
  if (status === 429) return "The video provider is busy or its rate limit was reached.";
  return body.error?.message || `The video provider returned HTTP ${status}.`;
}

function secondsFor(value?: number) {
  if (!value || value <= 4) return 4;
  if (value <= 8) return 8;
  return 12;
}

function sizeFor(aspectRatio?: string) {
  return aspectRatio === "16:9" ? "1280x720" : "720x1280";
}

async function parseJob(response: Response) {
  return await response.json().catch(() => ({})) as OpenAiVideoJob;
}

export class OpenAiVideoAdapter implements VideoGenerationProvider {
  providerKey = "openai_video";

  async createVideo(
    context: ProviderContext,
    input: { prompt: string; assets?: string[]; durationSeconds?: number; aspectRatio?: string; model?: string }
  ): Promise<ProviderResult<{ jobId: string; status: string; usage: ProviderUsage }>> {
    const configuration = getManagedVideoConfiguration();
    if (!context.liveActionsEnabled || !configuration) {
      return {
        ok: false,
        errorCategory: "provider_not_configured",
        safeMessage: "Premium video rendering is paused until the OpenAI video key, model, profitable pricing, and both monthly cost caps are configured.",
        retryable: false
      };
    }

    const seconds = secondsFor(input.durationSeconds);
    const form = new FormData();
    form.set("model", input.model || configuration.model);
    form.set("prompt", input.prompt);
    form.set("seconds", String(seconds));
    form.set("size", sizeFor(input.aspectRatio));

    const response = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Idempotency-Key": context.idempotencyKey
      },
      body: form,
      cache: "no-store"
    });
    const body = await parseJob(response);
    if (!response.ok || !body.id) {
      return {
        ok: false,
        errorCategory: response.status === 429 ? "provider_rate_limited" : "provider_error",
        safeMessage: safeProviderError(response.status, body),
        retryable: response.status === 429 || response.status >= 500
      };
    }

    return {
      ok: true,
      providerRequestId: body.id,
      providerCostCents: seconds * configuration.providerCostCentsPerSecond,
      data: {
        jobId: body.id,
        status: body.status || "queued",
        usage: {
          providerKey: this.providerKey,
          providerResourceId: body.id,
          featureKey: "premium_video",
          unitType: "video_second",
          quantity: seconds,
          providerCostCents: seconds * configuration.providerCostCentsPerSecond,
          metadata: {
            model: body.model || input.model || configuration.model,
            size: body.size || sizeFor(input.aspectRatio),
            sourceAssetCount: input.assets?.length ?? 0
          }
        }
      }
    };
  }

  async getVideo(
    context: ProviderContext,
    jobId: string
  ): Promise<ProviderResult<{ status: string; videoUrl?: string; usage?: ProviderUsage }>> {
    const configuration = getManagedVideoConfiguration();
    if (!configuration) {
      return {
        ok: false,
        errorCategory: "provider_not_configured",
        safeMessage: "Premium video rendering is not configured.",
        retryable: false
      };
    }
    const response = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${configuration.apiKey}` },
      cache: "no-store"
    });
    const body = await parseJob(response);
    if (!response.ok) {
      return {
        ok: false,
        errorCategory: response.status === 429 ? "provider_rate_limited" : "provider_error",
        safeMessage: safeProviderError(response.status, body),
        retryable: response.status === 429 || response.status >= 500
      };
    }
    return {
      ok: true,
      data: {
        status: body.status || "processing"
      }
    };
  }
}

const videoProviders: VideoGenerationProvider[] = [new OpenAiVideoAdapter()];

export function getVideoGenerationProvider(providerKey: string | null | undefined) {
  const normalized = providerKey?.trim().toLowerCase();
  if (!normalized || normalized === "openai") return videoProviders[0];
  return videoProviders.find((provider) => provider.providerKey === normalized) ?? null;
}

export function listVideoGenerationProviders() {
  return videoProviders.map((provider) => ({ providerKey: provider.providerKey, displayName: "OpenAI Video" }));
}

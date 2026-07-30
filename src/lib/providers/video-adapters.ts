import { GenerateVideosOperation, GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";
import type {
  ProviderContext,
  ProviderResult,
  ProviderUsage,
  VideoGenerationProvider
} from "@/lib/providers/interfaces";

type ManagedVideoProviderKey = "openai_video" | "google_veo";

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
  providerKey: ManagedVideoProviderKey;
  apiKey: string;
  model: string;
  globalMonthlyBudgetCents: number;
  workspaceMonthlyBudgetCents: number;
  providerCostCentsPerSecond: number;
  customerPriceCentsPerSecond: number;
};

function normalizedProviderKey(value: string | null | undefined): ManagedVideoProviderKey | null {
  const provider = value?.trim().toLowerCase();
  if (["openai", "openai_video"].includes(provider ?? "")) return "openai_video";
  if (["google", "google_veo", "veo"].includes(provider ?? "")) return "google_veo";
  return null;
}

export function getManagedVideoAccessConfiguration() {
  const providerKey = normalizedProviderKey(env.VIDEO_PROVIDER);
  const apiKey =
    env.VIDEO_API_KEY ??
    (providerKey === "openai_video" ? env.OPENAI_API_KEY : undefined);
  if (!providerKey || !apiKey || !env.VIDEO_MODEL) return null;
  return { providerKey, apiKey, model: env.VIDEO_MODEL };
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
    ...access,
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

export function normalizeVideoDuration(providerKey: ManagedVideoProviderKey, value?: number) {
  if (providerKey === "google_veo") {
    if (!value || value <= 4) return 4;
    if (value <= 6) return 6;
    return 8;
  }
  if (!value || value <= 4) return 4;
  if (value <= 8) return 8;
  return 12;
}

function sizeFor(aspectRatio?: string) {
  return aspectRatio === "16:9" ? "1280x720" : "720x1280";
}

function aspectRatioFor(value?: string) {
  return value === "16:9" ? "16:9" : "9:16";
}

async function parseJob(response: Response) {
  return await response.json().catch(() => ({})) as OpenAiVideoJob;
}

function providerException(error: unknown) {
  const message = error instanceof Error ? error.message : "The video provider request failed.";
  const lower = message.toLowerCase();
  return {
    ok: false as const,
    errorCategory: lower.includes("429") || lower.includes("rate") ? "provider_rate_limited" : "provider_error",
    safeMessage:
      lower.includes("api key") || lower.includes("credential") || lower.includes("401") || lower.includes("403")
        ? "The video provider rejected its credentials."
        : "The video provider could not complete the request.",
    retryable: lower.includes("429") || lower.includes("500") || lower.includes("503")
  };
}

export class OpenAiVideoAdapter implements VideoGenerationProvider {
  providerKey = "openai_video";

  async createVideo(
    context: ProviderContext,
    input: { prompt: string; assets?: string[]; durationSeconds?: number; aspectRatio?: string; model?: string }
  ): Promise<ProviderResult<{ jobId: string; status: string; usage: ProviderUsage }>> {
    const configuration = getManagedVideoConfiguration();
    if (!context.liveActionsEnabled || configuration?.providerKey !== this.providerKey) {
      return {
        ok: false,
        errorCategory: "provider_not_configured",
        safeMessage: "Premium video rendering is paused until the provider key, model, profitable pricing, and both monthly cost caps are configured.",
        retryable: false
      };
    }

    const seconds = normalizeVideoDuration("openai_video", input.durationSeconds);
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
    _context: ProviderContext,
    jobId: string
  ): Promise<ProviderResult<{ status: string; videoUrl?: string; usage?: ProviderUsage }>> {
    const configuration = getManagedVideoConfiguration();
    if (configuration?.providerKey !== this.providerKey) {
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
    return { ok: true, data: { status: body.status || "processing" } };
  }
}

export class GoogleVeoAdapter implements VideoGenerationProvider {
  providerKey = "google_veo";

  async createVideo(
    context: ProviderContext,
    input: { prompt: string; assets?: string[]; durationSeconds?: number; aspectRatio?: string; model?: string }
  ): Promise<ProviderResult<{ jobId: string; status: string; usage: ProviderUsage }>> {
    const configuration = getManagedVideoConfiguration();
    if (!context.liveActionsEnabled || configuration?.providerKey !== this.providerKey) {
      return {
        ok: false,
        errorCategory: "provider_not_configured",
        safeMessage: "Google Veo rendering is paused until its key, model, profitable pricing, and both monthly cost caps are configured.",
        retryable: false
      };
    }

    const seconds = normalizeVideoDuration("google_veo", input.durationSeconds);
    try {
      const ai = new GoogleGenAI({ apiKey: configuration.apiKey });
      const operation = await ai.models.generateVideos({
        model: input.model || configuration.model,
        prompt: input.prompt,
        config: {
          numberOfVideos: 1,
          durationSeconds: seconds,
          aspectRatio: aspectRatioFor(input.aspectRatio),
          resolution: "720p",
          generateAudio: true
        }
      });
      if (!operation.name) return providerException("The provider did not return an operation ID.");
      return {
        ok: true,
        providerRequestId: operation.name,
        providerCostCents: seconds * configuration.providerCostCentsPerSecond,
        data: {
          jobId: operation.name,
          status: operation.done ? "completed" : "queued",
          usage: {
            providerKey: this.providerKey,
            providerResourceId: operation.name,
            featureKey: "premium_video",
            unitType: "video_second",
            quantity: seconds,
            providerCostCents: seconds * configuration.providerCostCentsPerSecond,
            metadata: {
              model: input.model || configuration.model,
              aspectRatio: aspectRatioFor(input.aspectRatio),
              resolution: "720p",
              sourceAssetCount: input.assets?.length ?? 0
            }
          }
        }
      };
    } catch (error) {
      return providerException(error);
    }
  }

  async getVideo(
    _context: ProviderContext,
    jobId: string
  ): Promise<ProviderResult<{ status: string; videoUrl?: string; usage?: ProviderUsage }>> {
    const configuration = getManagedVideoConfiguration();
    if (configuration?.providerKey !== this.providerKey) {
      return {
        ok: false,
        errorCategory: "provider_not_configured",
        safeMessage: "Google Veo rendering is not configured.",
        retryable: false
      };
    }
    try {
      const ai = new GoogleGenAI({ apiKey: configuration.apiKey });
      const operation = new GenerateVideosOperation();
      operation.name = jobId;
      const refreshed = await ai.operations.getVideosOperation({ operation });
      if (refreshed.error) {
        return { ok: true, data: { status: "failed" } };
      }
      const video = refreshed.response?.generatedVideos?.[0]?.video;
      return {
        ok: true,
        data: {
          status: refreshed.done ? (video ? "completed" : "failed") : "processing",
          videoUrl: video?.uri
        }
      };
    } catch (error) {
      return providerException(error);
    }
  }
}

const videoProviders: VideoGenerationProvider[] = [
  new OpenAiVideoAdapter(),
  new GoogleVeoAdapter()
];

export function getVideoGenerationProvider(providerKey: string | null | undefined) {
  const normalized = normalizedProviderKey(providerKey);
  return videoProviders.find((provider) => provider.providerKey === normalized) ?? null;
}

export function listVideoGenerationProviders() {
  return [
    { providerKey: "openai_video", displayName: "OpenAI Video" },
    { providerKey: "google_veo", displayName: "Google Veo" }
  ];
}

export async function fetchManagedVideoContent(providerKey: string, jobId: string) {
  const configuration = getManagedVideoAccessConfiguration();
  const normalized = normalizedProviderKey(providerKey);
  if (!configuration || configuration.providerKey !== normalized) return null;

  if (normalized === "openai_video") {
    return fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(jobId)}/content`, {
      headers: { Authorization: `Bearer ${configuration.apiKey}` },
      cache: "no-store"
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: configuration.apiKey });
    const operation = new GenerateVideosOperation();
    operation.name = jobId;
    const refreshed = await ai.operations.getVideosOperation({ operation });
    const video = refreshed.response?.generatedVideos?.[0]?.video;
    if (!refreshed.done || !video) return null;
    if (video.videoBytes) {
      return new Response(Buffer.from(video.videoBytes, "base64"), {
        status: 200,
        headers: { "Content-Type": video.mimeType || "video/mp4" }
      });
    }
    if (!video.uri) return null;
    return fetch(video.uri, {
      headers: { "x-goog-api-key": configuration.apiKey },
      cache: "no-store"
    });
  } catch {
    return null;
  }
}

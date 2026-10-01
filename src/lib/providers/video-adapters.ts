import { GenerateVideosOperation, GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "@/lib/env";
import type {
  ProviderContext,
  ProviderResult,
  ProviderUsage,
  VideoGenerationProvider
} from "@/lib/providers/interfaces";

type ManagedVideoProviderKey = "openai_video" | "google_veo";
const OPENAI_VIDEO_API_SHUTDOWN_AT = Date.parse("2026-09-24T00:00:00Z");

export type VideoProviderCapability = {
  providerKey: ManagedVideoProviderKey | "elevenlabs_flows" | "runway" | "luma";
  displayName: string;
  adapterStatus: "live" | "legacy" | "evaluated";
  textToVideo: boolean;
  imageToVideo: boolean;
  referenceImages: number;
  nativeAspectRatios: string[];
  asyncJobs: boolean;
  notes: string;
};

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
    || (access.providerKey === "openai_video" && Date.now() >= OPENAI_VIDEO_API_SHUTDOWN_AT)
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
  const errorText = `${body.error?.code ?? ""} ${body.error?.message ?? ""}`.toLowerCase();
  if (errorText.includes("moderation") || errorText.includes("safety") || errorText.includes("content_policy")) {
    return "The video provider's safety review rejected this request. Revise the concept or reference assets before trying again.";
  }
  return body.error?.message || `The video provider returned HTTP ${status}.`;
}

function providerErrorCategory(status: number, body: OpenAiVideoJob) {
  const errorText = `${body.error?.code ?? ""} ${body.error?.message ?? ""}`.toLowerCase();
  if (status === 429) return "provider_rate_limited";
  if (errorText.includes("moderation") || errorText.includes("safety") || errorText.includes("content_policy")) return "provider_moderation";
  return "provider_error";
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

function usableAssetUrls(assets?: string[]) {
  return (assets ?? []).filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:";
    } catch {
      return false;
    }
  }).slice(0, 3);
}

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
  if (address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (!isIP(address) || address.includes(":")) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

async function assertPublicReferenceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Reference images must use a public HTTPS URL.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Reference image host is not public.");
  }
  return url;
}

async function googleImageFromUrl(url: string) {
  const publicUrl = await assertPublicReferenceUrl(url);
  const response = await fetch(publicUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Reference image returned HTTP ${response.status}.`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("Reference asset is not an image.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 12 * 1024 * 1024) throw new Error("Reference image is larger than 12 MB.");
  return { imageBytes: Buffer.from(bytes).toString("base64"), mimeType };
}

async function parseJob(response: Response) {
  return await response.json().catch(() => ({})) as OpenAiVideoJob;
}

function providerException(error: unknown) {
  const message = error instanceof Error ? error.message : "The video provider request failed.";
  const lower = message.toLowerCase();
  const moderated = lower.includes("moderation") || lower.includes("safety") || lower.includes("content policy");
  const timedOut = lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort");
  return {
    ok: false as const,
    errorCategory: moderated
      ? "provider_moderation"
      : timedOut
        ? "provider_timeout"
        : lower.includes("429") || lower.includes("rate")
          ? "provider_rate_limited"
          : "provider_error",
    safeMessage:
      moderated
        ? "The video provider's safety review rejected this request. Revise the concept or reference assets before trying again."
        : timedOut
          ? "The video provider timed out before completing the request. It is safe to retry."
          : lower.includes("api key") || lower.includes("credential") || lower.includes("401") || lower.includes("403")
        ? "The video provider rejected its credentials."
        : "The video provider could not complete the request.",
    retryable: timedOut || lower.includes("429") || lower.includes("500") || lower.includes("503")
  };
}

export class OpenAiVideoAdapter implements VideoGenerationProvider {
  providerKey = "openai_video";

  async createVideo(
    context: ProviderContext,
    input: { prompt: string; assets?: string[]; durationSeconds?: number; aspectRatio?: string; model?: string; quality?: "economy" | "balanced" | "premium" }
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
        errorCategory: providerErrorCategory(response.status, body),
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
        errorCategory: providerErrorCategory(response.status, body),
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
    input: { prompt: string; assets?: string[]; durationSeconds?: number; aspectRatio?: string; model?: string; quality?: "economy" | "balanced" | "premium" }
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
      const assetUrls = usableAssetUrls(input.assets);
      const images = await Promise.all(assetUrls.map(googleImageFromUrl));
      const model = input.model || configuration.model;
      const supportsReferenceImages = images.length > 0 && !model.includes("lite");
      const image = !supportsReferenceImages ? images[0] : undefined;
      const effectiveSeconds = supportsReferenceImages ? 8 : seconds;
      const operation = await ai.models.generateVideos({
        model,
        prompt: input.prompt,
        ...(image ? { image } : {}),
        config: {
          numberOfVideos: 1,
          durationSeconds: effectiveSeconds,
          aspectRatio: aspectRatioFor(input.aspectRatio),
          resolution: "720p",
          generateAudio: true,
          ...(supportsReferenceImages
            ? { referenceImages: images.map((referenceImage) => ({ image: referenceImage, referenceType: VideoGenerationReferenceType.ASSET })) }
            : {})
        }
      });
      if (!operation.name) return providerException("The provider did not return an operation ID.");
      return {
        ok: true,
        providerRequestId: operation.name,
        providerCostCents: effectiveSeconds * configuration.providerCostCentsPerSecond,
        data: {
          jobId: operation.name,
          status: operation.done ? "completed" : "queued",
          usage: {
            providerKey: this.providerKey,
            providerResourceId: operation.name,
            featureKey: "premium_video",
            unitType: "video_second",
            quantity: effectiveSeconds,
            providerCostCents: effectiveSeconds * configuration.providerCostCentsPerSecond,
            metadata: {
              model,
              aspectRatio: aspectRatioFor(input.aspectRatio),
              resolution: "720p",
              sourceAssetCount: assetUrls.length,
              imageToVideo: Boolean(image),
              referenceImageCount: supportsReferenceImages ? images.length : 0,
              requestedQuality: input.quality ?? "economy"
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
  return VIDEO_PROVIDER_CAPABILITIES;
}

export const VIDEO_PROVIDER_CAPABILITIES: VideoProviderCapability[] = [
  {
    providerKey: "google_veo",
    displayName: "Google Veo 3.1",
    adapterStatus: "live",
    textToVideo: true,
    imageToVideo: true,
    referenceImages: 3,
    nativeAspectRatios: ["16:9", "9:16"],
    asyncJobs: true,
    notes: "Default managed provider; square deliverables are created by Ferocity finishing from a source render."
  },
  {
    providerKey: "openai_video",
    displayName: "OpenAI Sora 2 (legacy)",
    adapterStatus: "legacy",
    textToVideo: true,
    imageToVideo: true,
    referenceImages: 1,
    nativeAspectRatios: ["16:9", "9:16"],
    asyncJobs: true,
    notes: "Retained for existing jobs only; the current Sora API is scheduled to shut down September 24, 2026."
  },
  {
    providerKey: "elevenlabs_flows",
    displayName: "ElevenLabs Image & Video",
    adapterStatus: "evaluated",
    textToVideo: true,
    imageToVideo: true,
    referenceImages: 3,
    nativeAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    asyncJobs: true,
    notes: "Strong UGC assembly candidate for voice, lip-sync, references, and localization. API use requires a Pro workspace and certification before activation."
  },
  {
    providerKey: "runway",
    displayName: "Runway",
    adapterStatus: "evaluated",
    textToVideo: true,
    imageToVideo: true,
    referenceImages: 7,
    nativeAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    asyncJobs: true,
    notes: "Strong future fallback/router candidate; no additional paid dependency is required for launch."
  },
  {
    providerKey: "luma",
    displayName: "Luma Dream Machine",
    adapterStatus: "evaluated",
    textToVideo: true,
    imageToVideo: true,
    referenceImages: 2,
    nativeAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    asyncJobs: true,
    notes: "Capable future provider, but adding another credential and billing relationship is unnecessary today."
  }
];

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

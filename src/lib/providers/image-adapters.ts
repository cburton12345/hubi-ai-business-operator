import crypto from "node:crypto";
import { inflateSync } from "node:zlib";
import { env } from "@/lib/env";
import type { ImageGenerationProvider, ProviderContext, ProviderResult, ProviderUsage } from "@/lib/providers/interfaces";
import { sanitizeImageUsageEvidence } from "@/lib/providers/image-usage-cost";

export type ManagedImageModel = "gpt-image-2.5-flare" | "gpt-image-2.5-sunburst";
export type ManagedImageConfiguration = { providerKey: "openai_image"; apiKey: string; model: ManagedImageModel; globalMonthlyBudgetCents: number; workspaceMonthlyBudgetCents: number; providerCostCentsPerImage: number; customerPriceCentsPerImage: number };
const models = new Set<ManagedImageModel>(["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]);
const sizes = new Set(["1024x1024", "1536x1024", "1024x1536"]);
const positive = (value?: string) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const maxDecodedImageBytes = 20 * 1024 * 1024;
const maxProviderResponseBytes = Math.ceil(maxDecodedImageBytes / 3) * 4 + 256 * 1024;

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Managed image outputs deliberately accept only non-interlaced, 8-bit RGB or
 * RGBA PNGs. Keeping the accepted subset small makes structural validation and
 * decoded-size bounds deterministic before bytes reach storage or a decoder.
 */
function validPng(bytes: Buffer, expectedSize: string) {
  if (bytes.length < 45 || bytes.length > 20 * 1024 * 1024 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return false;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let sawHeader = false;
  let sawEnd = false;
  const imageData: Buffer[] = [];
  let imageDataStarted = false;
  let imageDataEnded = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > 20 * 1024 * 1024 || end > bytes.length) return false;
    const type = bytes.subarray(offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(Buffer.concat([type, data])) !== bytes.readUInt32BE(offset + 8 + length)) return false;
    const name = type.toString("ascii");
    if (!sawHeader) {
      if (name !== "IHDR" || length !== 13) return false;
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9];
      if (width < 1 || height < 1 || width > 4096 || height > 4096 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) return false;
      sawHeader = true;
    } else if (name === "IDAT") {
      if (imageDataEnded) return false;
      imageDataStarted = true;
      imageData.push(data);
    }
    else if (name === "IEND") { if (length !== 0) return false; sawEnd = true; offset = end; break; }
    else if (name.charCodeAt(0) >= 65 && name.charCodeAt(0) <= 90) return false;
    else if (imageDataStarted) imageDataEnded = true;
    offset = end;
  }
  const [expectedWidth, expectedHeight] = expectedSize.split("x").map(Number);
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!sawHeader || !sawEnd || offset !== bytes.length || !channels || !imageData.length || bitDepth !== 8 || width !== expectedWidth || height !== expectedHeight) return false;
  try {
    const rowLength = 1 + width * channels;
    const expectedLength = height * rowLength;
    const inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedLength });
    if (inflated.length !== expectedLength) return false;
    for (let row = 0; row < height; row += 1) if (inflated[row * rowLength] > 4) return false;
    return true;
  } catch { return false; }
}

export function getManagedImageConfiguration(): ManagedImageConfiguration | null {
  const provider = env.IMAGE_PROVIDER?.trim().toLowerCase();
  const model = env.IMAGE_MODEL?.trim() as ManagedImageModel | undefined;
  const apiKey = env.IMAGE_API_KEY ?? env.OPENAI_API_KEY;
  const globalMonthlyBudgetCents = positive(env.IMAGE_MONTHLY_BUDGET_CENTS);
  const workspaceMonthlyBudgetCents = positive(env.IMAGE_WORKSPACE_MONTHLY_BUDGET_CENTS);
  const providerCostCentsPerImage = positive(env.IMAGE_PROVIDER_COST_CENTS_PER_IMAGE);
  const customerPriceCentsPerImage = positive(env.IMAGE_CUSTOMER_PRICE_CENTS_PER_IMAGE);
  if (env.IMAGE_GENERATION_ENABLED?.toLowerCase() !== "true" || !["openai", "openai_image"].includes(provider ?? "") || !apiKey || !model || !models.has(model) || !globalMonthlyBudgetCents || !workspaceMonthlyBudgetCents || !providerCostCentsPerImage || !customerPriceCentsPerImage || customerPriceCentsPerImage <= providerCostCentsPerImage) return null;
  return { providerKey: "openai_image", apiKey, model, globalMonthlyBudgetCents, workspaceMonthlyBudgetCents, providerCostCentsPerImage, customerPriceCentsPerImage };
}

type OpenAiBody = { data?: Array<{ b64_json?: string }>; usage?: Record<string, unknown>; error?: { code?: string; message?: string } };
async function readBoundedJson(response: Response, limit: number): Promise<OpenAiBody | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > limit) {
        await reader.cancel("provider response exceeded managed image limit").catch(() => undefined);
        return null;
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as OpenAiBody;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
function exceptionResult(error: unknown): ProviderResult<never> {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const timeout = message.includes("timeout") || message.includes("timed out") || message.includes("abort");
  return { ok: false, errorCategory: timeout ? "provider_timeout" : "provider_transport_unknown", safeMessage: timeout ? "The image provider timed out, so the outcome is unknown and automatic resubmission is paused." : "The provider connection ended without a confirmed outcome, so automatic resubmission is paused.", retryable: true };
}

export class OpenAiImageAdapter implements ImageGenerationProvider {
  providerKey = "openai_image";
  constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly responseByteLimit = maxProviderResponseBytes) {}
  async createImage(context: ProviderContext, input: { prompt: string; assets?: string[]; size?: string; model?: string }): Promise<ProviderResult<{ imageUrl?: string; imageBuffer?: ArrayBuffer; usage: ProviderUsage }>> {
    const config = getManagedImageConfiguration();
    if (!context.liveActionsEnabled || !config) return { ok: false, errorCategory: "provider_not_configured", safeMessage: "Managed image generation is paused until its provider, model, profitable pricing, and cost caps are configured.", retryable: false };
    const prompt = input.prompt.trim();
    if (prompt.length < 12 || prompt.length > 6000) return { ok: false, errorCategory: "invalid_request", safeMessage: "The image prompt must be between 12 and 6,000 characters.", retryable: false };
    if (input.assets?.length) return { ok: false, errorCategory: "unsupported_asset_input", safeMessage: "This renderer currently supports text-to-image only; source assets were not submitted.", retryable: false };
    const model = input.model ?? config.model;
    const size = input.size ?? "1024x1024";
    if (!models.has(model as ManagedImageModel) || !sizes.has(size)) return { ok: false, errorCategory: "invalid_request", safeMessage: "The requested image model or size is not supported.", retryable: false };
    try {
      const timeoutSignal = AbortSignal.timeout(120_000);
      const response = await this.fetchImpl("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": context.idempotencyKey }, body: JSON.stringify({ model, prompt, n: 1, size, quality: "medium", output_format: "png", safety_identifier: crypto.createHash("sha256").update(context.tenantId).digest("hex") }), cache: "no-store", signal: timeoutSignal });
      const body = await readBoundedJson(response, this.responseByteLimit);
      if (!body) return { ok: false, errorCategory: "invalid_provider_response", safeMessage: "The image provider response was malformed or exceeded the managed response limit, so the outcome requires review.", retryable: true };
      if (!response.ok) {
        const detail = `${body.error?.code ?? ""} ${body.error?.message ?? ""}`.toLowerCase();
        const moderation = detail.includes("safety") || detail.includes("moderation") || detail.includes("content_policy");
        return { ok: false, errorCategory: moderation ? "provider_moderation" : response.status === 429 ? "provider_rate_limited" : "provider_error", safeMessage: moderation ? "The image provider's safety review rejected this request." : response.status === 401 || response.status === 403 ? "The image provider rejected its credentials." : `The image provider returned HTTP ${response.status}.`, retryable: response.status === 429 || response.status >= 500 };
      }
      const encoded = body.data?.[0]?.b64_json;
      if (!encoded) return { ok: false, errorCategory: "invalid_provider_response", safeMessage: "The image provider returned no image data, so the outcome requires review.", retryable: true };
      const bytes = Buffer.from(encoded, "base64");
      if (!validPng(bytes, size)) return { ok: false, errorCategory: "invalid_provider_response", safeMessage: "The image provider returned a PNG with invalid encoding or dimensions, so the outcome requires review.", retryable: true };
      const providerUsageEvidence = sanitizeImageUsageEvidence(body.usage);
      const usage: ProviderUsage = { providerKey: this.providerKey, featureKey: "managed_image_ad", unitType: "image", quantity: 1, providerCostCents: config.providerCostCentsPerImage, metadata: { model, size, providerUsageEvidence, reconciliation: providerUsageEvidence ? "pending_usage_cost" : "unreconciled_usage" } };
      return { ok: true, providerRequestId: response.headers.get("x-request-id") ?? undefined, providerCostCents: config.providerCostCentsPerImage, data: { imageBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), usage } };
    } catch (error) { return exceptionResult(error); }
  }
}
export const getImageGenerationProvider = (key: string) => ["openai", "openai_image"].includes(key.toLowerCase()) ? new OpenAiImageAdapter() : null;

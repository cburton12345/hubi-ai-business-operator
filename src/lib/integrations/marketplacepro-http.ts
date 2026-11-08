import type { NextRequest } from "next/server";
import { MARKETPLACEPRO_MAX_REQUEST_BYTES } from "@/lib/integrations/marketplacepro-delivery";
import { consumePublicRateLimit } from "@/lib/security/rate-limit";

export type MarketplaceProHttpFailure = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export async function readBoundedMarketplaceProBody(
  request: Request,
  maxBytes = MARKETPLACEPRO_MAX_REQUEST_BYTES,
): Promise<{ ok: true; rawBody: string } | MarketplaceProHttpFailure> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    return { ok: false, status: 413, code: "payload_too_large", error: "MarketplacePro payload is too large." };
  }

  if (!request.body) return { ok: true, rawBody: "" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let rawBody = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, code: "payload_too_large", error: "MarketplacePro payload is too large." };
      }
      rawBody += decoder.decode(chunk.value, { stream: true });
    }
    rawBody += decoder.decode();
    return { ok: true, rawBody };
  } catch {
    return { ok: false, status: 400, code: "invalid_encoding", error: "MarketplacePro payload must be valid UTF-8." };
  } finally {
    reader.releaseLock();
  }
}

export async function prepareMarketplaceProHttpRequest(request: NextRequest, scope: string) {
  const rateLimit = await consumePublicRateLimit({
    request,
    scope: `marketplacepro:${scope}`,
    limit: 120,
    windowSeconds: 300,
  });
  if (!rateLimit.allowed) {
    return {
      ok: false as const,
      status: 429,
      code: "rate_limited",
      error: "Too many MarketplacePro delivery attempts. Retry later.",
    };
  }
  return readBoundedMarketplaceProBody(request);
}

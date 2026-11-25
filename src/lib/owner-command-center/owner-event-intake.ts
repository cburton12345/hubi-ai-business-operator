import { z } from "zod";

export const OWNER_EVENT_BODY_LIMIT_BYTES = 128 * 1024;

const safeActionHref = z.string().trim().max(500).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Action link must be an app-relative path or credential-free HTTPS URL.");

export const ownerEventSchema = z.object({
  tenantId: z.string().uuid(),
  platformKey: z.string().trim().min(1).max(80),
  platformName: z.string().trim().min(1).max(120),
  externalEventId: z.string().trim().min(1).max(180),
  eventType: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(220),
  summary: z.string().trim().min(1).max(1200),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).default("info"),
  status: z.enum(["open", "needs_owner", "critical", "ai_handled", "watching", "resolved", "archived"]).default("open"),
  ownerAttention: z.boolean().default(false),
  aiHandled: z.boolean().default(false),
  aiSummary: z.string().trim().max(1200).optional(),
  recommendedAction: z.string().trim().max(1200).optional(),
  actionHref: safeActionHref.optional(),
  moneyCents: z.number().int().nonnegative().max(9_000_000_000_000).default(0),
  riskType: z.enum(["revenue", "financial", "customer", "legal", "safety", "automation", "low_confidence", "approval"]).optional(),
  confidenceScore: z.number().int().min(0).max(100).default(80),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.string().max(120), z.unknown()).default({}),
}).strict();

export type OwnerEventInput = z.infer<typeof ownerEventSchema>;

export class OwnerEventRequestError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "OwnerEventRequestError";
  }
}

export async function readBoundedJson(request: Request, limit = OWNER_EVENT_BODY_LIMIT_BYTES): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new OwnerEventRequestError(413, "Owner event payload is too large.");
  }
  if (!request.body) throw new OwnerEventRequestError(400, "Invalid JSON payload.");

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > limit) {
        await reader.cancel("payload_limit_exceeded").catch(() => undefined);
        throw new OwnerEventRequestError(413, "Owner event payload is too large.");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new OwnerEventRequestError(400, "Invalid JSON payload.");
  }
}

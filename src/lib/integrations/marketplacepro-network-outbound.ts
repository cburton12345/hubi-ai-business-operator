import "server-only";
import { z } from "zod";

const uuid = z.string().uuid();
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const marketplaceProContractorRequestSchema = z.object({
  externalOpportunityId: uuid,
  externalEventId: boundedText(180),
  clientName: boundedText(180),
  clientExternalId: boundedText(180).optional(),
  contactName: boundedText(160),
  city: boundedText(120),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  zip: z.string().trim().max(10).optional(),
  trades: z.array(boundedText(120)).min(1).max(50),
  description: boundedText(5_000),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  deadlineAt: z.string().datetime({ offset: true }).optional(),
  customerBudget: z.number().finite().nonnegative().max(100_000_000).optional(),
  expectedContractorCost: z.number().finite().nonnegative().max(100_000_000).optional(),
  workersNeeded: z.number().int().min(1).max(10_000).default(1),
  requiredInsurance: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean()])).default({}),
  licensingRequirements: z.array(boundedText(500)).max(100).default([]),
}).strict();

export const marketplaceProOperationalCallbackSchema = z.object({
  externalEventId: boundedText(180),
  eventType: z.enum([
    "worker.responded",
    "labor_request.screened",
    "job.accepted",
    "assignment.dispatched",
    "assignment.en_route",
    "assignment.arrived",
    "assignment.in_progress",
    "assignment.paused",
    "assignment.completed",
    "assignment.disputed",
    "assignment.cancelled",
    "assignment.no_show",
    "assignment.scheduled",
  ]),
  laborRequestId: uuid.optional(),
  workerMatchId: uuid.optional(),
  assignmentId: uuid.optional(),
  status: boundedText(80).optional(),
  summary: boundedText(1_000).optional(),
  explicitAcceptance: z.boolean().optional(),
  qualified: z.boolean().optional(),
  selected: z.boolean().optional(),
  confirmed: z.boolean().optional(),
  actualHours: z.number().finite().nonnegative().max(10_000).optional(),
  workerConfirmedCompletion: z.boolean().optional(),
  requesterConfirmedCompletion: z.boolean().optional(),
}).strict().refine(
  (value) => Boolean(value.laborRequestId || value.workerMatchId || value.assignmentId),
  { message: "A labor request, worker match, or assignment ID is required." },
).superRefine((value, context) => {
  if (value.eventType === "job.accepted" && value.explicitAcceptance !== true) {
    context.addIssue({ code: "custom", path: ["explicitAcceptance"], message: "Binding job acceptance must be explicit." });
  }
});

const marketplaceProVendorOutreachSchema = z.object({
  id: uuid,
  prospect_id: uuid,
  application_id: uuid.nullable().optional(),
  contact_id: uuid.nullable().optional(),
  channel_id: uuid.nullable().optional(),
  channel: z.enum(["email", "sms", "call", "portal"]),
  recipient: boundedText(500),
  subject: z.string().max(500).nullable().optional(),
  message_body: boundedText(5_000),
  purpose: z.enum(["initial_application", "document_request", "follow_up", "reply", "status_check", "opportunity"]),
  status: z.literal("queued"),
  idempotency_key: boundedText(200),
  scheduled_for: z.string().datetime({ offset: true }).nullable().optional(),
  attempt_count: z.number().int().min(1).max(20),
}).passthrough();

const marketplaceProVendorClaimResponseSchema = z.object({
  ok: z.literal(true),
  outreach: z.array(marketplaceProVendorOutreachSchema).max(25),
}).passthrough();

export const marketplaceProVendorOutreachResultSchema = z.object({
  outreachId: uuid,
  status: z.enum(["sent", "delivered", "replied", "failed"]),
  providerMessageId: boundedText(300).optional(),
  error: z.string().trim().max(1_000).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "failed" && !value.error) context.addIssue({ code: "custom", path: ["error"], message: "Failed delivery requires a safe error summary." });
});

export type MarketplaceProContractorRequest = z.infer<typeof marketplaceProContractorRequestSchema>;
export type MarketplaceProOperationalCallback = z.infer<typeof marketplaceProOperationalCallbackSchema>;

type MarketplaceProNetworkConfig = { baseUrl?: string; secret?: string };
type FetchLike = typeof fetch;

function endpoint(baseUrl: string | undefined, path: string) {
  if (!baseUrl) throw new Error("MarketplacePro outbound integration is not configured.");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("MarketplacePro outbound integration requires a credential-free HTTPS origin.");
  }
  return new URL(path, parsed.origin).toString();
}

async function boundedJson(response: Response, maximumBytes = 64 * 1024) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("MarketplacePro returned an oversized response.");
  if (!response.body) return {};
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error("MarketplacePro returned an oversized response.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(merged);
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("MarketplacePro returned an invalid response.");
  }
}

async function sendMarketplacePro(
  path: string,
  payload: Record<string, unknown>,
  options: { config?: MarketplaceProNetworkConfig; fetcher?: FetchLike } = {},
) {
  const config = options.config ?? {
    baseUrl: process.env.MARKETPLACEPRO_NETWORK_BASE_URL,
    secret: process.env.MARKETPLACEPRO_NETWORK_SECRET,
  };
  if (!config.secret || config.secret.length < 16) {
    throw new Error("MarketplacePro outbound integration is not configured.");
  }
  const response = await (options.fetcher ?? fetch)(endpoint(config.baseUrl, path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ferocity-connect-token": config.secret,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const responseBody = await boundedJson(response);
  if (!response.ok) {
    throw new Error(`MarketplacePro request failed with status ${response.status}.`);
  }
  return responseBody;
}

export async function requestMarketplaceProContractors(
  input: MarketplaceProContractorRequest,
  options: { config?: MarketplaceProNetworkConfig; fetcher?: FetchLike } = {},
) {
  const parsed = marketplaceProContractorRequestSchema.parse(input);
  const payload = {
    externalOpportunityId: parsed.externalOpportunityId,
    external_event_id: parsed.externalEventId,
    clientName: parsed.clientName,
    client_external_id: parsed.clientExternalId,
    contactName: parsed.contactName,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    trades: parsed.trades,
    description: parsed.description,
    priority: parsed.priority,
    deadline_at: parsed.deadlineAt,
    customer_budget: parsed.customerBudget,
    expected_contractor_cost: parsed.expectedContractorCost,
    workers_needed: parsed.workersNeeded,
    required_insurance: parsed.requiredInsurance,
    licensing_requirements: parsed.licensingRequirements,
  };
  return sendMarketplacePro("/.netlify/functions/maintenance-opportunity-intake", payload, options);
}

export async function sendMarketplaceProOperationalCallback(
  input: MarketplaceProOperationalCallback,
  options: { config?: MarketplaceProNetworkConfig; fetcher?: FetchLike } = {},
) {
  const payload = marketplaceProOperationalCallbackSchema.parse(input);
  return sendMarketplacePro("/.netlify/functions/labor-connect-callback", payload, options);
}

export async function claimMarketplaceProVendorOutreach(
  limit = 10,
  options: { config?: MarketplaceProNetworkConfig; fetcher?: FetchLike } = {},
) {
  const payload = { limit: z.number().int().min(1).max(25).parse(limit) };
  const response = await sendMarketplacePro("/.netlify/functions/facility-vendor-outreach-claim", payload, options);
  return marketplaceProVendorClaimResponseSchema.parse(response).outreach;
}

export async function reportMarketplaceProVendorOutreachResult(
  input: z.infer<typeof marketplaceProVendorOutreachResultSchema>,
  options: { config?: MarketplaceProNetworkConfig; fetcher?: FetchLike } = {},
) {
  const payload = marketplaceProVendorOutreachResultSchema.parse(input);
  return sendMarketplacePro("/.netlify/functions/facility-vendor-outreach-result", payload, options);
}

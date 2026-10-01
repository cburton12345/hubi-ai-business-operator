import { z } from "zod";
import { resilientFetch } from "@/lib/http/resilient-fetch";

const API_ROOT = "https://business-api.tiktok.com/open_api/v1.3";

const envelopeSchema = z.object({
  code: z.number(),
  message: z.string().default(""),
  request_id: z.string().optional(),
  data: z.unknown().optional()
});

const tokenDataSchema = z.object({
  access_token: z.string().min(1),
  advertiser_ids: z.array(z.string()).default([]),
  scope: z.array(z.string()).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().optional(),
  refresh_expires_in: z.number().int().positive().optional()
}).passthrough();

export type TikTokBusinessToken = z.infer<typeof tokenDataSchema>;

export function buildTikTokBusinessAuthorizationUrl(input: {
  appId: string;
  state: string;
  redirectUri: string;
  scopes?: string[];
}) {
  const url = new URL("https://ads.tiktok.com/marketing_api/auth");
  url.searchParams.set("app_id", input.appId);
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  if (input.scopes?.length) url.searchParams.set("scope", input.scopes.join(","));
  return url;
}

async function parseEnvelope(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`TikTok for Business returned HTTP ${response.status}.`);
  const parsed = envelopeSchema.parse(body);
  if (parsed.code !== 0) throw new Error(parsed.message || `TikTok for Business error ${parsed.code}.`);
  return parsed;
}

export async function exchangeTikTokBusinessAuthorizationCode(input: {
  appId: string;
  appSecret: string;
  authCode: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await (input.fetchImpl ?? fetch)(`${API_ROOT}/tt_user/oauth2/token/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: input.appId,
      client_secret: input.appSecret,
      grant_type: "authorization_code",
      auth_code: input.authCode,
      redirect_uri: input.redirectUri
    }),
    cache: "no-store"
  });
  const envelope = await parseEnvelope(response);
  return tokenDataSchema.parse(envelope.data);
}

export async function callTikTokBusinessApi<T>(input: {
  accessToken: string;
  endpoint: string;
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  schema: z.ZodType<T>;
  fetchImpl?: typeof fetch;
}) {
  const url = new URL(`${API_ROOT}/${input.endpoint.replace(/^\/+/, "")}`);
  Object.entries(input.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await (input.fetchImpl ?? resilientFetch)(url, {
    method: input.method ?? "GET",
    headers: {
      "Access-Token": input.accessToken,
      ...(input.body ? { "content-type": "application/json" } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    cache: "no-store"
  });
  const envelope = await parseEnvelope(response);
  return {
    data: input.schema.parse(envelope.data),
    requestId: envelope.request_id
  };
}

const advertiserListSchema = z.object({
  list: z.array(z.object({
    advertiser_id: z.string(),
    advertiser_name: z.string().optional()
  }).passthrough()).default([])
}).passthrough();

export function listTikTokAdvertisers(accessToken: string, fetchImpl?: typeof fetch) {
  return callTikTokBusinessApi({
    accessToken,
    endpoint: "oauth2/advertiser/get/",
    schema: advertiserListSchema,
    fetchImpl
  });
}

export function listTikTokCampaigns(input: {
  accessToken: string;
  advertiserId: string;
  page?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
}) {
  return callTikTokBusinessApi({
    accessToken: input.accessToken,
    endpoint: "campaign/get/",
    query: {
      advertiser_id: input.advertiserId,
      page: String(input.page ?? 1),
      page_size: String(input.pageSize ?? 50)
    },
    schema: z.object({ list: z.array(z.record(z.string(), z.unknown())).default([]), page_info: z.record(z.string(), z.unknown()).optional() }).passthrough(),
    fetchImpl: input.fetchImpl
  });
}

export function getTikTokIntegratedReport(input: {
  accessToken: string;
  advertiserId: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics?: string[];
  fetchImpl?: typeof fetch;
}) {
  return callTikTokBusinessApi({
    accessToken: input.accessToken,
    endpoint: "report/integrated/get/",
    query: {
      advertiser_id: input.advertiserId,
      report_type: "BASIC",
      data_level: "AUCTION_ADVERTISER",
      dimensions: JSON.stringify(input.dimensions ?? ["stat_time_day"]),
      metrics: JSON.stringify(input.metrics ?? ["spend", "impressions", "clicks", "conversion"]),
      start_date: input.startDate,
      end_date: input.endDate,
      page: "1",
      page_size: "1000"
    },
    schema: z.object({ list: z.array(z.record(z.string(), z.unknown())).default([]), page_info: z.record(z.string(), z.unknown()).optional() }).passthrough(),
    fetchImpl: input.fetchImpl
  });
}

export function createTikTokCampaign(input: {
  accessToken: string;
  advertiserId: string;
  campaign: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}) {
  return callTikTokBusinessApi({
    accessToken: input.accessToken,
    endpoint: "campaign/create/",
    method: "POST",
    body: { advertiser_id: input.advertiserId, ...input.campaign },
    schema: z.object({ campaign_id: z.string() }).passthrough(),
    fetchImpl: input.fetchImpl
  });
}

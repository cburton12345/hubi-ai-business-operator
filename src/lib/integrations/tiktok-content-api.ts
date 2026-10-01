import { z } from "zod";

const API_ROOT = "https://open.tiktokapis.com/v2";
const errorSchema = z.object({ code: z.string(), message: z.string().optional(), log_id: z.string().optional() }).optional();

async function post<T>(input: { accessToken: string; path: string; body?: Record<string, unknown>; schema: z.ZodType<T>; fetchImpl?: typeof fetch }) {
  const response = await (input.fetchImpl ?? fetch)(`${API_ROOT}/${input.path.replace(/^\/+/, "")}`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify(input.body ?? {}),
    cache: "no-store"
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`TikTok Content Posting returned HTTP ${response.status}.`);
  const envelope = z.object({ data: input.schema, error: errorSchema }).parse(raw);
  if (envelope.error?.code && envelope.error.code !== "ok") throw new Error(envelope.error.message || envelope.error.code);
  return { data: envelope.data, logId: envelope.error?.log_id };
}

export function queryTikTokCreatorInfo(accessToken: string, fetchImpl?: typeof fetch) {
  return post({
    accessToken,
    path: "post/publish/creator_info/query/",
    schema: z.object({
      creator_username: z.string(), creator_nickname: z.string(), privacy_level_options: z.array(z.string()),
      comment_disabled: z.boolean(), duet_disabled: z.boolean(), stitch_disabled: z.boolean(), max_video_post_duration_sec: z.number().int()
    }).passthrough(),
    fetchImpl
  });
}

export function initializeTikTokDirectPost(input: {
  accessToken: string;
  title: string;
  privacyLevel: string;
  videoUrl: string;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  aiGenerated?: boolean;
  brandedContent?: "own_business" | "paid_partnership" | "none";
  fetchImpl?: typeof fetch;
}) {
  return post({
    accessToken: input.accessToken,
    path: "post/publish/video/init/",
    body: {
      post_info: {
        title: input.title,
        privacy_level: input.privacyLevel,
        disable_comment: input.disableComment ?? false,
        disable_duet: input.disableDuet ?? false,
        disable_stitch: input.disableStitch ?? false,
        video_cover_timestamp_ms: 1000,
        brand_content_toggle: input.brandedContent === "paid_partnership",
        brand_organic_toggle: (input.brandedContent ?? "own_business") === "own_business",
        ...(input.aiGenerated ? { is_aigc: true } : {})
      },
      source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl }
    },
    schema: z.object({ publish_id: z.string() }).passthrough(),
    fetchImpl: input.fetchImpl
  });
}

export function fetchTikTokPublishStatus(accessToken: string, publishId: string, fetchImpl?: typeof fetch) {
  return post({
    accessToken,
    path: "post/publish/status/fetch/",
    body: { publish_id: publishId },
    schema: z.object({
      status: z.string(),
      fail_reason: z.string().optional(),
      publicaly_available_post_id: z.array(z.union([z.string(), z.number()])).optional()
    }).passthrough().transform((value) => ({
      ...value,
      publicly_available_post_id: value.publicaly_available_post_id?.map(String) ?? []
    })),
    fetchImpl
  });
}

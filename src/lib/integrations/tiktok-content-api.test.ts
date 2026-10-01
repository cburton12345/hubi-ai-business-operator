import { describe, expect, it, vi } from "vitest";
import { fetchTikTokPublishStatus, initializeTikTokDirectPost, queryTikTokCreatorInfo } from "./tiktok-content-api";

const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: "ok", message: "", log_id: "log-1" } }), { status: 200 });

describe("TikTok Content Posting API", () => {
  it("queries creator settings before a post", async () => {
    const fetchImpl = vi.fn(async () => ok({ creator_username: "ferocity", creator_nickname: "Ferocity", privacy_level_options: ["SELF_ONLY"], comment_disabled: false, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 300 }));
    const result = await queryTikTokCreatorInfo("token", fetchImpl as typeof fetch);
    expect(result.data.privacy_level_options).toContain("SELF_ONLY");
  });

  it("initializes a URL-pull post and carries the AI-generated disclosure", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.source_info.source).toBe("PULL_FROM_URL");
      expect(body.post_info.is_aigc).toBe(true);
      expect(body.post_info.brand_organic_toggle).toBe(true);
      expect(body.post_info.brand_content_toggle).toBe(false);
      return ok({ publish_id: "publish-1" });
    });
    const result = await initializeTikTokDirectPost({ accessToken: "token", title: "A useful update", privacyLevel: "SELF_ONLY", videoUrl: "https://ferocity.live/video.mp4", aiGenerated: true, fetchImpl: fetchImpl as typeof fetch });
    expect(result.data.publish_id).toBe("publish-1");
  });

  it("polls publish status", async () => {
    const fetchImpl = vi.fn(async () => ok({ status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["post-1"] }));
    const result = await fetchTikTokPublishStatus("token", "publish-1", fetchImpl as typeof fetch);
    expect(result.data.status).toBe("PUBLISH_COMPLETE");
    expect(result.data.publicly_available_post_id).toEqual(["post-1"]);
  });
});

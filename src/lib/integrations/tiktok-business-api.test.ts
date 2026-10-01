import { describe, expect, it, vi } from "vitest";
import { buildTikTokBusinessAuthorizationUrl, exchangeTikTokBusinessAuthorizationCode, listTikTokAdvertisers } from "./tiktok-business-api";

describe("TikTok API for Business", () => {
  it("builds the distinct Business API authorization URL", () => {
    const url = buildTikTokBusinessAuthorizationUrl({ appId: "app-123", state: "state-123", redirectUri: "https://ferocity.live/api/integrations/tiktok-business/oauth/callback" });
    expect(url.origin + url.pathname).toBe("https://ads.tiktok.com/marketing_api/auth");
    expect(url.searchParams.get("app_id")).toBe("app-123");
    expect(url.searchParams.get("state")).toBe("state-123");
  });

  it("exchanges an authorization code without exposing the app secret in the URL", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toContain("/tt_user/oauth2/token/");
      expect(String(_url)).not.toContain("secret-123");
      expect(JSON.parse(String(init?.body))).toMatchObject({ client_id: "app-123", client_secret: "secret-123", auth_code: "code-123" });
      return new Response(JSON.stringify({ code: 0, message: "OK", data: { access_token: "token-123", advertiser_ids: ["7666569270685155345"] } }), { status: 200 });
    });
    const result = await exchangeTikTokBusinessAuthorizationCode({ appId: "app-123", appSecret: "secret-123", authCode: "code-123", redirectUri: "https://ferocity.live/callback", fetchImpl: fetchImpl as typeof fetch });
    expect(result.advertiser_ids).toEqual(["7666569270685155345"]);
  });

  it("reads authorized advertisers with the access token in the header", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Access-Token")).toBe("token-123");
      return new Response(JSON.stringify({ code: 0, message: "OK", data: { list: [{ advertiser_id: "7666569270685155345", advertiser_name: "Ferocity" }] } }), { status: 200 });
    });
    const result = await listTikTokAdvertisers("token-123", fetchImpl as typeof fetch);
    expect(result.data.list[0]?.advertiser_name).toBe("Ferocity");
  });
});

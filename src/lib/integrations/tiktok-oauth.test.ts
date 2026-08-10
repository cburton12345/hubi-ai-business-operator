import { afterEach, describe, expect, it, vi } from "vitest";
import { exchangeTikTokAuthorizationCode, fetchTikTokProfile, refreshTikTokAccessToken, tokenExpiryFromNow } from "./tiktok-oauth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TikTok OAuth", () => {
  it("exchanges an authorization code without exposing credentials in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          expires_in: 86400,
          open_id: "open-id",
          refresh_expires_in: 31536000,
          refresh_token: "refresh-token",
          scope: "user.info.basic",
          token_type: "Bearer"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokens = await exchangeTikTokAuthorizationCode({
      clientKey: "client-key",
      clientSecret: "client-secret",
      code: "authorization-code",
      redirectUri: "https://ferocity.live/api/integrations/tiktok/oauth/callback"
    });

    expect(tokens.open_id).toBe("open-id");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
    expect(url).not.toContain("client-secret");
    expect(String(options.body)).toContain("client_key=client-key");
    expect(String(options.body)).toContain("client_secret=client-secret");
  });

  it("loads only the approved basic profile fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { user: { open_id: "open-id", display_name: "Ferocity" } },
          error: { code: "ok", message: "", log_id: "log-id" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTikTokProfile("access-token")).resolves.toMatchObject({
      open_id: "open-id",
      display_name: "Ferocity"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
      expect.objectContaining({ headers: { authorization: "Bearer access-token" } })
    );
  });

  it("refreshes an expired access token without placing secrets in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: "new-access-token",
        expires_in: 86400,
        open_id: "open-id",
        refresh_expires_in: 31536000,
        refresh_token: "new-refresh-token",
        scope: "user.info.basic",
        token_type: "Bearer"
      }), { status: 200, headers: { "content-type": "application/json" } })
    );

    const tokens = await refreshTikTokAccessToken({
      clientKey: "client-key",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      fetchImpl: fetchMock
    });

    expect(tokens.access_token).toBe("new-access-token");
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
    expect(url).not.toContain("client-secret");
    expect(String(options.body)).toContain("grant_type=refresh_token");
  });

  it("surfaces TikTok OAuth errors returned with HTTP 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "The refresh token is invalid." }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(refreshTikTokAccessToken({
      clientKey: "client-key",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      fetchImpl: fetchMock
    })).rejects.toThrow("TikTok OAuth: The refresh token is invalid.");
  });

  it("calculates provider expiry timestamps", () => {
    const before = Date.now() + 59_000;
    const expiry = new Date(tokenExpiryFromNow(60)).getTime();
    expect(expiry).toBeGreaterThanOrEqual(before);
    expect(expiry).toBeLessThanOrEqual(Date.now() + 61_000);
  });
});

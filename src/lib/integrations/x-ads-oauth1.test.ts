import { describe, expect, it, vi } from "vitest";
import { createOAuth1Authorization, discoverXAdAccounts, exchangeXOAuthToken, requestXOAuthToken } from "./x-ads-oauth1";

describe("X Ads OAuth 1.0a", () => {
  it("creates a signed OAuth authorization header", () => {
    const header = createOAuth1Authorization({
      method: "POST",
      url: "https://api.x.com/oauth/request_token",
      credentials: { consumerKey: "key", consumerSecret: "secret" },
      oauthExtras: { oauth_callback: "https://ferocity.live/api/integrations/x_ads/oauth/callback" },
      nonce: "nonce",
      timestamp: "1700000000"
    });
    expect(header).toContain("oauth_consumer_key=\"key\"");
    expect(header).toContain("oauth_signature_method=\"HMAC-SHA1\"");
    expect(header).toContain("oauth_signature=");
  });

  it("requests and exchanges OAuth tokens", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("oauth_token=request&oauth_token_secret=request-secret&oauth_callback_confirmed=true", { status: 200 }))
      .mockResolvedValueOnce(new Response("oauth_token=access&oauth_token_secret=access-secret&user_id=42&screen_name=ferocity", { status: 200 })) as typeof fetch;
    const request = await requestXOAuthToken({ consumerKey: "key", consumerSecret: "secret", callbackUrl: "https://ferocity.live/callback", fetchImpl });
    expect(request).toEqual({ token: "request", tokenSecret: "request-secret" });
    const access = await exchangeXOAuthToken({ consumerKey: "key", consumerSecret: "secret", requestToken: request.token, requestTokenSecret: request.tokenSecret, verifier: "verifier", fetchImpl });
    expect(access).toMatchObject({ accessToken: "access", accessTokenSecret: "access-secret", userId: "42" });
  });

  it("discovers advertiser accounts without enabling writes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "x-1", name: "Ferocity", approval_status: "ACCEPTED", currency: "USD" }] }), { status: 200 })) as typeof fetch;
    const accounts = await discoverXAdAccounts({ consumerKey: "key", consumerSecret: "secret", accessToken: "token", accessTokenSecret: "token-secret", fetchImpl });
    expect(accounts).toEqual([{ id: "x-1", name: "Ferocity", kind: "ad_account", status: "ACCEPTED", currency: "USD" }]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createOAuthPkcePair, exchangeStandardOAuthAuthorizationCode, verifyStandardOAuthIdentity } from "./standard-oauth";

const client = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://ferocity.live/oauth/callback"
};

function tokenResponse(extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    scope: "read reporting",
    token_type: "Bearer",
    ...extra
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("standard OAuth token exchange", () => {
  it("uses Google's server-side authorization code exchange", async () => {
    let requestUrl = "";
    let requestOptions: RequestInit | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      requestUrl = String(input);
      requestOptions = options;
      return tokenResponse();
    }) as typeof fetch;
    const tokens = await exchangeStandardOAuthAuthorizationCode({ provider: "google_ads", code: "code", client, fetchImpl });
    expect(requestUrl).toBe("https://oauth2.googleapis.com/token");
    expect(String(requestOptions?.body)).toContain("grant_type=authorization_code");
    expect(tokens.refreshToken).toBe("refresh-token");
  });

  it("uses Reddit basic client authentication and verifies identity", async () => {
    let requestOptions: RequestInit | undefined;
    const exchangeFetch = vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      requestOptions = options;
      return tokenResponse({ scope: "identity read adsread" });
    }) as typeof fetch;
    await exchangeStandardOAuthAuthorizationCode({ provider: "reddit", code: "code", client, fetchImpl: exchangeFetch });
    expect(String((requestOptions?.headers as Record<string, string>).authorization)).toMatch(/^Basic /);

    const identity = await verifyStandardOAuthIdentity({
      provider: "reddit",
      accessToken: "access-token",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ id: "reddit-id", name: "ferocity" }), { status: 200 })) as typeof fetch
    });
    expect(identity).toMatchObject({ accountId: "reddit-id", accountName: "ferocity" });
  });

  it("uses Microsoft's v2 token endpoint with offline Ads scope", async () => {
    let requestUrl = "";
    let requestOptions: RequestInit | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      requestUrl = String(input);
      requestOptions = options;
      return tokenResponse();
    }) as typeof fetch;
    await exchangeStandardOAuthAuthorizationCode({ provider: "microsoft_ads", code: "code", client, fetchImpl });
    expect(requestUrl).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(String(requestOptions?.body)).toContain("offline_access");
    expect(String(requestOptions?.body)).toContain("msads.manage");
  });

  it("uses Jobber's token endpoint with PKCE and verifies the connected account", async () => {
    let requestUrl = "";
    let requestOptions: RequestInit | undefined;
    const exchangeFetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      requestUrl = String(input);
      requestOptions = options;
      return tokenResponse({ scope: undefined });
    }) as typeof fetch;
    await exchangeStandardOAuthAuthorizationCode({ provider: "jobber", code: "code", codeVerifier: "verifier", client, fetchImpl: exchangeFetch });
    expect(requestUrl).toBe("https://api.getjobber.com/api/oauth/token");
    expect(String(requestOptions?.body)).toContain("code_verifier=verifier");

    const identity = await verifyStandardOAuthIdentity({
      provider: "jobber",
      accessToken: "access-token",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ data: { account: { id: "account-id", name: "Acme Service" } } }), { status: 200 })) as typeof fetch
    });
    expect(identity).toEqual({ accountId: "account-id", accountName: "Acme Service", reportingVerified: true });
  });

  it("creates an S256-compatible PKCE pair", () => {
    const pair = createOAuthPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).not.toBe(pair.verifier);
  });
});

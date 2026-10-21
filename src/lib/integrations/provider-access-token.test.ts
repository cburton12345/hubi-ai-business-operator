import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryPostgres: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
}));

vi.mock("@/lib/db/postgres", () => ({ queryPostgres: mocks.queryPostgres }));
vi.mock("@/lib/credentials/credential-vault", () => ({
  decryptSecret: mocks.decryptSecret,
  encryptSecret: mocks.encryptSecret,
}));
vi.mock("@/lib/env", () => ({
  env: {
    MICROSOFT_CLIENT_ID: "microsoft-client",
    MICROSOFT_CLIENT_SECRET: "microsoft-secret",
    REDDIT_CLIENT_ID: "reddit-client",
    REDDIT_CLIENT_SECRET: "reddit-secret",
    SNAPCHAT_CLIENT_ID: "snap-client",
    SNAPCHAT_CLIENT_SECRET: "snap-secret",
  },
}));

import { getFreshProviderAccessToken } from "@/lib/integrations/provider-access-token";

describe("getFreshProviderAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryPostgres.mockResolvedValueOnce({
      rows: [
        {
          credential_label: "oauth_access_token",
          encrypted_secret: "expired-access",
          encryption_iv: "iv",
          encryption_tag: "tag",
          rotation_due_at: "2026-09-29T00:00:00.000Z",
        },
        {
          credential_label: "oauth_refresh_token",
          encrypted_secret: "refresh-token",
          encryption_iv: "iv",
          encryption_tag: "tag",
          rotation_due_at: "2027-03-28T00:00:00.000Z",
        },
      ],
    });
    mocks.decryptSecret.mockImplementation(({ encryptedSecret }: { encryptedSecret: string }) => encryptedSecret);
    mocks.encryptSecret.mockReturnValue({
      encryptedSecret: "encrypted-new-access",
      encryptionIv: "new-iv",
      encryptionTag: "new-tag",
      secretPreview: "****oken",
      secretFingerprint: "fingerprint",
    });
    mocks.queryPostgres.mockResolvedValue({ rows: [] });
  });

  it("refreshes Microsoft Ads tokens with Microsoft credentials and the Ads scope", async () => {
    mocks.queryPostgres
      .mockReset()
      .mockResolvedValueOnce({
        rows: [
          {
            credential_label: "oauth_access_token",
            encrypted_secret: "expired-access",
            encryption_iv: "iv",
            encryption_tag: "tag",
            rotation_due_at: "2026-09-29T00:00:00.000Z",
          },
          {
            credential_label: "oauth_refresh_token",
            encrypted_secret: "refresh-token",
            encryption_iv: "iv",
            encryption_tag: "tag",
            rotation_due_at: "2027-03-28T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const token = await getFreshProviderAccessToken("tenant-1", "microsoft_ads", fetchImpl as typeof fetch);

    expect(token).toBe("new-access-token");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(request.body.toString()).toContain("client_id=microsoft-client");
    expect(request.body.toString()).toContain("client_secret=microsoft-secret");
    expect(request.body.toString()).toContain("scope=offline_access+https%3A%2F%2Fads.microsoft.com%2Fmsads.manage");
    expect(request.body.toString()).not.toContain("oauth2.googleapis.com");
    expect(mocks.queryPostgres).toHaveBeenCalledTimes(3);
  });

  it("refreshes Reddit with HTTP Basic authentication and the required user agent", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-reddit-access",
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await getFreshProviderAccessToken("tenant-1", "reddit", fetchImpl as typeof fetch);

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://www.reddit.com/api/v1/access_token");
    expect(request.headers.authorization).toBe(`Basic ${Buffer.from("reddit-client:reddit-secret").toString("base64")}`);
    expect(request.headers["user-agent"]).toContain("ferocity.live");
    expect(request.body.toString()).toContain("grant_type=refresh_token");
    expect(request.body.toString()).not.toContain("client_secret");
  });

  it("refreshes Snapchat with client credentials in the form body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-snap-access",
      refresh_token: "new-snap-refresh",
      expires_in: 3600,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await getFreshProviderAccessToken("tenant-1", "snapchat_ads", fetchImpl as typeof fetch);

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://accounts.snapchat.com/login/oauth2/access_token");
    expect(request.body.toString()).toContain("client_id=snap-client");
    expect(request.body.toString()).toContain("client_secret=snap-secret");
    expect(request.body.toString()).toContain("refresh_token=refresh-token");
  });
});

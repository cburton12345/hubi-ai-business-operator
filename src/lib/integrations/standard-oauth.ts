import crypto from "node:crypto";
import { z } from "zod";

export type StandardOAuthProvider =
  | "google_business_profile"
  | "google_ads"
  | "search_console"
  | "analytics"
  | "reddit"
  | "microsoft_ads"
  | "google_calendar"
  | "microsoft_calendar"
  | "jobber";

export type StandardOAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
  tokenType: string;
};

type OAuthClient = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional()
});

async function readTokenResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object"
      ? String((body as Record<string, unknown>).error_description ?? (body as Record<string, unknown>).error ?? "")
      : "";
    throw new Error(message || `OAuth token exchange returned HTTP ${response.status}.`);
  }
  return tokenResponseSchema.parse(body);
}

function normalizedTokenSet(payload: z.infer<typeof tokenResponseSchema>): StandardOAuthTokenSet {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in ?? 3600,
    scopes: (payload.scope ?? "").split(/[ ,]+/).filter(Boolean),
    tokenType: payload.token_type ?? "Bearer"
  };
}

export async function exchangeStandardOAuthAuthorizationCode(input: {
  provider: StandardOAuthProvider;
  code: string;
  client: OAuthClient;
  fetchImpl?: typeof fetch;
  codeVerifier?: string;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const commonBody = {
    code: input.code,
    redirect_uri: input.client.redirectUri,
    grant_type: "authorization_code"
  };

  if (input.provider === "reddit") {
    const response = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${input.client.clientId}:${input.client.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "web:ferocity.live:1.0 (Ferocity OAuth connection)"
      },
      body: new URLSearchParams(commonBody),
      cache: "no-store"
    });
    return normalizedTokenSet(await readTokenResponse(response));
  }

  const microsoft = input.provider === "microsoft_ads" || input.provider === "microsoft_calendar";
  const jobber = input.provider === "jobber";
  const response = await fetchImpl(
    jobber
      ? "https://api.getjobber.com/api/oauth/token"
      : microsoft
      ? "https://login.microsoftonline.com/common/oauth2/v2.0/token"
      : "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...commonBody,
        client_id: input.client.clientId,
        client_secret: input.client.clientSecret,
        ...(jobber && input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
        ...(microsoft ? {
          scope: input.provider === "microsoft_calendar"
            ? "offline_access openid profile User.Read Calendars.ReadWrite"
            : "offline_access https://ads.microsoft.com/msads.manage"
        } : {})
      }),
      cache: "no-store"
    }
  );
  return normalizedTokenSet(await readTokenResponse(response));
}

export async function verifyStandardOAuthIdentity(input: {
  provider: StandardOAuthProvider;
  accessToken: string;
  fetchImpl?: typeof fetch;
}) {
  if (input.provider === "jobber") {
    const response = await (input.fetchImpl ?? fetch)("https://api.getjobber.com/api/graphql", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
        "x-jobber-graphql-version": "2025-04-16"
      },
      body: JSON.stringify({ query: "query FerocityAccountIdentity { account { id name } }" }),
      cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { data?: { account?: { id?: string; name?: string } }; errors?: { message?: string }[] } | null;
    if (!response.ok || !body?.data?.account?.id || body.errors?.length) {
      throw new Error(body?.errors?.[0]?.message || "Jobber account verification failed.");
    }
    return { accountId: body.data.account.id, accountName: body.data.account.name ?? null, reportingVerified: true };
  }
  if (input.provider !== "reddit") {
    return { accountId: null, accountName: null, reportingVerified: false };
  }

  const response = await (input.fetchImpl ?? fetch)("https://oauth.reddit.com/api/v1/me", {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "user-agent": "web:ferocity.live:1.0 (Ferocity OAuth connection)"
    },
    cache: "no-store"
  });
  const body = await response.json().catch(() => null) as { id?: string; name?: string; message?: string } | null;
  if (!response.ok || !body?.id) {
    throw new Error(body?.message || "Reddit account verification failed.");
  }
  return { accountId: body.id, accountName: body.name ?? null, reportingVerified: false };
}

export function standardOAuthProviderDetails(provider: StandardOAuthProvider) {
  const details: Record<StandardOAuthProvider, {
    label: string;
    capability: string;
    plainLanguageStatus: string;
  }> = {
    google_business_profile: {
      label: "Google Business Profile",
      capability: "google_business_profile",
      plainLanguageStatus: "Google Business Profile access is connected. Publishing remains approval-gated."
    },
    google_ads: {
      label: "Google Ads",
      capability: "google_ads",
      plainLanguageStatus: "Google Ads authorization is connected. Reporting verification remains required; campaign changes and spend remain disabled."
    },
    search_console: {
      label: "Google Search Console",
      capability: "search_console",
      plainLanguageStatus: "Google Search Console read access is connected."
    },
    analytics: {
      label: "Google Analytics",
      capability: "analytics",
      plainLanguageStatus: "Google Analytics authorization is connected. Property reporting remains disabled until a verified property is selected."
    },
    reddit: {
      label: "Reddit",
      capability: "reddit_ads",
      plainLanguageStatus: "Reddit identity and read access are connected. Ad reporting still requires an authorized ad account; posting and spend remain disabled."
    },
    microsoft_ads: {
      label: "Microsoft Ads",
      capability: "microsoft_ads",
      plainLanguageStatus: "Microsoft Ads authorization is connected. Account reporting verification remains required; campaign changes and spend remain disabled."
    },
    google_calendar: {
      label: "Google Calendar",
      capability: "calendar",
      plainLanguageStatus: "Google Calendar is connected in read-only mode until a calendar is selected and outbound writes are separately enabled."
    },
    microsoft_calendar: {
      label: "Microsoft Outlook Calendar",
      capability: "calendar",
      plainLanguageStatus: "Outlook Calendar is connected in read-only mode until a calendar is selected and outbound writes are separately enabled."
    },
    jobber: {
      label: "Jobber",
      capability: "service_business_platform",
      plainLanguageStatus: "Jobber is connected for read-only business analysis. Provider-owned records remain in Jobber and write-back stays disabled."
    }
  };
  return details[provider];
}

export function createOAuthPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

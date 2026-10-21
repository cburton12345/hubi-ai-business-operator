import crypto from "node:crypto";
import { z } from "zod";

export type StandardOAuthProvider =
  | "google_business_profile"
  | "google_ads"
  | "youtube"
  | "search_console"
  | "analytics"
  | "reddit"
  | "microsoft_ads"
  | "linkedin_ads"
  | "pinterest_ads"
  | "snapchat_ads"
  | "amazon_ads"
  | "x_ads"
  | "google_calendar"
  | "microsoft_calendar"
  | "gmail_mailbox"
  | "microsoft_mailbox"
  | "jobber";

export type StandardOAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
  tokenType: string;
};

export type OAuthScopeAssessment = {
  status: "verified" | "insufficient" | "unverified";
  effectiveScopes: string[];
  grantedScopes: string[];
  missingScopes: string[];
};

function normalizedScopes(scopes: string[]) {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

const protocolScopes = new Set(["openid", "email", "profile", "offline_access"]);

export function assessOAuthScopes(requestedScopes: string[], providerReportedScopes: string[]): OAuthScopeAssessment {
  const requested = normalizedScopes(requestedScopes);
  const granted = normalizedScopes(providerReportedScopes);
  if (!granted.length) {
    return {
      status: "unverified",
      effectiveScopes: requested,
      grantedScopes: [],
      missingScopes: [],
    };
  }
  const grantedSet = new Set(granted);
  const missingScopes = requested.filter((scope) => !protocolScopes.has(scope) && !grantedSet.has(scope));
  return {
    status: missingScopes.length ? "insufficient" : "verified",
    effectiveScopes: granted,
    grantedScopes: granted,
    missingScopes,
  };
}

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

  if (input.provider === "pinterest_ads") {
    const response = await fetchImpl("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${input.client.clientId}:${input.client.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(commonBody),
      cache: "no-store"
    });
    return normalizedTokenSet(await readTokenResponse(response));
  }

  const providerTokenEndpoints: Partial<Record<StandardOAuthProvider, string>> = {
    linkedin_ads: "https://www.linkedin.com/oauth/v2/accessToken",
    snapchat_ads: "https://accounts.snapchat.com/login/oauth2/access_token",
    amazon_ads: "https://api.amazon.com/auth/o2/token"
  };

  const microsoft = input.provider === "microsoft_ads" || input.provider === "microsoft_calendar" || input.provider === "microsoft_mailbox";
  const jobber = input.provider === "jobber";
  const response = await fetchImpl(
    jobber
      ? "https://api.getjobber.com/api/oauth/token"
      : providerTokenEndpoints[input.provider]
      ? providerTokenEndpoints[input.provider]!
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
            ? "offline_access openid profile User.Read Calendars.Read"
            : input.provider === "microsoft_mailbox"
              ? "offline_access openid profile User.Read Mail.Read"
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
  if (input.provider === "youtube") {
    const response = await (input.fetchImpl ?? fetch)("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
      headers: { authorization: `Bearer ${input.accessToken}` },
      cache: "no-store"
    });
    const body = await response.json().catch(() => null) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>;
      error?: { message?: string };
    } | null;
    const channel = body?.items?.[0];
    if (!response.ok || !channel?.id) {
      throw new Error(body?.error?.message || "No YouTube channel was found for this Google account.");
    }
    return { accountId: channel.id, accountName: channel.snippet?.title ?? null, reportingVerified: true };
  }
  if (input.provider === "gmail_mailbox") {
    const response = await (input.fetchImpl ?? fetch)("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { authorization: `Bearer ${input.accessToken}` },
      cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { emailAddress?: string; historyId?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.emailAddress) throw new Error(body?.error?.message || "Gmail account verification failed.");
    return { accountId: body.emailAddress, accountName: body.emailAddress, reportingVerified: true };
  }
  if (input.provider === "microsoft_mailbox") {
    const response = await (input.fetchImpl ?? fetch)("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { authorization: `Bearer ${input.accessToken}` },
      cache: "no-store"
    });
    const body = await response.json().catch(() => null) as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string; error?: { message?: string } } | null;
    if (!response.ok || !body?.id) throw new Error(body?.error?.message || "Microsoft mailbox verification failed.");
    return { accountId: body.id, accountName: body.mail || body.userPrincipalName || body.displayName || null, reportingVerified: true };
  }
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
    youtube: {
      label: "YouTube channel",
      capability: "youtube",
      plainLanguageStatus: "The YouTube channel is connected for read-only channel context. Uploading or publishing requires a separate owner authorization and approval policy."
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
    linkedin_ads: {
      label: "LinkedIn Ads",
      capability: "linkedin_ads",
      plainLanguageStatus: "LinkedIn authorization is connected. Select an approved Campaign Manager account; publishing and spend remain disabled."
    },
    pinterest_ads: {
      label: "Pinterest Ads",
      capability: "pinterest_ads",
      plainLanguageStatus: "Pinterest authorization is connected. Reporting can begin after account selection; publishing and spend remain disabled."
    },
    snapchat_ads: {
      label: "Snap Ads",
      capability: "snapchat_ads",
      plainLanguageStatus: "Snap authorization is connected. Select the business and ad account; publishing and spend remain disabled."
    },
    amazon_ads: {
      label: "Amazon Ads",
      capability: "amazon_ads",
      plainLanguageStatus: "Amazon Ads authorization is connected. Select an eligible advertising profile; publishing and spend remain disabled."
    },
    x_ads: {
      label: "X Ads",
      capability: "x_ads",
      plainLanguageStatus: "X Ads authorization is connected. Select an advertiser account; publishing and spend remain disabled."
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
    gmail_mailbox: {
      label: "Gmail inbox",
      capability: "email_monitoring",
      plainLanguageStatus: "Gmail is connected for read-only monitoring. Ferocity cannot send email from this account unless the owner separately enables sending."
    },
    microsoft_mailbox: {
      label: "Microsoft 365 inbox",
      capability: "email_monitoring",
      plainLanguageStatus: "Microsoft 365 email is connected for read-only monitoring. Ferocity cannot send email from this account unless the owner separately enables sending."
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

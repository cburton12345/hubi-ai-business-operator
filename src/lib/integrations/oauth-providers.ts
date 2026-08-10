import type { env } from "@/lib/env";

type EnvKey = keyof typeof env;

export type OAuthProviderConfig = {
  provider: string;
  label: string;
  authorizeUrl: string;
  clientIdParam?: string;
  clientIdEnv: EnvKey;
  redirectUriEnv: EnvKey;
  clientSecretEnv?: EnvKey;
  extraRequiredEnv?: EnvKey[];
  configurationIdEnv?: EnvKey;
  scopes: string[];
  sendScopes?: boolean;
  scopeSeparator?: string;
  query: Record<string, string>;
  liveActionRule: string;
  pkce?: boolean;
};

export const oauthProviderConfigs: Record<string, OAuthProviderConfig> = {
  google_calendar: {
    provider: "google_calendar",
    label: "Google Calendar",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar"],
    query: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    liveActionRule: "Read availability first. Calendar writes require a selected calendar and separate owner authorization."
  },
  microsoft_calendar: {
    provider: "microsoft_calendar",
    label: "Microsoft Outlook Calendar",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    redirectUriEnv: "MICROSOFT_OAUTH_REDIRECT_URI",
    scopes: ["offline_access", "openid", "profile", "User.Read", "Calendars.ReadWrite"],
    query: { response_mode: "query" },
    liveActionRule: "Read availability first. Calendar writes require a selected calendar and separate owner authorization."
  },
  google_business_profile: {
    provider: "google_business_profile",
    label: "Google Business Profile",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    scopes: ["https://www.googleapis.com/auth/business.manage"],
    query: { access_type: "offline", prompt: "consent" },
    liveActionRule: "Draft GBP posts and profile recommendations first. Publishing requires approval."
  },
  google_ads: {
    provider: "google_ads",
    label: "Google Ads",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    extraRequiredEnv: ["GOOGLE_ADS_DEVELOPER_TOKEN"],
    scopes: ["https://www.googleapis.com/auth/adwords"],
    query: { access_type: "offline", prompt: "consent" },
    liveActionRule: "Read reporting first. Campaign creation, budget edits, and spend require approval."
  },
  search_console: {
    provider: "search_console",
    label: "Google Search Console",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    query: { access_type: "offline", prompt: "consent" },
    liveActionRule: "Read SEO data only. Ferocity prepares recommendations and drafts."
  },
  analytics: {
    provider: "analytics",
    label: "Google Analytics",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_OAUTH_REDIRECT_URI",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    query: { access_type: "offline", prompt: "consent" },
    liveActionRule: "Read traffic and conversion reporting only. No site changes happen from analytics."
  },
  facebook: {
    provider: "facebook",
    label: "Facebook / Meta",
    authorizeUrl: "https://www.facebook.com/v25.0/dialog/oauth",
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    redirectUriEnv: "META_OAUTH_REDIRECT_URI",
    configurationIdEnv: "META_BUSINESS_LOGIN_CONFIG_ID",
    scopes: ["pages_read_engagement", "pages_show_list", "business_management", "ads_read"],
    sendScopes: false,
    query: { override_default_response_type: "true" },
    liveActionRule: "Read and draft first. Page publishing, replies, ads, and spend require approval."
  },
  tiktok: {
    provider: "tiktok",
    label: "TikTok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    clientIdParam: "client_key",
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    redirectUriEnv: "TIKTOK_OAUTH_REDIRECT_URI",
    scopes: ["user.info.basic"],
    scopeSeparator: ",",
    query: {},
    liveActionRule: "Creative drafts, scripts, and reporting first. Posting, creator actions, campaign creation, and spend require approval."
  },
  reddit: {
    provider: "reddit",
    label: "Reddit",
    authorizeUrl: "https://www.reddit.com/api/v1/authorize",
    clientIdEnv: "REDDIT_CLIENT_ID",
    clientSecretEnv: "REDDIT_CLIENT_SECRET",
    redirectUriEnv: "REDDIT_OAUTH_REDIRECT_URI",
    scopes: ["identity", "read", "adsread"],
    query: { duration: "permanent" },
    liveActionRule: "Community research and ad reporting first. Posting, replies, and ad spend require approval."
  },
  microsoft_ads: {
    provider: "microsoft_ads",
    label: "Microsoft Ads",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    redirectUriEnv: "MICROSOFT_OAUTH_REDIRECT_URI",
    extraRequiredEnv: ["MICROSOFT_ADS_DEVELOPER_TOKEN"],
    scopes: ["offline_access", "https://ads.microsoft.com/msads.manage"],
    query: { response_mode: "query" },
    liveActionRule: "Read reporting first. Campaign creation, budget edits, and spend require approval."
  },
  jobber: {
    provider: "jobber",
    label: "Jobber",
    authorizeUrl: "https://api.getjobber.com/api/oauth/authorize",
    clientIdEnv: "JOBBER_CLIENT_ID",
    clientSecretEnv: "JOBBER_CLIENT_SECRET",
    redirectUriEnv: "JOBBER_OAUTH_REDIRECT_URI",
    scopes: [
      "clients:read", "requests:read", "quotes:read", "jobs:read", "scheduled_items:read",
      "invoices:read", "payments:read", "users:read", "custom_fields:read", "tax_rates:read",
      "expenses:read", "timesheets:read", "vehicles_equipment:read", "marketing:read"
    ],
    sendScopes: false,
    pkce: true,
    query: {},
    liveActionRule: "Read the connected Jobber business for analysis. Ferocity never writes back until the owner enables a specific action."
  },
  yahoo_ads: {
    provider: "yahoo_ads",
    label: "Yahoo / Native Ads",
    authorizeUrl: "https://api.login.yahoo.com/oauth2/request_auth",
    clientIdEnv: "YAHOO_CLIENT_ID",
    clientSecretEnv: "YAHOO_CLIENT_SECRET",
    redirectUriEnv: "YAHOO_OAUTH_REDIRECT_URI",
    scopes: ["openid", "profile"],
    query: {},
    liveActionRule: "Reporting and attribution first. Publishing and spend require approval."
  }
};

export function getOAuthProviderConfig(provider: string) {
  return oauthProviderConfigs[provider.toLowerCase()] ?? null;
}

export function getOAuthRequiredEnv(config: OAuthProviderConfig): EnvKey[] {
  return [
    config.clientIdEnv,
    config.clientSecretEnv,
    config.redirectUriEnv,
    config.configurationIdEnv,
    ...(config.extraRequiredEnv ?? [])
  ].filter((key): key is EnvKey => Boolean(key));
}

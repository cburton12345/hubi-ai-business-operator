export const paidMediaCapabilityKeys = [
  "authorization",
  "account_discovery",
  "campaign_read",
  "campaign_write",
  "ad_group_management",
  "creative_management",
  "audience_targeting",
  "budget_management",
  "pause_resume",
  "reporting",
  "conversion_tracking",
  "server_conversion_feedback",
  "webhooks",
  "historical_sync",
  "recurring_sync"
] as const;

export type PaidMediaCapabilityKey = (typeof paidMediaCapabilityKeys)[number];
export type PaidMediaCapabilitySupport = "supported" | "partial" | "account_dependent" | "approval_required" | "unavailable";
export type PaidMediaActivationState =
  | "full_management"
  | "read_analytics"
  | "measurement_only"
  | "setup_required"
  | "waiting_for_platform_approval"
  | "unavailable";

export type PaidMediaCustomerAuthorizationStrategy =
  | "ferocity_platform_oauth"
  | "provider_account_invite"
  | "ferocity_managed_service"
  | "not_customer_connectable";

export type PaidMediaProviderKey =
  | "meta_ads"
  | "google_ads"
  | "tiktok_ads"
  | "microsoft_ads"
  | "linkedin_ads"
  | "x_ads"
  | "reddit_ads"
  | "pinterest_ads"
  | "snapchat_ads"
  | "amazon_ads"
  | "openai_ads"
  | "apple_search_ads";

export type PaidMediaCapability = {
  support: PaidMediaCapabilitySupport;
  note?: string;
};

export type PaidMediaProviderDefinition = {
  key: PaidMediaProviderKey;
  label: string;
  network: string;
  placements: string[];
  authModes: Array<"oauth" | "api_key" | "developer_token">;
  ferocityState: PaidMediaActivationState;
  approvalRequirements: string[];
  limitations: string[];
  officialDocs: string[];
  capabilities: Record<PaidMediaCapabilityKey, PaidMediaCapability>;
};

const S = (support: PaidMediaCapabilitySupport, note?: string): PaidMediaCapability => ({ support, note });

const fullApiCapabilities = (overrides: Partial<Record<PaidMediaCapabilityKey, PaidMediaCapability>> = {}) => ({
  authorization: S("supported"),
  account_discovery: S("supported"),
  campaign_read: S("supported"),
  campaign_write: S("supported"),
  ad_group_management: S("supported"),
  creative_management: S("supported"),
  audience_targeting: S("supported"),
  budget_management: S("supported"),
  pause_resume: S("supported"),
  reporting: S("supported"),
  conversion_tracking: S("supported"),
  server_conversion_feedback: S("supported"),
  webhooks: S("partial", "Provider event coverage is narrower than reporting and polling coverage."),
  historical_sync: S("supported"),
  recurring_sync: S("supported"),
  ...overrides
}) satisfies Record<PaidMediaCapabilityKey, PaidMediaCapability>;

export const paidMediaProviders: Record<PaidMediaProviderKey, PaidMediaProviderDefinition> = {
  meta_ads: {
    key: "meta_ads", label: "Meta Ads", network: "Meta", placements: ["Facebook", "Instagram", "Messenger", "Audience Network"],
    authModes: ["oauth"], ferocityState: "waiting_for_platform_approval",
    approvalRequirements: ["Meta app review for requested Marketing API permissions", "Business verification", "Customer-owned Page and ad-account authorization"],
    limitations: ["A Facebook Page is required for ad identity.", "Capabilities depend on approved scopes, assets, account roles, policy status, and regional availability."],
    officialDocs: ["https://developers.facebook.com/docs/marketing-apis/", "https://developers.facebook.com/docs/marketing-api/conversions-api/"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), webhooks: S("partial") })
  },
  google_ads: {
    key: "google_ads", label: "Google Ads", network: "Google", placements: ["Search", "Display", "YouTube", "Demand Gen", "Performance Max", "Shopping", "Apps"],
    authModes: ["oauth"], ferocityState: "setup_required",
    approvalRequirements: ["Google OAuth consent and brand verification", "Google Ads API access for Ferocity's Cloud project", "Authorized customer or manager-account relationship"],
    limitations: ["Inventory types have different schemas and reporting dimensions.", "Some UI-created or automated assets are read-only or have API-specific restrictions."],
    officialDocs: ["https://developers.google.com/google-ads/api/docs/start", "https://developers.google.com/google-ads/api/docs/reporting/overview", "https://developers.google.com/google-ads/api/docs/conversions/overview"],
    capabilities: fullApiCapabilities({ webhooks: S("unavailable", "Use scheduled reporting and change-event polling; Google Ads does not provide a general campaign webhook stream.") })
  },
  tiktok_ads: {
    key: "tiktok_ads", label: "TikTok Ads", network: "TikTok", placements: ["TikTok", "Pangle", "Global App Bundle where eligible"],
    authModes: ["oauth"], ferocityState: "waiting_for_platform_approval",
    approvalRequirements: ["TikTok API for Business developer and app approval", "Advertiser authorization", "Separate Content Posting approval for organic publishing"],
    limitations: ["Login Kit, Content Posting, and Ads authorization are separate grants.", "Availability varies by account, region, objective, and partner approval."],
    officialDocs: ["https://business-api.tiktok.com/portal/docs", "https://ads.tiktok.com/marketing_api/docs"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), webhooks: S("partial") })
  },
  microsoft_ads: {
    key: "microsoft_ads", label: "Microsoft Advertising", network: "Microsoft", placements: ["Bing", "Microsoft Audience Network", "Microsoft search partners"],
    authModes: ["oauth", "developer_token"], ferocityState: "setup_required",
    approvalRequirements: ["Verified advertiser", "OAuth user consent", "Microsoft Advertising developer token"],
    limitations: ["Campaign types and inventory have provider-specific entities.", "Use Reporting and Campaign Management services rather than assuming Google Ads request shapes."],
    officialDocs: ["https://learn.microsoft.com/en-us/advertising/", "https://learn.microsoft.com/en-us/advertising/guides/authentication-oauth"],
    capabilities: fullApiCapabilities({ webhooks: S("unavailable", "Use recurring reports and polling.") })
  },
  linkedin_ads: {
    key: "linkedin_ads", label: "LinkedIn Ads", network: "LinkedIn", placements: ["LinkedIn Feed", "LinkedIn Audience Network", "Lead Gen Forms", "Event Ads"],
    authModes: ["oauth"], ferocityState: "waiting_for_platform_approval",
    approvalRequirements: ["LinkedIn developer application", "Advertising API product approval", "Separate approval for Lead Sync, Conversions, Matched Audiences, or Community Management"],
    limitations: ["Product access is reviewed separately and versioned monthly.", "Storage, role, and partner-certification requirements apply."],
    officialDocs: ["https://learn.microsoft.com/en-us/linkedin/marketing/", "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/marketing-integrations-overview"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), webhooks: S("partial", "Lead and social notifications require separate products; campaign reporting is pull-based.") })
  },
  x_ads: {
    key: "x_ads", label: "X Ads", network: "X", placements: ["X timeline", "X video", "X Amplify where eligible"],
    authModes: ["oauth"], ferocityState: "waiting_for_platform_approval",
    approvalRequirements: ["Approved X Ads API access", "Advertiser authorization", "Appropriate paid API tier or partner access"],
    limitations: ["Access and product availability are account- and agreement-dependent.", "Ferocity must not claim campaign execution until an approved app is certified."],
    officialDocs: ["https://developer.x.com/en/docs/x-ads-api"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), server_conversion_feedback: S("partial"), webhooks: S("unavailable") })
  },
  reddit_ads: {
    key: "reddit_ads", label: "Reddit Ads", network: "Reddit", placements: ["Reddit Feed", "Conversation placement", "Community and interest targeting"],
    authModes: ["oauth"], ferocityState: "setup_required",
    approvalRequirements: ["Reddit Ads business and ad account", "Approved Ads API developer application", "Advertiser OAuth authorization"],
    limitations: ["Ads API use is approval-gated even when an Ads Manager account exists.", "Campaign objective enums and supported operations can change by API version."],
    officialDocs: ["https://ads-api.reddit.com/docs/v3/", "https://ads-api.reddit.com/docs/v3/api/get-a-report"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), server_conversion_feedback: S("partial"), webhooks: S("unavailable") })
  },
  pinterest_ads: {
    key: "pinterest_ads", label: "Pinterest Ads", network: "Pinterest", placements: ["Pinterest home feed", "Search", "Related Pins", "Shopping surfaces"],
    authModes: ["oauth"], ferocityState: "setup_required",
    approvalRequirements: ["Pinterest business access", "Ad account and billing", "Approved developer app and advertiser authorization"],
    limitations: ["Advertising is available only in eligible countries.", "Some business and billing setup steps require provider UI handoff."],
    officialDocs: ["https://developers.pinterest.com/docs/ads/ad-analytics-reporting/", "https://developers.pinterest.com/docs/api/v5/"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), webhooks: S("partial") })
  },
  snapchat_ads: {
    key: "snapchat_ads", label: "Snapchat Ads", network: "Snap", placements: ["Stories", "Spotlight", "Discover", "AR Lenses", "Dynamic Product Ads"],
    authModes: ["oauth"], ferocityState: "setup_required",
    approvalRequirements: ["Snap Business organization, funding source, and ad account", "OAuth app owned by an organization admin", "Advertiser authorization"],
    limitations: ["AR, creator, lead, and catalog capabilities have distinct schemas and eligibility.", "Reporting uses micro-currency units and provider-specific attribution windows."],
    officialDocs: ["https://developers.snap.com/marketing-api/home", "https://developers.snap.com/marketing-api/Ads-API/introduction", "https://developers.snap.com/marketing-api/Conversions-API/Introduction"],
    capabilities: fullApiCapabilities({ authorization: S("approval_required"), webhooks: S("partial") })
  },
  amazon_ads: {
    key: "amazon_ads", label: "Amazon Ads", network: "Amazon", placements: ["Sponsored Ads", "Amazon DSP", "Amazon retail media inventory"],
    authModes: ["oauth"], ferocityState: "setup_required",
    approvalRequirements: ["Amazon Ads developer access", "Eligible advertiser or DSP entity", "Advertiser authorization"],
    limitations: ["Sponsored Ads and DSP differ substantially.", "DSP campaign and conversion capabilities depend on account type and entity access."],
    officialDocs: ["https://advertising.amazon.com/about-api", "https://advertising.amazon.com/API/docs/en-us/guides/conversions/02-capi"],
    capabilities: fullApiCapabilities({ account_discovery: S("account_dependent"), campaign_write: S("account_dependent"), server_conversion_feedback: S("account_dependent"), webhooks: S("partial") })
  },
  openai_ads: {
    key: "openai_ads", label: "ChatGPT Ads", network: "OpenAI", placements: ["ChatGPT ad placements available to the advertiser account", "Product-feed ads where eligible"],
    authModes: ["api_key"], ferocityState: "setup_required",
    approvalRequirements: ["Active OpenAI Ads account", "Ad-account-scoped Advertiser API key", "Account review and billing readiness"],
    limitations: ["Availability is limited to eligible advertiser accounts.", "Advertiser and Conversions API keys are separate server-side secrets.", "No OAuth account discovery is currently assumed."],
    officialDocs: ["https://developers.openai.com/ads", "https://developers.openai.com/ads/api-overview", "https://developers.openai.com/ads/conversion-tracking", "https://developers.openai.com/ads/reporting"],
    capabilities: fullApiCapabilities({ authorization: S("account_dependent", "Uses an ad-account-scoped API key rather than customer OAuth."), account_discovery: S("partial", "The API key resolves its own ad account; it does not provide general multi-account discovery."), webhooks: S("unavailable") })
  },
  apple_search_ads: {
    key: "apple_search_ads", label: "Apple Ads", network: "Apple", placements: ["App Store search and eligible App Store placements", "Apple Maps business placements where eligible"],
    authModes: ["api_key"], ferocityState: "setup_required",
    approvalRequirements: ["Apple Ads account", "API user and OAuth key material", "Eligible app or Apple Maps business-brand resource and advertiser organization"],
    limitations: ["App Store and Apple Maps ad accounts use different product features and delegated resources.", "Maps inventory is available only to eligible businesses and regions."],
    officialDocs: ["https://developer.apple.com/documentation/apple-ads-platform-api", "https://ads.apple.com/maps"],
    capabilities: fullApiCapabilities({ authorization: S("account_dependent"), creative_management: S("partial"), server_conversion_feedback: S("partial"), webhooks: S("unavailable") })
  }
};

export type PaidMediaConnectionCategory = "ad_accounts" | "analytics" | "attribution_mmp" | "crm_first_party" | "website_tracking" | "creative_media";

export const paidMediaConnectionCatalog: Record<PaidMediaConnectionCategory, string[]> = {
  ad_accounts: Object.keys(paidMediaProviders),
  analytics: ["ferocity_native_analytics", "google_analytics_4", "google_search_console", "provider_reporting"],
  attribution_mmp: ["ferocity_closed_loop_attribution", "appsflyer", "adjust", "branch", "singular"],
  crm_first_party: ["ferocity_crm", "jobber", "highlevel", "hubspot", "housecall_pro", "servicetitan", "signed_webhook"],
  website_tracking: ["ferocity_tracked_links", "ferocity_web_chat", "google_tag", "meta_pixel_capi", "tiktok_pixel_events", "microsoft_uet", "reddit_pixel_capi", "linkedin_insight_capi", "snap_pixel_capi", "openai_pixel_capi"],
  creative_media: ["ferocity_asset_library", "google_veo", "openai_images", "customer_uploads", "provider_native_assets"]
};

/** Developer applications and secrets belong to Ferocity. This registry
 * describes only the minimum customer authorization after platform approval. */
export const paidMediaCustomerAuthorization: Record<PaidMediaProviderKey, {
  strategy: PaidMediaCustomerAuthorizationStrategy;
  customerAction: string;
  platformRequirement: string;
}> = {
  meta_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Meta, grant Ferocity access, and select the Page and ad account.", platformRequirement: "Ferocity owns the reviewed Meta app, Business Login configuration, client secret, redirect URI, and webhooks." },
  google_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Google, grant Ferocity access, and select the Google Ads customer account.", platformRequirement: "Ferocity owns the Google Cloud project, approved API access level, OAuth client, redirect URI, and manager integration." },
  tiktok_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to TikTok for Business, grant Ferocity access, and select the advertiser account.", platformRequirement: "Ferocity owns the approved API for Business application, app secret, callback, and webhooks." },
  microsoft_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Microsoft, grant Ferocity access, and select the advertising account.", platformRequirement: "Ferocity owns the Entra application, client secret, redirect URI, and Advertising developer token." },
  linkedin_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to LinkedIn, grant Ferocity access, and select the Campaign Manager account.", platformRequirement: "Ferocity owns the approved LinkedIn application and Marketing API products." },
  x_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to X, grant Ferocity access, and select the advertiser account.", platformRequirement: "Ferocity owns the approved X Ads API application and OAuth credentials." },
  reddit_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Reddit, grant Ferocity access, and select the advertiser account.", platformRequirement: "Ferocity owns the approved Reddit Ads developer application and OAuth credentials." },
  pinterest_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Pinterest, grant Ferocity access, and select the ad account.", platformRequirement: "Ferocity owns the approved Pinterest developer application and OAuth credentials." },
  snapchat_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Snap, grant Ferocity access, and select the business and ad account.", platformRequirement: "Ferocity owns the Snap OAuth application under its platform organization." },
  amazon_ads: { strategy: "ferocity_platform_oauth", customerAction: "Sign in to Amazon, grant Ferocity access, and select an eligible advertising profile.", platformRequirement: "Ferocity owns the approved Amazon Ads developer application and Login with Amazon client." },
  openai_ads: { strategy: "not_customer_connectable", customerAction: "No ordinary customer credential flow is exposed until OpenAI supports an appropriate delegated or partner authorization model.", platformRequirement: "Ferocity must obtain appropriate advertiser or partner access; account-scoped credentials remain server-side." },
  apple_search_ads: { strategy: "provider_account_invite", customerAction: "An eligible App Store or Apple Maps advertiser invites Ferocity with the minimum required API role through Apple's account controls.", platformRequirement: "Ferocity keeps OAuth key material server-side and does not ask a normal customer to paste a private key into Connect." }
};

export function getPaidMediaProvider(key: string) {
  return paidMediaProviders[key as PaidMediaProviderKey] ?? null;
}

export function getPaidMediaProvidersByState(state: PaidMediaActivationState) {
  return Object.values(paidMediaProviders).filter((provider) => provider.ferocityState === state);
}

export function paidMediaCapabilityMatrix() {
  return Object.values(paidMediaProviders).map((provider) => ({
    key: provider.key,
    label: provider.label,
    network: provider.network,
    placements: provider.placements,
    ferocityState: provider.ferocityState,
    capabilities: paidMediaCapabilityKeys.reduce<Record<string, PaidMediaCapabilitySupport>>((result, capability) => {
      result[capability] = provider.capabilities[capability].support;
      return result;
    }, {})
  }));
}

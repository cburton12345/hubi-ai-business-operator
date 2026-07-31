import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { missingEnvVars } from "@/lib/env";
import { getOAuthProviderConfig } from "@/lib/integrations/oauth-providers";
import { connectorExecutionMode, type ConnectorExecutionMode } from "@/lib/integrations/connector-runtime";

export type IntegrationRow = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  credentialsStatus: string;
  ownershipMode: string;
  notes: string;
  envVars: string[];
  setupItems: string[];
  callbackPath: string | null;
  riskLevel: string;
  missingEnvVars: string[];
  configuredEnvVars: string[];
  liveActionsEnabled: boolean;
  accountStatus: string | null;
  routeActions: string[];
  fallbackForActions: string[];
  oauthStartPath: string | null;
  setupMode: string;
  liveActionRule: string;
  executionMode: ConnectorExecutionMode;
};

export const plannedConnections = [
  {
    provider: "resend_shared",
    displayName: "Ferocity Shared Email",
    notes: "Starter Resend route managed by Ferocity. Outbound email and inbound replies can flow through Ferocity after sender and inbound webhook setup.",
    envVars: ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_REPLY_TO_ADDRESS", "RESEND_INBOUND_WEBHOOK_SECRET"],
    setupItems: [
      "Set EMAIL_PROVIDER to resend",
      "Add the Resend API key",
      "Use a verified sender",
      "Set a reply-to address that routes back into Ferocity",
      "Add a Resend inbound webhook to Ferocity",
      "Map inbound addresses to workspaces and brands",
      "Keep customer replies and sends review-visible"
    ],
    callbackPath: "/api/integrations/resend/inbound",
    riskLevel: "medium",
    setupMode: "managed_default",
    liveActionRule: "Transactional email sends require approved templates. Inbound replies can create leads/messages but do not trigger automatic sends."
  },
  {
    provider: "twilio_shared",
    displayName: "Optional SMS Provider",
    notes: "Optional SMS delivery. Ferocity defaults to app alerts, email, dashboard queues, and manual text drafts so owners can start without telecom setup.",
    envVars: [],
    setupItems: ["Use app alerts and email by default", "Keep manual text drafts available", "Add SMS only if consent, compliance, and cost limits are ready"],
    callbackPath: "/api/integrations/twilio/status",
    riskLevel: "high",
    setupMode: "optional_provider",
    liveActionRule: "SMS is optional. Live SMS sends require explicit opt-in, consent, approval gates, and plan limits."
  },
  {
    provider: "voice_ai",
    displayName: "Business Phone & AI Receptionist",
    notes: "Keep the business number customers already know, connect it fully, or get a new number. Ferocity keeps the phone and AI providers behind the scenes unless Advanced setup is opened.",
    envVars: ["VOICE_PROVIDER", "VOICE_API_KEY", "VOICE_WEBHOOK_SECRET", "VOICE_PHONE_NUMBER", "VOICE_MONTHLY_BUDGET_CENTS"],
    setupItems: [
      "Choose: keep the current number, connect it fully, get a new number, or use Advanced",
      "Tell Ferocity where important calls should transfer",
      "Choose business hours, voicemail, recording, and message behavior",
      "Confirm call recording and transcription disclosures",
      "Complete an authorized test call",
      "Set monthly limits before live AI calling",
      "Keep human handoff available for low confidence, money, legal, safety, or angry callers"
    ],
    callbackPath: "/api/integrations/voice-ai/webhook",
    riskLevel: "high",
    setupMode: "premium_voice_provider",
    liveActionRule: "Office-manager setup works now. Live calls, outbound calls, recordings, and voice-provider charges stay off until provider keys, consent, budget, and approval gates are ready."
  },
  {
    provider: "supabase_auth",
    displayName: "Supabase Auth",
    notes: "Connected as an additive bridge. Local sessions remain available during rollout.",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    setupItems: ["Confirm email templates", "Set allowed redirect URLs", "Test invite acceptance", "Run RLS verification"],
    callbackPath: null,
    riskLevel: "medium",
    setupMode: "core_account",
    liveActionRule: "Auth remains workspace-scoped and does not grant provider access by itself."
  },
  {
    provider: "stripe",
    displayName: "Stripe Billing",
    notes: "Stripe-hosted Checkout is available when the secret key, webhook secret, and Ferocity price IDs are configured. Customer-owned Stripe payment links can be prepared when invoice payment keys and webhooks are ready. Managed payment platform fees use the separate Stripe Connect readiness path.",
    envVars: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID_JOB_TRACKER",
      "STRIPE_PRICE_ID_STARTER",
      "STRIPE_PRICE_ID_GROWTH",
      "STRIPE_PRICE_ID_OPERATOR",
      "STRIPE_PRICE_ID_AI_GROWTH_REPORT"
    ],
    setupItems: [
      "Create Stripe products/prices",
      "Set billing portal return URL",
      "Register webhook endpoint",
      "Map Stripe customer to workspace",
      "Use customer-owned Stripe for payment links unless Stripe Connect managed payments is intentionally added",
      "Do not absorb processor, payout, refund, dispute, chargeback, or instant-payout fees by default",
      "Add publishable key only if embedded payment elements are enabled"
    ],
    callbackPath: "/api/integrations/stripe/webhook",
    riskLevel: "high",
    setupMode: "customer_or_platform_owned",
    liveActionRule: "Stripe payment links and ledgers can be prepared when configured; billing ownership, refunds, disputes, payouts, and platform fees stay controlled."
  },
  {
    provider: "stripe_connect",
    displayName: "Stripe Connect Managed Payments",
    notes: "Managed-payments path for connected Stripe accounts and Ferocity platform fees. This does not block normal subscription billing or customer-owned Stripe links.",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "FEROCITY_MANAGED_PAYMENTS_ENABLED", "FEROCITY_MANAGED_PAYMENT_FEE_BPS"],
    setupItems: [
      "Create Stripe Connect platform profile",
      "Keep FEROCITY_MANAGED_PAYMENTS_ENABLED false until onboarding is tested",
      "Create connected account onboarding and account-status refresh",
      "Store connected accounts in payment_provider_accounts",
      "Calculate application fees from the active payment_fee_policies row",
      "Pass through processor, payout, refund, dispute, chargeback, bank-return, and instant-payout fees",
      "Add customer-facing fee disclosure before live use"
    ],
    callbackPath: "/api/integrations/stripe/webhook",
    riskLevel: "high",
    setupMode: "connect_platform",
    liveActionRule: "Managed payments stay off until Connect onboarding, account status, fee disclosure, payout, refund, and dispute handling are verified."
  },
  {
    provider: "quickbooks",
    displayName: "Portable Accounting / Optional QuickBooks",
    notes: "Invoice, vendor-bill, expense, and ledger CSV exports work without provider credentials. QuickBooks or another accounting connection is optional for businesses that want automatic two-way sync.",
    envVars: [],
    setupItems: [
      "Use portable CSV exports and owner review by default",
      "Map customers, invoices, payments, expenses, reimbursements, and job costs",
      "Require owner approval before sending accounting data",
      "Add QuickBooks OAuth credentials when live sync is ready",
      "Log every accounting export or sync attempt"
    ],
    callbackPath: null,
    riskLevel: "high",
    setupMode: "keyless_export_optional_sync",
    liveActionRule: "Portable exports work now. Live QuickBooks sync stays optional and disabled until OAuth, mapping, approvals, and audit logs are ready."
  },
  {
    provider: "google_business_profile",
    displayName: "Google Business Profile",
    notes: "Google Business Profile drafts and recommendations are available now. Live publishing requires the connected Google account, approved scopes, and workspace approval rules.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    setupItems: ["Create Google Cloud OAuth app", "Request Business Profile scopes", "Verify redirect URL", "Require approval before publishing"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Draft GBP posts and profile recommendations first. Publishing requires approval."
  },
  {
    provider: "facebook",
    displayName: "Facebook / Meta",
    notes: "Social and ad drafts are available now. Live publishing, replies, and ad spend require the connected Meta account, approved permissions, and workspace approval rules.",
    envVars: ["META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI", "META_BUSINESS_LOGIN_CONFIG_ID"],
    setupItems: ["Create Meta app", "Request pages and ads permissions", "Configure redirect URL", "Keep publishing disabled until reviewed"],
    callbackPath: "/api/integrations/meta/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Read and draft first. Page publishing, replies, ads, and spend require approval."
  },
  {
    provider: "tiktok",
    displayName: "TikTok",
    notes: "Prepared for TikTok creator/content workflows, short-form ad briefs, and reporting. Drafts and creative plans work now; live posting and spend require approved provider access.",
    envVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_OAUTH_REDIRECT_URI"],
    setupItems: [
      "Create a TikTok developer or business API app",
      "Configure the deployed Ferocity callback URL",
      "Start with creative drafts, scripts, content calendars, and reporting",
      "Keep posting, creator actions, campaign creation, and ad spend approval-gated"
    ],
    callbackPath: "/api/integrations/tiktok/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Creative drafts, scripts, and reporting first. Posting, creator actions, campaign creation, and spend require approval."
  },
  {
    provider: "premium_video_rendering",
    displayName: "Premium Video Rendering",
    notes: "Ferocity can prepare video ad scripts, scenes, hooks, platform variants, and provider-ready briefs now. Finished AI video rendering requires a connected premium media provider, budget limits, and approval rules.",
    envVars: [
      "VIDEO_PROVIDER",
      "VIDEO_API_KEY",
      "VIDEO_MODEL",
      "VIDEO_RENDERING_ENABLED",
      "VIDEO_MONTHLY_BUDGET_CENTS",
      "VIDEO_WORKSPACE_MONTHLY_BUDGET_CENTS",
      "VIDEO_PROVIDER_COST_CENTS_PER_SECOND",
      "VIDEO_CUSTOMER_PRICE_CENTS_PER_SECOND"
    ],
    setupItems: [
      "Choose the rendering provider such as Veo, Runway, Kling, OpenAI media, or another approved vendor",
      "Add the provider API key and model name",
      "Set global and per-workspace monthly cost caps before enabling renders",
      "Set provider cost and customer price per rendered second; customer price must exceed provider cost",
      "Keep rendered videos approval-gated before publishing or spending",
      "Use real customer proof, source assets, and release permissions before generating ad creative"
    ],
    callbackPath: null,
    riskLevel: "high",
    setupMode: "premium_media_provider",
    liveActionRule: "Scripts and briefs are available now. Live rendering stays off until provider credentials, budget caps, proof permissions, and approval gates are ready."
  },
  {
    provider: "google_ads",
    displayName: "Google Ads",
    notes: "Campaign planning and read-only readiness are available now. Reporting, campaign creation, and budget changes require Google Ads credentials and approval rules.",
    envVars: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    setupItems: ["Create Ads developer token", "Connect manager account", "Request OAuth consent", "Require approval for budget changes"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Read reporting first. Campaign creation, budget edits, and spend require approval."
  },
  {
    provider: "reddit",
    displayName: "Reddit",
    notes: "Community listening, draft responses, ads readiness, and reporting. Ferocity will not post or spend without review and credentials.",
    envVars: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_OAUTH_REDIRECT_URI"],
    setupItems: [
      "Create a Reddit app",
      "Use the Ferocity redirect URL from the deployed domain",
      "Request only the scopes needed for the first workflow",
      "Keep posting, replies, and ads in review mode until approved"
    ],
    callbackPath: "/api/integrations/reddit/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Community research and ad reporting first. Posting, replies, and ad spend require approval."
  },
  {
    provider: "microsoft_ads",
    displayName: "Microsoft Ads",
    notes: "Ad reporting and conversion attribution for Bing/Microsoft channels. No budget actions run by default.",
    envVars: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_OAUTH_REDIRECT_URI", "MICROSOFT_ADS_DEVELOPER_TOKEN"],
    setupItems: [
      "Create Microsoft Entra app credentials",
      "Configure the deployed Ferocity redirect URL",
      "Connect ad account reporting only first",
      "Require approval for any campaign or budget change"
    ],
    callbackPath: "/api/integrations/microsoft/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Read reporting first. Campaign creation, budget edits, and spend require approval."
  },
  {
    provider: "yahoo_ads",
    displayName: "Yahoo / Native Ads",
    notes: "Prepared for native ad reporting and campaign attribution. Live sync requires provider credentials and approval.",
    envVars: ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "YAHOO_OAUTH_REDIRECT_URI"],
    setupItems: [
      "Confirm the Yahoo or native ads provider",
      "Create provider credentials",
      "Configure the deployed Ferocity callback URL",
      "Keep reporting read-only before any publishing or spend actions"
    ],
    callbackPath: "/api/integrations/yahoo/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Reporting and attribution first. Publishing and spend require approval."
  },
  {
    provider: "marketplacepro",
    displayName: "MarketplacePro",
    notes: "Optional adapter from MarketplacePro launch tables into Ferocity operations. MarketplacePro keeps its public discovery schema.",
    envVars: ["MARKETPLACEPRO_WEBHOOK_SECRET"],
    setupItems: [
      "Map posts, offers, labor_pool, saved_providers, worker_contact_requests, follows, notifications, and support_requests",
      "Connect MarketplacePro account/vendor/listing IDs to a Ferocity workspace or brand",
      "Import activity with MarketplacePro source details",
      "Manage follow-up, estimates, jobs, reviews, and provider relationships in Ferocity",
      "Keep outbound status sync paused until rules are reviewed"
    ],
    callbackPath: "/api/integrations/marketplacepro/events",
    riskLevel: "medium",
    setupMode: "signed_webhook",
    liveActionRule: "MarketplacePro can send inbound events; outbound status sync stays paused until reviewed."
  },
  {
    provider: "search_console",
    displayName: "Google Search Console",
    notes: "Manual SEO recommendations and source tracking are available now. Search Console reporting requires a connected Google property.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    setupItems: ["Verify site property ownership", "Request Search Console scope", "Map properties to brands", "Use data for recommendations only"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "medium",
    setupMode: "oauth",
    liveActionRule: "Read SEO data only. Ferocity prepares recommendations and drafts."
  },
  {
    provider: "analytics",
    displayName: "Analytics",
    notes: "Lead source and campaign attribution are tracked internally now. GA4 traffic and conversion reporting requires the connected analytics property.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GA4_PROPERTY_ID"],
    setupItems: ["Confirm GA4 property", "Map events to lead sources", "Avoid storing personal analytics data unnecessarily"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "medium",
    setupMode: "oauth",
    liveActionRule: "Read traffic and conversion reporting only. No site changes happen from analytics."
  },
  {
    provider: "email_provider",
    displayName: "Email Provider",
    notes: "Email delivery and inbound reply capture. Follow-up sends stay approval-gated.",
    envVars: ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_REPLY_TO_ADDRESS", "RESEND_INBOUND_WEBHOOK_SECRET"],
    setupItems: ["Choose provider", "Verify sender domain", "Configure unsubscribe/compliance footer", "Set a reply-to inbox", "Configure inbound replies", "Keep lead replies draft-only until approved"],
    callbackPath: "/api/integrations/resend/inbound",
    riskLevel: "high",
    setupMode: "api_key",
    liveActionRule: "Email sends require approved templates, sender compliance, and plan limits. Inbound replies can be recorded in conversations."
  },
  {
    provider: "twilio",
    displayName: "Optional Twilio SMS",
    notes: "Customer-owned Twilio can provide automated outbound SMS, inbound replies, delivery tracking, and opt-out handling. Ferocity keeps app alerts, email, queues, and manual text drafts as fallbacks.",
    envVars: ["ENABLE_TWILIO_SMS_SENDS", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
    setupItems: ["Save the workspace Twilio credentials", "Verify and activate the customer-owned number", "Configure messaging compliance", "Set both inbound and status callbacks to the Ferocity Twilio webhook", "Confirm consent before automated sending"],
    callbackPath: "/api/messaging/webhooks/twilio",
    riskLevel: "high",
    setupMode: "api_key",
    liveActionRule: "SMS is optional. Live SMS sends require verified workspace credentials, consent, suppression checks, limits, and explicit activation."
  },
  {
    provider: "review_platform",
    displayName: "Review Platform",
    notes: "Review ingestion and response workflows require a connected review provider. Public review responses require manual approval.",
    envVars: ["REVIEW_PROVIDER", "REVIEW_API_KEY"],
    setupItems: ["Choose review provider", "Map locations to brands", "Require approval before public responses", "Never invent testimonials"],
    callbackPath: "/api/integrations/reviews/webhook",
    riskLevel: "high",
    setupMode: "api_key_or_webhook",
    liveActionRule: "Review requests and public responses require approval and customer-consent rules."
  },
  {
    provider: "calendar_provider",
    displayName: "Keyless Calendar / Optional Two-Way Sync",
    notes: "Jobs and appointments work internally, and private revocable iCalendar feeds sync outward without provider credentials. Google or Microsoft OAuth is optional for two-way edits.",
    envVars: ["CALENDAR_PROVIDER", "CALENDAR_CLIENT_ID", "CALENDAR_CLIENT_SECRET", "CALENDAR_OAUTH_REDIRECT_URI"],
    setupItems: ["Create a private iCalendar feed from Schedule", "Subscribe from the owner's calendar", "Choose Google or Microsoft OAuth only if two-way editing is needed", "Avoid auto-booking until rules are approved"],
    callbackPath: "/api/integrations/calendar/oauth/callback",
    riskLevel: "medium",
    setupMode: "keyless_feed_optional_oauth",
    liveActionRule: "Private read-only schedule feeds work now. Provider-side edits and auto-booking require an optional connected account and explicit rules."
  },
  {
    provider: "webhook_framework",
    displayName: "Webhook Framework",
    notes: "Inbound authenticated webhook events are available. Outbound delivery remains disabled.",
    envVars: [],
    setupItems: ["Create inbound endpoint", "Copy one-time token", "Activate endpoint", "Review logged events before processing"],
    callbackPath: "/api/webhooks/[endpointId]",
    riskLevel: "medium",
    setupMode: "signed_webhook",
    liveActionRule: "Inbound events can be received; destructive outbound actions stay disabled."
  },
  {
    provider: "external_publishing",
    displayName: "External Publishing",
    notes: "Approved export packages are available now. Direct CMS or social publishing requires a connected provider and live-action approval rules.",
    envVars: ["CMS_PROVIDER", "CMS_API_KEY"],
    setupItems: ["Choose CMS/provider", "Map pages to brands", "Require approval before publishing", "Preserve manual export fallback"],
    callbackPath: null,
    riskLevel: "high",
    setupMode: "api_key_or_oauth",
    liveActionRule: "Hosted and customer-site publishing stays draft/review-first until permissions are approved."
  }
];

export async function ensurePlannedIntegrationConnections() {
  const workspaceId = await getCurrentWorkspaceId();
  for (const connection of plannedConnections) {
    await queryPostgres(
      `
      insert into public.integration_connections (tenant_id, provider, display_name, status, credentials_status, metadata_json)
      values ($1, $2, $3, 'planned', 'not_configured', $4::jsonb)
      on conflict (tenant_id, provider) do update
      set display_name = excluded.display_name,
          metadata_json = public.integration_connections.metadata_json || excluded.metadata_json,
          updated_at = now()
      `,
      [
        workspaceId,
        connection.provider,
        connection.displayName,
        JSON.stringify({
          notes: connection.notes,
          apiConnected: connection.provider === "supabase_auth" || connection.provider === "webhook_framework",
          envVars: connection.envVars,
          setupItems: connection.setupItems,
          callbackPath: connection.callbackPath,
          riskLevel: connection.riskLevel,
          liveActionsEnabled: false,
          setupMode: connection.setupMode,
          liveActionRule: connection.liveActionRule
        })
      ]
    );
  }
}

export async function getIntegrationRows(): Promise<IntegrationRow[]> {
  await ensurePlannedIntegrationConnections();
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    id: string;
    provider: string;
    display_name: string;
    status: string;
    credentials_status: string;
    metadata_json: {
      notes?: string;
      envVars?: string[];
      setupItems?: string[];
      callbackPath?: string | null;
      riskLevel?: string;
      liveActionsEnabled?: boolean;
      setupMode?: string;
      liveActionRule?: string;
    } | null;
  }>(
    `
    select id, provider, display_name, status, credentials_status, metadata_json
    from public.integration_connections
    where tenant_id = $1
    order by display_name
    `,
    [workspaceId]
  );
  const [accountResult, routeResult] = await Promise.all([
    queryPostgres<{
      provider_key: string;
      status: string;
      credentials_status: string;
      ownership_mode: string;
      live_actions_enabled: boolean;
    }>(
      `
      select provider_key, status, credentials_status, ownership_mode, live_actions_enabled
      from public.provider_accounts
      where tenant_id = $1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      action_type: string;
      default_provider_key: string;
      fallback_provider_key: string | null;
    }>(
      `
      select action_type, default_provider_key, fallback_provider_key
      from public.provider_routing_rules
      where tenant_id = $1 and status = 'active'
      `,
      [workspaceId]
    )
  ]);

  const accounts = new Map((accountResult?.rows ?? []).map((account) => [account.provider_key, account]));
  const routes = routeResult?.rows ?? [];

  return (result?.rows ?? []).map((row) => {
    const envVars = row.metadata_json?.envVars ?? [];
    const account = accounts.get(row.provider);
    const tenantCredentialsReady =
      account?.credentials_status === "configured"
      && ["connected", "paused", "error"].includes(account.status);
    const missing = tenantCredentialsReady
      ? []
      : missingEnvVars(envVars as Parameters<typeof missingEnvVars>[0]);
    const oauthConfig = getOAuthProviderConfig(row.provider);
    const envCredentialsReady = missing.length === 0 && envVars.length > 0;

    return {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      status: row.status,
      credentialsStatus: envCredentialsReady ? "configured" : account?.credentials_status ?? row.credentials_status,
      ownershipMode: account?.ownership_mode ?? (row.provider.endsWith("_shared") ? "ferocity_managed" : "workspace"),
      notes: row.metadata_json?.notes ?? "Prepared for provider connection and approval-gated live actions.",
      envVars,
      setupItems: row.metadata_json?.setupItems ?? [],
      callbackPath: row.metadata_json?.callbackPath ?? null,
      riskLevel: row.metadata_json?.riskLevel ?? "medium",
      missingEnvVars: missing,
      configuredEnvVars: envVars.filter((key) => !missing.includes(key as never)),
      liveActionsEnabled: account?.live_actions_enabled ?? row.metadata_json?.liveActionsEnabled === true,
      accountStatus: account?.status ?? null,
      routeActions: routes.filter((route) => route.default_provider_key === row.provider).map((route) => route.action_type),
      fallbackForActions: routes.filter((route) => route.fallback_provider_key === row.provider).map((route) => route.action_type),
      oauthStartPath: oauthConfig ? `/api/integrations/${row.provider}/oauth/start` : null,
      setupMode: row.metadata_json?.setupMode ?? (oauthConfig ? "oauth" : "manual"),
      liveActionRule: row.metadata_json?.liveActionRule ?? "Live actions stay disabled until reviewed.",
      executionMode: connectorExecutionMode(row.provider)
    };
  });
}

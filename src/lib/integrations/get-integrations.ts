import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { missingEnvVars } from "@/lib/env";
import { getOAuthProviderConfig } from "@/lib/integrations/oauth-providers";

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
    notes: "Optional future SMS delivery. Ferocity defaults to app alerts, email, dashboard queues, and manual text drafts so owners can start without telecom setup.",
    envVars: [],
    setupItems: ["Use app alerts and email by default", "Keep manual text drafts available", "Add SMS only if consent, compliance, and cost limits are ready"],
    callbackPath: "/api/integrations/twilio/status",
    riskLevel: "high",
    setupMode: "optional_later",
    liveActionRule: "SMS is optional. Live SMS sends require explicit opt-in, consent, approval gates, and plan limits."
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
      "Add publishable key only if embedded payment elements are added later"
    ],
    callbackPath: "/api/integrations/stripe/webhook",
    riskLevel: "high",
    setupMode: "customer_or_platform_owned",
    liveActionRule: "Stripe payment links and ledgers can be prepared when configured; billing ownership, refunds, disputes, payouts, and platform fees stay controlled."
  },
  {
    provider: "stripe_connect",
    displayName: "Stripe Connect Managed Payments",
    notes: "Future managed-payments path for connected Stripe accounts and Ferocity platform fees. This should not block normal subscription billing or customer-owned Stripe links.",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_CLIENT_ID", "FEROCITY_MANAGED_PAYMENTS_ENABLED", "FEROCITY_MANAGED_PAYMENT_FEE_BPS"],
    setupItems: [
      "Create Stripe Connect platform profile",
      "Add STRIPE_CONNECT_CLIENT_ID",
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
    displayName: "QuickBooks / Accounting Export",
    notes: "Accounting sync is provider-gated. Ferocity can prepare clean job cost, invoice, payment, receipt, reimbursement, and ledger records before any live accounting push.",
    envVars: [],
    setupItems: [
      "Keep manual exports and owner review available first",
      "Map customers, invoices, payments, expenses, reimbursements, and job costs",
      "Require owner approval before sending accounting data",
      "Add QuickBooks OAuth credentials when live sync is ready",
      "Log every accounting export or sync attempt"
    ],
    callbackPath: null,
    riskLevel: "high",
    setupMode: "provider_later",
    liveActionRule: "Accounting exports can be prepared for review. Live QuickBooks sync stays disabled until OAuth, mapping, approvals, and audit logs are ready."
  },
  {
    provider: "google_business_profile",
    displayName: "Google Business Profile",
    notes: "GBP post publishing later. Drafts remain internal.",
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
    notes: "Social publishing and ads later. Drafts remain manual for now.",
    envVars: ["META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI"],
    setupItems: ["Create Meta app", "Request pages and ads permissions", "Configure redirect URL", "Keep publishing disabled until reviewed"],
    callbackPath: "/api/integrations/meta/oauth/callback",
    riskLevel: "high",
    setupMode: "oauth",
    liveActionRule: "Read and draft first. Page publishing, replies, ads, and spend require approval."
  },
  {
    provider: "google_ads",
    displayName: "Google Ads",
    notes: "Campaign and budget sync later. No API connection in this phase.",
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
    notes: "Community listening, draft responses, and future ads/reporting. Ferocity will not post or spend without review and credentials.",
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
    notes: "Future ad reporting and conversion attribution for Bing/Microsoft channels. No budget actions run by default.",
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
    notes: "Prepared for future native ad reporting and campaign attribution. No live sync is active.",
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
    notes: "SEO reporting and ranking signals later. Manual SEO recommendations are available now.",
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
    notes: "Traffic and conversion reporting later. Lead source and campaign attribution are tracked internally now.",
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
    notes: "Optional SMS delivery later. Launch default is push/app alerts, email, dashboard queues, and manual text drafts.",
    envVars: ["ENABLE_TWILIO_SMS_SENDS", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
    setupItems: ["Keep disabled unless the business explicitly wants SMS", "Verify number", "Configure messaging compliance", "Confirm consent before sending", "Keep SMS replies draft-only until approved"],
    callbackPath: "/api/integrations/twilio/status",
    riskLevel: "high",
    setupMode: "api_key",
    liveActionRule: "SMS is optional. Live SMS sends require consent, approval gates, plan limits, and explicit workspace opt-in."
  },
  {
    provider: "review_platform",
    displayName: "Review Platform",
    notes: "Review ingestion and response workflows later. Public review responses require manual approval.",
    envVars: ["REVIEW_PROVIDER", "REVIEW_API_KEY"],
    setupItems: ["Choose review provider", "Map locations to brands", "Require approval before public responses", "Never invent testimonials"],
    callbackPath: "/api/integrations/reviews/webhook",
    riskLevel: "high",
    setupMode: "api_key_or_webhook",
    liveActionRule: "Review requests and public responses require approval and customer-consent rules."
  },
  {
    provider: "calendar_provider",
    displayName: "Calendar / Appointments",
    notes: "Calendar sync later. Jobs and appointment requests are tracked internally now.",
    envVars: ["CALENDAR_PROVIDER", "CALENDAR_CLIENT_ID", "CALENDAR_CLIENT_SECRET", "CALENDAR_OAUTH_REDIRECT_URI"],
    setupItems: ["Choose Google or Microsoft calendar", "Map calendars to brands/users", "Avoid auto-booking until rules are approved"],
    callbackPath: "/api/integrations/calendar/oauth/callback",
    riskLevel: "medium",
    setupMode: "oauth",
    liveActionRule: "Read and draft schedule changes first. Auto-booking requires explicit rules."
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
    notes: "CMS/social publishing later. Export packages are manual.",
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
    const missing = missingEnvVars(envVars as Parameters<typeof missingEnvVars>[0]);
    const account = accounts.get(row.provider);
    const oauthConfig = getOAuthProviderConfig(row.provider);
    const envCredentialsReady = missing.length === 0 && envVars.length > 0;

    return {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      status: row.status,
      credentialsStatus: envCredentialsReady ? "configured" : account?.credentials_status ?? row.credentials_status,
      ownershipMode: account?.ownership_mode ?? (row.provider.endsWith("_shared") ? "ferocity_managed" : "workspace"),
      notes: row.metadata_json?.notes ?? "Prepared for a later integration phase.",
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
      liveActionRule: row.metadata_json?.liveActionRule ?? "Live actions stay disabled until reviewed."
    };
  });
}

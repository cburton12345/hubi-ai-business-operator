import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { missingEnvVars } from "@/lib/env";

export type IntegrationRow = {
  id: string;
  provider: string;
  displayName: string;
  status: string;
  credentialsStatus: string;
  notes: string;
  envVars: string[];
  setupItems: string[];
  callbackPath: string | null;
  riskLevel: string;
  missingEnvVars: string[];
  configuredEnvVars: string[];
  liveActionsEnabled: boolean;
};

export const plannedConnections = [
  {
    provider: "supabase_auth",
    displayName: "Supabase Auth",
    notes: "Connected as an additive bridge. Local sessions remain available during rollout.",
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    setupItems: ["Confirm email templates", "Set allowed redirect URLs", "Test invite acceptance", "Run RLS verification"],
    callbackPath: null,
    riskLevel: "medium"
  },
  {
    provider: "stripe",
    displayName: "Stripe Billing",
    notes: "Billing later. Workspace plans are tracked without Stripe.",
    envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    setupItems: ["Create Stripe products/prices", "Set billing portal return URL", "Register webhook endpoint", "Map Stripe customer to workspace"],
    callbackPath: "/api/integrations/stripe/webhook",
    riskLevel: "high"
  },
  {
    provider: "google_business_profile",
    displayName: "Google Business Profile",
    notes: "GBP post publishing later. Drafts remain internal.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    setupItems: ["Create Google Cloud OAuth app", "Request Business Profile scopes", "Verify redirect URL", "Require approval before publishing"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "high"
  },
  {
    provider: "facebook",
    displayName: "Facebook / Meta",
    notes: "Social publishing and ads later. Drafts remain manual for now.",
    envVars: ["META_APP_ID", "META_APP_SECRET", "META_OAUTH_REDIRECT_URI"],
    setupItems: ["Create Meta app", "Request pages and ads permissions", "Configure redirect URL", "Keep publishing disabled until reviewed"],
    callbackPath: "/api/integrations/meta/oauth/callback",
    riskLevel: "high"
  },
  {
    provider: "google_ads",
    displayName: "Google Ads",
    notes: "Campaign and budget sync later. No API connection in this phase.",
    envVars: ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    setupItems: ["Create Ads developer token", "Connect manager account", "Request OAuth consent", "Require approval for budget changes"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "high"
  },
  {
    provider: "search_console",
    displayName: "Google Search Console",
    notes: "SEO reporting and ranking signals later. Manual SEO recommendations are available now.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT_URI"],
    setupItems: ["Verify site property ownership", "Request Search Console scope", "Map properties to brands", "Use data for recommendations only"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "medium"
  },
  {
    provider: "analytics",
    displayName: "Analytics",
    notes: "Traffic and conversion reporting later. Lead source and campaign attribution are tracked internally now.",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GA4_PROPERTY_ID"],
    setupItems: ["Confirm GA4 property", "Map events to lead sources", "Avoid storing personal analytics data unnecessarily"],
    callbackPath: "/api/integrations/google/oauth/callback",
    riskLevel: "medium"
  },
  {
    provider: "email_provider",
    displayName: "Email Provider",
    notes: "Email delivery later. Follow-up messages are draft-only now.",
    envVars: ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM_ADDRESS"],
    setupItems: ["Choose provider", "Verify sender domain", "Configure unsubscribe/compliance footer", "Keep lead replies draft-only until approved"],
    callbackPath: null,
    riskLevel: "high"
  },
  {
    provider: "twilio",
    displayName: "Twilio",
    notes: "SMS delivery later. Lead replies are draft-only now.",
    envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
    setupItems: ["Verify number", "Configure messaging compliance", "Confirm consent before sending", "Keep SMS replies draft-only until approved"],
    callbackPath: "/api/integrations/twilio/status",
    riskLevel: "high"
  },
  {
    provider: "review_platform",
    displayName: "Review Platform",
    notes: "Review ingestion and response workflows later. Public review responses require manual approval.",
    envVars: ["REVIEW_PROVIDER", "REVIEW_API_KEY"],
    setupItems: ["Choose review provider", "Map locations to brands", "Require approval before public responses", "Never invent testimonials"],
    callbackPath: "/api/integrations/reviews/webhook",
    riskLevel: "high"
  },
  {
    provider: "calendar_provider",
    displayName: "Calendar / Appointments",
    notes: "Calendar sync later. Jobs and appointment requests are tracked internally now.",
    envVars: ["CALENDAR_PROVIDER", "CALENDAR_CLIENT_ID", "CALENDAR_CLIENT_SECRET", "CALENDAR_OAUTH_REDIRECT_URI"],
    setupItems: ["Choose Google or Microsoft calendar", "Map calendars to brands/users", "Avoid auto-booking until rules are approved"],
    callbackPath: "/api/integrations/calendar/oauth/callback",
    riskLevel: "medium"
  },
  {
    provider: "webhook_framework",
    displayName: "Webhook Framework",
    notes: "Inbound authenticated webhook events are available. Outbound delivery remains disabled.",
    envVars: [],
    setupItems: ["Create inbound endpoint", "Copy one-time token", "Activate endpoint", "Review logged events before processing"],
    callbackPath: "/api/webhooks/[endpointId]",
    riskLevel: "medium"
  },
  {
    provider: "external_publishing",
    displayName: "External Publishing",
    notes: "CMS/social publishing later. Export packages are manual.",
    envVars: ["CMS_PROVIDER", "CMS_API_KEY"],
    setupItems: ["Choose CMS/provider", "Map pages to brands", "Require approval before publishing", "Preserve manual export fallback"],
    callbackPath: null,
    riskLevel: "high"
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
          metadata_json = excluded.metadata_json || public.integration_connections.metadata_json,
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
          liveActionsEnabled: false
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

  return (result?.rows ?? []).map((row) => {
    const envVars = row.metadata_json?.envVars ?? [];
    const missing = missingEnvVars(envVars as Parameters<typeof missingEnvVars>[0]);

    return {
      id: row.id,
      provider: row.provider,
      displayName: row.display_name,
      status: row.status,
      credentialsStatus: missing.length === 0 && envVars.length > 0 ? "configured" : row.credentials_status,
      notes: row.metadata_json?.notes ?? "Prepared for a later integration phase.",
      envVars,
      setupItems: row.metadata_json?.setupItems ?? [],
      callbackPath: row.metadata_json?.callbackPath ?? null,
      riskLevel: row.metadata_json?.riskLevel ?? "medium",
      missingEnvVars: missing,
      configuredEnvVars: envVars.filter((key) => !missing.includes(key as never)),
      liveActionsEnabled: row.metadata_json?.liveActionsEnabled === true
    };
  });
}

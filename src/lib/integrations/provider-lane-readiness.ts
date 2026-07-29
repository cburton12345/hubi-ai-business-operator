import { missingEnvVars } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { plannedConnections } from "@/lib/integrations/get-integrations";

type LaneRow = {
  id: string;
  capability_key: string;
  provider_key: string;
  lane_key: "customer_owned" | "ferocity_managed";
  display_name: string;
  connection_status: string;
  credentials_status: string;
  live_actions_enabled: boolean;
  plain_language_status: string;
  metadata_json: { sort?: number } | null;
};

type AccountRow = {
  provider_key: string;
  display_name: string | null;
  status: string;
  credentials_status: string;
  ownership_mode: string;
  live_actions_enabled: boolean;
};

export type ProviderLane = {
  laneKey: "customer_owned" | "ferocity_managed";
  providerKey: string;
  displayName: string;
  connectionStatus: string;
  credentialsStatus: string;
  liveActionsEnabled: boolean;
  plainLanguageStatus: string;
  missingEnvVars: string[];
  configuredEnvVars: string[];
};

export type ProviderCapabilityReadiness = {
  capabilityKey: string;
  label: string;
  description: string;
  sort: number;
  customerOwned: ProviderLane;
  ferocityManaged: ProviderLane;
};

const capabilityLabels: Record<string, { label: string; description: string; sort: number }> = {
  email: {
    label: "Email and replies",
    description: "Customer-owned sender or Ferocity-managed email route.",
    sort: 10
  },
  text_alerts: {
    label: "Texting and alerts",
    description: "Optional customer SMS plus Ferocity app alerts, queues, and manual text drafts.",
    sort: 20
  },
  ai_text: {
    label: "AI models",
    description: "Protected Ferocity AI by default, with an Advanced customer-owned account for selected low-risk work.",
    sort: 22
  },
  voice_ai: {
    label: "AI Office Manager voice",
    description: "Phone/voice provider lane for the AI Office Manager. Live voice requires telephony, consent, provider keys, and approval rules.",
    sort: 25
  },
  payments: {
    label: "Payments",
    description: "Customer Stripe or Ferocity-managed payments through Stripe Connect when onboarding is complete.",
    sort: 30
  },
  website_publishing: {
    label: "Website and SEO publishing",
    description: "Customer CMS publishing or Ferocity hosted growth pages.",
    sort: 40
  },
  google_business_profile: {
    label: "Google Business Profile",
    description: "Customer GBP connection with Ferocity-assisted drafts and tasks.",
    sort: 50
  },
  google_ads: {
    label: "Google Ads",
    description: "Customer ad account or Ferocity-managed ad service when approved.",
    sort: 60
  },
  meta_ads: {
    label: "Meta and Facebook",
    description: "Customer page/ad account or Ferocity-managed ad service when approved.",
    sort: 70
  },
  tiktok_ads: {
    label: "TikTok",
    description: "Customer TikTok account or Ferocity-managed TikTok campaigns when approved.",
    sort: 80
  },
  reddit_ads: {
    label: "Reddit",
    description: "Customer Reddit account or Ferocity-managed Reddit campaigns when approved.",
    sort: 90
  },
  microsoft_ads: {
    label: "Microsoft Ads",
    description: "Customer Microsoft Ads or Ferocity-managed Microsoft campaigns when approved.",
    sort: 100
  },
  marketplacepro: {
    label: "MarketplacePro events",
    description: "MarketplacePro account events and Ferocity owner-event receiver.",
    sort: 110
  },
  supplier_purchasing: {
    label: "Supplier pricing and purchasing",
    description: "Supplier price sheets, account pricing, quote tasks, order lists, and live order readiness.",
    sort: 120
  }
};

const envVarsByProvider = new Map(plannedConnections.map((connection) => [connection.provider, connection.envVars]));
envVarsByProvider.set("openai_managed", ["OPENAI_API_KEY"]);

function connectionTone(status: string, liveActionsEnabled: boolean) {
  if (liveActionsEnabled) return "high";
  if (status === "connected" || status === "available") return "";
  if (status === "paused" || status === "needs_attention") return "medium";
  return "medium";
}

export function providerLaneTone(lane: Pick<ProviderLane, "connectionStatus" | "liveActionsEnabled">) {
  return connectionTone(lane.connectionStatus, lane.liveActionsEnabled);
}

function plainStatus(status: string) {
  if (status === "not_connected") return "Not connected";
  return status.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function applyAccountToLane(lane: ProviderLane, account: AccountRow | undefined): ProviderLane {
  if (!account) return lane;

  const connectionStatus =
    account.status === "connected" && account.credentials_status === "configured"
      ? "connected"
      : account.status === "paused" && account.credentials_status === "configured"
        ? "paused"
        : account.status === "error"
          ? "needs_attention"
          : lane.connectionStatus;

  return {
    ...lane,
    displayName: account.display_name ?? lane.displayName,
    connectionStatus,
    credentialsStatus: account.credentials_status ?? lane.credentialsStatus,
    liveActionsEnabled: account.live_actions_enabled === true,
    plainLanguageStatus:
      connectionStatus === "connected"
        ? `${account.display_name ?? lane.displayName} is connected. Live actions still follow approval and plan controls.`
        : connectionStatus === "paused"
          ? `${account.display_name ?? lane.displayName} has credentials saved, but live actions are paused.`
          : connectionStatus === "needs_attention"
            ? `${account.display_name ?? lane.displayName} needs attention before it can be used.`
            : lane.plainLanguageStatus
  };
}

function buildLane(row: LaneRow, account: AccountRow | undefined): ProviderLane {
  const envVars = envVarsByProvider.get(row.provider_key) ?? [];
  const missing = missingEnvVars(envVars as Parameters<typeof missingEnvVars>[0]);
  const envConfigured = envVars.length > 0 && missing.length === 0;
  const base: ProviderLane = {
    laneKey: row.lane_key,
    providerKey: row.provider_key,
    displayName: row.display_name,
    connectionStatus: envConfigured && row.connection_status === "not_connected" ? "available" : row.connection_status,
    credentialsStatus: envConfigured ? "configured" : row.credentials_status,
    liveActionsEnabled: row.live_actions_enabled,
    plainLanguageStatus: envConfigured
      ? `${row.display_name} has the required platform environment keys. Live actions still require review.`
      : row.plain_language_status,
    missingEnvVars: missing,
    configuredEnvVars: envVars.filter((key) => !missing.includes(key as never))
  };

  return applyAccountToLane(base, account);
}

function fallbackLane(capabilityKey: string, laneKey: "customer_owned" | "ferocity_managed"): ProviderLane {
  return {
    laneKey,
    providerKey: `${capabilityKey}_${laneKey}`,
    displayName: laneKey === "customer_owned" ? "Customer account" : "Ferocity managed",
    connectionStatus: "not_connected",
    credentialsStatus: "not_configured",
    liveActionsEnabled: false,
    plainLanguageStatus:
      laneKey === "customer_owned"
        ? "No customer-owned account is connected for this capability yet."
        : "No Ferocity-managed account is active for this capability yet.",
    missingEnvVars: [],
    configuredEnvVars: []
  };
}

export async function getProviderCapabilityReadiness(workspaceId?: string): Promise<ProviderCapabilityReadiness[]> {
  const tenantId = workspaceId ?? await getCurrentWorkspaceId();
  const [laneResult, accountResult] = await Promise.all([
    queryPostgres<LaneRow>(
      `
      select id, capability_key, provider_key, lane_key, display_name, connection_status,
             credentials_status, live_actions_enabled, plain_language_status, metadata_json
      from public.provider_connection_lanes
      where tenant_id = $1
      order by coalesce((metadata_json->>'sort')::integer, 999), capability_key, lane_key
      `,
      [tenantId]
    ),
    queryPostgres<AccountRow>(
      `
      select provider_key, display_name, status, credentials_status, ownership_mode, live_actions_enabled
      from public.provider_accounts
      where tenant_id = $1
      `,
      [tenantId]
    )
  ]);

  const accounts = new Map((accountResult?.rows ?? []).map((row) => [row.provider_key, row]));
  const rows = laneResult?.rows ?? [];
  const byCapability = new Map<string, Partial<Record<"customer_owned" | "ferocity_managed", ProviderLane>>>();

  for (const row of rows) {
    const lanes = byCapability.get(row.capability_key) ?? {};
    lanes[row.lane_key] = buildLane(row, accounts.get(row.provider_key));
    byCapability.set(row.capability_key, lanes);
  }

  return [...byCapability.entries()]
    .map(([capabilityKey, lanes]) => {
      const details = capabilityLabels[capabilityKey] ?? {
        label: capabilityKey.replaceAll("_", " "),
        description: "Provider readiness.",
        sort: 999
      };
      return {
        capabilityKey,
        label: details.label,
        description: details.description,
        sort: details.sort,
        customerOwned: lanes.customer_owned ?? fallbackLane(capabilityKey, "customer_owned"),
        ferocityManaged: lanes.ferocity_managed ?? fallbackLane(capabilityKey, "ferocity_managed")
      };
    })
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
}

export function providerLaneStatusLabel(lane: ProviderLane) {
  if (lane.connectionStatus === "connected") return lane.liveActionsEnabled ? "Connected, live on" : "Connected, live off";
  if (lane.connectionStatus === "available") return lane.credentialsStatus === "configured" ? "Configured, review first" : "Available";
  return plainStatus(lane.connectionStatus);
}

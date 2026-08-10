import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import type { SearchVisibilityHealth } from "@/lib/sites/search-visibility-health";

export type WebsiteConnectionMode =
  | "public_scan"
  | "ferocity_hosted"
  | "install_snippet"
  | "cms_oauth"
  | "api_key"
  | "git_deploy"
  | "signed_webhook"
  | "manual_export";

export type WebsiteConnectionRow = {
  id: string;
  websiteUrl: string;
  normalizedOrigin: string;
  displayName: string | null;
  connectionMode: WebsiteConnectionMode;
  providerKey: string | null;
  status: string;
  capabilities: string[];
  searchVisibility: SearchVisibilityHealth | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
};

type DbRow = {
  id: string;
  website_url: string;
  normalized_origin: string;
  display_name: string | null;
  connection_mode: WebsiteConnectionMode;
  provider_key: string | null;
  status: string;
  capabilities_json: string[] | null;
  last_scan_json: unknown;
  last_verified_at: string | null;
  last_error: string | null;
};

export async function getWebsiteConnections(): Promise<WebsiteConnectionRow[]> {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<DbRow>(
    `
    select id, website_url, normalized_origin, display_name, connection_mode, provider_key,
           status, capabilities_json, last_scan_json, last_verified_at, last_error
    from public.website_connections
    where tenant_id = $1 and status <> 'disconnected'
    order by updated_at desc
    `,
    [workspaceId]
  );

  return (result?.rows ?? []).map((row) => {
    const lastScan = row.last_scan_json && typeof row.last_scan_json === "object"
      ? row.last_scan_json as { searchVisibility?: SearchVisibilityHealth }
      : null;
    const searchVisibility = lastScan?.searchVisibility;
    return {
    id: row.id,
    websiteUrl: row.website_url,
    normalizedOrigin: row.normalized_origin,
    displayName: row.display_name,
    connectionMode: row.connection_mode,
    providerKey: row.provider_key,
    status: row.status,
    capabilities: Array.isArray(row.capabilities_json) ? row.capabilities_json : [],
    searchVisibility: searchVisibility && typeof searchVisibility.score === "number" && Array.isArray(searchVisibility.checks)
      ? searchVisibility
      : null,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error
    };
  });
}

export function websiteConnectionModeLabel(mode: WebsiteConnectionMode) {
  if (mode === "public_scan") return "Read-only website scan";
  if (mode === "ferocity_hosted") return "Ferocity-hosted pages";
  if (mode === "install_snippet") return "Install lead/chat snippet";
  if (mode === "cms_oauth") return "Connect website platform";
  if (mode === "api_key") return "Website API key";
  if (mode === "git_deploy") return "Git or deploy workflow";
  if (mode === "signed_webhook") return "Signed webhook";
  return "Manual export";
}

export function websiteConnectionStatusLabel(status: string) {
  if (status === "verified_read_only") return "Verified read-only";
  if (status === "needs_connection") return "Connection required";
  if (status === "connected_draft_only") return "Connected, drafts only";
  if (status === "connected_live") return "Connected for approved publishing";
  if (status === "needs_attention") return "Needs attention";
  if (status === "disconnected") return "Disconnected";
  return "Needs verification";
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { queryPostgres } from "@/lib/db/postgres";
import { analyzePublicWebsiteUrl } from "@/lib/marketing-os/website-import-processor";
import type { WebsiteConnectionMode } from "@/lib/sites/website-connections";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

const allowedModes = new Set<WebsiteConnectionMode>([
  "public_scan",
  "ferocity_hosted",
  "install_snippet",
  "cms_oauth",
  "api_key",
  "git_deploy",
  "signed_webhook",
  "manual_export"
]);

function normalizeWebsiteUrl(input: string) {
  const withProtocol = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use a public website URL.");
  url.hash = "";
  return { websiteUrl: url.toString(), origin: url.origin.toLowerCase() };
}

function initialConnectionState(mode: WebsiteConnectionMode) {
  if (mode === "public_scan") return { status: "needs_verification", capabilities: ["read_public_pages", "check_search_visibility"] };
  if (mode === "ferocity_hosted") return { status: "connected_draft_only", capabilities: ["host_pages", "publish_approved_pages", "check_search_visibility"] };
  if (mode === "install_snippet") return { status: "needs_verification", capabilities: ["capture_leads", "track_attribution", "check_search_visibility"] };
  if (mode === "manual_export") return { status: "connected_draft_only", capabilities: ["export_content", "check_search_visibility"] };
  return { status: "needs_connection", capabilities: ["prepare_drafts", "check_search_visibility"] };
}

export async function saveWebsiteConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const rawUrl = String(formData.get("websiteUrl") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 120) || null;
  const mode = String(formData.get("connectionMode") ?? "public_scan") as WebsiteConnectionMode;
  const providerKey = String(formData.get("providerKey") ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || null;
  if (!rawUrl || !allowedModes.has(mode)) return;

  let normalized: { websiteUrl: string; origin: string };
  try {
    normalized = normalizeWebsiteUrl(rawUrl);
  } catch {
    return;
  }
  const initial = initialConnectionState(mode);

  await queryPostgres(
    `
    insert into public.website_connections (
      tenant_id, website_url, normalized_origin, display_name, connection_mode, provider_key,
      status, capabilities_json, metadata_json
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
    on conflict (tenant_id, normalized_origin) do update set
      website_url = excluded.website_url,
      display_name = coalesce(excluded.display_name, public.website_connections.display_name),
      connection_mode = excluded.connection_mode,
      provider_key = excluded.provider_key,
      status = excluded.status,
      capabilities_json = excluded.capabilities_json,
      last_error = null,
      metadata_json = public.website_connections.metadata_json || excluded.metadata_json,
      updated_at = now()
    `,
    [
      workspaceId,
      normalized.websiteUrl,
      normalized.origin,
      displayName,
      mode,
      providerKey,
      initial.status,
      JSON.stringify(initial.capabilities),
      JSON.stringify({ configuredBy: "workspace_operator", adapterRequired: ["cms_oauth", "api_key", "git_deploy"].includes(mode) })
    ]
  );

  revalidatePath("/app/website");
}

export async function verifyWebsiteConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const connectionId = String(formData.get("connectionId") ?? "");
  const result = await queryPostgres<{ website_url: string; connection_mode: WebsiteConnectionMode }>(
    `select website_url, connection_mode from public.website_connections where tenant_id = $1 and id = $2 limit 1`,
    [workspaceId, connectionId]
  );
  const connection = result?.rows[0];
  if (!connection) return;

  const analysis = await analyzePublicWebsiteUrl(connection.website_url);
  if (!analysis.ok) {
    await queryPostgres(
      `update public.website_connections set status = 'needs_attention', last_error = $3, updated_at = now() where tenant_id = $1 and id = $2`,
      [workspaceId, connectionId, analysis.message]
    );
    revalidatePath("/app/website");
    return;
  }

  const verifiedStatus = connection.connection_mode === "public_scan" ? "verified_read_only" :
    connection.connection_mode === "install_snippet" ? "needs_verification" : undefined;
  await queryPostgres(
    `
    update public.website_connections
    set status = coalesce($3, status), verification_method = 'public_http_scan',
        last_scan_json = $4::jsonb,
        provider_key = coalesce(provider_key, nullif($5, '')),
        last_verified_at = now(), last_error = null, updated_at = now()
    where tenant_id = $1 and id = $2
    `,
    [
      workspaceId,
      connectionId,
      verifiedStatus ?? null,
      JSON.stringify({
        finalUrl: analysis.analysis.finalUrl,
        title: analysis.analysis.title,
        formCount: analysis.analysis.formCount,
        platformHints: analysis.analysis.platformHints,
        searchVisibility: analysis.analysis.searchVisibility
      }),
      analysis.analysis.platformHints[0] ?? ""
    ]
  );
  revalidatePath("/app/website");
}

export async function disconnectWebsiteConnectionAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const connectionId = String(formData.get("connectionId") ?? "");
  await queryPostgres(
    `update public.website_connections set status = 'disconnected', updated_at = now() where tenant_id = $1 and id = $2`,
    [workspaceId, connectionId]
  );
  revalidatePath("/app/website");
}

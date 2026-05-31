import { getServiceUsage, type OveragePolicy, type ServiceMode } from "@/lib/controls/service-gates";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ServiceControl = {
  featureKey: string;
  label: string;
  category: string;
  status: string;
  mode: ServiceMode;
  usageLimit: number | null;
  usagePeriod: string;
  currentUsage: number;
  remaining: number | null;
  overagePolicy: OveragePolicy;
  plainRule: string;
  costed: boolean;
  publicFacing: boolean;
};

const featureOrder = [
  "ai_generation",
  "seo_autopilot",
  "hosted_growth_pages",
  "publishing_queue",
  "sms_send",
  "email_send",
  "review_requests",
  "ugc_proof_capture",
  "follow_up_recovery",
  "payment_collection",
  "calendar_sync",
  "growth_attribution",
  "marketplacepro_import"
];

function labelFor(featureKey: string) {
  return featureKey
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function getServiceControls() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    feature_key: string;
    status: string;
    usage_limit: number | null;
    usage_period: string | null;
    metadata_json: {
      category?: string;
      description?: string;
      approvalMode?: ServiceMode;
      overagePolicy?: OveragePolicy;
      plainRule?: string;
      costed?: boolean;
      publicFacing?: boolean;
    } | null;
  }>(
    `
    select feature_key, status, usage_limit, usage_period, metadata_json
    from public.workspace_feature_entitlements
    where tenant_id = $1
      and feature_key = any($2::text[])
    order by array_position($2::text[], feature_key)
    `,
    [workspaceId, featureOrder]
  );

  const controls = await Promise.all(
    (result?.rows ?? []).map(async (row) => {
      const currentUsage = await getServiceUsage(workspaceId, row.feature_key);
      const remaining = row.usage_limit === null ? null : Math.max(row.usage_limit - currentUsage, 0);
      const metadata = row.metadata_json ?? {};

      return {
        featureKey: row.feature_key,
        label: metadata.description ?? labelFor(row.feature_key),
        category: metadata.category ?? "General",
        status: row.status,
        mode: row.status === "disabled" ? "off" : metadata.approvalMode ?? "review_required",
        usageLimit: row.usage_limit,
        usagePeriod: row.usage_period ?? "monthly",
        currentUsage,
        remaining,
        overagePolicy: metadata.overagePolicy ?? "block",
        plainRule: metadata.plainRule ?? "Use this service only when it is useful and approved.",
        costed: Boolean(metadata.costed),
        publicFacing: Boolean(metadata.publicFacing)
      } satisfies ServiceControl;
    })
  );

  const warnings = controls.filter((control) => control.usageLimit !== null && control.remaining !== null && control.remaining <= Math.max(5, control.usageLimit * 0.1));

  return {
    workspaceId,
    controls,
    summary: {
      enabled: controls.filter((control) => control.mode === "enabled").length,
      reviewRequired: controls.filter((control) => control.mode === "review_required").length,
      draftOnly: controls.filter((control) => control.mode === "draft_only").length,
      off: controls.filter((control) => control.mode === "off").length,
      warnings: warnings.length
    }
  };
}

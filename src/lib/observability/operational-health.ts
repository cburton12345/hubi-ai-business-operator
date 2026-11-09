import { queryPostgresReadWithRetry } from "@/lib/db/postgres";
import { raisePlatformAdminAlert, resolvePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";

export type OperationalHealthStatus = "healthy" | "degraded" | "critical" | "unknown";

export type OperationalHealthCounts = {
  activeWorkflows: number;
  workflowsMissingNextRun: number;
  dueWorkflows: number;
  recentAgentRuns: number;
  stuckAgentRuns: number;
  failedAgentRuns24h: number;
  dueOutboundActions: number;
  failedOutboundActions24h: number;
  stuckIntegrationJobs: number;
  failedIntegrationJobs24h: number;
  stuckDocuments: number;
  failedDocuments24h: number;
  runtimeErrors24h: number;
  unhealthyConnections: number;
  staleLiveConnections: number;
  overdueExpectedEvidence: number;
  retryExhaustedExecutions: number;
  fallbackExecutions1h: number;
};

export type OperationalHealthComponent = {
  key: "workflow_schedule" | "agent_runtime" | "action_queue" | "integration_runtime" | "document_runtime" | "provider_connections" | "execution_evidence" | "application_runtime";
  label: string;
  status: Exclude<OperationalHealthStatus, "unknown">;
  summary: string;
  href: string;
};

export type OperationalHealthSnapshot = {
  status: OperationalHealthStatus;
  checkedAt: string;
  counts: OperationalHealthCounts | null;
  components: OperationalHealthComponent[];
  unavailableReason: string | null;
};

type OperationalHealthRow = Record<keyof OperationalHealthCounts, string | number>;

const zeroCounts: OperationalHealthCounts = {
  activeWorkflows: 0,
  workflowsMissingNextRun: 0,
  dueWorkflows: 0,
  recentAgentRuns: 0,
  stuckAgentRuns: 0,
  failedAgentRuns24h: 0,
  dueOutboundActions: 0,
  failedOutboundActions24h: 0,
  stuckIntegrationJobs: 0,
  failedIntegrationJobs24h: 0,
  stuckDocuments: 0,
  failedDocuments24h: 0,
  runtimeErrors24h: 0,
  unhealthyConnections: 0,
  staleLiveConnections: 0,
  overdueExpectedEvidence: 0,
  retryExhaustedExecutions: 0,
  fallbackExecutions1h: 0,
};

function numericRow(row: OperationalHealthRow): OperationalHealthCounts {
  return Object.fromEntries(
    Object.keys(zeroCounts).map((key) => {
      const value = Number(row[key as keyof OperationalHealthCounts]);
      return [key, Number.isFinite(value) && value >= 0 ? value : 0];
    }),
  ) as OperationalHealthCounts;
}

function component(
  key: OperationalHealthComponent["key"],
  label: string,
  status: OperationalHealthComponent["status"],
  summary: string,
  href: string,
): OperationalHealthComponent {
  return { key, label, status, summary, href };
}

export function evaluateOperationalHealth(
  counts: OperationalHealthCounts | null,
  checkedAt = new Date().toISOString(),
): OperationalHealthSnapshot {
  if (!counts) {
    return {
      status: "unknown",
      checkedAt,
      counts: null,
      components: [],
      unavailableReason: "Operational evidence could not be loaded. Ferocity is not treating the system as healthy.",
    };
  }

  const missingRunEvidence = counts.dueWorkflows > 0 && counts.recentAgentRuns === 0;
  const workflowCritical = counts.workflowsMissingNextRun > 0 || missingRunEvidence;
  const components: OperationalHealthComponent[] = [
    component(
      "workflow_schedule",
      "Workflow schedule",
      workflowCritical ? "critical" : counts.dueWorkflows > 0 ? "degraded" : "healthy",
      workflowCritical
        ? `${counts.workflowsMissingNextRun} scheduled workflow(s) lack a next run; ${missingRunEvidence ? "due work has no recent run evidence" : "recent run evidence exists"}.`
        : counts.dueWorkflows > 0
          ? `${counts.dueWorkflows} workflow(s) are due and awaiting the next automation pass.`
          : `${counts.activeWorkflows} active workflow(s); no overdue schedule anomaly.`,
      "/app/ai-workforce",
    ),
    component(
      "agent_runtime",
      "AI work runtime",
      counts.stuckAgentRuns > 0 ? "critical" : counts.failedAgentRuns24h > 0 ? "degraded" : "healthy",
      `${counts.stuckAgentRuns} stuck run(s); ${counts.failedAgentRuns24h} failed in the last 24 hours.`,
      "/app/ai-workforce",
    ),
    component(
      "action_queue",
      "Authorized action queue",
      counts.failedOutboundActions24h > 0 ? "critical" : counts.dueOutboundActions > 0 ? "degraded" : "healthy",
      `${counts.dueOutboundActions} due action(s); ${counts.failedOutboundActions24h} failed or blocked in the last 24 hours.`,
      "/app/approvals",
    ),
    component(
      "integration_runtime",
      "Integration jobs",
      counts.stuckIntegrationJobs > 0 ? "critical" : counts.failedIntegrationJobs24h > 0 ? "degraded" : "healthy",
      `${counts.stuckIntegrationJobs} stuck job(s); ${counts.failedIntegrationJobs24h} failed in the last 24 hours.`,
      "/app/integrations",
    ),
    component(
      "document_runtime",
      "Document processing",
      counts.stuckDocuments > 0 ? "critical" : counts.failedDocuments24h > 0 ? "degraded" : "healthy",
      `${counts.stuckDocuments} document(s) stuck in processing; ${counts.failedDocuments24h} failed in the last 24 hours.`,
      "/app/receipts",
    ),
    component(
      "provider_connections",
      "Provider connections",
      counts.unhealthyConnections > 0 ? "critical" : counts.staleLiveConnections > 0 ? "degraded" : "healthy",
      `${counts.unhealthyConnections} invalid/error connection(s); ${counts.staleLiveConnections} enabled connection(s) have stale health evidence.`,
      "/app/integrations",
    ),
    component(
      "execution_evidence",
      "Completion evidence",
      counts.overdueExpectedEvidence > 0 || counts.retryExhaustedExecutions > 0
        ? "critical"
        : counts.fallbackExecutions1h >= 3
          ? "degraded"
          : "healthy",
      `${counts.overdueExpectedEvidence} overdue expected result(s); ${counts.retryExhaustedExecutions} retry-exhausted execution(s); ${counts.fallbackExecutions1h} fallback execution(s) in the last hour.`,
      "/app/platform-activity",
    ),
    component(
      "application_runtime",
      "Application and function runtime",
      counts.runtimeErrors24h > 0 ? "critical" : "healthy",
      `${counts.runtimeErrors24h} unresolved error or critical runtime event(s) in the last 24 hours.`,
      "/app/errors",
    ),
  ];

  const status: OperationalHealthStatus = components.some((item) => item.status === "critical")
    ? "critical"
    : components.some((item) => item.status === "degraded")
      ? "degraded"
      : "healthy";
  return { status, checkedAt, counts, components, unavailableReason: null };
}

export async function getOperationalHealthSnapshot(tenantId: string): Promise<OperationalHealthSnapshot> {
  const result = await queryPostgresReadWithRetry<OperationalHealthRow>(
    `select
      (select count(*) from public.ai_agent_workflows where tenant_id=$1 and status='active')::text as "activeWorkflows",
      (select count(*) from public.ai_agent_workflows where tenant_id=$1 and status='active' and cadence_key<>'manual' and next_run_at is null)::text as "workflowsMissingNextRun",
      (select count(*) from public.ai_agent_workflows where tenant_id=$1 and status='active' and cadence_key<>'manual' and next_run_at<=now())::text as "dueWorkflows",
      (select count(*) from public.ai_agent_runs where tenant_id=$1 and started_at>=now()-interval '24 hours')::text as "recentAgentRuns",
      (select count(*) from public.ai_agent_runs where tenant_id=$1 and status in ('queued','running') and started_at<now()-interval '30 minutes')::text as "stuckAgentRuns",
      (select count(*) from public.ai_agent_runs where tenant_id=$1 and status='failed' and started_at>=now()-interval '24 hours')::text as "failedAgentRuns24h",
      (select count(*) from public.outbound_action_queue where tenant_id=$1 and status in ('approved','queued') and coalesce(scheduled_for,created_at)<=now())::text as "dueOutboundActions",
      (select count(*) from public.outbound_action_queue where tenant_id=$1 and status in ('failed','blocked') and updated_at>=now()-interval '24 hours')::text as "failedOutboundActions24h",
      (select count(*) from public.integration_jobs where tenant_id=$1 and status in ('queued','running') and coalesce(started_at,scheduled_for,created_at)<now()-interval '30 minutes')::text as "stuckIntegrationJobs",
      (select count(*) from public.integration_jobs where tenant_id=$1 and status='failed' and coalesce(completed_at,created_at)>=now()-interval '24 hours')::text as "failedIntegrationJobs24h",
      (select count(*) from public.document_intelligence_documents where tenant_id=$1 and status='processing' and updated_at<now()-interval '30 minutes')::text as "stuckDocuments",
      (select count(*) from public.document_intelligence_documents where tenant_id=$1 and status='failed' and updated_at>=now()-interval '24 hours')::text as "failedDocuments24h",
      (select count(*) from public.app_error_events where tenant_id=$1 and severity in ('error','critical') and resolved_at is null and created_at>=now()-interval '24 hours')::text as "runtimeErrors24h",
      (select count(*) from public.integration_connections where tenant_id=$1 and (status='error' or credentials_status in ('expired','invalid')))::text as "unhealthyConnections",
      (select count(*) from public.integration_connections where tenant_id=$1 and status='connected' and lower(coalesce(metadata_json->>'liveActionsEnabled','false'))='true' and coalesce(last_checked_at,updated_at)<now()-interval '24 hours')::text as "staleLiveConnections",
      (select count(*) from public.capability_execution_audits where tenant_id=$1 and state in ('attempted','provider_accepted','delayed','unknown') and expected_event_at is not null and expected_event_at<now())::text as "overdueExpectedEvidence",
      (select count(*) from public.capability_execution_audits where tenant_id=$1 and retry_count>=3 and state not in ('completed','confirmed','failed','blocked'))::text as "retryExhaustedExecutions",
      (select count(*) from public.capability_execution_audits where tenant_id=$1 and fallback_count>0 and updated_at>=now()-interval '1 hour')::text as "fallbackExecutions1h"`,
    [tenantId],
    { attempts: 2, baseDelayMs: 500 },
  );
  return evaluateOperationalHealth(result?.rows[0] ? numericRow(result.rows[0]) : null);
}

export async function evaluateOperationalHealthAlerts(tenantIds: string[]) {
  const uniqueTenantIds = [...new Set(tenantIds.filter(Boolean))];
  let criticalTenants = 0;
  let unavailableTenants = 0;

  for (let offset = 0; offset < uniqueTenantIds.length; offset += 10) {
    const batch = uniqueTenantIds.slice(offset, offset + 10);
    await Promise.all(batch.map(async (tenantId) => {
      const snapshot = await getOperationalHealthSnapshot(tenantId);
      const fingerprint = `operational-health:${tenantId}`;
      if (snapshot.status === "healthy") {
        await resolvePlatformAdminAlert(fingerprint);
        return;
      }
      if (snapshot.status === "unknown") unavailableTenants += 1;
      if (snapshot.status === "critical") criticalTenants += 1;
      const affected = snapshot.components.filter((item) => item.status !== "healthy");
      await raisePlatformAdminAlert({
        fingerprint,
        family: "automation_health",
        type: snapshot.status === "unknown" ? "operational_health_unknown" : "operational_health_degraded",
        severity: snapshot.status === "critical" ? "high" : "warning",
        title: snapshot.status === "unknown" ? "Operational health is unknown" : "Ferocity execution needs attention",
        body: snapshot.unavailableReason ?? affected.map((item) => `${item.label}: ${item.summary}`).join(" ").slice(0, 1_500),
        tenantId,
        actionUrl: "/app/system-health",
        metadata: { checkedAt: snapshot.checkedAt, status: snapshot.status, componentKeys: affected.map((item) => item.key) },
      });
    }));
  }
  return { tenantsChecked: uniqueTenantIds.length, criticalTenants, unavailableTenants };
}

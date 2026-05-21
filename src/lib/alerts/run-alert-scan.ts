import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type AlertCandidate = {
  key: string;
  category: "lead" | "content" | "approval" | "form" | "system" | "ai" | "integration" | "billing";
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  actionHref: string;
  metadata: Record<string, unknown>;
};

function addIf(candidates: AlertCandidate[], condition: boolean, candidate: AlertCandidate) {
  if (condition) candidates.push(candidate);
}

export async function runWorkspaceAlertScan() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<{
    stale_leads: string;
    current_leads: string;
    previous_leads: string;
    new_leads: string;
    pending_approvals: string;
    failed_forms: string;
    app_errors: string;
    ai_fallbacks: string;
    pending_exports: string;
  }>(
    `
    select
      (select count(*) from public.leads where tenant_id = $1 and status in ('new', 'contacted') and created_at < now() - interval '3 days') as stale_leads,
      (select count(*) from public.leads where tenant_id = $1 and created_at >= now() - interval '7 days') as current_leads,
      (select count(*) from public.leads where tenant_id = $1 and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as previous_leads,
      (select count(*) from public.leads where tenant_id = $1 and status = 'new' and created_at >= now() - interval '24 hours') as new_leads,
      (select count(*) from public.approvals where tenant_id = $1 and status = 'pending') as pending_approvals,
      (select count(*) from public.app_error_events where (tenant_id = $1 or tenant_id is null) and source = 'api.public.leads' and created_at >= now() - interval '7 days') as failed_forms,
      (select count(*) from public.app_error_events where (tenant_id = $1 or tenant_id is null) and severity in ('error', 'critical') and created_at >= now() - interval '7 days') as app_errors,
      (select count(*) from public.ai_generation_runs where tenant_id = $1 and fallback_used = true and created_at >= now() - interval '7 days') as ai_fallbacks,
      (select count(*) from public.content_exports where tenant_id = $1 and status in ('pending', 'processing')) as pending_exports
    `,
    [workspaceId]
  );
  const row = result?.rows[0];
  const staleLeads = Number(row?.stale_leads ?? 0);
  const currentLeads = Number(row?.current_leads ?? 0);
  const previousLeads = Number(row?.previous_leads ?? 0);
  const newLeads = Number(row?.new_leads ?? 0);
  const pendingApprovals = Number(row?.pending_approvals ?? 0);
  const failedForms = Number(row?.failed_forms ?? 0);
  const appErrors = Number(row?.app_errors ?? 0);
  const aiFallbacks = Number(row?.ai_fallbacks ?? 0);
  const pendingExports = Number(row?.pending_exports ?? 0);
  const leadVolumeDropped = previousLeads >= 3 && currentLeads < Math.ceil(previousLeads / 2);
  const candidates: AlertCandidate[] = [];

  addIf(candidates, newLeads > 0, {
    key: "new-leads-today",
    category: "lead",
    severity: newLeads >= 5 ? "high" : "medium",
    title: "New leads need review",
    summary: `${newLeads} new lead${newLeads === 1 ? "" : "s"} arrived in the last 24 hours. Review and assign manually.`,
    actionHref: "/app/leads?status=new",
    metadata: { newLeads }
  });

  addIf(candidates, staleLeads > 0, {
    key: "stale-leads",
    category: "lead",
    severity: staleLeads >= 5 ? "high" : "medium",
    title: "Stale leads need follow-up",
    summary: `${staleLeads} open lead${staleLeads === 1 ? "" : "s"} have been waiting more than 3 days.`,
    actionHref: "/app/leads?status=new",
    metadata: { staleLeads }
  });

  addIf(candidates, leadVolumeDropped, {
    key: "lead-volume-drop",
    category: "lead",
    severity: "medium",
    title: "Lead volume dropped",
    summary: `Lead volume is ${currentLeads} this week compared with ${previousLeads} in the prior week.`,
    actionHref: "/app/reports",
    metadata: { currentLeads, previousLeads }
  });

  addIf(candidates, pendingApprovals > 0, {
    key: "pending-approvals",
    category: "approval",
    severity: pendingApprovals >= 10 ? "high" : "medium",
    title: "Pending approvals are waiting",
    summary: `${pendingApprovals} item${pendingApprovals === 1 ? "" : "s"} need manual review before action.`,
    actionHref: "/app/approvals",
    metadata: { pendingApprovals }
  });

  addIf(candidates, failedForms > 0, {
    key: "failed-form-submissions",
    category: "form",
    severity: "high",
    title: "Public form errors detected",
    summary: `${failedForms} public lead capture error${failedForms === 1 ? "" : "s"} occurred in the last 7 days.`,
    actionHref: "/app/safety",
    metadata: { failedForms }
  });

  addIf(candidates, appErrors > 0, {
    key: "recent-app-errors",
    category: "system",
    severity: "high",
    title: "Recent app errors need review",
    summary: `${appErrors} error-level event${appErrors === 1 ? "" : "s"} occurred in the last 7 days.`,
    actionHref: "/app/safety",
    metadata: { appErrors }
  });

  addIf(candidates, aiFallbacks > 0, {
    key: "ai-fallbacks",
    category: "ai",
    severity: "low",
    title: "AI fallback generation was used",
    summary: `${aiFallbacks} AI run${aiFallbacks === 1 ? "" : "s"} used deterministic fallback output this week.`,
    actionHref: "/app/marketing",
    metadata: { aiFallbacks }
  });

  addIf(candidates, pendingExports > 0, {
    key: "pending-exports",
    category: "content",
    severity: "low",
    title: "Export packages are still processing",
    summary: `${pendingExports} manual export package${pendingExports === 1 ? "" : "s"} are not complete yet.`,
    actionHref: "/app/exports",
    metadata: { pendingExports }
  });

  for (const alert of candidates) {
    await queryPostgres(
      `
      insert into public.operator_alerts (tenant_id, alert_key, category, severity, status, title, summary, action_href, metadata_json, last_seen_at, updated_at)
      values ($1, $2, $3, $4, 'active', $5, $6, $7, $8::jsonb, now(), now())
      on conflict (tenant_id, alert_key) do update
      set category = excluded.category,
          severity = excluded.severity,
          status = 'active',
          title = excluded.title,
          summary = excluded.summary,
          action_href = excluded.action_href,
          metadata_json = excluded.metadata_json,
          last_seen_at = now(),
          resolved_at = null,
          resolved_by_user_id = null,
          updated_at = now()
      `,
      [
        workspaceId,
        alert.key,
        alert.category,
        alert.severity,
        alert.title,
        alert.summary,
        alert.actionHref,
        JSON.stringify(alert.metadata)
      ]
    );
  }

  return { generated: candidates.length, candidates };
}

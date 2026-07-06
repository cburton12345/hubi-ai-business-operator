import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getServiceControls } from "@/lib/controls/get-service-controls";
import { queryPostgres } from "@/lib/db/postgres";
import { getEmailProviderHealth } from "@/lib/email/provider-health";
import { getIntegrationRows } from "@/lib/integrations/get-integrations";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type SafetyStatus = "ready" | "needs_setup" | "needs_review" | "blocked" | "paused";

export type SafetyItem = {
  title: string;
  detail: string;
  status: SafetyStatus;
  href: string;
  button: string;
};

export type SafetySection = {
  title: string;
  body: string;
  href: string;
  items: SafetyItem[];
};

export type SafetyReadinessDashboard = {
  metrics: {
    ready: number;
    needsSetup: number;
    needsReview: number;
    blocked: number;
    paused: number;
    missingEnvVars: number;
    liveActions: number;
    nearLimits: number;
    pendingApprovals: number;
  };
  topNeeds: SafetyItem[];
  sections: SafetySection[];
};

type SafetyCounts = {
  pending_approvals: string;
  pending_actions: string;
  active_alerts: string;
  credentials: string;
  credentials_need_key: string;
  webhook_endpoints: string;
  recent_errors: string;
  public_forms: string;
  active_brands: string;
};

function num(value: string | undefined) {
  return Number(value ?? 0);
}

function item(title: string, detail: string, status: SafetyStatus, href: string, button: string): SafetyItem {
  return { title, detail, status, href, button };
}

function liveActionCount(rows: Awaited<ReturnType<typeof getIntegrationRows>>) {
  return rows.filter((row) => row.liveActionsEnabled).length;
}

export async function getSafetyReadinessDashboard(): Promise<SafetyReadinessDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [integrations, controls, billing, emailHealth, countResult] = await Promise.all([
    getIntegrationRows(),
    getServiceControls(),
    getBillingOverview(),
    getEmailProviderHealth(),
    queryPostgres<SafetyCounts>(
      `
      select
        (select count(*) from public.approvals where tenant_id = $1 and status = 'pending')::text as pending_approvals,
        (select count(*) from public.outbound_action_queue where tenant_id = $1 and status in ('needs_review','approved','queued'))::text as pending_actions,
        (select count(*) from public.operator_alerts where tenant_id = $1 and status = 'active')::text as active_alerts,
        (select count(*) from public.tenant_provider_credentials where tenant_id = $1 and status <> 'archived')::text as credentials,
        (select count(*) from public.tenant_provider_credentials where tenant_id = $1 and status = 'needs_encryption_key')::text as credentials_need_key,
        (select count(*) from public.webhook_endpoints where tenant_id = $1 and status <> 'archived')::text as webhook_endpoints,
        (select count(*) from public.app_error_events where (tenant_id = $1 or tenant_id is null) and created_at >= now() - interval '7 days')::text as recent_errors,
        (select count(*) from public.forms where tenant_id = $1 and active = true and public_key is not null)::text as public_forms,
        (select count(*) from public.brands where tenant_id = $1 and status = 'active')::text as active_brands
      `,
      [workspaceId]
    )
  ]);

  const counts = countResult?.rows[0];
  const missingEnvVars = integrations.reduce((sum, row) => sum + row.missingEnvVars.length, 0);
  const liveActions = liveActionCount(integrations);
  const nearLimits = controls.summary.warnings;
  const pendingApprovals = num(counts?.pending_approvals);
  const pendingActions = num(counts?.pending_actions);
  const recentErrors = num(counts?.recent_errors);
  const credentialsNeedKey = num(counts?.credentials_need_key);

  const coreItems: SafetyItem[] = [
    item(
      "Private app access",
      "Workspace dashboards stay behind the app session. Public demo, grader, proof, and forms remain separate.",
      "ready",
      "/app/access",
      "Access"
    ),
    item(
      "Business basics",
      num(counts?.active_brands) > 0 ? `${counts?.active_brands} active brand record(s) exist.` : "Add a brand before turning on customer-facing workflows.",
      num(counts?.active_brands) > 0 ? "ready" : "needs_setup",
      "/app/setup",
      "Setup"
    ),
    item(
      "Public lead capture",
      num(counts?.public_forms) > 0 ? `${counts?.public_forms} public form(s) are active.` : "Create a public form before sending traffic into Ferocity.",
      num(counts?.public_forms) > 0 ? "ready" : "needs_setup",
      "/app/forms",
      "Forms"
    ),
    item(
      "Recent app errors",
      recentErrors === 0 ? "No app errors were recorded in the last 7 days." : `${recentErrors} app error event(s) were recorded in the last 7 days.`,
      recentErrors === 0 ? "ready" : "blocked",
      "/app/alerts",
      "Alerts"
    )
  ];

  const providerItems: SafetyItem[] = [
    item(
      "Provider keys",
      missingEnvVars === 0 ? "Required provider environment variables are present or not required." : `${missingEnvVars} provider environment variable(s) are missing.`,
      missingEnvVars === 0 ? "ready" : "needs_setup",
      "/app/credentials",
      "Credentials"
    ),
    item(
      "Email sending",
      emailHealth.status === "ready" ? emailHealth.detail : `${emailHealth.title}: ${emailHealth.detail}`,
      emailHealth.status === "ready" ? "ready" : "needs_setup",
      "/app/integrations",
      "Email"
    ),
    item(
      "Customer-owned credentials",
      credentialsNeedKey === 0 ? `${counts?.credentials ?? 0} stored credential record(s), no encryption-key blocker.` : `${credentialsNeedKey} credential record(s) need CREDENTIAL_ENCRYPTION_KEY.`,
      credentialsNeedKey === 0 ? "ready" : "blocked",
      "/app/credentials",
      "Vault"
    ),
    item(
      "Webhooks",
      num(counts?.webhook_endpoints) > 0 ? `${counts?.webhook_endpoints} webhook endpoint(s) are configured.` : "No workspace webhook endpoints are configured yet.",
      num(counts?.webhook_endpoints) > 0 ? "ready" : "needs_setup",
      "/app/webhooks",
      "Webhooks"
    )
  ];

  const actionItems: SafetyItem[] = [
    item(
      "Approval queue",
      pendingApprovals === 0 ? "No pending approval records." : `${pendingApprovals} approval item(s) need review.`,
      pendingApprovals === 0 ? "ready" : "needs_review",
      "/app/approvals",
      "Approvals"
    ),
    item(
      "Action queue",
      pendingActions === 0 ? "No queued action records need attention." : `${pendingActions} action queue item(s) need attention.`,
      pendingActions === 0 ? "ready" : "needs_review",
      "/app/actions",
      "Actions"
    ),
    item(
      "Live external actions",
      liveActions === 0 ? "No integration has live external actions enabled by default." : `${liveActions} integration(s) have live actions enabled. Review before launch.`,
      liveActions === 0 ? "ready" : "needs_review",
      "/app/integrations",
      "Integrations"
    ),
    item(
      "Operator alerts",
      num(counts?.active_alerts) === 0 ? "No active operator alerts." : `${counts?.active_alerts} active operator alert(s).`,
      num(counts?.active_alerts) === 0 ? "ready" : "needs_review",
      "/app/alerts",
      "Alerts"
    )
  ];

  const limitItems: SafetyItem[] = [
    item(
      "Feature controls",
      `${controls.summary.reviewRequired} review-required, ${controls.summary.draftOnly} draft-only, ${controls.summary.enabled} enabled, ${controls.summary.off} off.`,
      controls.controls.length > 0 ? "ready" : "needs_setup",
      "/app/controls",
      "Controls"
    ),
    item(
      "Near usage limits",
      nearLimits === 0 ? "No service controls are near their usage limit." : `${nearLimits} service control(s) are close to their limit.`,
      nearLimits === 0 ? "ready" : "needs_review",
      "/app/controls",
      "Limits"
    ),
    item(
      "Billing readiness",
      billing.readiness.map((row) => `${row.label}: ${row.detail}`).join(" "),
      billing.readiness.some((row) => row.status === "blocked") ? "blocked" : billing.readiness.some((row) => row.status === "needs_setup") ? "needs_setup" : "ready",
      "/app/billing",
      "Billing"
    ),
    item(
      "Go-live checklist",
      "Use the detailed launch checklist before letting real customers, provider sends, Stripe payment links, or publishing run.",
      "needs_review",
      "/app/go-live",
      "Go Live"
    )
  ];

  const sections: SafetySection[] = [
    { title: "App And Data Safety", body: "Private dashboards, business records, public forms, and recent errors.", href: "/app/system-health", items: coreItems },
    { title: "Provider Readiness", body: "Email, app alerts, optional SMS, billing, webhooks, credentials, and customer-owned provider keys.", href: "/app/credentials", items: providerItems },
    { title: "Approvals And Live Actions", body: "Anything that could send, publish, bill, route, or affect reputation.", href: "/app/actions", items: actionItems },
    { title: "Limits And Launch", body: "Plan limits, cost controls, overages, billing, and final launch checks.", href: "/app/go-live", items: limitItems }
  ];

  const allItems = sections.flatMap((section) => section.items);
  const rank = { blocked: 0, needs_review: 1, needs_setup: 2, paused: 3, ready: 4 } satisfies Record<SafetyStatus, number>;
  const topNeeds = allItems
    .filter((row) => row.status !== "ready")
    .sort((a, b) => rank[a.status] - rank[b.status])
    .slice(0, 6);

  return {
    metrics: {
      ready: allItems.filter((row) => row.status === "ready").length,
      needsSetup: allItems.filter((row) => row.status === "needs_setup").length,
      needsReview: allItems.filter((row) => row.status === "needs_review").length,
      blocked: allItems.filter((row) => row.status === "blocked").length,
      paused: allItems.filter((row) => row.status === "paused").length,
      missingEnvVars,
      liveActions,
      nearLimits,
      pendingApprovals
    },
    topNeeds,
    sections
  };
}

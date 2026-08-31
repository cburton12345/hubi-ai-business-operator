import { queryPostgres } from "@/lib/db/postgres";
import { raisePlatformAdminAlert, resolvePlatformAdminAlert } from "@/lib/observability/platform-admin-alerts";

type PlatformBriefCounts = {
  new_subscriptions: string;
  cancellations: string;
  onboarding_errors: string;
  unresolved_support: string;
  failed_automations: string;
  provider_risks: string;
  active_critical_alerts: string;
  month_provider_cost_cents: string;
};

export async function sendPlatformAdminDailyBrief(now = new Date()) {
  const dateKey = now.toISOString().slice(0, 10);
  const fingerprint = `platform-daily-brief:${dateKey}`;
  const existing = await queryPostgres<{ id: string }>(
    `select id from public.platform_admin_alerts where fingerprint=$1 limit 1`,
    [fingerprint]
  );
  if (existing?.rows[0]) return { sent: false, reason: "already_sent" as const, dateKey };

  const result = await queryPostgres<PlatformBriefCounts>(
    `select
      (select count(*) from public.billing_subscriptions where status='active' and created_at >= current_date)::text as new_subscriptions,
      (select count(*) from public.billing_subscriptions where status='cancelled' and updated_at >= current_date)::text as cancellations,
      (select count(*) from public.app_error_events where created_at >= current_date and source like 'access-request%' and resolved_at is null)::text as onboarding_errors,
      (select count(*) from public.support_issue_queue where status in ('open','in_progress'))::text as unresolved_support,
      (select count(*) from public.app_error_events where created_at >= current_date and source like 'automation.%' and resolved_at is null)::text as failed_automations,
      (select count(*) from public.provider_connection_lanes where connection_status in ('blocked','needs_attention') or credentials_status in ('expired','revoked'))::text as provider_risks,
      (select count(*) from public.platform_admin_alerts where status='active' and severity in ('high','critical'))::text as active_critical_alerts,
      (select coalesce(sum(provider_cost_cents),0) from public.usage_meter_events where billing_period_start=date_trunc('month',now())::date and status not in ('void','failed'))::text as month_provider_cost_cents`
  );
  const row = result?.rows[0];
  const values = {
    newSubscriptions: Number(row?.new_subscriptions ?? 0),
    cancellations: Number(row?.cancellations ?? 0),
    onboardingErrors: Number(row?.onboarding_errors ?? 0),
    unresolvedSupport: Number(row?.unresolved_support ?? 0),
    failedAutomations: Number(row?.failed_automations ?? 0),
    providerRisks: Number(row?.provider_risks ?? 0),
    activeCriticalAlerts: Number(row?.active_critical_alerts ?? 0),
    monthProviderCostCents: Number(row?.month_provider_cost_cents ?? 0)
  };
  const body = [
    `${values.newSubscriptions} new paid subscription(s) today; ${values.cancellations} cancellation(s).`,
    `${values.onboardingErrors} onboarding error(s); ${values.unresolvedSupport} unresolved support request(s).`,
    `${values.failedAutomations} automation failure(s); ${values.providerRisks} provider connection risk(s).`,
    `${values.activeCriticalAlerts} active high/critical platform alert(s).`,
    `Recorded provider cost this month: $${(values.monthProviderCostCents / 100).toFixed(2)}.`
  ].join("\n");

  await raisePlatformAdminAlert({
    fingerprint,
    family: "operator_brief",
    type: "platform_daily_brief",
    severity: values.activeCriticalAlerts > 0 || values.failedAutomations > 0 ? "high" : "info",
    title: `Ferocity platform brief — ${dateKey}`,
    body,
    actionUrl: "/app/platform-activity",
    metadata: values
  });
  await resolvePlatformAdminAlert(fingerprint);
  return { sent: true, dateKey, ...values };
}

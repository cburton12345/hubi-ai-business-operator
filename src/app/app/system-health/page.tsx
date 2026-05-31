import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed, ShieldAlert, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { hasSupabaseAdminConfig, hasSupabaseBrowserConfig, missingEnvVars } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getEmailProviderHealth, type EmailProviderHealth } from "@/lib/email/provider-health";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type HealthStatus = "ok" | "needs_setup" | "warning" | "broken" | "not_connected" | "paused";

type HealthCheck = {
  title: string;
  body: string;
  status: HealthStatus;
  href: string;
  button: string;
};

type HealthStats = {
  health_query: string;
  brands: string;
  forms: string;
  form_errors: string;
  unassigned_leads: string;
  stale_followups: string;
  followups: string;
  templates: string;
  automations_without_templates: string;
  setup_applied: string;
  setup_reverted: string;
  setup_changes_applied: string;
  billing_plans: string;
  feature_gates: string;
  integrations: string;
  live_integrations: string;
  callback_integrations: string;
  marketplace_connections: string;
  marketplace_events: string;
  public_forms: string;
  pages: string;
};

type IntegrationStatus = {
  provider: string;
  display_name: string;
  status: string;
  credentials_status: string;
};

async function getSystemHealthData() {
  const workspaceId = await getCurrentWorkspaceId();
  const [statsResult, integrationsResult, emailHealth] = await Promise.all([
    queryPostgres<HealthStats>(
      `
      select
        (select count(*) from public.tenants where id = $1)::text as health_query,
        (select count(*) from public.brands where tenant_id = $1 and status <> 'archived')::text as brands,
        (select count(*) from public.forms where tenant_id = $1 and active = true)::text as forms,
        (select count(*) from public.app_error_events where (tenant_id = $1 or tenant_id is null) and source = 'api.public.leads' and created_at >= now() - interval '7 days')::text as form_errors,
        (select count(*) from public.leads where tenant_id = $1 and status in ('new','qualified') and assigned_to_user_id is null)::text as unassigned_leads,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open','scheduled','missed') and due_at < now())::text as stale_followups,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open','scheduled','missed'))::text as followups,
        (select count(*) from public.communication_templates where tenant_id = $1 and active = true)::text as templates,
        (
          select count(*) from public.follow_up_workflows f
          where f.tenant_id = $1
            and f.status in ('open','scheduled')
            and not exists (
              select 1 from public.communication_templates t
              where t.tenant_id = f.tenant_id and t.active = true
            )
        )::text as automations_without_templates,
        (select count(*) from public.setup_operator_runs where tenant_id = $1 and status = 'applied')::text as setup_applied,
        (select count(*) from public.setup_operator_runs where tenant_id = $1 and status = 'reverted')::text as setup_reverted,
        (select count(*) from public.setup_operator_run_changes where tenant_id = $1 and status = 'applied')::text as setup_changes_applied,
        (select count(*) from public.billing_plans where active = true)::text as billing_plans,
        (select count(*) from public.workspace_feature_entitlements where tenant_id = $1)::text as feature_gates,
        (select count(*) from public.integration_connections where tenant_id = $1)::text as integrations,
        (select count(*) from public.integration_connections where tenant_id = $1 and coalesce((metadata_json->>'liveActionsEnabled')::boolean, false) = true)::text as live_integrations,
        (select count(*) from public.integration_connections where tenant_id = $1 and metadata_json->>'callbackPath' is not null)::text as callback_integrations,
        (select count(*) from public.marketplacepro_connections where tenant_id = $1)::text as marketplace_connections,
        (select count(*) from public.marketplacepro_sync_events where tenant_id = $1)::text as marketplace_events,
        (select count(*) from public.forms where tenant_id = $1 and active = true and public_key is not null)::text as public_forms,
        (select count(*) from public.brand_landing_pages where tenant_id = $1 and status <> 'archived')::text as pages
      `,
      [workspaceId]
    ),
    queryPostgres<IntegrationStatus>(
      `
      select provider, display_name, status, credentials_status
      from public.integration_connections
      where tenant_id = $1
      order by provider
      `,
      [workspaceId]
    ),
    getEmailProviderHealth()
  ]);

  return { stats: statsResult?.rows[0] ?? null, integrations: integrationsResult?.rows ?? [], emailHealth };
}

function count(value: string | undefined) {
  return Number(value ?? 0);
}

function integration(integrations: IntegrationStatus[], provider: string) {
  return integrations.find((item) => item.provider === provider);
}

function connected(item: IntegrationStatus | undefined) {
  return item?.status === "connected" || item?.credentials_status === "configured";
}

function buildHealthChecks(stats: HealthStats | null, integrations: IntegrationStatus[], emailHealth: EmailProviderHealth): HealthCheck[] {
  const requiredCoreEnv = missingEnvVars(["DATABASE_URL", "ADMIN_ACCESS_TOKEN"]);
  const emailConfigured = connected(integration(integrations, "email_provider")) || connected(integration(integrations, "resend_shared"));
  const emailReady = emailHealth.status === "ready";
  const smsLive = connected(integration(integrations, "twilio")) || connected(integration(integrations, "twilio_shared"));
  const marketplace = integration(integrations, "marketplacepro");
  const liveIntegrations = count(stats?.live_integrations);

  return [
    {
      title: "Supabase health",
      body: stats && count(stats.health_query) > 0 ? "Database query succeeded for this workspace." : "Database health query failed or workspace was not found.",
      status: stats && count(stats.health_query) > 0 ? "ok" : "broken",
      href: "/api/health/supabase",
      button: "Health URL"
    },
    {
      title: "Core environment",
      body: requiredCoreEnv.length === 0 ? "Required local/server keys for this app are present." : `Missing: ${requiredCoreEnv.join(", ")}.`,
      status: requiredCoreEnv.length === 0 ? "ok" : "broken",
      href: "/app/credentials",
      button: "Credentials"
    },
    {
      title: "Supabase browser/admin config",
      body: hasSupabaseBrowserConfig() && hasSupabaseAdminConfig() ? "Supabase browser and admin config are present." : "Supabase public or admin keys are missing.",
      status: hasSupabaseBrowserConfig() && hasSupabaseAdminConfig() ? "ok" : "warning",
      href: "/app/credentials",
      button: "Check keys"
    },
    {
      title: "Private dashboard safety",
      body: "The app layout requires an admin/app session before rendering /app pages.",
      status: "ok",
      href: "/app/go-live",
      button: "Go Live"
    },
    {
      title: "Active brand",
      body: count(stats?.brands) > 0 ? `${stats?.brands} brand record(s) found.` : "No active/non-archived brand exists.",
      status: count(stats?.brands) > 0 ? "ok" : "needs_setup",
      href: "/app/setup",
      button: "Setup"
    },
    {
      title: "Lead forms",
      body: count(stats?.forms) > 0 ? `${stats?.forms} active form(s) found.` : "No active lead form exists.",
      status: count(stats?.forms) > 0 ? "ok" : "needs_setup",
      href: "/app/forms",
      button: "Forms"
    },
    {
      title: "Form errors",
      body: count(stats?.form_errors) === 0 ? "No public lead form errors in the last 7 days." : `${stats?.form_errors} form error event(s) in the last 7 days.`,
      status: count(stats?.form_errors) === 0 ? "ok" : "broken",
      href: "/app/alerts",
      button: "Alerts"
    },
    {
      title: "Unassigned leads",
      body: count(stats?.unassigned_leads) === 0 ? "No new/qualified leads are unassigned." : `${stats?.unassigned_leads} lead(s) need assignment.`,
      status: count(stats?.unassigned_leads) === 0 ? "ok" : "warning",
      href: "/app/leads",
      button: "Leads"
    },
    {
      title: "Stale follow-ups",
      body: count(stats?.stale_followups) === 0 ? "No overdue follow-up workflows." : `${stats?.stale_followups} follow-up item(s) are overdue.`,
      status: count(stats?.stale_followups) === 0 ? "ok" : "warning",
      href: "/app/operator",
      button: "Operator"
    },
    {
      title: "Templates for automations",
      body: count(stats?.automations_without_templates) === 0 ? "Automations are not missing communication templates." : `${stats?.automations_without_templates} workflow(s) have no active templates.`,
      status: count(stats?.automations_without_templates) === 0 ? "ok" : "warning",
      href: "/app/operator",
      button: "Templates"
    },
    {
      title: "Setup run audit",
      body: count(stats?.setup_applied) > 0 || count(stats?.setup_reverted) > 0 ? `${stats?.setup_applied} applied and ${stats?.setup_reverted} reverted setup run(s).` : "No setup plan has been applied yet.",
      status: count(stats?.setup_applied) > 0 || count(stats?.setup_reverted) > 0 ? "ok" : "needs_setup",
      href: "/app/build-system",
      button: "Build"
    },
    {
      title: "Feature gates",
      body: count(stats?.feature_gates) > 0 ? `${stats?.feature_gates} feature gate(s) found.` : "No feature gates exist yet.",
      status: count(stats?.feature_gates) > 0 ? "ok" : "needs_setup",
      href: "/app/controls",
      button: "Controls"
    },
    {
      title: "Billing plans",
      body: count(stats?.billing_plans) > 0 ? `${stats?.billing_plans} active billing plan(s) found.` : "No active billing plans are configured.",
      status: count(stats?.billing_plans) > 0 ? "ok" : "needs_setup",
      href: "/app/billing",
      button: "Billing"
    },
    {
      title: "Integration placeholders",
      body: count(stats?.integrations) > 0 ? `${stats?.integrations} integration placeholder(s) found.` : "No integration placeholders exist.",
      status: count(stats?.integrations) > 0 ? "ok" : "needs_setup",
      href: "/app/integrations",
      button: "Integrations"
    },
    {
      title: "Live integrations",
      body: liveIntegrations === 0 ? "No live provider actions are enabled by accident." : `${liveIntegrations} live provider connection(s) are enabled.`,
      status: liveIntegrations === 0 ? "paused" : "broken",
      href: "/app/integrations",
      button: "Inspect"
    },
    {
      title: "Provider callbacks",
      body: count(stats?.callback_integrations) >= 3 ? `${stats?.callback_integrations} callback-ready integration(s) found.` : "Few provider callback stubs are registered.",
      status: count(stats?.callback_integrations) >= 3 ? "ok" : "warning",
      href: "/app/integrations",
      button: "Callbacks"
    },
    {
      title: "Email sending",
      body: emailReady
        ? emailHealth.detail
        : emailConfigured
          ? `${emailHealth.title}: ${emailHealth.detail}`
          : `${emailHealth.title}. Email is not connected or intentionally paused.`,
      status: emailReady ? "ok" : emailHealth.status === "provider_rejected" ? "broken" : "not_connected",
      href: "/app/integrations",
      button: "Email"
    },
    {
      title: "SMS sending",
      body: smsLive ? "SMS provider route is configured." : "SMS is not connected or intentionally paused.",
      status: smsLive ? "ok" : "not_connected",
      href: "/app/integrations",
      button: "SMS"
    },
    {
      title: "MarketplacePro bridge",
      body: marketplace ? `MarketplacePro is ${marketplace.status}; ${stats?.marketplace_connections ?? 0} mapping(s), ${stats?.marketplace_events ?? 0} event(s).` : "MarketplacePro placeholder is missing.",
      status: marketplace ? (connected(marketplace) ? "ok" : "paused") : "needs_setup",
      href: "/app/integrations",
      button: "Marketplace"
    },
    {
      title: "Public pages and forms",
      body: count(stats?.pages) > 0 || count(stats?.public_forms) > 0 ? `${stats?.pages} page target(s), ${stats?.public_forms} public form(s).` : "No public growth pages or forms are ready.",
      status: count(stats?.pages) > 0 || count(stats?.public_forms) > 0 ? "ok" : "needs_setup",
      href: "/app/sites",
      button: "Sites"
    }
  ];
}

function label(status: HealthStatus) {
  const labels = {
    ok: "OK",
    needs_setup: "Needs setup",
    warning: "Warning",
    broken: "Broken",
    not_connected: "Not connected",
    paused: "Intentionally paused"
  };
  return labels[status];
}

function classNameFor(status: HealthStatus) {
  if (status === "ok") return "status-included";
  if (status === "warning" || status === "paused") return "status-draft_only";
  if (status === "broken") return "high";
  return "status-needs_setup";
}

function iconFor(status: HealthStatus) {
  if (status === "ok") return <CheckCircle2 size={18} />;
  if (status === "paused" || status === "not_connected") return <CircleDashed size={18} />;
  if (status === "broken") return <ShieldAlert size={18} />;
  return <CircleAlert size={18} />;
}

export default async function SystemHealthPage() {
  const { stats, integrations, emailHealth } = await getSystemHealthData();
  const checks = buildHealthChecks(stats, integrations, emailHealth);
  const totals = {
    ok: checks.filter((item) => item.status === "ok").length,
    warning: checks.filter((item) => item.status === "warning").length,
    broken: checks.filter((item) => item.status === "broken").length,
    notConnected: checks.filter((item) => item.status === "not_connected").length,
    paused: checks.filter((item) => item.status === "paused").length,
    needsSetup: checks.filter((item) => item.status === "needs_setup").length
  };

  return (
    <QueuePageShell
      eyebrow="System Health"
      title="Broken, Missing, Or Not Hooked Up"
      description="A read-only scan for what is working, what needs setup, what is intentionally paused, and what could be broken."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Health Summary</h2>
            <p className="muted">This does not change anything. It helps find risky gaps before launch or demos.</p>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="grid">
          <div className="panel span-2 metric"><span className="muted">OK</span><strong>{totals.ok}</strong></div>
          <div className="panel span-2 metric"><span className="muted">Warnings</span><strong>{totals.warning}</strong></div>
          <div className="panel span-2 metric"><span className="muted">Broken</span><strong>{totals.broken}</strong></div>
          <div className="panel span-2 metric"><span className="muted">Needs setup</span><strong>{totals.needsSetup}</strong></div>
          <div className="panel span-2 metric"><span className="muted">Not connected</span><strong>{totals.notConnected}</strong></div>
          <div className="panel span-2 metric"><span className="muted">Paused</span><strong>{totals.paused}</strong></div>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Checks</h2>
            <p className="muted">Plain-English checks from environment config, database records, integrations, forms, setup logs, and safety gates.</p>
          </div>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/go-live">Go Live scan</Link>
            <Link className="mini-button" href="/app/qa">Operational QA</Link>
          </div>
        </div>
        <ul className="list">
          {checks.map((check) => (
            <li className="list-row" key={check.title}>
              <div className="inline-title">
                {iconFor(check.status)}
                <div>
                  <h3>{check.title}</h3>
                  <p className="muted">{check.body}</p>
                </div>
              </div>
              <div className="inline-actions">
                <span className={`pill ${classNameFor(check.status)}`}>{label(check.status)}</span>
                <Link className="mini-button" href={check.href}>{check.button}</Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </QueuePageShell>
  );
}

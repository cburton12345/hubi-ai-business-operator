import Link from "next/link";
import { CheckCircle2, CircleAlert, CircleDashed, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { queryPostgres } from "@/lib/db/postgres";
import { getEmailProviderHealth, type EmailProviderHealth } from "@/lib/email/provider-health";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

type LaunchStats = {
  brands: string;
  brands_missing_contact: string;
  services: string;
  areas: string;
  forms: string;
  templates: string;
  templates_needing_review: string;
  followups: string;
  review_workflows: string;
  pages: string;
  published_pages: string;
  manual_marketing_settings: string;
  feature_gates: string;
  billing_subscriptions: string;
  billing_plans: string;
};

type IntegrationStatus = {
  provider: string;
  display_name: string;
  status: string;
  credentials_status: string;
};

type LaunchCheck = {
  title: string;
  body: string;
  status: "ready" | "needs_setup" | "needs_provider" | "needs_approval" | "optional";
  href: string;
  button: string;
};

async function getLaunchReadiness() {
  const workspaceId = await getCurrentWorkspaceId();
  const [statsResult, integrationsResult, emailHealth] = await Promise.all([
    queryPostgres<LaunchStats>(
      `
      select
        (select count(*) from public.brands where tenant_id = $1 and status = 'active')::text as brands,
        (select count(*) from public.brands where tenant_id = $1 and status = 'active' and (phone is null or email is null or primary_location is null))::text as brands_missing_contact,
        (select count(*) from public.brand_services where tenant_id = $1 and active = true)::text as services,
        (select count(*) from public.brand_locations where tenant_id = $1 and active = true)::text as areas,
        (select count(*) from public.forms where tenant_id = $1 and active = true)::text as forms,
        (select count(*) from public.communication_templates where tenant_id = $1 and active = true)::text as templates,
        (select count(*) from public.communication_templates where tenant_id = $1 and active = true and requires_approval = true)::text as templates_needing_review,
        (select count(*) from public.follow_up_workflows where tenant_id = $1 and status in ('open','scheduled'))::text as followups,
        (select count(*) from public.review_request_workflows where tenant_id = $1 and status in ('draft','scheduled'))::text as review_workflows,
        (select count(*) from public.brand_landing_pages where tenant_id = $1 and status in ('planned','draft','published'))::text as pages,
        (select count(*) from public.brand_landing_pages where tenant_id = $1 and status = 'published')::text as published_pages,
        (select count(*) from public.brand_marketing_settings where tenant_id = $1 and approval_mode = 'manual')::text as manual_marketing_settings,
        (select count(*) from public.workspace_feature_entitlements where tenant_id = $1)::text as feature_gates,
        (select count(*) from public.billing_subscriptions where tenant_id = $1)::text as billing_subscriptions,
        (select count(*) from public.billing_plans where active = true)::text as billing_plans
      `,
      [workspaceId]
    ),
    queryPostgres<IntegrationStatus>(
      `
      select provider, display_name, status, credentials_status
      from public.integration_connections
      where tenant_id = $1
        and provider in (
          'resend_shared',
          'email_provider',
          'twilio',
          'twilio_shared',
          'google_business_profile',
          'marketplacepro',
          'stripe',
          'external_publishing'
        )
      order by provider
      `,
      [workspaceId]
    ),
    getEmailProviderHealth()
  ]);

  const stats = statsResult?.rows[0] ?? null;
  const integrations = integrationsResult?.rows ?? [];
  return { stats, integrations, emailHealth };
}

function n(value: string | undefined) {
  return Number(value ?? 0);
}

function integration(integrations: IntegrationStatus[], provider: string) {
  return integrations.find((item) => item.provider === provider);
}

function connected(item: IntegrationStatus | undefined) {
  return item?.status === "connected" || item?.credentials_status === "configured";
}

function buildChecks(stats: LaunchStats | null, integrations: IntegrationStatus[], emailHealth: EmailProviderHealth): LaunchCheck[] {
  const emailReady = emailHealth.status === "ready";
  const smsReady = connected(integration(integrations, "twilio")) || connected(integration(integrations, "twilio_shared"));
  const marketplaceReady = connected(integration(integrations, "marketplacepro"));
  const stripeReady = connected(integration(integrations, "stripe"));
  const gbpReady = connected(integration(integrations, "google_business_profile"));
  const publishingReady = connected(integration(integrations, "external_publishing"));

  return [
    {
      title: "Business basics",
      body: stats && n(stats.brands) > 0 && n(stats.brands_missing_contact) === 0 ? "Brand basics look ready." : "Add or confirm business name, phone, email, and service area.",
      status: stats && n(stats.brands) > 0 && n(stats.brands_missing_contact) === 0 ? "ready" : "needs_setup",
      href: "/app/setup",
      button: "Fix basics"
    },
    {
      title: "Services and areas",
      body: stats && n(stats.services) > 0 && n(stats.areas) > 0 ? `${stats.services} service(s) and ${stats.areas} area(s) are active.` : "Add at least one service and one service area.",
      status: stats && n(stats.services) > 0 && n(stats.areas) > 0 ? "ready" : "needs_setup",
      href: "/app/brands",
      button: "Edit services"
    },
    {
      title: "Lead form",
      body: stats && n(stats.forms) > 0 ? `${stats.forms} active lead form(s) found.` : "Create or activate a lead form before sending traffic.",
      status: stats && n(stats.forms) > 0 ? "ready" : "needs_setup",
      href: "/app/forms",
      button: "Open forms"
    },
    {
      title: "Follow-up templates",
      body: stats && n(stats.templates) > 0 ? `${stats.templates} template(s) are ready for review.` : "Create lead, estimate, invoice, and review templates.",
      status: stats && n(stats.templates) > 0 ? "needs_approval" : "needs_setup",
      href: "/app/operator",
      button: "Review templates"
    },
    {
      title: "Automations",
      body: stats && n(stats.followups) > 0 ? `${stats.followups} follow-up workflow(s) are active or scheduled.` : "Create follow-up rules for stale leads, estimates, invoices, and callbacks.",
      status: stats && n(stats.followups) > 0 ? "ready" : "needs_setup",
      href: "/app/automation",
      button: "Set rules"
    },
    {
      title: "Review workflow",
      body: stats && n(stats.review_workflows) > 0 ? "Review request workflow is drafted or scheduled." : "Set when to ask for reviews after completed work.",
      status: stats && n(stats.review_workflows) > 0 ? "needs_approval" : "needs_setup",
      href: "/app/review",
      button: "Review"
    },
    {
      title: "SEO and page publishing",
      body: stats && n(stats.pages) > 0 ? `${stats.pages} page target(s) exist. ${stats.published_pages} published.` : "Plan service/location pages before publishing.",
      status: stats && n(stats.pages) > 0 && n(stats.manual_marketing_settings) > 0 ? "needs_approval" : "needs_setup",
      href: "/app/sites",
      button: "Open pages"
    },
    {
      title: "Email provider",
      body: emailReady ? emailHealth.detail : `${emailHealth.title}: ${emailHealth.detail}`,
      status: emailReady ? "ready" : "needs_provider",
      href: "/app/integrations",
      button: "Connect email"
    },
    {
      title: "SMS provider",
      body: smsReady ? "SMS route is configured." : "SMS needs Twilio or shared SMS setup plus consent and compliance rules.",
      status: smsReady ? "ready" : "needs_provider",
      href: "/app/integrations",
      button: "Connect SMS"
    },
    {
      title: "Google profile / reviews",
      body: gbpReady ? "Google Business Profile is connected." : "GBP is optional, but needed for live review/post sync.",
      status: gbpReady ? "ready" : "optional",
      href: "/app/integrations",
      button: "Connect GBP"
    },
    {
      title: "MarketplacePro bridge",
      body: marketplaceReady ? "MarketplacePro is connected." : "Optional bridge is prepared but not connected.",
      status: marketplaceReady ? "ready" : "optional",
      href: "/app/integrations",
      button: "Connect"
    },
    {
      title: "Billing and plan limits",
      body: stats && n(stats.billing_plans) > 0 && n(stats.feature_gates) > 0 ? "Plan and feature limit records exist." : "Create plan limits before enforcing paid tiers or overages.",
      status: stats && n(stats.billing_plans) > 0 && n(stats.feature_gates) > 0 ? (stripeReady || n(stats.billing_subscriptions) > 0 ? "ready" : "needs_provider") : "needs_setup",
      href: "/app/billing",
      button: "Review billing"
    },
    {
      title: "Public demo/private app safety",
      body: "Public demo pages are separate from the private workspace, and /app is behind sign-in/session checks.",
      status: "ready",
      href: "/app/sample-tour",
      button: "View tour"
    },
    {
      title: "Live publishing provider",
      body: publishingReady ? "External publishing provider is connected." : "Optional. Manual export and draft review can be used before live publishing.",
      status: publishingReady ? "ready" : "optional",
      href: "/app/integrations",
      button: "Publishing"
    }
  ];
}

function statusLabel(status: LaunchCheck["status"]) {
  const labels = {
    ready: "Ready",
    needs_setup: "Needs setup",
    needs_provider: "Needs provider key",
    needs_approval: "Needs approval",
    optional: "Optional"
  };
  return labels[status];
}

function statusClass(status: LaunchCheck["status"]) {
  if (status === "ready") return "status-included";
  if (status === "needs_approval") return "status-draft_only";
  if (status === "optional") return "";
  return "status-needs_setup";
}

function statusIcon(status: LaunchCheck["status"]) {
  if (status === "ready") return <CheckCircle2 size={18} />;
  if (status === "optional") return <CircleDashed size={18} />;
  return <CircleAlert size={18} />;
}

export default async function GoLivePage() {
  const { stats, integrations, emailHealth } = await getLaunchReadiness();
  const checks = buildChecks(stats, integrations, emailHealth);
  const ready = checks.filter((check) => check.status === "ready").length;
  const blockers = checks.filter((check) => check.status === "needs_setup" || check.status === "needs_provider").length;
  const approvals = checks.filter((check) => check.status === "needs_approval").length;
  const optional = checks.filter((check) => check.status === "optional").length;

  return (
    <QueuePageShell
      eyebrow="Go Live"
      title="Workspace Readiness Scan"
      description="Ferocity checks the workspace automatically and shows what is ready, what needs setup, what needs a provider key, and what only needs approval."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Launch Summary</h2>
            <p className="muted">This does not turn anything on. It is a read-only readiness check with links to fix each item.</p>
          </div>
          <ShieldCheck size={22} />
        </div>
        <div className="grid">
          <div className="panel span-3 metric">
            <span className="muted">Ready</span>
            <strong>{ready}</strong>
          </div>
          <div className="panel span-3 metric">
            <span className="muted">Needs setup/provider</span>
            <strong>{blockers}</strong>
          </div>
          <div className="panel span-3 metric">
            <span className="muted">Needs approval</span>
            <strong>{approvals}</strong>
          </div>
          <div className="panel span-3 metric">
            <span className="muted">Optional</span>
            <strong>{optional}</strong>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Readiness Checks</h2>
            <p className="muted">Most of this is checked from real workspace records. Optional items do not block launch.</p>
          </div>
          <Link className="mini-button" href="/app/build-system">
            Build missing pieces
          </Link>
        </div>
        <ul className="list">
          {checks.map((check) => (
            <li className="list-row" key={check.title}>
              <div className="inline-title">
                {statusIcon(check.status)}
                <div>
                  <h3>{check.title}</h3>
                  <p className="muted">{check.body}</p>
                </div>
              </div>
              <div className="inline-actions">
                <span className={`pill ${statusClass(check.status)}`}>{statusLabel(check.status)}</span>
                <Link className="mini-button" href={check.href}>
                  {check.button}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Before Live Sending Or Publishing</h2>
            <p className="muted">
              Keep customer messages, public posts, review responses, provider sync, and ad spend behind approval until credentials,
              consent, limits, and billing rules are confirmed.
            </p>
          </div>
          <Link className="mini-button" href="/app/controls">
            Review controls
          </Link>
        </div>
      </section>
    </QueuePageShell>
  );
}

import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Megaphone,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Workflow
} from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { executeAiWorkforceCommandSimpleAction } from "@/app/app/ai-workforce/actions";
import { getLatestAiCommandRun } from "@/lib/ai-workforce/command-runs";
import { getDashboardSnapshot } from "@/lib/dashboard/get-dashboard-snapshot";
import { queryPostgres } from "@/lib/db/postgres";
import { getProviderCapabilityReadiness } from "@/lib/integrations/provider-lane-readiness";
import { getCurrentWorkspace } from "@/lib/workspace/current-workspace";

type ManagedCountsRow = {
  owner_attention: string;
  critical_events: string;
  ai_handled_today: string;
  approval_queue: string;
  provider_blocks: string;
  app_errors: string;
  ai_fallbacks: string;
};

type ManagedEventRow = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  recommended_action: string | null;
  action_href: string | null;
  occurred_at: Date;
};

async function getManagedOperatorSnapshot(workspaceId: string) {
  const [countsResult, eventsResult] = await Promise.all([
    queryPostgres<ManagedCountsRow>(
      `
      select
        (select count(*) from public.owner_command_events where tenant_id = $1 and (owner_attention = true or status = 'needs_owner'))::text as owner_attention,
        (select count(*) from public.owner_command_events where tenant_id = $1 and severity = 'critical' and status not in ('resolved','archived'))::text as critical_events,
        (select count(*) from public.owner_command_events where tenant_id = $1 and ai_handled = true and occurred_at >= now() - interval '1 day')::text as ai_handled_today,
        (select count(*) from public.review_first_export_queue where tenant_id = $1 and status in ('draft','needs_review','blocked','approved'))::text as approval_queue,
        (select count(*) from public.provider_connection_lanes where tenant_id = $1 and connection_status in ('not_connected','needs_attention','blocked'))::text as provider_blocks,
        (select count(*) from public.app_error_events where (tenant_id = $1 or tenant_id is null) and severity in ('error','critical') and resolved_at is null and created_at >= now() - interval '7 days')::text as app_errors,
        (select count(*) from public.ai_generation_runs where tenant_id = $1 and fallback_used = true and created_at >= now() - interval '7 days')::text as ai_fallbacks
      `,
      [workspaceId]
    ),
    queryPostgres<ManagedEventRow>(
      `
      select id, title, summary, severity, status, recommended_action, action_href, occurred_at
      from public.owner_command_events
      where tenant_id = $1
        and status not in ('resolved','archived')
      order by
        case when owner_attention then 0 else 1 end,
        case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end,
        occurred_at desc
      limit 6
      `,
      [workspaceId]
    )
  ]);

  return {
    counts: countsResult?.rows[0] ?? {
      owner_attention: "0",
      critical_events: "0",
      ai_handled_today: "0",
      approval_queue: "0",
      provider_blocks: "0",
      app_errors: "0",
      ai_fallbacks: "0"
    },
    events: eventsResult?.rows ?? []
  };
}

function numberText(value: string | number) {
  return Number(value ?? 0).toLocaleString();
}

function moneyFromLabel(value: string) {
  return value || "$0";
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function statusTone(value: string | number) {
  return Number(value) > 0 ? "high" : "";
}

function providerStatus(capability: Awaited<ReturnType<typeof getProviderCapabilityReadiness>>[number]) {
  const connected =
    capability.customerOwned.connectionStatus === "connected" ||
    capability.customerOwned.connectionStatus === "available" ||
    capability.ferocityManaged.connectionStatus === "connected" ||
    capability.ferocityManaged.connectionStatus === "available";
  return connected ? "Ready path" : "Needs setup";
}

export default async function ManagedOperatorPage() {
  const workspace = await getCurrentWorkspace();
  const [snapshot, managed, providerCapabilities, latestCommand] = await Promise.all([
    getDashboardSnapshot(),
    getManagedOperatorSnapshot(workspace.id),
    getProviderCapabilityReadiness(workspace.id),
    getLatestAiCommandRun(workspace.id)
  ]);

  const counts = managed.counts;
  const mainQueues = [
    {
      label: "Needs owner",
      value: counts.owner_attention,
      detail: "Money, risk, approvals, or low-confidence items.",
      href: "/app/owner-command-center",
      icon: AlertTriangle
    },
    {
      label: "AI handled today",
      value: counts.ai_handled_today,
      detail: "Recorded items Ferocity handled or prepared.",
      href: "/app/automation-timeline",
      icon: Bot
    },
    {
      label: "Approvals waiting",
      value: counts.approval_queue,
      detail: "Drafts, posts, replies, exports, and live-action reviews.",
      href: "/app/publishing-hub",
      icon: ShieldCheck
    },
    {
      label: "Connection blocks",
      value: counts.provider_blocks,
      detail: "Provider routes that still need credentials or setup.",
      href: "/app/integrations",
      icon: PlugZap
    }
  ];

  const operatingLoops = [
    ["Sell Ferocity", "Track requests, qualify leads, prepare replies, and push interested businesses toward setup.", "/app/access-requests", Megaphone],
    ["Onboard customers", "Use Business Info, Guided Setup, website connection, controls, and first automation paths.", "/app/welcome", Workflow],
    ["Protect money", "Watch subscriptions, invoices, payment failures, usage billing, and managed payment readiness.", "/app/billing", CircleDollarSign],
    ["Run daily brief", "Batch routine items and interrupt only for money, risk, failures, urgent customers, and approvals.", "/app/ai-monitoring", Clock3]
  ] as const;

  const providerPreview = providerCapabilities.slice(0, 8);

  return (
    <QueuePageShell
      eyebrow="Managed Operator"
      title="Let Ferocity handle more of the business."
      description={`This is the control room for ${workspace.name}. It shows what AI can handle, what needs approval, and what is blocked before Ferocity can operate with less owner involvement.`}
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Sparkles size={18} /> Ferocity Managing Ferocity
            </h2>
            <p className="muted">
              Use this workspace as the first real test. Ferocity should help sell itself, follow up, onboard customers, watch money,
              prepare marketing, and bring only important decisions to the owner.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/business-brain">Business Info</Link>
            <Link className="button secondary-button" href="/app/owner-command-center">Owner Events</Link>
            <Link className="button secondary-button" href="/app/feature-readiness">Truth Board</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        {mainQueues.map((item) => {
          const Icon = item.icon;
          return (
            <Link className="panel span-3 metric" href={item.href} key={item.label}>
              <Icon size={18} />
              <span className="muted">{item.label}</span>
              <strong>{numberText(item.value)}</strong>
              <small className="muted">{item.detail}</small>
            </Link>
          );
        })}
      </section>

      <section className="panel section-actions">
        <div className="operator-command-hero">
          <div>
            <p className="eyebrow">Tell Ferocity the outcome</p>
            <h2>One place to ask for setup, follow-up, marketing, jobs, money, or reminders.</h2>
            <p className="muted">
              The AI routes the request to existing Ferocity tools. It prepares work and logs what happened instead of creating a second hidden system.
            </p>
          </div>
          <form className="operator-command-input large-command" action={executeAiWorkforceCommandSimpleAction}>
            <label className="sr-only" htmlFor="managed-operator-command">Tell Ferocity what to do</label>
            <input
              id="managed-operator-command"
              name="command"
              placeholder="Example: follow up with new Ferocity leads, prepare tomorrow's owner brief, or create a launch campaign..."
              minLength={8}
              maxLength={2000}
              required
            />
            <button className="mini-button" type="submit">Prepare it</button>
          </form>
        </div>
        {latestCommand ? (
          <div className="list-row">
            <div>
              <strong>Latest AI command</strong>
              <p className="muted">{latestCommand.command}</p>
            </div>
            <Link className="mini-button" href={`/app/ai-workforce/results/${latestCommand.id}`}>Open result</Link>
          </div>
        ) : null}
      </section>

      <section className="grid section-actions">
        {operatingLoops.map(([title, detail, href, Icon]) => (
          <Link className="panel span-6" href={href} key={title}>
            <div className="inline-title">
              <Icon size={18} />
              <h2>{title}</h2>
            </div>
            <p className="muted">{detail}</p>
          </Link>
        ))}
      </section>

      <section className="grid section-actions">
        <section className="panel span-6 section-actions">
          <div className="list-row flush-row">
            <div>
              <h2>Live Workspace Signals</h2>
              <p className="muted">These use current workspace data, not demo promises.</p>
            </div>
            <Link className="mini-button" href="/app">Command center</Link>
          </div>
          <div className="status-grid compact-status-grid">
            <Metric label="Open leads" value={snapshot.metrics.openLeads} href="/app/lead-command" />
            <Metric label="Follow-ups due" value={snapshot.metrics.followUpsDue} href="/app/actions" />
            <Metric label="Unpaid invoices" value={snapshot.metrics.unpaidInvoices} href="/app/cash-collection" />
            <Metric label="Pipeline" value={moneyFromLabel(snapshot.metrics.pipelineValue)} href="/app/reports" />
            <Metric label="Team plans needed" value={snapshot.operator.ownerSummary.itineraryNeeded} href="/app/crew-itinerary" />
            <Metric label="Review queue" value={snapshot.metrics.actionQueue} href="/app/publishing-hub" />
          </div>
        </section>

        <section className="panel span-6 section-actions">
          <div className="list-row flush-row">
            <div>
              <h2>What Still Blocks Autopilot</h2>
              <p className="muted">These are the reasons Ferocity should ask instead of acting.</p>
            </div>
            <Link className="mini-button" href="/app/integrations">Fix connections</Link>
          </div>
          <ul className="list compact-list">
            <li className="list-row">
              <span>Critical unresolved events</span>
              <span className={`pill ${statusTone(counts.critical_events)}`}>{numberText(counts.critical_events)}</span>
            </li>
            <li className="list-row">
              <span>Recent app errors</span>
              <span className={`pill ${statusTone(counts.app_errors)}`}>{numberText(counts.app_errors)}</span>
            </li>
            <li className="list-row">
              <span>Recent AI fallbacks</span>
              <span className={`pill ${statusTone(counts.ai_fallbacks)}`}>{numberText(counts.ai_fallbacks)}</span>
            </li>
            <li className="list-row">
              <span>Provider connections needing setup</span>
              <span className={`pill ${statusTone(counts.provider_blocks)}`}>{numberText(counts.provider_blocks)}</span>
            </li>
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Owner Decisions</h2>
            <p className="muted">Ferocity should keep routine work moving and bring these items forward.</p>
          </div>
          <Link className="mini-button" href="/app/owner-command-center">Open all</Link>
        </div>
        <ul className="list">
          {managed.events.map((event) => (
            <li className="list-row" key={event.id}>
              <div>
                <h3>{event.title}</h3>
                <p>{event.summary}</p>
                <p className="muted">{event.recommended_action ?? "Review and decide next step."} / {dateLabel(event.occurred_at)}</p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${event.severity === "critical" || event.severity === "high" ? "high" : event.severity === "medium" ? "medium" : ""}`}>
                  {event.status.replaceAll("_", " ")}
                </span>
                <Link className="mini-button" href={event.action_href ?? "/app/owner-command-center"}>Open</Link>
              </div>
            </li>
          ))}
          {managed.events.length === 0 ? (
            <li className="list-row">
              <CheckCircle2 size={18} />
              <span className="muted">No open owner-decision events right now.</span>
            </li>
          ) : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Provider Readiness</h2>
            <p className="muted">Customer-owned and Ferocity-managed paths stay side by side so customers are not forced into one setup.</p>
          </div>
          <Link className="mini-button" href="/app/credentials">Credentials</Link>
        </div>
        <div className="status-grid">
          {providerPreview.map((capability) => (
            <Link className="status-card" href="/app/integrations" key={capability.capabilityKey}>
              <div>
                <h3>{capability.label}</h3>
                <p className="muted">{capability.description}</p>
                <small className="muted">
                  Customer: {capability.customerOwned.connectionStatus.replaceAll("_", " ")} / Ferocity: {capability.ferocityManaged.connectionStatus.replaceAll("_", " ")}
                </small>
              </div>
              <span className={`pill ${providerStatus(capability) === "Ready path" ? "" : "medium"}`}>{providerStatus(capability)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>Truth</h2>
        <p>
          Ferocity can manage repeat work when the workspace has enough context, rules, approvals, and connected signals.
          It should ask for help when provider keys are missing, confidence is low, money is moving, a customer is upset, a legal or safety issue appears, or live publishing/spend is involved.
        </p>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link className="status-card" href={href}>
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </Link>
  );
}

import Link from "next/link";
import type React from "react";
import { Bot, CheckCircle2, CircleAlert, Gauge, GitBranch, PlayCircle, ShieldCheck, Workflow } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAutomationCommandDashboard } from "@/lib/automation-command/get-automation-command-dashboard";

function tone(value: string) {
  if (["high", "blocked", "failed", "missing"].includes(value)) return "high";
  if (["medium", "needs_review", "approved", "queued", "approval_required"].includes(value)) return "medium";
  return "";
}

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default async function AutomationCommandPage() {
  const dashboard = await getAutomationCommandDashboard();

  return (
    <QueuePageShell
      eyebrow="Automation Rules"
      title="What Can Run, What Needs Review, What Is Blocked"
      description="One place to see what Ferocity can do automatically, what needs review, and what is waiting on a connection."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Plain automation view</p>
            <h2>Automation should feel powerful, not mysterious.</h2>
            <p className="muted">
              Ferocity can find work, prepare drafts, and queue actions. Customer messages, public posts, payments, and outside connections stay visible and controlled.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="/app/ai-workforce">
              <Bot size={16} /> AI Workforce
            </Link>
            <Link className="button secondary-button" href="/app/actions">
              Action Queue
            </Link>
          </div>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/automation">Recurring Rules</Link>
          <Link className="button secondary-button" href="/app/workflows">Workflows</Link>
          <Link className="button secondary-button" href="/app/controls">Controls</Link>
          <Link className="button secondary-button" href="/app/safety-readiness">Safety</Link>
          <Link className="button secondary-button" href="/app/integrations">Connections</Link>
          <Link className="button secondary-button" href="/app/build-system">Have AI Set This Up</Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="AI workflows" value={dashboard.metrics.aiWorkflows} icon={<Bot size={16} />} />
        <Metric label="AI outputs waiting" value={dashboard.metrics.openAgentOutputs} icon={<PlayCircle size={16} />} tone={dashboard.metrics.openAgentOutputs ? "medium" : ""} />
        <Metric label="Automation rules" value={dashboard.metrics.automationRules} icon={<Workflow size={16} />} />
        <Metric label="Queued actions" value={dashboard.metrics.queuedActions} icon={<CheckCircle2 size={16} />} tone={dashboard.metrics.queuedActions ? "medium" : ""} />
        <Metric label="Needs review" value={dashboard.metrics.needsReview} icon={<ShieldCheck size={16} />} tone={dashboard.metrics.needsReview ? "high" : ""} />
        <Metric label="Blocked" value={dashboard.metrics.blockedActions} icon={<CircleAlert size={16} />} tone={dashboard.metrics.blockedActions ? "high" : ""} />
        <Metric label="Missing consent" value={dashboard.metrics.missingConsent} icon={<ShieldCheck size={16} />} tone={dashboard.metrics.missingConsent ? "high" : ""} />
        <Metric label="Near limits" value={dashboard.metrics.controlsNearLimit} icon={<Gauge size={16} />} tone={dashboard.metrics.controlsNearLimit ? "medium" : ""} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Do These Next</h2>
          <p className="muted">Fix safety blockers before trusting live automation.</p>
          <ul className="list">
            {dashboard.nextActions.map((action) => (
              <li className="list-row" key={action.title}>
                <div>
                  <h3>{action.title}</h3>
                  <p className="muted">{action.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(action.urgency)}`}>{action.urgency}</span>
                  <Link className="mini-button" href={action.href}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-7">
          <h2>Automation Runway</h2>
          <p className="muted">These are the plain stages between AI noticing something and anything touching a customer or public channel.</p>
          <div className="path-grid">
            {[
              ["Find work", "Scans leads, estimates, invoices, jobs, reviews, SEO, publishing, and provider events.", "/app/automation"],
              ["Prepare output", "AI agents create drafts, tasks, summaries, reminders, and queued actions.", "/app/ai-workforce"],
              ["Check safety", "Consent, connected accounts, live policies, plan limits, and risk rules are checked.", "/app/safety-readiness"],
              ["Review queue", "Human approval stays visible for messages, publishing, reviews, payments, and sync.", "/app/actions"],
              ["Run or record", "Approved work can be sent, marked manual, scheduled, blocked, or logged.", "/app/actions"],
              ["Report back", "Reports and Owner Feed show what happened, what failed, and what needs help.", "/app/owner-command-center"]
            ].map(([title, detail, href]) => (
              <Link className="path-card" href={href} key={title}>
                <GitBranch size={18} />
                <strong>{title}</strong>
                <span>{detail}</span>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>AI Agent Workflows</h2>
              <p className="muted">Lead response, follow-up, reviews, invoice reminders, and SEO marketing agents.</p>
            </div>
            <Link className="mini-button" href="/app/ai-workforce">Open AI</Link>
          </div>
          <ul className="list">
            {dashboard.agentWorkflows.map((workflow) => (
              <li className="list-row" key={workflow.id}>
                <div>
                  <h3>{workflow.agentName}</h3>
                  <p className="muted">{workflow.plainGoal}</p>
                  <p className="muted">{workflow.cadenceKey} / next {dateLabel(workflow.nextRunAt)}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(workflow.runMode)}`}>{workflow.runMode.replaceAll("_", " ")}</span>
                  <span className="pill">{workflow.openOutputs} waiting</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Queued Actions</h2>
              <p className="muted">Messages, publishing, reviews, payments, calendar sync, and provider work waiting for a decision.</p>
            </div>
            <Link className="mini-button" href="/app/actions">Review queue</Link>
          </div>
          <ul className="list">
            {dashboard.queuedActions.map((action) => (
              <li className="list-row" key={action.id}>
                <div>
                  <h3>{action.subject || action.actionType}</h3>
                  <p className="muted">{action.actionType} / {action.providerKey} / {action.targetType ?? "no target"}</p>
                  {action.bodyPreview ? <p>{action.bodyPreview}</p> : null}
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(action.riskLevel)}`}>{action.riskLevel}</span>
                  <span className={`pill ${tone(action.status)}`}>{action.status}</span>
                </div>
              </li>
            ))}
            {dashboard.queuedActions.length === 0 ? <li className="list-row"><span className="muted">No queued actions yet.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Recurring Automation Rules</h2>
              <p className="muted">Marketing and reporting rules that create draft work on a cadence or trigger.</p>
            </div>
            <Link className="mini-button" href="/app/automation">Open rules</Link>
          </div>
          <ul className="list">
            {dashboard.automationRules.map((rule) => (
              <li className="list-row" key={rule.id}>
                <div>
                  <h3>{rule.automationType.replaceAll("_", " ")}</h3>
                  <p className="muted">{rule.brandName} / {rule.cadence} / next {dateLabel(rule.nextRunAt)}</p>
                </div>
                <span className="pill">{rule.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Live Action Policies</h2>
              <p className="muted">Rules that decide what can happen after approval and what still needs a connection.</p>
            </div>
            <Link className="mini-button" href="/app/actions">Open policies</Link>
          </div>
          <ul className="list">
            {dashboard.policies.map((policy) => (
              <li className="list-row" key={policy.id}>
                <div>
                  <h3>{policy.label}</h3>
                  <p className="muted">{policy.providerKey} / {policy.minimumPlanKey} / {policy.status}</p>
                  <p>{policy.rule}</p>
                </div>
                <span className={`pill ${tone(policy.riskLevel)}`}>{policy.riskLevel}</span>
              </li>
            ))}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon, tone: toneName = "" }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  return (
    <section className="metric-card span-3">
      <small className={`pill ${toneName}`}>{icon} automation</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

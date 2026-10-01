import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  MessageSquareText,
  PhoneCall,
  Sparkles,
  Timer,
  Workflow,
} from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getLeadCommandDashboard } from "@/lib/lead-command/get-lead-command-dashboard";

function tone(value: string) {
  if (value === "high" || value === "failed" || value === "hot") return "high";
  if (value === "medium" || value === "needs_review" || value === "approved")
    return "medium";
  return "";
}

function dateLabel(value: string | null) {
  if (!value) return "No time set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function LeadCommandPage() {
  const dashboard = await getLeadCommandDashboard();

  return (
    <QueuePageShell
      eyebrow="Customers"
      title="Customers And Opportunities"
      description="See who needs a reply, what should happen next, and which opportunities are moving toward revenue."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>Help the right person next.</h2>
            <p className="muted">
              Ferocity keeps replies, callbacks, estimates, and follow-up
              organized. Ask what needs attention or open the next priority
              below.
            </p>
          </div>
          <div className="inline-actions">
            <Link
              className="button"
              href="/app/ferocity?prompt=Who%20should%20I%20follow%20up%20with%20next%3F"
            >
              <Sparkles size={16} /> Ask Ferocity
            </Link>
            <Link className="button secondary-button" href="/app/operator">
              <Workflow size={16} /> Open pipeline
            </Link>
          </div>
        </div>
        <details className="subtle-panel">
          <summary>More customer tools</summary>
          <div className="button-row section-actions">
            <Link className="mini-button" href="/app/leads">
              All leads
            </Link>
            <Link className="mini-button" href="/app/forms">
              Forms
            </Link>
            <Link className="mini-button" href="/app/actions">
              Follow-up queue
            </Link>
            <Link className="mini-button" href="/app/drafts">
              Drafts
            </Link>
            <Link className="mini-button" href="/app/growth">
              Source tracking
            </Link>
            <Link className="mini-button" href="/app/job-tracker">
              Work
            </Link>
          </div>
        </details>
      </section>

      <section className="grid section-actions">
        <Metric
          label="New/open leads"
          value={dashboard.metrics.newLeads}
          icon={<Inbox size={16} />}
          tone={dashboard.metrics.newLeads ? "medium" : ""}
        />
        <Metric
          label="Hot leads"
          value={dashboard.metrics.highPriorityLeads}
          icon={<PhoneCall size={16} />}
          tone={dashboard.metrics.highPriorityLeads ? "high" : ""}
        />
        <Metric
          label="Unanswered"
          value={dashboard.metrics.unansweredThreads}
          icon={<MessageSquareText size={16} />}
          tone={dashboard.metrics.unansweredThreads ? "high" : ""}
        />
        <Metric
          label="Due in 24h"
          value={dashboard.metrics.followUpsDue}
          icon={<Timer size={16} />}
          tone={dashboard.metrics.followUpsDue ? "high" : ""}
        />
        <Metric
          label="Pipeline value"
          value={dashboard.metrics.pipelineValue}
          icon={<ArrowRight size={16} />}
        />
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Do These Next</h2>
          <p className="muted">
            Ferocity should make the next sales step clear before a lead goes
            cold.
          </p>
          <ul className="list">
            {dashboard.nextActions.map((action) => (
              <li className="list-row" key={action.title}>
                <div>
                  <h3>{action.title}</h3>
                  <p className="muted">{action.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(action.urgency)}`}>
                    {action.urgency}
                  </span>
                  <Link className="mini-button" href={action.href}>
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-7">
          <h2>How Ferocity keeps momentum</h2>
          <p className="muted">
            Every conversation stays connected as a person becomes a customer
            and work turns into revenue.
          </p>
          <details className="subtle-panel">
            <summary>See the customer journey</summary>
            <div className="path-grid section-actions">
              {[
                [
                  "Catch",
                  "Forms, calls, website requests, MarketplacePro, and imports become lead records.",
                  "/app/forms",
                ],
                [
                  "Reply",
                  "Drafts, templates, conversations, and queued sends stay visible before customer contact.",
                  "/app/operator",
                ],
                [
                  "Follow up",
                  "Callbacks, stale leads, estimates, and reminders stop opportunities from going cold.",
                  "/app/actions",
                ],
                [
                  "Move pipeline",
                  "Qualified opportunities move toward estimates, jobs, invoices, reviews, and revenue.",
                  "/app/operator",
                ],
                [
                  "Track source",
                  "Keep source, page, service, city, campaign, and revenue context attached.",
                  "/app/growth",
                ],
                [
                  "Hand off work",
                  "Real work moves into scheduling, delivery, invoicing, and reviews.",
                  "/app/job-tracker",
                ],
              ].map(([title, detail, href]) => (
                <Link className="path-card" href={href} key={title}>
                  <ArrowRight size={18} />
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </Link>
              ))}
            </div>
          </details>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Newest Leads</h2>
              <p className="muted">
                Review contact quality, source, priority, and assignment.
              </p>
            </div>
            <Link className="mini-button" href="/app/leads">
              All leads
            </Link>
          </div>
          <ul className="list">
            {dashboard.leads.map((lead) => (
              <li className="list-row" key={lead.id}>
                <div>
                  <h3>
                    <Link href={`/app/leads/${lead.id}`}>{lead.name}</Link>
                  </h3>
                  <p className="muted">
                    {lead.brandName} / {lead.leadType} /{" "}
                    {lead.email || lead.phone || "No contact"}
                  </p>
                  <p className="muted">Assigned: {lead.assignedTo}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(lead.priority)}`}>
                    {lead.priority}
                  </span>
                  <span className={`pill ${tone(lead.grade)}`}>
                    {lead.grade}
                  </span>
                </div>
              </li>
            ))}
            {dashboard.leads.length === 0 ? (
              <li className="list-row">
                <span className="muted">No leads yet.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Conversations And Queued Work</h2>
              <p className="muted">
                Drafts and queued sends stay visible before live customer
                contact.
              </p>
            </div>
            <Link className="mini-button" href="/app/actions">
              Review queue
            </Link>
          </div>
          <ul className="list">
            {dashboard.threads.map((thread) => (
              <li className="list-row" key={thread.id}>
                <div>
                  <h3>{thread.subject}</h3>
                  <p className="muted">
                    {[
                      thread.brandName,
                      thread.leadName,
                      thread.customerName,
                      thread.channel,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                  <p className="muted">
                    Next: {dateLabel(thread.nextFollowUpAt)} / unanswered:{" "}
                    {dateLabel(thread.unansweredSince)}
                  </p>
                </div>
                <span className="pill">{thread.status}</span>
              </li>
            ))}
            {dashboard.queuedActions.map((action) => (
              <li className="list-row" key={action.id}>
                <div>
                  <h3>
                    <Link href={action.href}>{action.subject}</Link>
                  </h3>
                  <p className="muted">Prepared business action</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(action.riskLevel)}`}>
                    {action.riskLevel}
                  </span>
                  <span className={`pill ${tone(action.status)}`}>
                    {action.status}
                  </span>
                </div>
              </li>
            ))}
            {dashboard.threads.length + dashboard.queuedActions.length === 0 ? (
              <li className="list-row">
                <span className="muted">
                  No conversations or queued actions yet.
                </span>
              </li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Pipeline</h2>
            <p className="muted">
              Use the full Sales Console to move stages and add notes.
            </p>
          </div>
          <Link className="mini-button" href="/app/operator">
            Open pipeline
          </Link>
        </div>
        <div className="grid">
          {dashboard.stages.map((stage) => (
            <section className="panel span-4" key={stage.id}>
              <h3>{stage.name}</h3>
              <p className="muted">{stage.probability}% default probability</p>
              <strong>{stage.opportunities.length}</strong>
              <span className="muted">open opportunity records</span>
            </section>
          ))}
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({
  label,
  value,
  icon,
  tone: toneName = "",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <section className="metric-card span-3">
      <small className={`pill ${toneName}`}>
        {icon}
        <span className="sr-only">Customer metric</span>
      </small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

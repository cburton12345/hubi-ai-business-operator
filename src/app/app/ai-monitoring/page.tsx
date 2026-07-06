import Link from "next/link";
import type React from "react";
import { AlertTriangle, BellRing, Bot, BriefcaseBusiness, CheckCircle2, Eye, Mail, Radar, ShieldAlert } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { currentWorkspaceMonitoringCenter, type MonitorPriority, type MonitorSection } from "@/lib/ai-monitoring/get-ai-monitoring-center";
import { generateDailyOwnerBriefingAction } from "./actions";

function tone(priority: MonitorPriority) {
  if (priority === "critical" || priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "";
}

export default async function AIMonitoringBriefingPage() {
  const center = await currentWorkspaceMonitoringCenter();

  return (
    <QueuePageShell
      eyebrow="Daily Brief"
      title="Daily Brief And Watchtower"
      description="Ferocity watches the business, writes the morning brief, and interrupts the owner only for money, risk, customer trouble, safety, payroll, failed automation, urgent bids, or decisions."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Plain English</p>
            <h2>{center.dailyBrief.title}</h2>
            <p className="muted">{center.dailyBrief.summary}</p>
          </div>
          <div className="button-row">
            <form action={generateDailyOwnerBriefingAction}>
              <button className="button" type="submit">
                <Bot size={16} /> Generate today&apos;s brief
              </button>
            </form>
            <Link className="button secondary-button" href="/app/owner-command-center">Owner Feed</Link>
            <Link className="button secondary-button" href="/app/notifications">Notifications</Link>
            <Link className="button secondary-button" href="/app/lifeops-connections">Connected Systems</Link>
          </div>
        </div>
        <div className="inline-actions">
          <span className={`pill ${tone(center.dailyBrief.priority)}`}>{center.dailyBrief.priority} priority</span>
          <span className="pill">{center.gate.enabled ? "monitoring available" : "blocked"}</span>
          {center.gate.remaining === null ? null : <span className="pill">{center.gate.remaining} briefs left</span>}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>What This Page Does</h2>
            <p className="muted">
              This is the owner&apos;s morning check-in. It looks across leads, estimates, jobs, invoices, reviews, employees, marketing,
              email-ready sources, bids, competitors, and connected systems. Routine updates stay in the brief. Urgent items become alerts.
            </p>
          </div>
          <span className="pill">less checking, more running</span>
        </div>
        <div className="setup-step-grid">
          <Step number="1" title="Watch" body="Read Ferocity records and connected-system events." />
          <Step number="2" title="Sort" body="Separate normal updates from money, risk, customer, safety, payroll, and approval issues." />
          <Step number="3" title="Brief" body="Write what happened yesterday and what matters today." />
          <Step number="4" title="Interrupt" body="Notify only when the owner really needs to act." />
        </div>
      </section>

      <section className="grid section-actions">
        <Metric icon={<BellRing size={18} />} label="Immediate alert rules" value={center.metrics.immediateAlerts} tone={center.metrics.immediateAlerts ? "high" : ""} />
        <Metric icon={<Eye size={18} />} label="Brief-only rules" value={center.metrics.dailyBriefOnly} />
        <Metric icon={<CheckCircle2 size={18} />} label="Connected sources" value={center.metrics.connectedSources} />
        <Metric icon={<AlertTriangle size={18} />} label="Sources needing setup" value={center.metrics.needsAttentionSources} tone={center.metrics.needsAttentionSources ? "medium" : ""} />
        <Metric icon={<ShieldAlert size={18} />} label="Needs owner" value={center.metrics.ownerAttention} tone={center.metrics.ownerAttention ? "high" : ""} />
        <Metric icon={<Bot size={18} />} label="AI handled" value={center.metrics.aiHandled} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>What Happened Yesterday</h2>
          <ul className="list">
            {center.dailyBrief.yesterday.map((item) => (
              <li className="list-row" key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="panel span-6">
          <h2>What Matters Today</h2>
          <ul className="list">
            {center.dailyBrief.today.map((item) => (
              <li className="list-row" key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </section>

      <section className="grid section-actions">
        <AttentionPanel title="Needs Owner Attention" icon={<ShieldAlert size={18} />} rows={center.dailyBrief.ownerAttention} empty="Nothing urgent needs the owner right now." />
        <AttentionPanel title="AI Handled" icon={<Bot size={18} />} rows={center.dailyBrief.aiHandled} empty="No AI-handled items are recorded yet." />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Radar size={18} /> Monitor Map
            </h2>
            <p className="muted">
              Immediate alerts are reserved for lost lead risk, complaints, negative reviews, safety, payroll problems, large overdue invoices,
              high-value leads, urgent bids, failures, and low-confidence work. Everything else goes into the daily brief.
            </p>
          </div>
          <Link className="mini-button" href="/app/webhooks">Webhook intake</Link>
        </div>
        <div className="grid section-actions">
          {center.sections.map((section) => (
            <MonitorSectionCard key={section.key} section={section} />
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>
            <Mail size={18} /> Email Watch
          </h2>
          <p className="muted">
            Gmail, Outlook, and Microsoft 365 are prepared as provider sources. When connected, email can become a lead, task, job, vendor item,
            financial item, or ignored spam.
          </p>
          <ul className="list">
            {["Leads", "Existing customers", "Vendors", "Financial mail", "Owner action", "Spam"].map((item) => (
              <li className="list-row" key={item}>
                <span>{item}</span>
                <span className="pill">category</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Competitor Watch</h2>
          <p className="muted">Track competitors for review changes, website changes, services, locations, promotions, and hiring activity.</p>
          <ul className="list">
            {center.competitors.map((competitor) => (
              <li className="list-row" key={competitor.id}>
                <div>
                  <h3>{competitor.competitorName}</h3>
                  <p className="muted">{competitor.summary ?? competitor.websiteUrl ?? "Ready to monitor."}</p>
                </div>
                <span className="pill">{competitor.status}</span>
              </li>
            ))}
            {center.competitors.length === 0 ? <li className="list-row"><span className="muted">No competitors are tracked yet.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>What Can Be Watched</h2>
            <p className="muted">Some monitors use Ferocity data today. Others turn on when the right accounts, OAuth, webhooks, or connected systems are added.</p>
          </div>
          <Link className="mini-button" href="/app/integrations">Connect providers</Link>
        </div>
        <div className="grid">
          {[
            ["Leads", "Forms, hosted pages, imports, MarketplacePro, and connected systems.", "works now", "/app/lead-command"],
            ["Invoices and money", "Unpaid invoices, payment events, overdue reminders, and ledgers.", "works now", "/app/cash-collection"],
            ["Workers", "Clock-ins, assignments, field proof, expenses, mileage, safety, and payroll review.", "works now", "/app/operations-workforce"],
            ["Email", "Gmail, Outlook, and Microsoft 365 categories: leads, customers, vendors, finance, important, spam.", "needs connection", "/app/integrations"],
            ["Reviews", "Google, Facebook, Yelp, negative reviews, trends, and suggested replies.", "needs connection", "/app/review"],
            ["Bids", "GovFlow/BidOps opportunities, deadlines, rebids, scores, and urgent bid alerts.", "connected-system ready", "/app/lifeops-connections"],
            ["Marketing", "Traffic, SEO, landing pages, lead sources, campaign performance, and recommended actions.", "partly connected", "/app/reports"],
            ["Competitors", "Reviews, website changes, locations, promotions, services, and hiring activity.", "planned", "/app/ai-monitoring"]
          ].map(([title, body, status, href]) => (
            <Link className="panel span-3 status-card" href={href} key={title}>
              <div>
                <h3>{title}</h3>
                <p className="muted">{body}</p>
              </div>
              <span className={`pill ${status.includes("needs") ? "medium" : ""}`}>{status}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>Monitor Sources</h2>
          <ul className="list">
            {center.monitorSources.map((source) => (
              <li className="list-row" key={source.id}>
                <div>
                  <h3>{source.displayName}</h3>
                  <p className="muted">{[source.sourceType, source.providerKey].filter(Boolean).join(" / ")}</p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{source.status.replaceAll("_", " ")}</span>
                  <span className="pill">{source.immediateAlertEnabled ? "alerts" : "brief only"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>When Ferocity Interrupts</h2>
          <ul className="list">
            {center.immediateAlertRules.map((rule) => (
              <li className="list-row" key={rule.id}>
                <div>
                  <h3>{rule.label}</h3>
                  <p className="muted">{rule.monitorArea}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${tone(rule.severity)}`}>{rule.severity}</span>
                  <Link className="mini-button" href={rule.actionHref}>Open</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
          <h2>Recent Briefs</h2>
            <p className="muted">Generated briefs are saved so the owner can review what Ferocity thought mattered each day.</p>
          </div>
          <BriefcaseBusiness size={20} />
        </div>
        <ul className="list">
          {center.recentBriefings.map((brief) => (
            <li className="list-row" key={brief.id}>
              <div>
                <h3>{brief.title}</h3>
                <p className="muted">{brief.summary}</p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${tone(brief.priority)}`}>{brief.priority}</span>
                <span className="pill">{brief.briefDate}</span>
              </div>
            </li>
          ))}
          {center.recentBriefings.length === 0 ? <li className="list-row"><span className="muted">No daily briefs have been generated yet.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="setup-step-card">
      <span className="step-dot">{number}</span>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </div>
  );
}

function Metric({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: string | number; tone?: string }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      <small className={`pill ${tone}`}>{icon} monitoring</small>
    </section>
  );
}

function AttentionPanel({
  title,
  icon,
  rows,
  empty
}: {
  title: string;
  icon: React.ReactNode;
  rows: { title: string; detail: string; href: string; priority: MonitorPriority }[];
  empty: string;
}) {
  return (
    <section className="panel span-6">
      <h2>{icon} {title}</h2>
      <ul className="list">
        {rows.map((item) => (
          <li className="list-row" key={`${item.title}-${item.href}`}>
            <div>
              <h3>{item.title}</h3>
              <p className="muted">{item.detail}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${tone(item.priority)}`}>{item.priority}</span>
              <Link className="mini-button" href={item.href}>Open</Link>
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}

function MonitorSectionCard({ section }: { section: MonitorSection }) {
  return (
    <article className="panel span-4">
      <div className="list-row flush-row">
        <div>
          <h3>{section.title}</h3>
          <p className="muted">{section.summary}</p>
        </div>
        <span className={`pill ${tone(section.priority)}`}>{section.priority}</span>
      </div>
      <div className="grid section-actions">
        {section.metrics.map((metric) => (
          <div className="metric-card span-6" key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
      <ul className="list">
        {section.items.slice(0, 3).map((item) => (
          <li className="list-row" key={`${section.key}-${item.title}-${item.href}`}>
            <div>
              <strong>{item.title}</strong>
              <p className="muted">{item.detail}</p>
            </div>
            <Link className="mini-button" href={item.href}>Open</Link>
          </li>
        ))}
        {section.items.length === 0 ? <li className="list-row"><span className="muted">No urgent items. This stays in the daily brief.</span></li> : null}
      </ul>
    </article>
  );
}

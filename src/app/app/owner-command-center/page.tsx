import Link from "next/link";
import { AlertTriangle, Bot, BriefcaseBusiness, DollarSign, Radar, ShieldAlert, Sparkles } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOwnerCommandCenter, type OwnerCommandEvent } from "@/lib/owner-command-center/get-owner-command-center";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function severityClass(severity: string) {
  if (severity === "critical" || severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "";
}

export default async function OwnerCommandCenterPage() {
  const center = await getOwnerCommandCenter();

  return (
    <QueuePageShell
      eyebrow="Owner View"
      title="Owner Command Center"
      description="The AI Chief of Staff layer for all owned businesses and connected systems. It shows what happened, what matters, what AI handled, and what needs a decision."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Sparkles size={18} /> Daily Briefing
            </h2>
            <p className="muted">{center.briefing}</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/ai-workforce">AI Workforce</Link>
            <Link className="button secondary-button" href="/app/operator">Operations</Link>
            <Link className="button secondary-button" href="/app/reports">Reports</Link>
          </div>
        </div>
        <div className="inline-actions">
          {center.platformFilters.map((platform) => (
            <span className="pill" key={platform}>{platform}</span>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Needs owner" value={center.metrics.needsOwner} icon={<AlertTriangle size={18} />} tone={center.metrics.needsOwner ? "high" : ""} />
        <Metric label="Critical issues" value={center.metrics.critical} icon={<ShieldAlert size={18} />} tone={center.metrics.critical ? "high" : ""} />
        <Metric label="AI handled" value={center.metrics.aiHandled} icon={<Bot size={18} />} />
        <Metric label="Money radar" value={money(center.metrics.openMoneyCents)} icon={<DollarSign size={18} />} />
        <Metric label="Open pipeline" value={money(center.metrics.openPipelineCents)} icon={<Radar size={18} />} />
        <Metric label="Collected" value={money(center.metrics.collectedRevenueCents)} icon={<BriefcaseBusiness size={18} />} />
      </section>

      <section className="grid section-actions">
        <EventPanel title="Needs Owner Queue" empty="No owner decisions are waiting right now." events={center.needsOwner} />
        <EventPanel title="Critical Issues Queue" empty="No critical issues are open." events={center.criticalIssues} />
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2>
            <DollarSign size={18} /> Make Money Next
          </h2>
          <ul className="list">
            {center.makeMoneyNext.map((item) => (
              <li className="list-row" key={`${item.title}-${item.href}`}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.detail}</p>
                </div>
                <div className="inline-actions">
                  {item.valueCents ? <span className="pill">{money(item.valueCents)}</span> : null}
                  <Link className="mini-button" href={item.href}>Open</Link>
                </div>
              </li>
            ))}
            {center.makeMoneyNext.length === 0 ? <li className="list-row"><span className="muted">No money moves are ready yet.</span></li> : null}
          </ul>
        </section>
        <EventPanel title="Money Radar" empty="No revenue or financial-risk events have arrived yet." events={center.moneyRadar} />
      </section>

      <section className="grid section-actions">
        <EventPanel title="AI Actions Feed" empty="No AI-handled events yet." events={center.aiActions} />
        <EventPanel title="Unified Owner Event Feed" empty="No owner events yet. Connected systems can post events into the intake endpoint." events={center.events.slice(0, 12)} />
      </section>

      <section className="panel section-actions">
        <h2>How This Fits Ferocity</h2>
        <div className="setup-step-grid">
          <Step number="1" title="Owner View" body="What happened, what matters, what needs attention, and what to do next." />
          <Step number="2" title="Operations View" body="Leads, jobs, customers, marketing, reviews, revenue, and follow-up remain fully available." />
          <Step number="3" title="Builder View" body="AI Workforce, workflows, integrations, rules, prompt systems, and automation controls stay available for power users." />
          <Step number="4" title="Safe Escalation" body="Revenue, risk, disputes, legal, safety, failures, low confidence, and approval needs rise to the owner." />
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, icon, tone = "" }: { label: string; value: number | string; icon: React.ReactNode; tone?: string }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      <small className={`pill ${tone}`}>{icon} owner layer</small>
    </section>
  );
}

function EventPanel({ title, empty, events }: { title: string; empty: string; events: OwnerCommandEvent[] }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {events.map((event) => (
          <li className="list-row" key={event.id}>
            <div>
              <h3>{event.title}</h3>
              <p>{event.summary}</p>
              <p className="muted">
                {event.platformName} / {event.eventType} / confidence {event.confidenceScore}%
              </p>
              {event.aiSummary ? <p className="muted">AI: {event.aiSummary}</p> : null}
            </div>
            <div className="inline-actions">
              <span className={`pill ${severityClass(event.severity)}`}>{event.severity}</span>
              {event.moneyCents ? <span className="pill">{money(event.moneyCents)}</span> : null}
              <Link className="mini-button" href={event.actionHref}>Open</Link>
            </div>
          </li>
        ))}
        {events.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
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

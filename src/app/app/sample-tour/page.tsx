import Link from "next/link";
import { BellRing, CalendarClock, ChartNoAxesCombined, FileCheck2, MessageSquareText, ShieldCheck, Star } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";

const sampleMetrics = [
  ["New leads", "12", "4 need a reply"],
  ["Follow-ups due", "7", "2 are high priority"],
  ["Open estimates", "$86k", "3 viewed but not approved"],
  ["Review requests", "5", "Queued for approval"]
];

const sampleLeadFlow = [
  {
    title: "Storm roof repair lead",
    detail: "Source: city service page / urgency: high / consent: form submitted",
    next: "Approve first response draft",
    status: "Needs approval"
  },
  {
    title: "Gutter replacement callback",
    detail: "Source: Google Business Profile / missed callback yesterday",
    next: "Call before noon",
    status: "Due today"
  },
  {
    title: "Trailer rental quote",
    detail: "Source: MarketplacePro / weekend delivery request",
    next: "Confirm availability",
    status: "New"
  }
];

const sampleAutomations = [
  ["Lead reply draft", "Prepared but not sent", "Needs approval"],
  ["Estimate follow-up", "Queued after 48 hours", "Active"],
  ["Invoice reminder", "Polite draft after due date", "Draft only"],
  ["Review request", "After completed job", "Needs approval"],
  ["SEO refresh", "Suggest update after low traffic", "Planned"],
  ["Operator alert", "Drop in lead flow", "Active"]
];

const sampleTimeline = [
  ["8:12 AM", "Lead came in from storm roof repair page"],
  ["8:13 AM", "Ferocity prepared first response draft"],
  ["8:20 AM", "Callback task created for sales desk"],
  ["Yesterday", "Estimate viewed but not approved"],
  ["Monday", "Review request drafted after completed job"]
];

export default function SampleTourPage() {
  return (
    <QueuePageShell
      eyebrow="Sample Tour"
      title="See Ferocity With Sample Data"
      description="A private walkthrough using sample records only. This does not create real leads, jobs, invoices, messages, provider sends, or customer data."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Sample Data Only</h2>
            <p className="muted">
              Use this page to understand the full operating loop before connecting real lead sources or providers. Nothing here is mixed into the workspace.
            </p>
          </div>
          <span className="pill status-draft_only">safe tour</span>
        </div>
        <div className="button-row">
          <Link className="button" href="/app/build-system">
            Build my real system
          </Link>
          <Link className="button secondary-button" href="/app/operator">
            Open real console
          </Link>
        </div>
      </section>

      <div className="grid">
        {sampleMetrics.map(([label, value, detail]) => (
          <section className="panel span-3 metric" key={label}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
            <small className="muted">{detail}</small>
          </section>
        ))}
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Sample Lead-To-Job Loop</h2>
            <p className="muted">This is what the real dashboard starts to show once leads, estimates, jobs, reviews, and revenue exist.</p>
          </div>
          <MessageSquareText size={20} />
        </div>
        <ul className="list">
          {sampleLeadFlow.map((lead) => (
            <li className="list-row" key={lead.title}>
              <div>
                <h3>{lead.title}</h3>
                <p className="muted">{lead.detail}</p>
                <p>{lead.next}</p>
              </div>
              <span className="pill">{lead.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Sample Automations</h2>
            <p className="muted">Automations prepare work and surface next actions. Live sends and publishing still need approval and provider setup.</p>
          </div>
          <BellRing size={20} />
        </div>
        <div className="status-grid">
          {sampleAutomations.map(([title, detail, status]) => (
            <div className="status-card" key={title}>
              <div>
                <h3>{title}</h3>
                <p className="muted">{detail}</p>
              </div>
              <span className="pill">{status}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>
                <CalendarClock size={18} /> Sample Schedule
              </h2>
              <p className="muted">Callbacks, appointments, and job reminders appear here in the real system.</p>
            </div>
          </div>
          <ul className="list">
            <li className="list-row">
              <div>
                <h3>Roof inspection callback</h3>
                <p className="muted">Today 10:30 AM / high-priority storm lead</p>
              </div>
              <span className="pill">Due soon</span>
            </li>
            <li className="list-row">
              <div>
                <h3>Estimate follow-up</h3>
                <p className="muted">Tomorrow 9:00 AM / viewed estimate</p>
              </div>
              <span className="pill">Scheduled</span>
            </li>
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>
                <ChartNoAxesCombined size={18} /> Sample ROI
              </h2>
              <p className="muted">Ferocity connects marketing to real jobs and money once source tracking is active.</p>
            </div>
          </div>
          <ul className="list">
            <li className="list-row">
              <div>
                <h3>Organic local SEO</h3>
                <p className="muted">18 leads / 5 jobs / $42k revenue</p>
              </div>
              <span className="pill status-included">Working</span>
            </li>
            <li className="list-row">
              <div>
                <h3>Facebook storm post</h3>
                <p className="muted">9 leads / 2 jobs / $16k revenue</p>
              </div>
              <span className="pill">Watch</span>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Star size={18} /> Sample Reviews And Reputation
            </h2>
            <p className="muted">Review requests stay approval-based. Negative-experience interception keeps trust protected.</p>
          </div>
        </div>
        <ul className="list">
          <li className="list-row">
            <div>
              <h3>Completed roof repair</h3>
              <p className="muted">Review request draft ready after job completion.</p>
            </div>
            <span className="pill">Needs approval</span>
          </li>
          <li className="list-row">
            <div>
              <h3>Service recovery needed</h3>
              <p className="muted">Customer feedback says follow up before asking for a public review.</p>
            </div>
            <span className="pill high">Handle first</span>
          </li>
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <FileCheck2 size={18} /> Sample Timeline
            </h2>
            <p className="muted">The real timeline becomes the audit trail for leads, messages, jobs, reviews, automation, and revenue.</p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <ul className="list">
          {sampleTimeline.map(([time, event]) => (
            <li className="list-row" key={`${time}-${event}`}>
              <strong>{time}</strong>
              <span className="muted">{event}</span>
            </li>
          ))}
        </ul>
      </section>
    </QueuePageShell>
  );
}

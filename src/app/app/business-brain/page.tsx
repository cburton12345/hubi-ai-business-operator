import Link from "next/link";
import { Bot, Brain, BriefcaseBusiness, CheckCircle2, FileText, Globe2, PlugZap, Users } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getBusinessBrainDashboard, type BrainRow } from "@/lib/business-brain/get-business-brain";

function statusClass(status: string) {
  if (status.includes("need")) return "high";
  if (status === "learning" || status === "paused") return "medium";
  return "";
}

function BrainList({ title, description, rows, empty }: { title: string; description: string; rows: BrainRow[]; empty: string }) {
  return (
    <section className="panel span-6">
      <div className="list-row flush-row">
        <div>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
      </div>
      <ul className="list">
        {rows.map((item) => (
          <li className="list-row" key={item.id}>
            <div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <p className="muted">{item.meta}</p>
            </div>
            <div className="inline-actions">
              <span className={`pill ${statusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
              <Link className="mini-button" href={item.href}>Open</Link>
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}

export default async function BusinessBrainPage() {
  const brain = await getBusinessBrainDashboard();

  return (
    <QueuePageShell
      eyebrow="Source of truth"
      title="Business Info"
      description="The shared business facts every AI helper should read before it writes, replies, schedules, follows up, publishes, or recommends."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Bot size={18} /> Teach Ferocity How To Run This Business
            </h2>
            <p className="muted">
              Every customer should have editable AI instructions: what to prioritize, what to avoid, how to talk,
              which customers and services matter most, what growth should focus on, and when Ferocity must ask first.
            </p>
          </div>
          <div className="button-row">
            {brain.brands[0] ? <Link className="button" href={brain.brands[0].href}>Edit AI Instructions</Link> : null}
            <Link className="button secondary-button" href="/app/autopilot">Choose Autopilot Mode</Link>
          </div>
        </div>
        <div className="setup-step-grid">
          {[
            ["1", "Connect the business", "Website, forms, email, payments, calendars, reviews, workers, and other tools can feed Ferocity when ready."],
            ["2", "Set the rules", "Tell AI what to manage, what to prioritize, how to respond, and what needs approval."],
            ["3", "Run the loops", "Ferocity watches growth, leads, jobs, invoices, reviews, reminders, and connected-system events."],
            ["4", "Interrupt less", "Routine work goes into daily briefs. Owner alerts stay for money, risk, urgent customers, failures, and approvals."]
          ].map(([number, title, body]) => (
            <div className="setup-step-card" key={number}>
              <span className="step-dot">{number}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Brain size={18} /> One Place For Business Facts
            </h2>
            <p className="muted">
              Services, areas, customers, proof, reviews, website context, integrations, brand voice, and past work should live here first.
              The AI Workforce uses this context so sales, scheduling, marketing, collections, and reputation work do not contradict each other.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">Guided Setup</Link>
            <Link className="button secondary-button" href="/app/ai-workforce">AI Workforce</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric icon={<BriefcaseBusiness size={18} />} label="Brands" value={brain.metrics.brands} />
        <Metric icon={<CheckCircle2 size={18} />} label="Services" value={brain.metrics.services} />
        <Metric icon={<Globe2 size={18} />} label="Service areas" value={brain.metrics.serviceAreas} />
        <Metric icon={<Users size={18} />} label="Customers" value={brain.metrics.customers} />
        <Metric icon={<Bot size={18} />} label="Leads" value={brain.metrics.leads} />
        <Metric icon={<FileText size={18} />} label="Jobs" value={brain.metrics.jobs} />
        <Metric icon={<CheckCircle2 size={18} />} label="Reviews" value={brain.metrics.reviews} />
        <Metric icon={<FileText size={18} />} label="Proof assets" value={brain.metrics.proofAssets} />
        <Metric icon={<PlugZap size={18} />} label="Connections" value={brain.metrics.integrations} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Brain Completeness</h2>
            <p className="muted">These are the pieces Ferocity needs before it can confidently automate more of the business.</p>
          </div>
          <Link className="mini-button" href="/app/go-live">Readiness scan</Link>
        </div>
        <div className="status-grid">
          {brain.completeness.map((item) => (
            <Link className="status-card" href={item.href} key={item.id}>
              <div>
                <h3>{item.title}</h3>
                <p className="muted">{item.detail}</p>
                <small className="muted">{item.meta}</small>
              </div>
              <span className={`pill ${statusClass(item.status)}`}>{item.status.replaceAll("_", " ")}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <BrainList title="Business Identity" description="Company, website, phone, email, goals, and positioning." rows={brain.brands} empty="No brands yet." />
        <BrainList title="Services" description="What Ferocity should sell, route, quote, schedule, and write about." rows={brain.services} empty="No services yet." />
        <BrainList title="Territories" description="Cities, service areas, routes, and local growth targets." rows={brain.serviceAreas} empty="No service areas yet." />
        <BrainList title="Marketing Memory" description="Useful facts from website imports, brand voice, services, and service areas." rows={brain.businessProfiles} empty="No marketing memory yet." />
        <BrainList title="Customer Signals" description="Customer history that should guide follow-up, service, reviews, and retention." rows={brain.customerSignals} empty="No customers yet." />
        <BrainList title="Proof And Documents" description="Photos, videos, proof, reviews, assets, and permissions that can power trustworthy marketing." rows={brain.documentsAndProof} empty="No proof assets yet." />
        <BrainList title="Connected Tools" description="Provider connections Ferocity can use for email, payments, calendar, ads, publishing, marketplace, and events." rows={brain.integrations} empty="No integrations connected yet." />
        <BrainList title="Where AI Reads This" description="The AI helpers that should use this business info before acting." rows={brain.aiReadsFrom} empty="No AI readers configured." />
      </section>
    </QueuePageShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <section className="panel span-4 metric">
      {icon}
      <span className="muted">{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </section>
  );
}

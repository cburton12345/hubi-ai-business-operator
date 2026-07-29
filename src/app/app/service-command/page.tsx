import Link from "next/link";
import { CalendarDays, Camera, ClipboardCheck, CreditCard, HardHat, Map, Package, ReceiptText, ShieldCheck, Star, Wrench } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceOpsDashboard } from "@/lib/service-ops/get-service-ops-dashboard";

const serviceLoops = [
  {
    title: "Schedule Work",
    detail: "Put unscheduled jobs on the calendar, assign crew, and see route planning.",
    href: "/app/service/routes",
    icon: <CalendarDays size={18} />
  },
  {
    title: "Work The Job",
    detail: "Use technician workflow, AI walkthrough, field notes, proof, photos, and completion tasks.",
    href: "/app/service/tech",
    icon: <HardHat size={18} />
  },
  {
    title: "Send Estimate",
    detail: "Open estimates, follow up on viewed/aging quotes, and keep pipeline value visible.",
    href: "/app/service",
    icon: <ClipboardCheck size={18} />
  },
  {
    title: "Collect Money",
    detail: "See invoices, manual payment records, Stripe payment-link readiness, overdue reminders, and ledger records.",
    href: "/app/cash-collection",
    icon: <CreditCard size={18} />
  },
  {
    title: "Track Job Costs",
    detail: "See bids, job costs, people paid, material lists, and money left on each job.",
    href: "/app/job-tracker",
    icon: <ReceiptText size={18} />
  },
  {
    title: "Share Customer Portal",
    detail: "Create customer links for shared estimates, jobs, invoices, recurring work, and proof collection.",
    href: "/app/customer-touchpoints",
    icon: <ShieldCheck size={18} />
  },
  {
    title: "Build Job Proof",
    detail: "Collect photos, videos, before/after proof, notes, and consent for reports, reviews, and marketing.",
    href: "/app/proof",
    icon: <Camera size={18} />
  },
  {
    title: "Ask For Review",
    detail: "Use completed work and customer proof to request reviews and create trusted marketing.",
    href: "/app/review",
    icon: <Star size={18} />
  },
  {
    title: "Check Materials",
    detail: "Watch low inventory, tools, equipment, materials, and assigned job assets.",
    href: "/app/service/inventory",
    icon: <Package size={18} />
  }
];

const fieldServiceBackbone = [
  ["Capture", "Leads, forms, calls, quote requests, and customer records", "/app/lead-command", "working"],
  ["Bid", "Simple bids, estimate line items, payment terms, deposits, and manual follow-up drafts", "/app/job-tracker", "working"],
  ["Schedule", "Unscheduled jobs, route view, technician view, calendar-ready work, and reminders", "/app/service/routes", "working"],
  ["Dispatch", "Worker day plans, assignments, punch-in readiness, field proof, mileage, and field costs", "/app/operations-workforce", "working"],
  ["Materials", "Material lists, inventory, equipment, needed/ordered/purchased/used status", "/app/job-tracker", "working"],
  ["Invoice", "Invoices, manual payment records, Stripe payment-link readiness, overdue status, and cash collection", "/app/cash-collection", "working"],
  ["Collect", "Invoice follow-up drafts, app reminders, payment status, and owner alerts", "/app/text-queue", "working"],
  ["Portal", "Customer portal links, shared work history, proof uploads, and customer-facing status", "/app/customer-touchpoints", "working"],
  ["Proof", "Job photos, before/after proof, testimonials, consent, and photo-report readiness", "/app/proof", "working"],
  ["Reputation", "Review requests, proof capture, testimonials, before/after content, and consent", "/app/review", "working"],
  ["Accounting", "Job cost view, worker payments, reimbursements, ledgers, and portable CSV exports", "/app/purchasing", "works without provider keys"],
  ["AI help", "Needs Attention, Owner Events, action queue, automation timeline, and AI Workforce", "/app/attention-command", "better"]
];

function statusTone(value: string) {
  return value === "high" || value === "overdue" || value === "provider gated" ? "high" : value === "medium" || value === "better" ? "medium" : "";
}

export default async function ServiceCommandPage() {
  const dashboard = await getServiceOpsDashboard();

  return (
    <QueuePageShell
      eyebrow="Work"
      title="Run Today's Jobs Without Hunting"
      description="One plain service loop for customers, estimates, jobs, schedules, invoices, reviews, inventory, field proof, and technician work."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Normal operator view</p>
            <h2>Start with the work that moves jobs, money, and customer trust.</h2>
            <p className="muted">
              The detailed work records still exist. This page just puts the daily loop in the right order.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="button" href="/app/service">
              <Map size={16} /> Work Records
            </Link>
            <Link className="button secondary-button" href="/app/ai-walkthrough">
              AI Walkthrough
            </Link>
          </div>
        </div>
        <div className="button-row">
          <Link className="button secondary-button" href="/app/service/routes">Routes</Link>
          <Link className="button secondary-button" href="/app/service/tech">Tech View</Link>
          <Link className="button secondary-button" href="/app/service/inventory">Inventory</Link>
          <Link className="button secondary-button" href="/app/cash-collection">Cash</Link>
        </div>
      </section>

      <section className="grid section-actions">
        <Metric label="Open estimates" value={dashboard.metrics.openEstimates} />
        <Metric label="Scheduled jobs" value={dashboard.metrics.scheduledJobs} />
        <Metric label="Unscheduled jobs" value={dashboard.metrics.unscheduledJobs} tone={dashboard.metrics.unscheduledJobs ? "high" : ""} />
        <Metric label="Unpaid invoices" value={dashboard.metrics.unpaidInvoices} tone={dashboard.metrics.unpaidInvoices ? "medium" : ""} />
        <Metric label="Open tasks" value={dashboard.metrics.openTasks} tone={dashboard.metrics.openTasks ? "medium" : ""} />
        <Metric label="Review asks" value={dashboard.metrics.reviewRequestsDue} />
        <Metric label="Low inventory" value={dashboard.metrics.lowInventory} tone={dashboard.metrics.lowInventory ? "medium" : ""} />
        <Metric label="Pipeline value" value={dashboard.metrics.pipelineValue} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Where Ferocity must be credible</p>
            <h2>Field-service basics stay manual-friendly. AI sits on top.</h2>
            <p className="muted">
              Jobber and Housecall Pro are strong because the basic work is easy. Ferocity has to keep that same plain path:
              add records manually, move jobs forward, keep payment status visible, and let AI recommend the next action.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/service">Add records</Link>
            <Link className="mini-button" href="/app/customer-touchpoints">Portal setup</Link>
            <Link className="mini-button" href="/app/operations-workforce#payroll">Accounting export</Link>
          </div>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Field service backbone</p>
            <h2>The normal job flow is here. Ferocity adds the AI operator on top.</h2>
            <p className="muted">
              A job-based business still needs the basics: quote, schedule, dispatch, materials, invoice, collect, and review.
              Ferocity keeps those in one loop with Today, owner alerts, reminders, AI recommendations, marketing proof, and revenue learning.
            </p>
          </div>
          <Link className="button secondary-button" href="/app/job-tracker">
            <Wrench size={16} /> Simple job tracker
          </Link>
        </div>
        <div className="path-grid">
          {fieldServiceBackbone.map(([label, detail, href, status]) => (
            <Link className="path-card" href={href} key={label}>
              <strong>{label}</strong>
              <span>{detail}</span>
              <small className={`pill ${statusTone(status)}`}>{status}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-5">
          <h2>Do These Next</h2>
          <p className="muted">Generated from real service tasks, jobs, invoices, reviews, and inventory.</p>
          <ul className="list">
            {dashboard.nextBestActions.map((action) => (
              <li className="list-row" key={action.title}>
                <div>
                  <h3>{action.title}</h3>
                  <p className="muted">{action.detail}</p>
                </div>
                <div className="inline-actions">
                  <span className={`pill ${statusTone(action.urgency)}`}>{action.urgency}</span>
                  <Link className="mini-button" href={action.href === "/app/service" ? "/app/service-command" : action.href}>Open</Link>
                </div>
              </li>
            ))}
            {dashboard.nextBestActions.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No urgent service issue found</h3>
                  <p className="muted">Use Work Records to add customers, estimates, jobs, invoices, and tasks.</p>
                </div>
                <Link className="mini-button" href="/app/service">Work Records</Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-7">
          <h2>Service Loop</h2>
          <p className="muted">The business does not need to think in modules. It needs the job to move from request to paid and reviewed.</p>
          <div className="path-grid">
            {serviceLoops.map((loop) => (
              <Link className="path-card" href={loop.href} key={loop.title}>
                {loop.icon}
                <strong>{loop.title}</strong>
                <span>{loop.detail}</span>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Open Service Tasks</h2>
              <p className="muted">The task list stays in Work Records; this view just keeps it visible.</p>
            </div>
            <Link className="mini-button" href="/app/service">Manage tasks</Link>
          </div>
          <ul className="list">
            {dashboard.operationalTasks.slice(0, 8).map((task) => (
              <li className="list-row" key={task.id}>
                <div>
                  <h3><Link href={task.href}>{task.title}</Link></h3>
                  <p className="muted">{task.taskType} / {task.status}</p>
                  <p>{task.nextStep}</p>
                </div>
                <span className={`pill ${statusTone(task.priority)}`}>{task.priority}</span>
              </li>
            ))}
            {dashboard.operationalTasks.length === 0 ? (
              <li className="list-row">
                <span className="muted">No open service tasks yet.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <div className="list-row flush-row">
            <div>
              <h2>Recent Jobs And Invoices</h2>
              <p className="muted">Keep field work and money in the same daily view.</p>
            </div>
            <Link className="mini-button" href="/app/cash-collection">Cash collection</Link>
          </div>
          <ul className="list">
            {[...dashboard.jobs.slice(0, 4), ...dashboard.invoices.slice(0, 4)].map((record) => (
              <li className="list-row" key={`${record.href}-${record.id}`}>
                <div>
                  <h3><Link href={record.href}>{record.title}</Link></h3>
                  <p className="muted">
                    {"customerName" in record ? record.customerName : ""} / {"schedule" in record ? record.schedule : record.dueDate}
                  </p>
                </div>
                <span className={`pill ${statusTone(record.status)}`}>{record.status}</span>
              </li>
            ))}
            {dashboard.jobs.length + dashboard.invoices.length === 0 ? (
              <li className="list-row">
                <span className="muted">No recent jobs or invoices yet.</span>
              </li>
            ) : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ReceiptText size={18} /> Create Records In Work Records</h2>
            <p className="muted">Customer, estimate, job, and invoice forms stay on the detailed Work Records page so this page stays clean.</p>
          </div>
          <Link className="button" href="/app/service">Open Work Records</Link>
        </div>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <section className="metric-card span-3">
      <small className={`pill ${tone}`}>service</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

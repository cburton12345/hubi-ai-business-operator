import Link from "next/link";
import { Bot, CheckCircle2, CircleDollarSign, LockKeyhole, SlidersHorizontal, WandSparkles, Workflow } from "lucide-react";
import { getCurrentWorkspace, getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { queryPostgres } from "@/lib/db/postgres";

type WelcomeStats = {
  brands: string;
  forms: string;
  subscription_status: string | null;
  plan_key: string | null;
};

async function getWelcomeStats() {
  const workspaceId = await getCurrentWorkspaceId();
  const result = await queryPostgres<WelcomeStats>(
    `
    select
      (select count(*) from public.brands where tenant_id = $1)::text as brands,
      (select count(*) from public.forms where tenant_id = $1 and active = true)::text as forms,
      (select status from public.billing_subscriptions where tenant_id = $1 limit 1) as subscription_status,
      (select plan_key from public.billing_subscriptions where tenant_id = $1 limit 1) as plan_key
    `,
    [workspaceId]
  );

  return result?.rows[0] ?? {
    brands: "0",
    forms: "0",
    subscription_status: null,
    plan_key: null
  };
}

export default async function WelcomePage() {
  const [workspace, stats] = await Promise.all([getCurrentWorkspace(), getWelcomeStats()]);

  return (
    <section className="page-section">
      <div className="topbar">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1>Start {workspace.name} the simple way.</h1>
          <p className="muted">
            Use AI guided mode when you want Ferocity to lead. Use manual mode when you just need to add a customer, job, invoice, field cost,
            reminder, worker, or payment record yourself.
          </p>
        </div>
        <div className="inline-actions">
          <Link className="button" href="/app/build-system">
            Let Ferocity guide me
          </Link>
          <Link className="button secondary-button" href="/app/service-command">
            Do it myself
          </Link>
          <Link className="button secondary-button" href="/app/setup">
            Settings
          </Link>
        </div>
      </div>

      <section className="grid section-actions">
        <Metric label="Plan" value={stats.plan_key ?? workspace.accountType} />
        <Metric label="Billing" value={stats.subscription_status ?? "not connected"} />
        <Metric label="Brands" value={stats.brands} />
        <Metric label="Lead forms" value={stats.forms} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">What do you need first?</p>
            <h2>Start with the business problem, not the menu.</h2>
            <p className="muted">
              Ferocity has a lot inside it. These shortcuts keep the first move simple.
            </p>
          </div>
          <Link className="mini-button" href="/app/feature-map">See every tool</Link>
        </div>
        <div className="path-grid">
          {[
            ["I need more leads", "Plan website, SEO, reviews, proof, campaigns, and lead source tracking.", "/app/growth-calendar"],
            ["I need to follow up", "Work new leads, stale leads, callbacks, estimates, and customer replies.", "/app/lead-command"],
            ["I need to track jobs and bids", "Track bids, jobs, materials, worker payments, money owed, and job profit.", "/app/job-tracker"],
            ["I need to collect money", "See unpaid invoices, payment follow-up, manual payments, and ledger visibility.", "/app/cash-collection"],
            ["I need to plan workers", "Build the crew day, assign work, check time, mileage, and field proof.", "/app/crew-itinerary"],
            ["I need Ferocity to guide me", "Tell Ferocity the outcome and preview the setup or work plan first.", "/app/ai-workforce"]
          ].map(([title, detail, href]) => (
            <Link className="path-card" href={href} key={title}>
              <CheckCircle2 size={18} />
              <strong>{title}</strong>
              <span>{detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <article className="panel span-6">
          <Workflow size={20} />
          <h2>Let Ferocity guide setup</h2>
          <p className="muted">
            Tell Ferocity what the business needs. It recommends services, lead sources, follow-up, reviews, payments, SEO, and automations before
            anything goes live.
          </p>
          <Link className="mini-button" href="/app/build-system">
            Start guided setup
          </Link>
        </article>

        <article className="panel span-6">
          <Bot size={20} />
          <h2>Use the AI Workforce</h2>
          <p className="muted">
            Use the AI Workforce when you want Ferocity to prepare replies, follow-up, content, reviews, setup work, and next actions for approval.
          </p>
          <Link className="mini-button" href="/app/ai-workforce">
            AI Workforce
          </Link>
        </article>

        <article className="panel span-6">
          <SlidersHorizontal size={20} />
          <h2>Add basic work manually</h2>
          <p className="muted">
            Add customers, leads, bids, jobs, invoices, field costs, materials, payments, workers, and reminders without asking AI.
          </p>
          <Link className="mini-button" href="/app/service-command">
            Open manual tools
          </Link>
        </article>

        <article className="panel span-6">
          <WandSparkles size={20} />
          <h2>Connect the outside world</h2>
          <p className="muted">
            Website forms, customer portals, proof links, payment links, email, app alerts, Google, ads, and reviews can be added when the business is ready.
          </p>
          <Link className="mini-button" href="/app/customer-touchpoints">
            Connect touchpoints
          </Link>
        </article>

        <article className="panel span-6">
          <CheckCircle2 size={20} />
          <h2>Check Today</h2>
          <p className="muted">
            See leads, follow-up, invoices, worker plans, customer issues, and AI-prepared actions that need attention.
          </p>
          <Link className="mini-button" href="/app/attention-command">
            Open Needs Attention
          </Link>
        </article>

        <article className="panel span-6">
          <LockKeyhole size={20} />
          <h2>Keep control</h2>
          <p className="muted">
            Turn AI help on or off, require review, control spending, and keep messages, public posts, and payment requests under owner control.
          </p>
          <Link className="mini-button" href="/app/controls">
            Open controls
          </Link>
        </article>

        <article className="panel span-6">
          <CircleDollarSign size={20} />
          <h2>Know what is paid</h2>
          <p className="muted">
            Plans, limits, subscription status, payment-link readiness, and managed payment rules live in billing.
          </p>
          <Link className="mini-button" href="/app/billing">
            Billing readiness
          </Link>
        </article>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

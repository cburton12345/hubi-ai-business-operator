import Link from "next/link";
import { Bot, CheckCircle2, CircleDollarSign, LockKeyhole, SlidersHorizontal, WandSparkles, Workflow } from "lucide-react";
import { getCurrentWorkspace, getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { queryPostgres } from "@/lib/db/postgres";
import { getOperatorSetupDashboard } from "@/lib/setup/get-operator-setup";
import { ServiceChoiceGrid } from "@/components/setup/ServiceChoiceGrid";

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
  const [workspace, stats, setup] = await Promise.all([getCurrentWorkspace(), getWelcomeStats(), getOperatorSetupDashboard()]);

  return (
    <section className="page-section">
      <div className="topbar">
        <div>
          <p className="eyebrow">Welcome</p>
          <h1>Start {workspace.name} the simple way.</h1>
          <p className="muted">
            Pick the outcome you want Ferocity to move first. Ferocity can guide setup and prepare work, while manual tools stay available
            for customers, jobs, invoices, field costs, reminders, workers, and payments.
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
            <p className="eyebrow">Choose services</p>
            <h2>Choose the parts of the business Ferocity should help handle.</h2>
            <p className="muted">
              Start with one service, a few services, or the full operating system. Included tools can stay available without forcing setup today.
            </p>
          </div>
          <div className="inline-actions">
            <span className="pill">Current plan: {setup.currentPlanName}</span>
            <Link className="mini-button" href="/app/setup">Direct controls</Link>
            <Link className="mini-button secondary-button" href="/app/feature-map">See every tool</Link>
          </div>
        </div>
        <ServiceChoiceGrid verticals={setup.verticals} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Common starting points</p>
            <h2>Start with the business problem, not the menu.</h2>
            <p className="muted">
              If the owner does not know which service to choose, these paths point to the most common wins.
            </p>
          </div>
        </div>
        <div className="path-grid">
          {[
            ["I want more booked income", "Find missed follow-up, qualify leads, track sources, and turn attention into collected revenue.", "/app/revenue-growth"],
            ["I want leads followed up", "Work new leads, stale leads, callbacks, estimates, and customer replies.", "/app/lead-command"],
            ["I want simple job tracking", "Track bids, jobs, materials, worker payments, money owed, and job profit.", "/app/job-tracker"],
            ["I want money collected faster", "See unpaid invoices, payment follow-up, manual payments, and ledger visibility.", "/app/cash-collection"],
            ["I want worker days planned", "Build the crew day, assign work, check time, mileage, and field proof.", "/app/crew-itinerary"],
            ["I want Ferocity to lead", "Tell Ferocity the outcome and preview the setup or work plan first.", "/app/ai-workforce"]
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

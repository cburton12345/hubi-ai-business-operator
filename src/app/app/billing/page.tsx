import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { checkLeadIntakeLimits } from "@/lib/billing/plan-limits";
import { getBillingOverview } from "@/lib/billing/get-billing-overview";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

export default async function BillingPage() {
  const [billing, workspaceId] = await Promise.all([getBillingOverview(), getCurrentWorkspaceId()]);
  const leadLimits = await checkLeadIntakeLimits(workspaceId);
  const currentPlan = billing.subscription?.planKey ?? leadLimits.planKey ?? "free";
  const leadUsage =
    leadLimits.monthlyLeadLimit === null
      ? `${leadLimits.monthlyLeadsUsed.toLocaleString()} this month`
      : `${leadLimits.monthlyLeadsUsed.toLocaleString()} / ${leadLimits.monthlyLeadLimit.toLocaleString()}`;
  const formUsage =
    leadLimits.formsLimit === null
      ? `${leadLimits.activeForms.toLocaleString()} active`
      : `${leadLimits.activeForms.toLocaleString()} / ${leadLimits.formsLimit.toLocaleString()}`;

  return (
    <QueuePageShell
      eyebrow="Billing"
      title="Plan, Limits, And Upgrade Path"
      description="See what this workspace can use now, what is gated, and what changes when the business upgrades."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Current Plan</h2>
            <p className="muted">
              The workspace keeps its data when it upgrades. Live email, SMS, payment links, publishing, and provider sync stay gated by
              connected accounts and review rules.
            </p>
          </div>
          <div className="inline-actions">
            <span className="pill">{currentPlan}</span>
            <span className={`pill ${leadLimits.ok ? "" : "high"}`}>{leadLimits.ok ? "accepting leads" : "limit reached"}</span>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Leads this month" value={leadUsage} />
          <Metric label="Active forms" value={formUsage} />
          <Metric label="Seats" value={billing.subscription?.seats ?? 1} />
        </div>
        <div className="inline-actions">
          <Link className="button" href="/pricing">View public plans</Link>
          <Link className="button secondary-button" href="/start?source=billing_upgrade">Request upgrade help</Link>
          <Link className="mini-button" href="/app/controls">Control limits</Link>
        </div>
      </section>

      <div className="grid section-actions">
        <Metric label="Brands" value={billing.usage.brands} />
        <Metric label="Users" value={billing.usage.users} />
        <Metric label="Leads this month" value={billing.usage.leadsThisMonth} />
        <Metric label="Active forms" value={billing.usage.activeForms} />
        <Metric label="AI runs this month" value={billing.usage.aiRunsThisMonth} />
        <Metric label="SEO drafts this month" value={billing.usage.seoDraftsThisMonth} />
        <Metric label="Publishing queue" value={billing.usage.publishingQueueItems} />
        <Metric label="Review requests" value={billing.usage.reviewRequestsThisMonth} />
      </div>

      <section className="panel section-actions">
        <h2>Billing Readiness</h2>
        <p className="muted">This tells the operator why a paid or live action is allowed, blocked, or waiting on keys.</p>
        <ul className="list">
          {billing.readiness.map((item) => (
            <li className="list-row" key={item.label}>
              <div>
                <h3>{item.label}</h3>
                <p className="muted">{item.detail}</p>
              </div>
              <span className={`pill ${item.status === "blocked" ? "high" : item.status === "needs_setup" ? "medium" : ""}`}>{item.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Feature Gates</h2>
            <p className="muted">Usage and limits are visible now so paid tiers can be enforced cleanly later.</p>
          </div>
          <Link className="mini-button" href="/app/controls">Open controls</Link>
        </div>
        <ul className="list">
          {billing.featureGates.map((gate) => (
            <li className="list-row" key={gate.featureKey}>
              <div>
                <h3>{gate.label}</h3>
                <p className="muted">{gate.featureKey} / {gate.usagePeriod ?? "monthly"} / used {gate.currentUsage.toLocaleString()}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{gate.status}</span>
                <span className="pill">{gate.usageLimit === null ? "unlimited" : `${gate.remaining?.toLocaleString()} left`}</span>
              </div>
            </li>
          ))}
          {billing.featureGates.length === 0 ? <li className="list-row"><span className="muted">No feature gates configured yet.</span></li> : null}
        </ul>
      </section>

      <div className="grid">
        {billing.plans.map((plan) => (
          <section className="panel span-4" key={plan.id}>
            <h2>{plan.name}</h2>
            <p className="metric"><strong>{dollars(plan.monthlyPriceCents)}</strong></p>
            <ul className="list">
              <li className="list-row"><strong>Brands</strong><span className="pill">{plan.includedBrands}</span></li>
              <li className="list-row"><strong>AI runs</strong><span className="pill">{plan.includedAiRuns}</span></li>
            </ul>
            <form action="/api/billing/checkout" method="post">
              <input name="plan" type="hidden" value={plan.planKey} />
              <input name="source" type="hidden" value="app_billing" />
              <button className="mini-button" disabled={plan.planKey === currentPlan} type="submit">
                {plan.planKey === currentPlan ? "Current plan" : "Choose plan"}
              </button>
            </form>
          </section>
        ))}
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}

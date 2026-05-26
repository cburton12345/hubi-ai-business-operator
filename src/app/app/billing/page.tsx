import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getBillingOverview } from "@/lib/billing/get-billing-overview";

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}/mo`;
}

export default async function BillingPage() {
  const billing = await getBillingOverview();

  return (
    <QueuePageShell
      eyebrow="Billing"
      title="Plan And Subscription Readiness"
      description="Billing plans are modeled for paid launch. Stripe remains disconnected until credentials and product decisions are ready."
    >
      <section className="panel section-actions">
        <h2>Current Subscription</h2>
        {billing.subscription ? (
          <ul className="list">
            <li className="list-row"><strong>Plan</strong><span className="pill">{billing.subscription.planKey}</span></li>
            <li className="list-row"><strong>Status</strong><span className="pill">{billing.subscription.status}</span></li>
            <li className="list-row"><strong>Seats</strong><span className="pill">{billing.subscription.seats}</span></li>
            <li className="list-row"><strong>Processor</strong><span className="pill">not connected</span></li>
          </ul>
        ) : (
          <p className="muted">No subscription placeholder exists for this organization yet.</p>
        )}
      </section>

      <div className="grid section-actions">
        <Metric label="Brands" value={billing.usage.brands} />
        <Metric label="Users" value={billing.usage.users} />
        <Metric label="AI runs this month" value={billing.usage.aiRunsThisMonth} />
        <Metric label="SEO drafts this month" value={billing.usage.seoDraftsThisMonth} />
        <Metric label="Publishing queue" value={billing.usage.publishingQueueItems} />
        <Metric label="Review requests" value={billing.usage.reviewRequestsThisMonth} />
      </div>

      <section className="panel section-actions">
        <h2>Billing Readiness</h2>
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
        <h2>Feature Gates</h2>
        <p className="muted">Usage and limits are visible now so paid tiers can be enforced cleanly later.</p>
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

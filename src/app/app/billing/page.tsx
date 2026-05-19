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

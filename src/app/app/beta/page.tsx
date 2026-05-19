import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getBetaReadiness } from "@/lib/beta/get-beta-readiness";
import { updateBetaCheckAction } from "./actions";

export default async function BetaReadinessPage() {
  const readiness = await getBetaReadiness();

  return (
    <QueuePageShell
      eyebrow="Beta Launch"
      title="Customer Readiness"
      description="Beta checklist for real external organizations before paid launch."
    >
      <div className="grid section-actions">
        <Metric label="Brands" value={readiness.counts.brands} />
        <Metric label="Forms" value={readiness.counts.forms} />
        <Metric label="Users" value={readiness.counts.users} />
        <Metric label="AI Plans" value={readiness.counts.aiPlans} />
        <Metric label="Exports" value={readiness.counts.exports} />
        <Metric label="Leads" value={readiness.counts.leads} />
      </div>

      <ul className="review-list">
        {readiness.checks.map((check) => (
          <li className="panel" key={check.id}>
            <form action={updateBetaCheckAction} className="compact-form">
              <input name="checkId" type="hidden" value={check.id} />
              <div>
                <strong>{check.label}</strong>
                <span className="muted">{check.key}</span>
              </div>
              <select name="status" defaultValue={check.status}>
                <option value="pending">pending</option>
                <option value="passed">passed</option>
                <option value="failed">failed</option>
                <option value="waived">waived</option>
              </select>
              <input name="notes" defaultValue={check.notes} placeholder="Notes" />
              <button className="mini-button" type="submit">Save</button>
            </form>
          </li>
        ))}
      </ul>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

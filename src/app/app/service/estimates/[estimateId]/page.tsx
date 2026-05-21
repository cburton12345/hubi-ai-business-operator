import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceEstimateDetail } from "@/lib/service-ops/get-service-record-detail";
import { updateEstimateAction } from "../../actions";

const statuses = ["draft", "sent_manually", "approved", "declined", "expired"];

export default async function EstimateDetailPage({ params }: { params: Promise<{ estimateId: string }> }) {
  const { estimateId } = await params;
  const estimate = await getServiceEstimateDetail(estimateId);
  if (!estimate) notFound();

  return (
    <QueuePageShell eyebrow="Estimate" title={estimate.title} description={`${estimate.customerName} / ${estimate.total}`}>
      <div className="grid">
        <section className="panel span-7">
          <h2>Line Items</h2>
          <ul className="list">
            {estimate.lineItems.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p className="muted">{item.description || "No description"} / qty {item.quantity} / {item.unitPrice}</p>
                </div>
                <span className="pill">{item.total}</span>
              </li>
            ))}
          </ul>
          <Link className="button secondary-button section-actions" href={`/app/service/customers/${estimate.customerId}`}>View customer</Link>
        </section>
        <section className="panel span-5 form-stack">
          <h2>Estimate Workflow</h2>
          <form action={updateEstimateAction} className="form-stack">
            <input name="estimateId" type="hidden" value={estimate.id} />
            <label>
              Status
              <select name="status" defaultValue={estimate.status}>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              Internal notes
              <textarea name="internalNotes" rows={4} defaultValue={estimate.internalNotes} />
            </label>
            <label>
              Manual follow-up draft
              <textarea name="followUpDraft" rows={5} defaultValue={estimate.followUpDraft} />
            </label>
            <button className="button" type="submit">Save estimate</button>
          </form>
        </section>
      </div>
    </QueuePageShell>
  );
}

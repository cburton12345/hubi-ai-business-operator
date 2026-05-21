import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceEstimateDetail } from "@/lib/service-ops/get-service-record-detail";
import { deleteEstimateLineItemAction, saveEstimateLineItemAction, updateEstimateAction } from "../../actions";

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
                <form action={saveEstimateLineItemAction} className="compact-form">
                  <input name="estimateId" type="hidden" value={estimate.id} />
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="name" defaultValue={item.name} />
                  <input name="description" defaultValue={item.description} placeholder="Description" />
                  <input name="quantity" defaultValue={item.quantity} inputMode="decimal" />
                  <input name="unitPrice" defaultValue={item.unitPriceValue} inputMode="decimal" />
                  <button className="mini-button" type="submit">Save</button>
                </form>
                <span className="pill">{item.total}</span>
                <form action={deleteEstimateLineItemAction}>
                  <input name="estimateId" type="hidden" value={estimate.id} />
                  <input name="itemId" type="hidden" value={item.id} />
                  <button className="mini-button danger-button" type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveEstimateLineItemAction} className="compact-form section-actions">
            <input name="estimateId" type="hidden" value={estimate.id} />
            <input name="name" placeholder="New line item" required />
            <input name="description" placeholder="Description" />
            <input name="quantity" defaultValue="1" inputMode="decimal" />
            <input name="unitPrice" placeholder="Unit price" inputMode="decimal" />
            <button className="mini-button" type="submit">Add item</button>
          </form>
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

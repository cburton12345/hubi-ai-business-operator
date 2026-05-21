import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceInvoiceDetail } from "@/lib/service-ops/get-service-record-detail";
import { deleteInvoiceLineItemAction, saveInvoiceLineItemAction, updateInvoiceAction } from "../../actions";

const statuses = ["draft", "sent_manually", "partially_paid", "paid", "void", "overdue"];

export default async function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const invoice = await getServiceInvoiceDetail(invoiceId);
  if (!invoice) notFound();

  return (
    <QueuePageShell eyebrow="Invoice" title={invoice.title} description={`${invoice.customerName} / ${invoice.total}`}>
      <div className="grid">
        <section className="panel span-7">
          <h2>Line Items</h2>
          <ul className="list">
            {invoice.lineItems.map((item) => (
              <li className="list-row" key={item.id}>
                <form action={saveInvoiceLineItemAction} className="compact-form">
                  <input name="invoiceId" type="hidden" value={invoice.id} />
                  <input name="itemId" type="hidden" value={item.id} />
                  <input name="name" defaultValue={item.name} />
                  <input name="description" defaultValue={item.description} placeholder="Description" />
                  <input name="quantity" defaultValue={item.quantity} inputMode="decimal" />
                  <input name="unitPrice" defaultValue={item.unitPriceValue} inputMode="decimal" />
                  <button className="mini-button" type="submit">Save</button>
                </form>
                <span className="pill">{item.total}</span>
                <form action={deleteInvoiceLineItemAction}>
                  <input name="invoiceId" type="hidden" value={invoice.id} />
                  <input name="itemId" type="hidden" value={item.id} />
                  <button className="mini-button danger-button" type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={saveInvoiceLineItemAction} className="compact-form section-actions">
            <input name="invoiceId" type="hidden" value={invoice.id} />
            <input name="name" placeholder="New line item" required />
            <input name="description" placeholder="Description" />
            <input name="quantity" defaultValue="1" inputMode="decimal" />
            <input name="unitPrice" placeholder="Unit price" inputMode="decimal" />
            <button className="mini-button" type="submit">Add item</button>
          </form>
          <dl className="detail-grid section-actions">
            <Detail label="Amount paid" value={invoice.amountPaid} />
            <Detail label="Due date" value={invoice.dueDate} />
          </dl>
          <Link className="button secondary-button section-actions" href={`/app/service/customers/${invoice.customerId}`}>View customer</Link>
        </section>
        <section className="panel span-5 form-stack">
          <h2>Invoice Workflow</h2>
          <form action={updateInvoiceAction} className="form-stack">
            <input name="invoiceId" type="hidden" value={invoice.id} />
            <label>
              Status
              <select name="status" defaultValue={invoice.status}>
                {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>Amount paid<input name="amountPaid" inputMode="decimal" placeholder={invoice.amountPaid} /></label>
            <label>Due date<input name="dueDate" type="date" /></label>
            <label>Internal notes<textarea name="internalNotes" rows={3} defaultValue={invoice.internalNotes} /></label>
            <label>Manual payment notes<textarea name="paymentNotes" rows={3} defaultValue={invoice.paymentNotes} /></label>
            <button className="button" type="submit">Save invoice</button>
          </form>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

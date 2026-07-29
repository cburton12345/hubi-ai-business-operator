import Link from "next/link";
import { CreditCard, DollarSign, FileText, ReceiptText, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { prepareInvoicePaymentRequestAction } from "@/app/app/service/actions";
import { getCashCollectionDashboard } from "@/lib/cash-collection/get-cash-collection-dashboard";

export default async function CashCollectionPage() {
  const dashboard = await getCashCollectionDashboard();

  return (
    <QueuePageShell
      eyebrow="Cash Collection"
      title="Get Paid And Keep The Ledger Clean"
      description="One place for unpaid invoices, overdue follow-up, manual payment records, Stripe payment-link readiness, payments received, and ledger visibility."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><DollarSign size={18} /> What needs money attention?</h2>
            <p className="muted">
              Ferocity can prepare payment requests, record manual payments, and keep ledger entries. Live online payment links require Stripe to be
              configured and remain under owner control. Managed platform-fee payments are not live until Stripe Connect is added.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/service">Create invoice</Link>
            <Link className="button secondary-button" href="/app/text-queue">Text bill reminders</Link>
            <Link className="button secondary-button" href="/app/billing">Stripe setup</Link>
            <Link className="button secondary-button" href="/app/purchasing">Purchasing & accounting</Link>
            <Link className="button secondary-button" href="/app/reports">Reports</Link>
          </div>
        </div>
      </section>

      <div className="grid section-actions">
        <Metric label="Open invoices" value={dashboard.metrics.openInvoices} />
        <Metric label="Overdue" value={dashboard.metrics.overdueInvoices} tone={dashboard.metrics.overdueInvoices ? "high" : ""} />
        <Metric label="Balance due" value={dashboard.metrics.balanceDue} />
        <Metric label="Collected" value={dashboard.metrics.collectedRevenue} />
        <Metric label="Payment requests" value={dashboard.metrics.paymentRequests} />
        <Metric label="Payments received" value={dashboard.metrics.paymentsReceived} />
        <Metric label="Ledger entries" value={dashboard.metrics.ledgerEntries} />
      </div>

      <section className="grid section-actions">
        <section className="panel span-7">
          <h2><ShieldCheck size={18} /> Next Money Moves</h2>
          <ul className="priority-list">
            {dashboard.nextActions.map((action, index) => (
              <li className="priority-row" key={action.title}>
                <span className="priority-number">{index + 1}</span>
                <div>
                  <h3>{action.title}</h3>
                  <p className="muted">{action.detail}</p>
                </div>
                <span className={`pill ${action.urgency}`}>{action.urgency}</span>
                <Link className="mini-button" href={action.href}>Open</Link>
              </li>
            ))}
            {dashboard.nextActions.length === 0 ? (
              <li className="priority-row">
                <span className="priority-number">1</span>
                <div>
                  <h3>No urgent cash collection issue found</h3>
                  <p className="muted">Create invoices, payment requests, payments, or ledger entries to populate this board.</p>
                </div>
                <span className="pill low">low</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-5">
          <h2><CreditCard size={18} /> Payment Readiness</h2>
          <p className="muted">{dashboard.readiness.detail}</p>
          <div className="inline-actions section-actions">
            <span className={`pill ${dashboard.readiness.stripeStatus === "ready" ? "" : "high"}`}>{dashboard.readiness.stripeStatus.replaceAll("_", " ")}</span>
            <Link className="mini-button" href="/app/billing">Billing</Link>
            <Link className="mini-button secondary-button" href="/app/integrations">Integrations</Link>
          </div>
        </section>
      </section>

      <section className="panel section-actions">
        <h2><ShieldCheck size={18} /> Fee Safety Rules</h2>
        <p className="muted">
          Manual payment records do not create processing fees. Online payment links use provider fees. Managed payments must pass through
          processor fees, instant-payout fees, refunds, disputes, chargebacks, and bank-return costs before managed payment options are enabled.
        </p>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><FileText size={18} /> Open Invoice Checklist</h2>
            <p className="muted">Open the invoice to edit line items, record a manual payment, prepare a payment request, or view the ledger.</p>
          </div>
          <Link className="mini-button" href="/app/service">All service ops</Link>
        </div>
        <ul className="list">
          {dashboard.invoices.map((invoice) => (
            <li className="list-row" key={invoice.id}>
              <div>
                <h3><Link href={invoice.href}>{invoice.title}</Link></h3>
                <p className="muted">{invoice.customerName} / due {invoice.dueDate}</p>
                <p className="muted">Total {invoice.total} / paid {invoice.paid} / balance {invoice.balance}</p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${invoice.status === "overdue" ? "high" : ""}`}>{invoice.status}</span>
                <form action={prepareInvoicePaymentRequestAction}>
                  <input name="invoiceId" type="hidden" value={invoice.id} />
                  <button className="mini-button" type="submit">Prepare Stripe link</button>
                </form>
                <a className={`mini-button secondary-button ${invoice.canText ? "" : "disabled-link"}`} href={invoice.smsHref} aria-disabled={!invoice.canText}>
                  Text reminder
                </a>
                <Link className="mini-button secondary-button" href={invoice.href}>Open</Link>
              </div>
            </li>
          ))}
          {dashboard.invoices.length === 0 ? <li className="list-row"><span className="muted">No open invoices found.</span></li> : null}
        </ul>
      </section>

      <div className="grid section-actions">
        <ListPanel
          title="Payment Requests"
          icon={<CreditCard size={18} />}
          empty="No payment requests prepared yet."
          rows={dashboard.paymentRequests.map((request) => ({
            id: request.id,
            title: `${request.invoiceTitle} / ${request.amount}`,
            detail: `${request.customerName} / ${request.provider} / ${request.hasLiveUrl ? "Stripe checkout link ready" : "no live Stripe link yet"}`,
            status: request.status,
            href: request.href
          }))}
        />
        <ListPanel
          title="Payments Received"
          icon={<DollarSign size={18} />}
          empty="No payments recorded yet."
          rows={dashboard.payments.map((payment) => ({
            id: payment.id,
            title: `${payment.invoiceTitle} / ${payment.amount}`,
            detail: `${payment.customerName} / ${payment.provider} / ${payment.receivedAt}`,
            status: payment.status,
            href: payment.href
          }))}
        />
        <ListPanel
          title="Ledger"
          icon={<ReceiptText size={18} />}
          empty="No ledger entries yet."
          rows={dashboard.ledgerEntries.map((entry) => ({
            id: entry.id,
            title: `${entry.entryType.replaceAll("_", " ")} / ${entry.amount}`,
            detail: `${entry.invoiceTitle} / ${entry.occurredAt}`,
            status: entry.direction,
            href: entry.href
          }))}
        />
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      {tone ? <span className={`pill ${tone}`}>needs attention</span> : null}
    </section>
  );
}

function ListPanel({
  title,
  icon,
  empty,
  rows
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  rows: { id: string; title: string; detail: string; status: string; href: string }[];
}) {
  return (
    <section className="panel span-6">
      <h2>{icon} {title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3><Link href={row.href}>{row.title}</Link></h3>
              <p className="muted">{row.detail}</p>
            </div>
            <div className="inline-actions">
              <span className="pill">{row.status}</span>
              <Link className="mini-button" href={row.href}>Open</Link>
            </div>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}

import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceOpsDashboard } from "@/lib/service-ops/get-service-ops-dashboard";
import { createCustomerAction, createEstimateAction, createInvoiceAction, createJobAction } from "./actions";

export default async function ServiceOpsPage() {
  const dashboard = await getServiceOpsDashboard();

  return (
    <QueuePageShell
      eyebrow="Service Operations"
      title="Field Service Command Center"
      description="Manage customers, estimates, scheduled jobs, invoices, and manual AI-assisted follow-up for the selected organization."
    >
      <div className="grid section-actions">
        <Metric label="Customers" value={dashboard.metrics.customers} />
        <Metric label="Open estimates" value={dashboard.metrics.openEstimates} />
        <Metric label="Scheduled jobs" value={dashboard.metrics.scheduledJobs} />
        <Metric label="Unscheduled jobs" value={dashboard.metrics.unscheduledJobs} />
        <Metric label="Unpaid invoices" value={dashboard.metrics.unpaidInvoices} />
        <Metric label="Pipeline value" value={dashboard.metrics.pipelineValue} />
      </div>

      <div className="grid">
        <section className="panel span-6 form-stack">
          <h2>Add customer</h2>
          <form action={createCustomerAction} className="form-stack">
            <input name="name" placeholder="Customer name" required />
            <input name="email" type="email" placeholder="Email" />
            <input name="phone" placeholder="Phone" />
            <div className="two-col">
              <input name="city" placeholder="City" />
              <input name="state" placeholder="State" />
            </div>
            <textarea name="notes" rows={3} placeholder="Internal notes" />
            <button className="button" type="submit">Create customer</button>
          </form>
        </section>

        <CreateMoneyPanel
          action={createEstimateAction}
          buttonLabel="Create estimate"
          customers={dashboard.customers}
          title="Create estimate"
          titlePlaceholder="Roof repair estimate"
        />

        <section className="panel span-6 form-stack">
          <h2>Create job</h2>
          <form action={createJobAction} className="form-stack">
            <CustomerSelect customers={dashboard.customers} />
            <input name="title" placeholder="Job title" required />
            <label>
              Scheduled start
              <input name="scheduledStart" type="datetime-local" />
            </label>
            <label>
              Scheduled end
              <input name="scheduledEnd" type="datetime-local" />
            </label>
            <input name="serviceArea" placeholder="Service area" />
            <textarea name="dispatcherNotes" rows={3} placeholder="Dispatcher notes" />
            <button className="button" type="submit">Create job</button>
          </form>
        </section>

        <CreateMoneyPanel
          action={createInvoiceAction}
          buttonLabel="Create invoice"
          customers={dashboard.customers}
          title="Create invoice"
          titlePlaceholder="Completed service invoice"
        />
      </div>

      <div className="grid section-actions">
        <ListPanel
          title="Customers"
          rows={dashboard.customers.map((customer) => ({
            id: customer.id,
            title: customer.name,
            meta: `${customer.contact} / ${customer.location}`,
            pill: customer.status
          }))}
        />
        <ListPanel
          title="Estimates"
          rows={dashboard.estimates.map((estimate) => ({
            id: estimate.id,
            title: estimate.title,
            meta: `${estimate.customerName} / ${estimate.total}`,
            pill: estimate.status
          }))}
        />
        <ListPanel
          title="Jobs"
          rows={dashboard.jobs.map((job) => ({
            id: job.id,
            title: job.title,
            meta: `${job.customerName} / ${job.schedule} / ${job.assignedTo}`,
            pill: job.status
          }))}
        />
        <ListPanel
          title="Invoices"
          rows={dashboard.invoices.map((invoice) => ({
            id: invoice.id,
            title: invoice.title,
            meta: `${invoice.customerName} / ${invoice.total} / due ${invoice.dueDate}`,
            pill: invoice.status
          }))}
        />
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function CustomerSelect({ customers }: { customers: { id: string; name: string }[] }) {
  return (
    <select name="customerId" required>
      <option value="">Select customer</option>
      {customers.map((customer) => (
        <option key={customer.id} value={customer.id}>{customer.name}</option>
      ))}
    </select>
  );
}

function CreateMoneyPanel({
  action,
  buttonLabel,
  customers,
  title,
  titlePlaceholder
}: {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  customers: { id: string; name: string }[];
  title: string;
  titlePlaceholder: string;
}) {
  return (
    <section className="panel span-6 form-stack">
      <h2>{title}</h2>
      <form action={action} className="form-stack">
        <CustomerSelect customers={customers} />
        <input name="title" placeholder={titlePlaceholder} required />
        <input name="lineItem" placeholder="Line item" required />
        <input name="amount" inputMode="decimal" placeholder="Amount" />
        <textarea name="notes" rows={3} placeholder="Internal notes" />
        <button className="button" type="submit">{buttonLabel}</button>
      </form>
    </section>
  );
}

function ListPanel({
  title,
  rows
}: {
  title: string;
  rows: { id: string; title: string; meta: string; pill: string }[];
}) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.title}</h3>
              <p className="muted">{row.meta}</p>
            </div>
            <span className="pill">{row.pill}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">No records yet.</span></li> : null}
      </ul>
    </section>
  );
}

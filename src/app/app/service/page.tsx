import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getServiceOpsDashboard } from "@/lib/service-ops/get-service-ops-dashboard";
import { createCustomerAction, createEstimateAction, createInvoiceAction, createJobAction, scanServiceOpsAction, updateServiceTaskAction } from "./actions";

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function ServiceOpsPage() {
  const dashboard = await getServiceOpsDashboard();

  return (
    <QueuePageShell
      eyebrow="Service Operations"
      title="Field Service Command Center"
      description="Manage customers, estimates, scheduled jobs, invoices, and manual AI-assisted follow-up for the selected organization."
    >
      <div className="section-actions button-row">
        <form action={scanServiceOpsAction}>
          <button className="button" type="submit">Scan service ops</button>
        </form>
        <Link className="button secondary-button" href="/app/service/routes">Route planning</Link>
        <Link className="button secondary-button" href="/app/service/tech">Technician workflow</Link>
        <Link className="button secondary-button" href="/app/service/inventory">Inventory</Link>
      </div>

      <div className="grid section-actions">
        <Metric label="Customers" value={dashboard.metrics.customers} />
        <Metric label="Open estimates" value={dashboard.metrics.openEstimates} />
        <Metric label="Scheduled jobs" value={dashboard.metrics.scheduledJobs} />
        <Metric label="Unscheduled jobs" value={dashboard.metrics.unscheduledJobs} />
        <Metric label="Unpaid invoices" value={dashboard.metrics.unpaidInvoices} />
        <Metric label="Open tasks" value={dashboard.metrics.openTasks} />
        <Metric label="Review requests" value={dashboard.metrics.reviewRequestsDue} />
        <Metric label="Low inventory" value={dashboard.metrics.lowInventory} />
        <Metric label="Pipeline value" value={dashboard.metrics.pipelineValue} />
      </div>

      <div className="grid">
        <section className="panel span-12">
          <div className="list-row flush-row">
            <div>
              <h2>Today In Service</h2>
              <p className="muted">The practical work list for jobs, estimates, invoices, reviews, recurring service, and inventory.</p>
            </div>
            <Link className="mini-button" href="/app/operator">Operator console</Link>
          </div>
          <ul className="priority-list">
            {dashboard.nextBestActions.map((action, index) => (
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
            {dashboard.nextBestActions.length === 0 ? (
              <li className="priority-row">
                <span className="priority-number">1</span>
                <div>
                  <h3>No urgent service work found</h3>
                  <p className="muted">Run a scan after jobs, estimates, invoices, reviews, recurring service, or inventory change.</p>
                </div>
                <span className="pill low">low</span>
                <form action={scanServiceOpsAction}>
                  <button className="mini-button" type="submit">Scan</button>
                </form>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-12">
          <h2>Service Tasks</h2>
          <ul className="list">
            {dashboard.operationalTasks.map((task) => (
              <li className="list-row" key={task.id}>
                <div>
                  <h3><Link href={task.href}>{task.title}</Link></h3>
                  <p className="muted">{task.taskType} / due {dateLabel(task.dueAt)}</p>
                  <p>{task.detail}</p>
                  <p className="muted">Next: {task.nextStep}</p>
                </div>
                <form action={updateServiceTaskAction} className="inline-actions">
                  <input name="taskId" type="hidden" value={task.id} />
                  <span className={`pill ${task.priority}`}>{task.priority}</span>
                  <select name="status" defaultValue={task.status}>
                    <option value="open">open</option>
                    <option value="scheduled">scheduled</option>
                    <option value="done">done</option>
                    <option value="dismissed">dismissed</option>
                  </select>
                  <button className="mini-button" type="submit">Save</button>
                </form>
              </li>
            ))}
            {dashboard.operationalTasks.length === 0 ? (
              <li className="list-row">
                <span className="muted">No service tasks yet. Run a scan to create tasks from real jobs, estimates, invoices, review workflows, recurring plans, and inventory.</span>
              </li>
            ) : null}
          </ul>
        </section>

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
            pill: customer.status,
            href: customer.href
          }))}
        />
        <ListPanel
          title="Estimates"
          rows={dashboard.estimates.map((estimate) => ({
            id: estimate.id,
            title: estimate.title,
            meta: `${estimate.customerName} / ${estimate.total}`,
            pill: estimate.status,
            href: estimate.href
          }))}
        />
        <ListPanel
          title="Jobs"
          rows={dashboard.jobs.map((job) => ({
            id: job.id,
            title: job.title,
            meta: `${job.customerName} / ${job.schedule} / ${job.assignedTo}`,
            pill: job.status,
            href: job.href
          }))}
        />
        <ListPanel
          title="Invoices"
          rows={dashboard.invoices.map((invoice) => ({
            id: invoice.id,
            title: invoice.title,
            meta: `${invoice.customerName} / ${invoice.total} / due ${invoice.dueDate}`,
            pill: invoice.status,
            href: invoice.href
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
  rows: { id: string; title: string; meta: string; pill: string; href?: string }[];
}) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((row) => (
          <li className="list-row" key={row.id}>
            <div>
              <h3>{row.href ? <Link href={row.href}>{row.title}</Link> : row.title}</h3>
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

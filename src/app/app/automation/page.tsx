import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import {
  getMarketingAutomationRuleRows,
  getMarketingAutomationRunRows,
  type MarketingAutomationRuleRow,
  type MarketingAutomationRunRow
} from "@/lib/automation/get-marketing-automation";
import { runMarketingAutomationAction } from "./actions";

const automationReadiness = [
  ["Lead response", "Creates first-response drafts and unanswered lead tasks.", "review required"],
  ["Stale lead recovery", "Finds old open leads and queues next actions.", "ready to scan"],
  ["Estimate follow-up", "Finds aging or viewed estimates and prepares reminders.", "ready to scan"],
  ["Invoice follow-up", "Finds unpaid balances and prepares payment reminders.", "ready to scan"],
  ["Payment collection", "Prepares invoice payment requests and ledger entries.", "Stripe-ready"],
  ["Review request", "Queues requests after completed work with interception rules.", "review required"],
  ["SEO refresh", "Prepares service and city page updates from real business context.", "draft only"],
  ["Publishing", "Holds external posts/pages until approval and provider connection.", "approval required"]
];

export default async function AutomationPage() {
  const [rules, runs] = await Promise.all([getMarketingAutomationRuleRows(), getMarketingAutomationRunRows()]);

  return (
    <QueuePageShell
      eyebrow="Future Automation"
      title="Marketing Automation Rules"
      description="Generate recurring draft work and reporting summaries for each workspace brand. Publishing, sending, budgets, and external platforms stay manual."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Automation Status</h2>
            <p className="muted">Ferocity separates finding the work, drafting the next action, and doing anything customer-facing.</p>
          </div>
          <div className="button-row">
            <a className="button" href="/app/build-system">Build My System</a>
            <form action={runMarketingAutomationAction}>
              <button className="button secondary-button" type="submit">Run workspace automations</button>
            </form>
          </div>
        </div>
        <div className="source-step-grid section-actions">
          {automationReadiness.map(([title, body, status]) => (
            <div key={title}>
              <strong>{title}</strong>
              <span>{body}</span>
              <small>{status}</small>
            </div>
          ))}
        </div>
      </section>

      <QueueTable<MarketingAutomationRuleRow>
        rows={rules}
        columns={[
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "type", label: "Automation", render: (row) => <span className="pill">{row.automationType}</span> },
          { key: "cadence", label: "Cadence", render: (row) => row.cadence },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          {
            key: "next",
            label: "Next",
            render: (row) => row.nextRunAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.nextRunAt)) : "On trigger"
          },
          {
            key: "last",
            label: "Last Run",
            render: (row) => row.lastRunAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.lastRunAt)) : "Never"
          }
        ]}
      />

      <section className="section-actions">
        <h2>Recent Automation Runs</h2>
      </section>
      <QueueTable<MarketingAutomationRunRow>
        rows={runs}
        columns={[
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "type", label: "Automation", render: (row) => <span className="pill">{row.automationType}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "summary", label: "Summary", render: (row) => <span className="muted">{row.summary}</span> },
          { key: "created", label: "Created", render: (row) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt)) }
        ]}
      />
    </QueuePageShell>
  );
}

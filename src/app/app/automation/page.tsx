import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import {
  getMarketingAutomationRuleRows,
  getMarketingAutomationRunRows,
  type MarketingAutomationRuleRow,
  type MarketingAutomationRunRow
} from "@/lib/automation/get-marketing-automation";
import { runMarketingAutomationAction } from "./actions";

export default async function AutomationPage() {
  const [rules, runs] = await Promise.all([getMarketingAutomationRuleRows(), getMarketingAutomationRunRows()]);

  return (
    <QueuePageShell
      eyebrow="Future Automation"
      title="Marketing Automation Rules"
      description="Generate recurring draft work and reporting summaries for each workspace brand. Publishing, sending, budgets, and external platforms stay manual."
    >
      <form action={runMarketingAutomationAction} className="section-actions">
        <button className="button" type="submit">Run workspace automations</button>
      </form>

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

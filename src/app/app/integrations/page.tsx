import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getIntegrationRows, type IntegrationRow } from "@/lib/integrations/get-integrations";

export default async function IntegrationsPage() {
  const rows = await getIntegrationRows();

  return (
    <QueuePageShell
      eyebrow="Integration Readiness"
      title="Prepared Connections"
      description="Clean structures for future Google Ads, Facebook, Google Business Profile, Twilio, Stripe, and publishing integrations. No external APIs are connected."
    >
      <QueueTable<IntegrationRow>
        rows={rows}
        columns={[
          {
            key: "name",
            label: "Connection",
            render: (row) => (
              <>
                <strong>{row.displayName}</strong>
                <span className="muted">{row.provider}</span>
              </>
            )
          },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "credentials", label: "Credentials", render: (row) => <span className="pill">{row.credentialsStatus}</span> },
          { key: "risk", label: "Risk", render: (row) => <span className={`pill ${row.riskLevel}`}>{row.riskLevel}</span> },
          {
            key: "setup",
            label: "Setup",
            render: (row) => (
              <>
                <span className="muted">{row.notes}</span>
                <span className="muted">Env: {row.envVars.length > 0 ? row.envVars.join(", ") : "No new env vars"}</span>
                <span className="muted">Callback: {row.callbackPath ?? "None"}</span>
                <span className="muted">Checklist: {row.setupItems.join(" / ")}</span>
              </>
            )
          }
        ]}
      />
    </QueuePageShell>
  );
}

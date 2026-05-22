import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getIntegrationRows, type IntegrationRow } from "@/lib/integrations/get-integrations";

export default async function CredentialsPage() {
  const rows = await getIntegrationRows();
  const missingCount = rows.reduce((count, row) => count + row.missingEnvVars.length, 0);
  const readyCount = rows.filter((row) => row.envVars.length === 0 || row.missingEnvVars.length === 0).length;

  return (
    <QueuePageShell
      eyebrow="Credentials"
      title="Provider Credential Checklist"
      description="See which provider keys are configured without exposing secret values. Live actions stay disabled until each integration is reviewed."
    >
      <div className="grid section-actions">
        <section className="panel span-4">
          <h2>{readyCount}</h2>
          <p className="muted">Provider groups ready or no-key</p>
        </section>
        <section className="panel span-4">
          <h2>{missingCount}</h2>
          <p className="muted">Missing environment variables</p>
        </section>
        <section className="panel span-4">
          <h2>0</h2>
          <p className="muted">Live external actions enabled by default</p>
        </section>
      </div>

      <QueueTable<IntegrationRow>
        rows={rows}
        columns={[
          {
            key: "provider",
            label: "Provider",
            render: (row) => (
              <>
                <strong>{row.displayName}</strong>
                <span className="muted">{row.provider}</span>
              </>
            )
          },
          {
            key: "configured",
            label: "Configured",
            render: (row) => row.configuredEnvVars.length > 0 ? row.configuredEnvVars.join(", ") : "No configured env vars detected"
          },
          {
            key: "missing",
            label: "Missing",
            render: (row) => row.missingEnvVars.length > 0 ? row.missingEnvVars.join(", ") : "None"
          },
          {
            key: "actions",
            label: "Safety",
            render: (row) => <span className={`pill ${row.liveActionsEnabled ? "high" : ""}`}>{row.liveActionsEnabled ? "live actions on" : "live actions off"}</span>
          }
        ]}
      />
    </QueuePageShell>
  );
}

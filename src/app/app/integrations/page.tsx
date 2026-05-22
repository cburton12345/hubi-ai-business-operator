import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getIntegrationRows, type IntegrationRow } from "@/lib/integrations/get-integrations";
import { updateIntegrationReadinessAction } from "./actions";

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
          },
          {
            key: "controls",
            label: "Controls",
            render: (row) => (
              <form action={updateIntegrationReadinessAction} className="inline-actions">
                <input name="connectionId" type="hidden" value={row.id} />
                <input name="liveActionsEnabled" type="hidden" value="false" />
                <button className="mini-button" name="status" type="submit" value="planned">Plan</button>
                <button className="mini-button" name="status" type="submit" value="paused">Pause</button>
                <button className="mini-button" name="status" type="submit" value="connected" disabled={row.missingEnvVars.length > 0}>
                  Mark ready
                </button>
                <span className="muted">{row.liveActionsEnabled ? "Live actions enabled" : "Live actions off"}</span>
              </form>
            )
          }
        ]}
      />
    </QueuePageShell>
  );
}

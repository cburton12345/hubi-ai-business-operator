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
          { key: "notes", label: "Notes", render: (row) => row.notes }
        ]}
      />
    </QueuePageShell>
  );
}

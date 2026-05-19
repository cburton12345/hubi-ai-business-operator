import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getWebhookEndpointRows, type WebhookEndpointRow } from "@/lib/webhooks/get-webhooks";
import { createWebhookEndpointAction } from "./actions";

export default async function WebhooksPage() {
  const rows = await getWebhookEndpointRows();

  return (
    <QueuePageShell
      eyebrow="Webhooks"
      title="Webhook Framework"
      description="Prepared outbound event structure for future integrations. Endpoints start paused and no delivery worker is active."
    >
      <form action={createWebhookEndpointAction} className="panel form-stack section-actions">
        <h2>Create Paused Endpoint</h2>
        <div className="filter-bar">
          <label>Name<input name="name" required placeholder="CRM endpoint" /></label>
          <label>URL<input name="url" type="url" required placeholder="https://example.com/webhook" /></label>
          <label>Events<input name="eventTypes" required placeholder="lead.created,content.approved" /></label>
          <button className="button" type="submit">Create</button>
        </div>
      </form>
      <QueueTable<WebhookEndpointRow>
        rows={rows}
        columns={[
          { key: "name", label: "Name", render: (row) => <><strong>{row.name}</strong><span className="muted">{row.url}</span></> },
          { key: "events", label: "Events", render: (row) => row.eventTypes.join(", ") || "None" },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> }
        ]}
      />
    </QueuePageShell>
  );
}

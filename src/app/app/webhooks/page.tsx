import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getWebhookEndpointRows, type WebhookEndpointRow } from "@/lib/webhooks/get-webhooks";
import { createWebhookEndpointAction, updateWebhookEndpointStatusAction } from "./actions";

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ token?: string; endpoint?: string }> }) {
  const params = await searchParams;
  const rows = await getWebhookEndpointRows();

  return (
    <QueuePageShell
      eyebrow="Webhooks"
      title="Webhook Framework"
      description="Prepared inbound and outbound event structure for future integrations. External delivery is still disabled."
    >
      {params.token ? (
        <section className="panel section-actions success-panel">
          <div>
            <h2>Inbound token created</h2>
            <p>Copy this token now. It will not be shown again.</p>
          </div>
          <input readOnly value={params.token} />
        </section>
      ) : null}
      <form action={createWebhookEndpointAction} className="panel form-stack section-actions">
        <h2>Create Endpoint</h2>
        <div className="filter-bar">
          <label>Name<input name="name" required placeholder="CRM endpoint" /></label>
          <label>URL<input name="url" type="url" required placeholder="https://example.com/webhook" /></label>
          <label>
            Direction
            <select name="direction" defaultValue="inbound">
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </label>
          <label>Events<input name="eventTypes" required placeholder="lead.created,content.approved" /></label>
          <button className="button" type="submit">Create</button>
        </div>
      </form>
      <QueueTable<WebhookEndpointRow>
        rows={rows}
        columns={[
          { key: "name", label: "Name", render: (row) => <><strong>{row.name}</strong><span className="muted">{row.url}</span></> },
          { key: "direction", label: "Direction", render: (row) => <span className="pill">{row.direction}</span> },
          { key: "events", label: "Events", render: (row) => row.eventTypes.join(", ") || "None" },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          {
            key: "received",
            label: "Last Received",
            render: (row) => row.lastReceivedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.lastReceivedAt)) : "Never"
          },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <form action={updateWebhookEndpointStatusAction} className="inline-actions">
                <input name="endpointId" type="hidden" value={row.id} />
                <button className="mini-button" name="status" type="submit" value={row.status === "active" ? "paused" : "active"}>
                  {row.status === "active" ? "Pause" : "Activate"}
                </button>
                <button className="mini-button danger-button" name="status" type="submit" value="disabled">Disable</button>
              </form>
            )
          }
        ]}
      />
    </QueuePageShell>
  );
}

import Link from "next/link";
import { Cable, CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getLifeOpsConnections, type LifeOpsConnection } from "@/lib/lifeops/get-lifeops-connections";
import { createLifeOpsConnectionAction, updateLifeOpsConnectionAction } from "./actions";

function statusTone(status: string) {
  if (status === "connected") return "";
  if (status === "needs_attention") return "high";
  if (status === "paused") return "medium";
  return "";
}

function dateLabel(value: string | null) {
  if (!value) return "No events yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function LifeOpsConnectionsPage() {
  const dashboard = await getLifeOpsConnections();

  return (
    <QueuePageShell
      eyebrow="Connected systems"
      title="Connect Owner Systems"
      description="Register each outside brand, app, website, or platform that should send owner-level events into Ferocity without merging codebases."
    >
      <section className="grid section-actions">
        <Metric label="Connected" value={dashboard.metrics.connected} />
        <Metric label="Planned" value={dashboard.metrics.planned} />
        <Metric label="Needs attention" value={dashboard.metrics.needsAttention} tone={dashboard.metrics.needsAttention ? "high" : ""} />
        <Metric label="Personal systems" value={dashboard.metrics.personal} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Cable size={18} /> How Other Brands Feed Ferocity
            </h2>
            <p className="muted">
              Other systems send important events to the Owner Events intake. Ferocity records the event, ranks owner attention, and routes it to
              Owner Events or Private Owner Tasks. This does not give Ferocity destructive control over those products, and you can disconnect or archive a system later.
            </p>
          </div>
          <span className={`pill ${dashboard.tokenConfigured ? "" : "high"}`}>{dashboard.tokenConfigured ? "token ready" : "token missing"}</span>
        </div>
        <div className="grid section-actions">
          <section className="panel span-6">
            <h3>Endpoint</h3>
            <pre className="json-block">POST https://ferocity.live{dashboard.endpoint}</pre>
            <p className="muted">Use `Authorization: Bearer OWNER_COMMAND_CENTER_TOKEN` from the sending system.</p>
          </section>
          <section className="panel span-6">
            <h3>Send only what matters</h3>
            <ul className="plain-list">
              <li>money opportunity</li>
              <li>financial risk</li>
              <li>customer dispute</li>
              <li>legal or safety concern</li>
              <li>automation failure</li>
              <li>owner approval needed</li>
            </ul>
          </section>
        </div>
        <div className="button-row">
          <Link className="button" href="/app/owner-command-center">Owner Events</Link>
          <Link className="button secondary-button" href="/app/personal-ops">Private Owner Tasks</Link>
          <Link className="button secondary-button" href="/app/integrations">Provider Integrations</Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Register Another System</h2>
            <p className="muted">
              Add a future brand, app, website, marketplace, or personal system here. It can start sending owner events with the same endpoint and token.
            </p>
          </div>
          <span className="pill">no code needed</span>
        </div>
        <form action={createLifeOpsConnectionAction} className="grid">
          <label className="span-3">
            System key
            <input name="platformKey" placeholder="preferred-trailer" required />
          </label>
          <label className="span-3">
            Display name
            <input name="platformName" placeholder="Preferred Trailer" required />
          </label>
          <label className="span-3">
            Type
            <select name="platformType" defaultValue="business">
              <option value="business">Business</option>
              <option value="marketplace">Marketplace</option>
              <option value="software">Software</option>
              <option value="personal">Personal</option>
              <option value="safety">Safety</option>
              <option value="finance">Finance</option>
              <option value="property">Property</option>
              <option value="operations">Operations</option>
            </select>
          </label>
          <label className="span-3">
            Owner layer
            <select name="ownerLayer" defaultValue="owner_command">
              <option value="owner_command">Owner Events</option>
              <option value="personal_ops">Private Owner Tasks</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="span-4">
            Website or app URL
            <input name="externalBaseUrl" placeholder="https://example.com" />
          </label>
          <label className="span-4">
            Event types
            <input name="eventScope" placeholder="payment.issue, support.contact, lead.hot" />
          </label>
          <label className="span-4">
            Notes
            <input name="notes" placeholder="What should Ferocity watch for?" />
          </label>
          <div className="span-12 button-row">
            <button className="button" type="submit">Register System</button>
          </div>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <ShieldCheck size={18} /> Registered Systems
            </h2>
            <p className="muted">
              These are the brands and platforms Ferocity expects to hear from. Planned means registered. Connected means Ferocity has received a
              valid owner event from that system or you manually marked it ready. Disconnect pauses the system. Archive hides it from this active list while keeping event history.
            </p>
          </div>
          <span className="pill">{dashboard.connections.length} systems</span>
        </div>
        <div className="grid">
          {dashboard.connections.map((connection) => (
            <ConnectionCard connection={connection} key={connection.id} />
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <h2>
          <Copy size={18} /> Example Event Payload
        </h2>
        <pre className="json-block">{`{
  "platformKey": "tz-construction",
  "platformName": "TZ's Construction",
  "externalEventId": "lead-123",
  "eventType": "lead.hot",
  "title": "Storm lead needs same-day reply",
  "summary": "New roof repair lead came from Facebook and has not been contacted.",
  "severity": "high",
  "status": "needs_owner",
  "ownerAttention": true,
  "recommendedAction": "Open the lead and approve the first response.",
  "actionHref": "/app/leads",
  "moneyCents": 1800000,
  "riskType": "revenue",
  "confidenceScore": 86,
  "metadata": {
    "brand": "TZ's Construction",
    "source": "facebook"
  }
}`}</pre>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <section className="metric-card span-3">
      <small className={`pill ${tone}`}>owner systems</small>
      <strong>{value}</strong>
      <span>{label}</span>
    </section>
  );
}

function ConnectionCard({ connection }: { connection: LifeOpsConnection }) {
  return (
    <section className="panel span-4">
      <div className="list-row flush-row">
        <div>
          <h3>{connection.platformName}</h3>
          <p className="muted">{connection.platformKey} / {connection.platformType}</p>
        </div>
        <span className={`pill ${statusTone(connection.connectionStatus)}`}>{connection.connectionStatus.replaceAll("_", " ")}</span>
      </div>
      <p className="muted">{connection.notes}</p>
      <div className="inline-actions section-actions">
        <span className="pill">{connection.ownerLayer.replaceAll("_", " ")}</span>
        <span className="pill">{dateLabel(connection.lastEventAt)}</span>
        <span className="pill">{connection.lastEventAt ? "event intake seen" : "registered only"}</span>
      </div>
      <div className="inline-actions">
        {connection.eventScope.map((scope) => (
          <span className="pill" key={scope}>{scope.replaceAll("_", " ")}</span>
        ))}
      </div>
      <form action={updateLifeOpsConnectionAction} className="button-row section-actions">
        <input name="connectionId" type="hidden" value={connection.id} />
        <button className="mini-button" name="status" value="planned" type="submit">Plan</button>
        <button className="mini-button" name="status" value="connected" type="submit">
          <CheckCircle2 size={13} /> Connected
        </button>
        <button className="mini-button secondary-button" name="status" value="paused" type="submit">Disconnect</button>
        <button className="mini-button secondary-button" name="status" value="needs_attention" type="submit">Needs attention</button>
        <button className="mini-button secondary-button" name="status" value="archived" type="submit">Archive</button>
      </form>
      {connection.actionHref ? <Link className="mini-button" href={connection.actionHref}>Open route</Link> : null}
    </section>
  );
}

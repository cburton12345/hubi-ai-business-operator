import Link from "next/link";
import { Cable, CheckCircle2, Copy, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getLifeOpsConnections, type LifeOpsConnection } from "@/lib/lifeops/get-lifeops-connections";
import { updateLifeOpsConnectionAction } from "./actions";

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
      eyebrow="LifeOps connections"
      title="Connect Owner Brands And Platforms"
      description="Register each outside brand, app, or personal system that should send owner-level events into Ferocity without merging codebases."
    >
      <section className="grid section-actions">
        <Metric label="Connected" value={dashboard.metrics.connected} />
        <Metric label="Planned" value={dashboard.metrics.planned} />
        <Metric label="Needs attention" value={dashboard.metrics.needsAttention} tone={dashboard.metrics.needsAttention ? "high" : ""} />
        <Metric label="Personal/LifeOps" value={dashboard.metrics.personal} />
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <Cable size={18} /> How Other Brands Feed Ferocity
            </h2>
            <p className="muted">
              Other systems send important events to the Owner Command intake. Ferocity records the event, ranks owner attention, and routes it to
              Owner Command or Personal Ops. This does not give Ferocity destructive control over those products.
            </p>
          </div>
          <span className={`pill ${dashboard.tokenConfigured ? "" : "high"}`}>{dashboard.tokenConfigured ? "token ready" : "token missing"}</span>
        </div>
        <div className="grid section-actions">
          <section className="panel span-6">
            <h3>Endpoint</h3>
            <pre className="json-block">POST {dashboard.endpoint}</pre>
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
          <Link className="button" href="/app/owner-command-center">Owner Command</Link>
          <Link className="button secondary-button" href="/app/personal-ops">Personal Ops</Link>
          <Link className="button secondary-button" href="/app/integrations">Provider Integrations</Link>
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>
              <ShieldCheck size={18} /> Registered Systems
            </h2>
            <p className="muted">
              These are the brands and platforms Ferocity expects to hear from. Planned means registered. Connected means Ferocity has received a
              valid owner event from that system or you manually marked it ready.
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
      <small className={`pill ${tone}`}>lifeops</small>
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
        <button className="mini-button secondary-button" name="status" value="paused" type="submit">Pause</button>
        <button className="mini-button secondary-button" name="status" value="needs_attention" type="submit">Needs attention</button>
      </form>
      {connection.actionHref ? <Link className="mini-button" href={connection.actionHref}>Open route</Link> : null}
    </section>
  );
}

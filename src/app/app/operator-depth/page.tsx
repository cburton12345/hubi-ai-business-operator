import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getOperatorDepthDashboard, type OperatorDepthRow } from "@/lib/operator-depth/get-operator-depth";
import { refreshOperatorDepthAction } from "./actions";

export default async function OperatorDepthPage() {
  const dashboard = await getOperatorDepthDashboard();

  return (
    <QueuePageShell
      eyebrow="Operator Depth"
      title="Cross-Project Operating Depth"
      description="The deeper business layer inspired by MarketplacePro, 4Bid, and GovFlow: service areas, crew bench, connector health, source scoring, review queues, support, and public endpoint logs."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Depth Scan</h2>
            <p className="muted">Refresh builds useful internal records from real workspace data. It does not send messages, publish content, change ad spend, or sync external providers.</p>
          </div>
          <div className="button-row">
            <form action={refreshOperatorDepthAction}>
              <button className="button" type="submit">Refresh depth scan</button>
            </form>
            <Link className="button secondary-button" href="/app/system-health">System health</Link>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Service areas" value={dashboard.metrics.serviceAreas} />
          <Metric label="Crew bench" value={dashboard.metrics.crewBench} />
          <Metric label="Source scores" value={dashboard.metrics.sourceScores} />
          <Metric label="Connector runs" value={dashboard.metrics.connectorRuns} />
          <Metric label="Credential alerts" value={dashboard.metrics.credentialAlerts} />
          <Metric label="Export queue" value={dashboard.metrics.exportQueue} />
          <Metric label="Document reviews" value={dashboard.metrics.documentReviews} />
          <Metric label="Support issues" value={dashboard.metrics.supportIssues} />
          <Metric label="Endpoint events" value={dashboard.metrics.endpointEvents} />
        </div>
      </section>

      <section className="panel section-actions">
        <h2>What This Adds</h2>
        <div className="grid">
          <Principle title="Better local growth" detail="Cities, service areas, proof, and sources become trackable instead of loose marketing ideas." />
          <Principle title="Better operations" detail="Providers, crews, documents, invoices, and support issues sit in the same operating loop." />
          <Principle title="Better safety" detail="Exports, connectors, credentials, and public endpoints get review logs before anything becomes live automation." />
        </div>
      </section>

      <div className="grid section-actions">
        <ListPanel title="Service Area Intelligence" empty="No service area targets yet. Refresh after brand locations are set." rows={dashboard.serviceAreas} />
        <ListPanel title="Provider And Crew Bench" empty="No saved providers or crew relationships yet." rows={dashboard.crewBench} />
        <ListPanel title="Lead Source Scores" empty="No source scores yet. Scores appear after real leads have source data." rows={dashboard.sourceScores} />
        <ListPanel title="Connector Run History" empty="No connector run history yet. Refresh to log provider readiness checks." rows={dashboard.connectorRuns} />
        <ListPanel title="Credential Rotation Alerts" empty="No credential alerts yet. Refresh after integrations/providers exist." rows={dashboard.credentialAlerts} />
        <ListPanel title="Daily Operator Digests" empty="No daily digest yet. Refresh to create today’s command summary." rows={dashboard.dailyDigests} />
        <ListPanel title="Review-First Export Queue" empty="No exports waiting for review." rows={dashboard.exportQueue} />
        <ListPanel title="Document Review Items" empty="No documents or invoices need review." rows={dashboard.documentReviews} />
        <ListPanel title="Support And Report Queue" empty="No support issues in the queue." rows={dashboard.supportIssues} />
        <ListPanel title="Public Endpoint Events" empty="No public endpoint events in the recent log." rows={dashboard.endpointEvents} />
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-4 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function Principle({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="panel span-4">
      <h3>{title}</h3>
      <p className="muted">{detail}</p>
    </section>
  );
}

function ListPanel({ title, empty, rows }: { title: string; empty: string; rows: OperatorDepthRow[] }) {
  return (
    <section className="panel span-6">
      <h2>{title}</h2>
      <ul className="list">
        {rows.map((item) => (
          <li className="list-row" key={item.id}>
            <div>
              <h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3>
              {item.detail ? <p>{item.detail}</p> : null}
              <p className="muted">{item.meta}</p>
            </div>
            <span className="pill">{item.status}</span>
          </li>
        ))}
        {rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}
      </ul>
    </section>
  );
}

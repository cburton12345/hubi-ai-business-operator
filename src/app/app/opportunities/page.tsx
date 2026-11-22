import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMaintenanceOpportunitiesDashboard } from "@/lib/maintenance-ops/get-opportunities-dashboard";

function money(cents: number | null) {
  if (cents === null) return "Not recorded";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ q?: string; classification?: string; status?: string; sort?: string }> }) {
  const params = await searchParams;
  const dashboard = await getMaintenanceOpportunitiesDashboard({ query: params.q, classification: params.classification, status: params.status, sort: params.sort });
  return (
    <QueuePageShell eyebrow="Autonomous Operations" title="Opportunities" description="Inspect sales and maintenance opportunities without confusing them with accepted work orders. Only verified commercial-maintenance records enter MarketplacePro sourcing.">
      <div className="section-actions button-row">
        <Link className="button secondary-button" href="/app/service">Field Work Center</Link>
        <Link className="button secondary-button" href="/app/service-command">Service Command</Link>
      </div>
      <div className="grid section-actions">
        <Metric label="All opportunities" value={dashboard.metrics.total} />
        <Metric label="Maintenance" value={dashboard.metrics.commercialMaintenance} />
        <Metric label="Needs information" value={dashboard.metrics.needsInformation} />
        <Metric label="Marketplace sourcing" value={dashboard.metrics.sourcing} />
        <Metric label="Ready for authorization" value={dashboard.metrics.ready} />
        <Metric label="Converted work orders" value={dashboard.metrics.converted} />
      </div>
      <section className="panel section-actions">
        <form className="form-grid" method="get">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search title, customer, or trade" />
          <select name="classification" defaultValue={params.classification ?? "all"}>
            <option value="all">All classifications</option><option value="unclassified">Unclassified</option>
            <option value="commercial_maintenance">Commercial maintenance</option><option value="other_business">Other business</option><option value="non_opportunity">Not an opportunity</option>
          </select>
          <select name="status" defaultValue={params.status ?? "all"}>
            <option value="all">All workflow statuses</option><option value="received">Received</option><option value="needs_information">Needs information</option>
            <option value="evaluated">Evaluated</option><option value="sourcing">Sourcing</option><option value="recruiting">Recruiting</option>
            <option value="contractor_confirmed">Contractor confirmed</option><option value="ready_for_authorization">Ready for authorization</option>
            <option value="converted">Converted</option><option value="declined">Declined</option>
          </select>
          <select name="sort" defaultValue={params.sort ?? "newest"}>
            <option value="newest">Newest first</option><option value="value_desc">Highest value</option><option value="deadline">Nearest deadline</option><option value="risk_desc">Highest risk</option>
          </select>
          <button className="button" type="submit">Apply</button>
        </form>
      </section>
      <section className="panel">
        <ul className="list">
          {dashboard.opportunities.map((opportunity) => (
            <li className="list-row" key={opportunity.id}>
              <div>
                <h3><Link href={`/app/opportunities/${opportunity.id}`}>{opportunity.title}</Link></h3>
                <p className="muted">{opportunity.customerName} · {opportunity.location} · {opportunity.source}</p>
                <p>{opportunity.trade} · Budget {money(opportunity.customerBudgetCents)} · Contractor {money(opportunity.expectedContractorCostCents)} · Contribution {money(opportunity.grossContributionCents)}</p>
                <p className="muted">Evaluation: {opportunity.evaluation} · MarketplacePro: {opportunity.marketplaceStatus} · Work order: {opportunity.workOrderId ? "created" : "not created"}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{opportunity.classification.replaceAll("_", " ")}</span>
                <span className="pill">{opportunity.workflowStatus.replaceAll("_", " ")}</span>
                <Link className="mini-button" href={`/app/opportunities/${opportunity.id}`}>Open</Link>
              </div>
            </li>
          ))}
          {dashboard.opportunities.length === 0 ? <li className="list-row"><span className="muted">No opportunities match these filters.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="panel span-4 metric"><span className="muted">{label}</span><strong>{value}</strong></section>;
}

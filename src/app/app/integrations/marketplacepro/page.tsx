import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMarketplaceProVendorPhoneReadiness } from "@/lib/integrations/marketplacepro-vendor-readiness";
import { getMarketplaceProReconciliation } from "@/lib/integrations/marketplacepro-reconciliation";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function label(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "not configured";
}

function ReadinessCard({ labelText, ready, readyText = "Ready", blockedText = "Needs setup" }: {
  labelText: string; ready: boolean; readyText?: string; blockedText?: string;
}) {
  return (
    <article className={`network-readiness-card ${ready ? "is-ready" : "is-blocked"}`}>
      {ready ? <CheckCircle2 aria-hidden="true" size={19} /> : <CircleAlert aria-hidden="true" size={19} />}
      <span>{labelText}</span><strong>{ready ? readyText : blockedText}</strong>
    </article>
  );
}

export default async function MarketplaceProOperationsPage() {
  const tenantId = await getCurrentWorkspaceId();
  const [readiness, reconciliation] = await Promise.all([
    getMarketplaceProVendorPhoneReadiness(tenantId),
    getMarketplaceProReconciliation(tenantId),
  ]);
  const nextAction = reconciliation.counts.attention
    ? `${reconciliation.counts.attention} linked ${reconciliation.counts.attention === 1 ? "opportunity needs" : "opportunities need"} reconciliation.`
    : reconciliation.counts.waiting
      ? `${reconciliation.counts.waiting} linked ${reconciliation.counts.waiting === 1 ? "opportunity is" : "opportunities are"} waiting on the next confirmed event.`
      : "No linked contractor handoff needs attention.";

  return (
    <QueuePageShell eyebrow="Contractor operations" title="Find the crew. Confirm the job. Run it in Ferocity." description="MarketplacePro sources and verifies contractors. Ferocity takes over only after the opportunity, contractor, and authority to proceed are confirmed.">
      <section className="panel network-operations-hero">
        <div><p className="eyebrow">Next action</p><h2>{nextAction}</h2><p className="muted">An opportunity is never treated as an accepted job. Every handoff keeps the source, contractor confirmation, assignment, and Ferocity job status visible.</p></div>
        <div className="network-operations-actions">
          <Link className="button" href="/app/opportunities">Open opportunities <ArrowRight aria-hidden="true" size={16} /></Link>
          <a className="mini-button" href="https://marketplacepro.live/app">Open MarketplacePro <ExternalLink aria-hidden="true" size={15} /></a>
        </div>
        <ol className="network-operation-path" aria-label="Opportunity to completed job workflow">
          <li><span>1</span><strong>Opportunity</strong><small>Review scope and margin</small></li>
          <li><span>2</span><strong>Match</strong><small>Search verified coverage</small></li>
          <li><span>3</span><strong>Confirm</strong><small>Contractor accepts</small></li>
          <li><span>4</span><strong>Dispatch</strong><small>Ferocity runs the job</small></li>
          <li><span>5</span><strong>Close</strong><small>Verify work and payment</small></li>
        </ol>
      </section>
      <section className="network-readiness-grid" aria-label="Contractor network readiness">
        <ReadinessCard labelText="Inbound phone" ready={readiness.inboundReady} blockedText="Blocked" />
        <ReadinessCard labelText="MPP intake bridge" ready={readiness.phoneIntakeBridgeReady} blockedText="Blocked" />
        <ReadinessCard labelText="Vendor relations" ready={readiness.vendorRelationsReady} />
        <ReadinessCard labelText="Linked records" ready={reconciliation.counts.attention === 0} readyText={`${reconciliation.counts.aligned} aligned`} blockedText={`${reconciliation.counts.attention} need attention`} />
      </section>
      <section className="panel section-actions network-reconciliation">
        <div className="list-row flush-row">
          <div><p className="eyebrow">Live handoffs</p><h2>Contractor and job reconciliation</h2><p className="muted">Disagreement is surfaced here. Ferocity never advances or accepts the work automatically.</p></div>
          <div className="inline-actions" aria-label="Reconciliation totals"><span className={`pill ${reconciliation.counts.attention ? "high" : "status-included"}`}>{reconciliation.counts.attention} attention</span><span className="pill">{reconciliation.counts.waiting} waiting</span><span className="pill status-included">{reconciliation.counts.aligned} aligned</span></div>
        </div>
        <ul className="list section-actions">
          {reconciliation.items.map((item) => (
            <li className="list-row network-reconciliation-row" key={item.opportunityId}>
              <div><h3>{item.opportunityTitle}</h3><p className="muted">Ferocity {label(item.ferocityStatus)} · MPP {label(item.marketplaceProStatus)} · contractor {label(item.confirmationStatus)} · job {label(item.serviceJobStatus)}</p><p className="muted">{item.reasons.join(" ")}{item.lastSyncAt ? ` Last sync ${item.lastSyncAt}.` : " No correlated sync is recorded yet."}</p></div>
              <div className="inline-actions"><span className={`pill ${item.state === "attention" ? "high" : item.state === "waiting" ? "medium" : "status-included"}`}>{item.state}</span><Link className="mini-button" href={`/app/opportunities/${item.opportunityId}`}>Review</Link></div>
            </li>
          ))}
          {!reconciliation.items.length ? <li className="network-empty-state"><strong>No linked maintenance opportunities yet.</strong><span>Enter or receive an opportunity, then use MarketplacePro to source the contractor.</span><Link className="mini-button" href="/app/opportunities">Open opportunities</Link></li> : null}
        </ul>
      </section>
      <details className="panel progressive-disclosure network-details" open={readiness.blockers.length > 0}>
        <summary><div><p className="eyebrow">Setup</p><h2>Phone, vendor, and bridge readiness</h2></div><span className={`pill ${readiness.blockers.length ? "medium" : "status-included"}`}>{readiness.blockers.length ? `${readiness.blockers.length} blockers` : "ready"}</span></summary>
        <div className="progressive-disclosure-body">
          <div className="list-row flush-row"><p className="muted">Only the Diamond Homes brand-specific number, assistant, and voice route count. Ferocity&apos;s support line does not satisfy this check.</p><Link className="mini-button" href="/app/receptionist-setup">Phone setup</Link></div>
          {readiness.blockers.length ? <ul className="list">{readiness.blockers.map((blocker) => <li className="list-row" key={blocker}><span>{blocker}</span><span className="pill medium">required</span></li>)}</ul> : <p className="muted">No phone-routing blocker is recorded.</p>}
          <ul className="list">{readiness.numbers.map((number) => <li className="list-row" key={number.id}><div><strong>{number.phone_number}</strong><p className="muted">{label(number.provider_key)} / {label(number.number_mode)} / compliance {label(number.compliance_status)}</p></div><div className="inline-actions"><span className="pill">{label(number.status)}</span><span className={`pill ${number.inbound_enabled ? "status-included" : "medium"}`}>inbound {number.inbound_enabled ? "on" : "off"}</span></div></li>)}</ul>
        </div>
      </details>
      <details className="panel progressive-disclosure network-details">
        <summary><div><p className="eyebrow">Safeguards</p><h2>Who owns each step</h2></div><span className="muted">View boundary</span></summary>
        <div className="progressive-disclosure-body"><ol className="network-boundary-list"><li><strong>MarketplacePro</strong><span>Contractor recruiting, credential review, coverage, matching, and vendor-application records.</span></li><li><strong>Manager approval</strong><span>Consequential outreach, binding work, price, insurance exceptions, and contractor confirmation.</span></li><li><strong>Ferocity</strong><span>Accepted jobs, dispatch, scheduling, evidence, invoicing, collections, and operational exceptions.</span></li></ol></div>
      </details>
    </QueuePageShell>
  );
}

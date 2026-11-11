import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMarketplaceProVendorPhoneReadiness } from "@/lib/integrations/marketplacepro-vendor-readiness";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

function label(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "not configured";
}

export default async function MarketplaceProOperationsPage() {
  const tenantId = await getCurrentWorkspaceId();
  const readiness = await getMarketplaceProVendorPhoneReadiness(tenantId);
  return (
    <QueuePageShell
      eyebrow="MarketplacePro operations"
      title="Vendor and Contractor Communications"
      description="MarketplacePro owns vendor, contractor, coverage, and matching records. Ferocity owns approved communications, phone routing, jobs, invoices, payments, and exception handling."
    >
      <section className="grid section-actions">
        <div className="panel span-3 metric"><span className="muted">Inbound phone</span><strong>{readiness.inboundReady ? "Ready" : "Blocked"}</strong></div>
        <div className="panel span-3 metric"><span className="muted">Outbound phone</span><strong>{readiness.outboundReady ? "Ready" : "Blocked"}</strong></div>
        <div className="panel span-3 metric"><span className="muted">MPP intake bridge</span><strong>{readiness.phoneIntakeBridgeReady ? "Ready" : "Blocked"}</strong></div>
        <div className="panel span-3 metric"><span className="muted">Vendor relations</span><strong>{readiness.vendorRelationsReady ? "Ready" : "Needs setup"}</strong></div>
      </section>
      <section className="panel section-actions">
        <div className="list-row flush-row"><div><h2>Diamond Homes phone ownership and routing</h2><p className="muted">Only the Diamond Homes brand-specific number, assistant, and voice route count here. Ferocity&apos;s existing support line does not satisfy this readiness check.</p></div><Link className="button secondary-button" href="/app/receptionist-setup">Open phone setup</Link></div>
        <ul className="list">
          {readiness.numbers.map((number) => (
            <li className="list-row" key={number.id}><div><strong>{number.phone_number}</strong><p className="muted">{label(number.provider_key)} / {label(number.number_mode)} / compliance {label(number.compliance_status)}</p></div><div className="inline-actions"><span className="pill">{label(number.status)}</span><span className={`pill ${number.inbound_enabled ? "" : "medium"}`}>inbound {number.inbound_enabled ? "on" : "off"}</span><span className={`pill ${number.outbound_enabled ? "" : "medium"}`}>outbound {number.outbound_enabled ? "on" : "off"}</span></div></li>
          ))}
          {!readiness.numbers.length ? <li className="list-row"><span className="muted">No active phone-number record exists in this workspace.</span></li> : null}
        </ul>
      </section>
      <section className="panel section-actions">
        <h2>Current blockers</h2>
        {readiness.blockers.length ? <ul className="list">{readiness.blockers.map((blocker) => <li className="list-row" key={blocker}><span>{blocker}</span><span className="pill medium">required</span></li>)}</ul> : <p className="muted">No phone-routing blocker is recorded.</p>}
      </section>
      <section className="panel section-actions">
        <h2>Operating boundary</h2>
        <ol>
          <li>MarketplacePro prepares and records vendor or contractor work.</li>
          <li>An authorized manager approves consequential outreach.</li>
          <li>Ferocity claims only approved, due work and uses the certified provider for that channel.</li>
          <li>Delivery, reply, job, invoice, and payment outcomes synchronize back to the shared record.</li>
          <li>Only blockers, approvals, and unusual replies require owner attention.</li>
        </ol>
      </section>
    </QueuePageShell>
  );
}

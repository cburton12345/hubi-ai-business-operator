import Link from "next/link";
import { randomUUID } from "node:crypto";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { can } from "@/lib/auth/permissions";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { getEarnDashboard } from "@/lib/billing/earn";
import {
  correctEarnAttributionAction,
  disputeEarnAction,
  enrollInEarnAction,
  establishEarnAttributionAction,
  prepareEarnSettlementAction,
  recordOfflineRefundAction,
  resolveEarnDisputeAction
} from "./actions";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function rate(bps: number | null) {
  return bps === null ? "Not classified" : `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
}

function classification(value: string | null) {
  if (value === "CUSTOMER_ORIGINATED_FEROCITY_MANAGED") return "Customer-originated / Ferocity-managed";
  if (value === "FEROCITY_ORIGINATED") return "Ferocity-originated";
  if (value === "NON_EARN") return "Non-Earn";
  if (value === "NEEDS_REVIEW") return "Needs review";
  return "Not classified";
}

export default async function EarnPage() {
  const [dashboard, actor] = await Promise.all([getEarnDashboard(), getCurrentActor()]);
  const active = dashboard.enrollment?.status === "active";
  return (
    <QueuePageShell
      eyebrow="Billing / Ferocity Earn"
      title="Ferocity Earn"
      description="No monthly base subscription. Earn accrues only when an attributed opportunity produces eligible collected revenue."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>$0/month base subscription</h2>
            <p><strong>0.9%</strong> when you bring the business to Ferocity to manage.</p>
            <p><strong>6%</strong> when Ferocity brings you the business.</p>
            <p className="muted">And we don&apos;t get paid until you do. Provider usage, payment processing, and third-party costs remain separate.</p>
          </div>
          <span className={`pill ${active ? "" : "medium"}`}>{dashboard.enrollment?.status ?? "not enrolled"}</span>
        </div>
        {!dashboard.enrollment ? (
          <form action={enrollInEarnAction} className="form-stack">
            <label className="checkbox-row">
              <input name="accepted" type="checkbox" value="yes" required />
              <span>I accept the Ferocity Earn V1 agreement and understand that it applies prospectively from enrollment, not to historical collected revenue.</span>
            </label>
            <button className="button" type="submit">Enroll in Ferocity Earn</button>
          </form>
        ) : (
          <div className="inline-actions">
            <span className="pill">Effective {dashboard.enrollment.effectiveAt ? new Date(dashboard.enrollment.effectiveAt).toLocaleDateString() : "pending"}</span>
            <span className="pill">Next settlement {new Date(dashboard.enrollment.nextSettlementAt).toLocaleDateString()}</span>
            <Link className="mini-button" href="/pricing">Compare fixed plans</Link>
            {dashboard.currentPeriod.currentBalanceCents > 0 ? (
              <form action={prepareEarnSettlementAction}><button className="mini-button" type="submit">Prepare monthly statement</button></form>
            ) : null}
          </div>
        )}
      </section>

      <section className="grid section-actions">
        <Metric label="Eligible revenue managed" value={money(dashboard.currentPeriod.managedRevenueCents)} />
        <Metric label="0.9% Earn" value={money(dashboard.currentPeriod.managedEarnCents)} />
        <Metric label="Ferocity-originated revenue" value={money(dashboard.currentPeriod.originatedRevenueCents)} />
        <Metric label="6% Earn" value={money(dashboard.currentPeriod.originatedEarnCents)} />
        <Metric label="Credits / adjustments" value={money(dashboard.currentPeriod.adjustmentsCents)} />
        <Metric label="Disputed" value={money(dashboard.currentPeriod.disputedCents)} />
        <Metric label="Provider usage (separate)" value={money(dashboard.currentPeriod.providerUsageCents)} />
        <Metric label="Current Earn balance" value={money(dashboard.currentPeriod.currentBalanceCents)} />
        <Metric label="Revenue Ferocity brought you — lifetime" value={money(dashboard.lifetimeOriginatedRevenueCents)} />
      </section>

      <section className="panel section-actions">
        <h2>Opportunity attribution</h2>
        <p className="muted">Each opportunity is classified independently. A customer&apos;s original source never forces all future work to the same rate.</p>
        <ul className="list">
          {dashboard.opportunities.map((opportunity) => (
            <li className="list-row" key={opportunity.id}>
              <div>
                <h3>{opportunity.title}</h3>
                <p>{opportunity.customerName} · Current value {money(opportunity.valueCents)}</p>
                <p className="muted">
                  {classification(opportunity.classification)} · {rate(opportunity.lockedRateBps)} · Collected eligible {money(opportunity.collectedEligibleCents)} · Earn accrued {money(opportunity.earnAccruedCents)}
                </p>
                {opportunity.reason ? <p><strong>Why this rate?</strong> {opportunity.reason}</p> : null}
                <p className="muted">Projected Earn if the current value is fully collected: {money(opportunity.projectedEarnCents)}. This projection is not owed on uncollected revenue.</p>
              </div>
              <div className="span-5">
                {!opportunity.classification && active ? (
                  <details className="panel subtle-panel">
                    <summary>Classify opportunity</summary>
                    <form action={establishEarnAttributionAction} className="form-stack">
                      <input name="opportunityId" type="hidden" value={opportunity.id} />
                      <label>Classification
                        <select name="classification" defaultValue="NEEDS_REVIEW">
                          <option value="NEEDS_REVIEW">Needs review</option>
                          <option value="CUSTOMER_ORIGINATED_FEROCITY_MANAGED">Customer-originated / Ferocity-managed — 0.9%</option>
                          <option value="FEROCITY_ORIGINATED">Ferocity-originated — 6%</option>
                          <option value="NON_EARN">Legitimate Non-Earn — 0%</option>
                        </select>
                      </label>
                      <label>Source or channel<input name="sourceChannel" placeholder="team referral, website, Ferocity reactivation…" required /></label>
                      <label>Why this rate?<textarea name="reason" rows={3} required /></label>
                      <label>Supporting evidence<textarea name="evidence" rows={3} /></label>
                      <button className="mini-button" type="submit">Lock attribution</button>
                    </form>
                  </details>
                ) : null}
                {opportunity.classification ? (
                  <details className="panel subtle-panel">
                    <summary>Dispute attribution or calculation</summary>
                    <form action={disputeEarnAction} className="form-stack">
                      <input name="attributionId" type="hidden" value={opportunity.attributionId ?? ""} />
                      <label>Issue
                        <select name="disputeType"><option value="attribution">Attribution</option><option value="eligible_amount">Eligible amount</option><option value="earn_calculation">Earn calculation</option><option value="exclusion_adjustment">Exclusion or adjustment</option></select>
                      </label>
                      <label>Short reason<input name="reason" required /></label>
                      <label>Explanation<textarea name="explanation" rows={3} required /></label>
                      <input name="amountCents" type="hidden" value={opportunity.earnAccruedCents} />
                      <button className="mini-button" type="submit">Submit dispute</button>
                    </form>
                  </details>
                ) : null}
                {can(actor, "platform:manage") && opportunity.classification ? (
                  <details className="panel subtle-panel">
                    <summary>Correct attribution (platform review)</summary>
                    <form action={correctEarnAttributionAction} className="form-stack">
                      <input name="attributionId" type="hidden" value={opportunity.attributionId ?? ""} />
                      <input name="opportunityId" type="hidden" value={opportunity.id} />
                      <select name="classification" defaultValue={opportunity.classification}>
                        <option value="CUSTOMER_ORIGINATED_FEROCITY_MANAGED">Customer-originated / Ferocity-managed</option><option value="FEROCITY_ORIGINATED">Ferocity-originated</option><option value="NON_EARN">Non-Earn</option><option value="NEEDS_REVIEW">Needs review</option>
                      </select>
                      <input name="sourceChannel" defaultValue={opportunity.sourceChannel ?? "review"} required />
                      <textarea name="reason" placeholder="Correction reason" required />
                      <textarea name="evidence" placeholder="Approver evidence" required />
                      <button className="mini-button" type="submit">Record correction</button>
                    </form>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
          {dashboard.opportunities.length === 0 ? <li className="list-row"><span className="muted">No revenue opportunities are available yet.</span></li> : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Earn statement drill-down</h2>
        <p className="muted">Original activity is never erased. Refunds, credits, disputes, corrections, and settlements appear as linked ledger events.</p>
        <ul className="list">
          {dashboard.recentLedger.map((entry) => (
            <li className="list-row" key={entry.id}>
              <div><h3>{entry.opportunityTitle}</h3><p>{entry.customerName} · {entry.reason}</p><p className="muted">{entry.eventType.replaceAll("_", " ")} · {classification(entry.classification)} · {rate(entry.rateBps)} · {new Date(entry.occurredAt).toLocaleString()}</p></div>
              <div>
                <strong>{entry.earnAmountCents ? money(entry.earnAmountCents) : money(entry.eligibleAmountCents)}</strong><span className="pill">{entry.settlementStatus}</span>
                {entry.eventType === "eligible_payment" && entry.paymentId ? (
                  <details className="panel subtle-panel">
                    <summary>Record a refund already issued</summary>
                    <form action={recordOfflineRefundAction} className="form-stack">
                      <input name="paymentId" type="hidden" value={entry.paymentId} />
                      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                      <label>Refund amount<input name="amount" inputMode="decimal" required /></label>
                      <label>Reason<input name="reason" required /></label>
                      <button className="mini-button" type="submit">Record refund and Earn credit</button>
                    </form>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
          {dashboard.recentLedger.length === 0 ? <li className="list-row"><span className="muted">No Earn ledger activity. Estimates and invoices alone do not create a fee.</span></li> : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Disputes and resolutions</h2>
        <ul className="list">
          {dashboard.disputes.map((dispute) => (
            <li className="list-row" key={dispute.id}>
              <div><h3>{dispute.reason}</h3><p className="muted">{dispute.type.replaceAll("_", " ")} · {money(dispute.amountCents)} · {new Date(dispute.createdAt).toLocaleString()}</p></div>
              <div>
                <span className={`pill ${["OPEN", "UNDER_REVIEW"].includes(dispute.status) ? "high" : ""}`}>{dispute.status}</span>
                {can(actor, "platform:manage") && ["OPEN", "UNDER_REVIEW"].includes(dispute.status) ? (
                  <details className="panel subtle-panel">
                    <summary>Resolve dispute</summary>
                    <form action={resolveEarnDisputeAction} className="form-stack">
                      <input name="disputeId" type="hidden" value={dispute.id} />
                      <label>Resolution<select name="status"><option value="APPROVED">Approved</option><option value="PARTIALLY_APPROVED">Partially approved</option><option value="DENIED">Denied</option><option value="RESOLVED">Resolved without adjustment</option></select></label>
                      <label>Approved Earn credit<input name="creditAmount" inputMode="decimal" defaultValue="0.00" /></label>
                      <label>Resolution and evidence<textarea name="resolution" rows={3} required /></label>
                      <button className="mini-button" type="submit">Record resolution</button>
                    </form>
                  </details>
                ) : null}
              </div>
            </li>
          ))}
          {dashboard.disputes.length === 0 ? <li className="list-row"><span className="muted">No Earn disputes have been submitted.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <section className="panel span-3"><p className="eyebrow">{label}</p><h2>{value}</h2></section>;
}

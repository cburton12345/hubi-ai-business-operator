import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMaintenanceOpportunityDetail } from "@/lib/maintenance-ops/get-opportunities-dashboard";
import { convertOpportunityToWorkOrderAction, evaluateAndSourceOpportunityAction, updateMaintenanceOpportunityAction } from "../actions";

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown) { return typeof value === "number" ? value : value === null || value === undefined ? "" : Number(value); }
function checked(value: unknown) { return value === true; }
function dollars(value: unknown) { return typeof value === "number" ? (value / 100).toFixed(2) : ""; }
function listText(value: unknown) { return Array.isArray(value) ? value.join("\n") : ""; }
function objectText(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${String(item)}`).join("\n") : ""; }
function dateTimeLocal(value: unknown) { const raw = text(value); return raw ? new Date(raw).toISOString().slice(0, 16) : ""; }

export default async function OpportunityDetailPage({ params, searchParams }: { params: Promise<{ opportunityId: string }>; searchParams: Promise<{ saved?: string; evaluated?: string; converted?: string; error?: string }> }) {
  const { opportunityId } = await params;
  const feedback = await searchParams;
  const detail = await getMaintenanceOpportunityDetail(opportunityId);
  if (!detail.opportunity) notFound();
  const opportunity = detail.opportunity;
  const title = text(opportunity.title) || "Opportunity";
  const classification = text(opportunity.classification) || "unclassified";
  const workflowStatus = text(opportunity.workflow_status) || "received";
  const latest = detail.evaluations[0];
  return (
    <QueuePageShell eyebrow="Opportunity Control" title={title} description="Opportunity evidence, profitability, contractor sourcing, compliance, authorization, and work-order conversion remain separate and auditable.">
      <div className="button-row section-actions"><Link className="button secondary-button" href="/app/opportunities">All opportunities</Link><Link className="button secondary-button" href="/app/service">Field Work Center</Link></div>
      {feedback.saved ? <p className="success-banner">Opportunity details saved.</p> : null}
      {feedback.evaluated ? <p className="success-banner">Evaluation completed. MarketplacePro sourcing ran only if every sourcing gate passed.</p> : null}
      {feedback.converted ? <p className="success-banner">Authorized work order created.</p> : null}
      {feedback.error ? <p className="form-error">The requested operation did not pass validation or authorization gates. Review the evidence below.</p> : null}
      <div className="grid section-actions">
        <section className="panel span-4 metric"><span className="muted">Canonical record</span><strong>{text(opportunity.status)}</strong></section>
        <section className="panel span-4 metric"><span className="muted">Maintenance workflow</span><strong>{workflowStatus.replaceAll("_", " ")}</strong></section>
        <section className="panel span-4 metric"><span className="muted">Latest evaluation</span><strong>{text(latest?.classification) || "Not evaluated"}</strong></section>
      </div>
      <div className="grid">
        <section className="panel span-8">
          <h2>Opportunity evidence and controls</h2>
          <form action={updateMaintenanceOpportunityAction} className="form-stack">
            <input type="hidden" name="opportunityId" value={opportunityId} />
            <label>Classification<select name="classification" defaultValue={classification}><option value="unclassified">Unclassified</option><option value="commercial_maintenance">Commercial maintenance</option><option value="other_business">Other legitimate business</option><option value="non_opportunity">Not an opportunity</option></select></label>
            <label>Workflow status<select name="workflowStatus" defaultValue={workflowStatus}><option value="received">Received</option><option value="needs_information">Needs information</option><option value="evaluated">Evaluated</option><option value="sourcing">Sourcing</option><option value="recruiting">Recruiting</option><option value="contractor_identified">Contractor identified</option><option value="contractor_confirmed">Contractor confirmed</option><option value="ready_for_authorization">Ready for authorization</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="converted">Converted</option><option value="closed">Closed</option></select></label>
            <label>Customer<select name="customerId" defaultValue={text(opportunity.customer_id)}><option value="">No customer linked</option>{detail.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
            <div className="two-col"><label>Trade<input name="trade" defaultValue={text(opportunity.trade)} /></label><label>Deadline<input name="deadlineAt" type="datetime-local" defaultValue={dateTimeLocal(opportunity.deadline_at)} /></label></div>
            <label>Scope<textarea name="scope" rows={5} defaultValue={text(opportunity.scope) || text(opportunity.lead_message)} /></label>
            <label>Service address<input name="serviceAddress" defaultValue={text(opportunity.service_address)} /></label>
            <div className="three-col"><label>City<input name="city" defaultValue={text(opportunity.service_city)} /></label><label>State<input name="state" maxLength={2} defaultValue={text(opportunity.service_state)} /></label><label>ZIP<input name="postalCode" defaultValue={text(opportunity.postal_code)} /></label></div>
            <div className="two-col"><label>Customer budget<input name="customerBudget" inputMode="decimal" defaultValue={dollars(opportunity.customer_budget_cents ?? opportunity.value_cents)} /></label><label>Expected contractor cost<input name="expectedContractorCost" inputMode="decimal" defaultValue={dollars(opportunity.expected_contractor_cost_cents)} /></label></div>
            <div className="two-col"><label>Materials allowance<input name="materialsAllowance" inputMode="decimal" defaultValue={dollars(opportunity.materials_allowance_cents)} /></label><label>Additional direct cost<input name="additionalCost" inputMode="decimal" defaultValue={dollars(opportunity.additional_cost_cents)} /></label></div>
            <div className="three-col"><label>Payment terms (days)<input name="paymentTermsDays" type="number" min={0} max={365} defaultValue={numberValue(opportunity.payment_terms_days)} /></label><label>Complexity (0–100)<input name="complexityScore" type="number" min={0} max={100} defaultValue={numberValue(opportunity.complexity_score)} /></label><label>Callback risk (0–100)<input name="callbackRiskScore" type="number" min={0} max={100} defaultValue={numberValue(opportunity.callback_risk_score)} /></label></div>
            <div className="two-col"><label>Licensing requirements<textarea name="licensingRequirements" rows={4} defaultValue={listText(opportunity.licensing_requirements)} /></label><label>Insurance requirements<textarea name="insuranceRequirements" rows={4} defaultValue={objectText(opportunity.insurance_requirements)} /></label></div>
            <label><input name="licensingVerified" type="checkbox" defaultChecked={checked(opportunity.licensing_verified)} /> Licensing evidence verified</label>
            <label><input name="insuranceVerified" type="checkbox" defaultChecked={checked(opportunity.insurance_verified)} /> Insurance evidence verified</label>
            <label><input name="customerAuthorized" type="checkbox" defaultChecked={checked(opportunity.customer_authorized)} /> Customer explicitly authorized binding work</label>
            <label><input name="contractorConfirmed" type="checkbox" defaultChecked={checked(opportunity.contractor_confirmed)} /> Qualified contractor explicitly confirmed availability</label>
            <button className="button" type="submit">Save opportunity controls</button>
          </form>
        </section>
        <section className="panel span-4">
          <h2>Verified next actions</h2>
          <p><strong>MarketplacePro:</strong> {text(opportunity.marketplacepro_status) || "Not requested"}</p>
          <p className="muted">Labor request: {text(opportunity.marketplacepro_labor_request_id) || "None"}</p>
          <form action={evaluateAndSourceOpportunityAction} className="section-actions"><input type="hidden" name="opportunityId" value={opportunityId} /><button className="button" type="submit">Evaluate and source if eligible</button></form>
          <form action={convertOpportunityToWorkOrderAction} className="section-actions"><input type="hidden" name="opportunityId" value={opportunityId} /><button className="button" type="submit">Create authorized work order</button></form>
          <p className="muted">Conversion fails closed unless profitability, location, contractor confirmation, insurance, licensing, customer authorization, and operating limits all pass.</p>
          {text(opportunity.work_order_id) ? <p><strong>Work order:</strong> {text(opportunity.work_order_id)}</p> : null}
        </section>
      </div>
      <div className="grid section-actions">
        <History title="Evaluation history" rows={detail.evaluations} empty="No evaluation has run." />
        <History title="Automation history" rows={detail.events} empty="No orchestration event has run." />
        <History title="Manager and owner interventions" rows={detail.interventions} empty="No intervention recorded." />
      </div>
    </QueuePageShell>
  );
}

function History({ title, rows, empty }: { title: string; rows: Record<string, unknown>[]; empty: string }) {
  return <section className="panel span-12"><h2>{title}</h2><ul className="list">{rows.map((row, index) => <li className="list-row" key={text(row.id) || String(index)}><div><h3>{text(row.classification) || text(row.action_type) || text(row.reason_code) || "Activity"}</h3><p className="muted">{text(row.status) || text(row.recommended_action) || "recorded"} · {text(row.created_at) || text(row.opened_at)}</p>{text(row.safe_error) ? <p>{text(row.safe_error)}</p> : null}</div></li>)}{rows.length === 0 ? <li className="list-row"><span className="muted">{empty}</span></li> : null}</ul></section>;
}

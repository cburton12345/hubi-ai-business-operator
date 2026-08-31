import { CheckCircle2, GitBranch, RefreshCw, ShieldAlert } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getActionQueueDashboard } from "@/lib/actions-queue/get-action-queue";
import { scanActionQueueAction, sendApprovedEmailAction, updateOutboundActionStatusAction } from "./actions";
import { CommunicationMethodControl } from "./CommunicationMethodControl";

function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function providerOwnerLabel(value: string) {
  return value === "ferocity_managed" ? "Ferocity managed" : "Customer owned";
}

function usageLabel(used: number, included: number | null) {
  if (!included) return `${used.toLocaleString()} used`;
  return `${used.toLocaleString()} of ${included.toLocaleString()} included`;
}

function actionLabel(value: string) {
  const labels: Record<string, string> = {
    sms_send: "Text message",
    email_send: "Email",
    voice_call: "AI phone call",
    phone_call: "Phone call",
    manual_message: "Prepared message",
    publish_content: "Publish content",
    calendar_sync: "Calendar update",
    review_request: "Review request",
    billing_sync: "Billing update"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function targetLabel(value: string | null) {
  if (!value) return "General business task";
  const labels: Record<string, string> = {
    communication_message: "Customer conversation",
    review_request_workflow: "Review follow-up",
    follow_up_workflow: "Customer follow-up",
    revenue_appointment_reminder: "Appointment reminder",
    service_invoice: "Customer invoice",
    lead: "Lead"
  };
  if (labels[value]) return labels[value];
  return value.replaceAll("_", " ");
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    needs_review: "Needs review",
    approved: "Approved",
    queued: "Ready",
    sent_manually: "Completed manually",
    blocked: "Blocked",
    failed: "Needs attention",
    canceled: "Canceled"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export default async function ActionsPage() {
  const dashboard = await getActionQueueDashboard();

  return (
    <QueuePageShell
      eyebrow="Action Queue"
      title="Control What Ferocity Can Do"
      description="Review customer messages and business actions in one place, or let approved routine work move automatically. Ferocity still checks connections, customer permissions, spending limits, and your authority rules."
    >
      <div className="button-row section-actions">
        <form action={scanActionQueueAction}>
          <button className="button" type="submit">
            <RefreshCw size={16} /> Scan action queue
          </button>
        </form>
      </div>

      <div className="grid section-actions">
        {dashboard.metrics.map((metric) => (
          <section className="panel span-2 metric" key={metric.label}>
            <span className="muted">{metric.label}</span>
            <strong>{metric.value.toLocaleString()}</strong>
            <small className="muted">{metric.detail}</small>
          </section>
        ))}
      </div>

      <div className="grid">
        <section className="panel span-8">
          <h2>Queued Actions</h2>
          <ul className="list">
            {dashboard.actions.map((action) => (
              <li className="list-row" key={action.id}>
                <form action={updateOutboundActionStatusAction} className="form-stack compact-form">
                  <input name="actionId" type="hidden" value={action.id} />
                  <div className="list-row flush-row">
                    <div>
                      <h3>{action.subject}</h3>
                      <p className="muted">
                        {actionLabel(action.actionType)} / {targetLabel(action.targetType)} / {dateLabel(action.scheduledFor)}
                      </p>
                      <p className="muted">{action.recipientLabel ?? "No recipient"}</p>
                      {action.bodyPreview ? <p>{action.bodyPreview}</p> : null}
                      {action.voiceCapacityStatus === "waiting_for_capacity" ? (
                        <p className="muted">
                          Ferocity is holding this call until phone capacity is available
                          {action.voiceEstimatedStartAt ? ` — estimated ${dateLabel(action.voiceEstimatedStartAt)}` : ""}.
                        </p>
                      ) : null}
                      {action.lastError ? <p className="danger-text">{action.lastError}</p> : null}
                    </div>
                    <div className="inline-actions">
                      <span className={`pill ${action.riskLevel}`}>{action.riskLevel} risk</span>
                      <span className="pill">{statusLabel(action.status)}</span>
                    </div>
                  </div>
                  <div className="two-col">
                    <select name="status" defaultValue={action.status}>
                      <option value="needs_review">Needs review</option>
                      <option value="approved">Approve</option>
                      <option value="queued">Ready to run</option>
                      <option value="sent_manually">Completed manually</option>
                      <option value="blocked">Blocked</option>
                      <option value="failed">Needs attention</option>
                      <option value="canceled">Canceled</option>
                    </select>
                    <button className="mini-button" type="submit">
                      Save
                    </button>
                  </div>
                  <input name="note" placeholder="Short review note" />
                </form>
                {["sms_send", "email_send", "voice_call", "phone_call", "manual_message"].includes(action.actionType) ? (
                  <CommunicationMethodControl
                    actionId={action.id}
                    body={action.bodyPreview ?? ""}
                    currentMethod={action.resolvedMethod}
                    email={action.email}
                    phone={action.phone}
                    resolvedScope={action.resolvedScope}
                    subject={action.subject}
                  />
                ) : null}
                {action.actionType === "email_send" && (action.status === "approved" || action.status === "queued") ? (
                  <form action={sendApprovedEmailAction} className="section-actions">
                    <input name="actionId" type="hidden" value={action.id} />
                    <button className="button" type="submit">
                      Send approved email
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
            {dashboard.actions.length === 0 ? (
              <li className="list-row">
                <div>
                  <h3>No actions queued</h3>
                  <p className="muted">Run a scan after creating messages, publishing queue items, reviews, or schedule events.</p>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-4">
          <h2>
            <ShieldAlert size={18} /> Live Action Policies
          </h2>
          <p className="muted">Plain rules decide what stays draft-only, what needs approval, and what Ferocity may run automatically.</p>
          <ul className="list">
            {dashboard.policies.map((policy) => (
              <li className="list-row" key={policy.id}>
                <div>
                  <h3>{policy.label}</h3>
                  <p>{policy.rule}</p>
                </div>
                <span className={`pill ${policy.riskLevel}`}>{policy.riskLevel} risk</span>
              </li>
            ))}
          </ul>
        </section>

        <details className="panel span-6 admin-detail-panel">
          <summary>Provider Accounts ({dashboard.providers.length})</summary>
          <p className="muted">Provider records show what can be used after credentials, policies, consent, and live-action settings are ready. Customer-owned accounts can replace shared/default routes by workspace.</p>
          <ul className="list">
            {dashboard.providers.map((provider) => (
              <li className="list-row" key={provider.providerKey}>
                <div>
                  <h3>{provider.displayName}</h3>
                  <p className="muted">
                    {provider.providerKey} / {provider.status} / {provider.credentialsStatus}
                  </p>
                  <p className="muted">
                    {providerOwnerLabel(provider.ownershipMode)} / {provider.senderIdentity ?? "No sender yet"} /{" "}
                    {usageLabel(provider.monthlyUsedUnits, provider.monthlyIncludedUnits)}
                  </p>
                </div>
                <div className="inline-actions">
                  <span className="pill">{provider.overagePolicy}</span>
                  <span className="pill">{provider.liveActionsEnabled ? "live on" : "live off"}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>

        <details className="panel span-6 admin-detail-panel">
          <summary><GitBranch size={18} /> Provider Routes ({dashboard.routingRules.length})</summary>
          <p className="muted">Routes decide which provider Ferocity should use for each kind of action.</p>
          <ul className="list">
            {dashboard.routingRules.map((route) => (
              <li className="list-row" key={route.id}>
                <div>
                  <h3>{route.actionType}</h3>
                  <p className="muted">
                    {route.defaultProviderKey} / {providerOwnerLabel(route.ownershipMode)} / fallback:{" "}
                    {route.fallbackProviderKey ?? "none"}
                  </p>
                  <p>{route.rule}</p>
                </div>
                <span className="pill">{route.status}</span>
              </li>
            ))}
            {dashboard.routingRules.length === 0 ? (
              <li className="list-row">
                <span className="muted">No message routes are configured yet. Finish connection setup before turning on managed or bring-your-own delivery.</span>
              </li>
            ) : null}
          </ul>
        </details>

        <details className="panel span-6 admin-detail-panel">
          <summary><CheckCircle2 size={18} /> Consent Records ({dashboard.consents.length})</summary>
          <p className="muted">Text, email, and phone actions need consent and suppression checks.</p>
          <ul className="list">
            {dashboard.consents.map((consent) => (
              <li className="list-row" key={consent.id}>
                <div>
                  <h3>{consent.contactValue}</h3>
                  <p className="muted">
                    {consent.channel} / {consent.source ?? "unknown"} / {dateLabel(consent.recordedAt)}
                  </p>
                </div>
                <span className="pill">{consent.status}</span>
              </li>
            ))}
            {dashboard.consents.length === 0 ? (
              <li className="list-row">
                <span className="muted">No consent records yet. Scan the action queue to pull from real lead intake.</span>
              </li>
            ) : null}
          </ul>
        </details>
      </div>
    </QueuePageShell>
  );
}

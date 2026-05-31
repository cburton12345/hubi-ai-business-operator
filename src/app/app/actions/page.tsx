import { CheckCircle2, GitBranch, RefreshCw, ShieldAlert } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getActionQueueDashboard } from "@/lib/actions-queue/get-action-queue";
import { scanActionQueueAction, sendApprovedEmailAction, updateOutboundActionStatusAction } from "./actions";

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

export default async function ActionsPage() {
  const dashboard = await getActionQueueDashboard();

  return (
    <QueuePageShell
      eyebrow="Action Queue"
      title="Review Before Anything Goes Live"
      description="One safety queue for texts, emails, publishing, review requests, calendar sync, and billing actions. Live sends stay off until provider rules are ready."
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
          <h2>Actions To Review</h2>
          <ul className="list">
            {dashboard.actions.map((action) => (
              <li className="list-row" key={action.id}>
                <form action={updateOutboundActionStatusAction} className="form-stack compact-form">
                  <input name="actionId" type="hidden" value={action.id} />
                  <div className="list-row flush-row">
                    <div>
                      <h3>{action.subject}</h3>
                      <p className="muted">
                        {action.actionType} / {action.providerKey} / {action.targetType ?? "no target"} / {dateLabel(action.scheduledFor)}
                      </p>
                      <p className="muted">{action.recipientLabel ?? "No recipient"}</p>
                      {action.bodyPreview ? <p>{action.bodyPreview}</p> : null}
                      {action.lastError ? <p className="danger-text">{action.lastError}</p> : null}
                    </div>
                    <div className="inline-actions">
                      <span className={`pill ${action.riskLevel}`}>{action.riskLevel}</span>
                      <span className="pill">{action.status}</span>
                    </div>
                  </div>
                  <div className="two-col">
                    <select name="status" defaultValue={action.status}>
                      <option value="needs_review">needs_review</option>
                      <option value="approved">approved</option>
                      <option value="queued">queued</option>
                      <option value="sent_manually">sent_manually</option>
                      <option value="blocked">blocked</option>
                      <option value="failed">failed</option>
                      <option value="canceled">canceled</option>
                    </select>
                    <button className="mini-button" type="submit">
                      Save
                    </button>
                  </div>
                  <input name="note" placeholder="Short review note" />
                </form>
                {action.actionType === "email_send" && (action.status === "approved" || action.status === "queued") ? (
                  <form action={sendApprovedEmailAction} className="section-actions">
                    <input name="actionId" type="hidden" value={action.id} />
                    <button className="button" type="submit">
                      Send with Resend
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
          <p className="muted">Plain rules that decide what can ever become live.</p>
          <ul className="list">
            {dashboard.policies.map((policy) => (
              <li className="list-row" key={policy.id}>
                <div>
                  <h3>{policy.label}</h3>
                  <p className="muted">
                    {policy.providerKey} / {policy.minimumPlanKey} / {policy.status}
                  </p>
                  <p>{policy.rule}</p>
                </div>
                <span className={`pill ${policy.riskLevel}`}>{policy.riskLevel}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Provider Accounts</h2>
          <p className="muted">Use Ferocity managed defaults early. Switch to customer-owned accounts when setup is ready.</p>
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
        </section>

        <section className="panel span-6">
          <h2>
            <GitBranch size={18} /> Provider Routes
          </h2>
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
                <span className="muted">No routes configured yet. Run migrations to enable managed and bring-your-own routing.</span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>
            <CheckCircle2 size={18} /> Consent Records
          </h2>
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
        </section>
      </div>
    </QueuePageShell>
  );
}

import Link from "next/link";
import { Mail, MessageSquareText, PhoneCall, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { manualSmsHref } from "@/lib/communication/manual-sms";
import { getMessagingDashboard } from "@/lib/messaging/get-messaging-dashboard";
import {
  messageHealthLabel,
  messageHealthTone,
  messageNeedsAttention,
  safeDeliveryExplanation
} from "@/lib/messaging/message-health-view";
import {
  clearMessagingEmergencyPauseAction,
  emergencyPauseMessagingAccountAction,
  retryMessageAction,
  updateInboundSmsReplyModeAction
} from "./actions";

function statusTone(status: string) {
  if (["active", "ready", "available", "configured"].includes(status)) return "";
  if (["paused", "needs_attention", "not_connected", "not_configured", "planned"].includes(status)) return "medium";
  return "high";
}

export default async function MessagingPage() {
  const dashboard = await getMessagingDashboard();

  return (
    <QueuePageShell
      eyebrow="Messaging Engine"
      title="Customer Messages, Without Provider Lock-In"
      description="Ferocity routes SMS, email, manual texts, voice-ready workflows, delivery logs, consent, opt-outs, and future providers through one messaging layer."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ShieldCheck size={18} /> How Sends Work</h2>
            <p className="muted">
              Business workflows ask Ferocity to send or prepare a message. The Messaging Engine chooses the route, checks consent and opt-outs,
              records usage, and logs provider failures. Twilio and Resend are providers, not the architecture.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/text-queue"><MessageSquareText size={16} /> Manual texts</Link>
            <Link className="button secondary-button" href="/app/messaging/a2p">Set up texting</Link>
            <Link className="button secondary-button" href="/app/messaging/twilio-isv">Twilio ISV</Link>
            <Link className="button secondary-button" href="/app/actions">Action queue</Link>
            <Link className="button secondary-button" href="/docs/provider-independent-messaging-engine">Docs</Link>
          </div>
        </div>
      </section>

      <div className="grid section-actions">
        <Metric label="Unread conversations" value={dashboard.metrics.unreadConversations} />
        <Metric label="Response overdue" value={dashboard.metrics.overdueResponses} />
        <Metric label="Messages this month" value={dashboard.metrics.messagesThisMonth} />
        <Metric label="Opt-outs" value={dashboard.metrics.optOuts} />
        <Metric label="Delivery problems" value={dashboard.metrics.deliveryProblems} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Inbound SMS replies</h2>
            <p className="muted">Ferocity always records the inbound text. It can prepare a Business Brain reply for review, or automatically queue only high-confidence ordinary replies when you explicitly allow it. Consent, opt-outs, quiet hours, provider health, and risk escalation still apply.</p>
          </div>
          <form action={updateInboundSmsReplyModeAction} className="inline-actions">
            <label className="sr-only" htmlFor="inbound-reply-mode">Inbound SMS reply mode</label>
            <select id="inbound-reply-mode" name="mode" defaultValue={dashboard.inboundReplyMode}>
              <option value="off">Record only</option>
              <option value="review">Prepare for review</option>
              <option value="automatic">Automatic when safe</option>
            </select>
            <button className="mini-button" type="submit">Save reply mode</button>
          </form>
        </div>
        {dashboard.inboundReplyMode === "automatic" ? <p className="muted">Automatic mode is active. Low-confidence, money, legal, safety, angry-customer, opt-out, and ambiguous messages still require a person.</p> : null}
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Shared customer inbox</h2>
            <p className="muted">Inbound replies rise to the top and automatically stop matching nurture and follow-up so customers are not chased after responding.</p>
          </div>
          <span className={`pill ${dashboard.metrics.overdueResponses ? "high" : ""}`}>{dashboard.metrics.overdueResponses} overdue</span>
        </div>
        <ul className="list">
          {dashboard.conversations.map((conversation) => (
            <li className="list-row" key={conversation.id}>
              <div>
                <h3>{conversation.contactName} — {conversation.subject}</h3>
                <p>{conversation.lastMessage}</p>
                <p className="muted">{conversation.channel} / last activity {conversation.lastMessageAt} / response due {conversation.responseDue}</p>
                {conversation.messages.length ? (
                  <details className="section-actions">
                    <summary>View conversation ({conversation.messages.length} recent messages)</summary>
                    <ul className="list">
                      {conversation.messages.map((message) => {
                        const explanation = safeDeliveryExplanation(message);
                        return (
                          <li className="list-row" key={message.id}>
                            <div>
                              <p>{message.body}</p>
                              <p className="muted">
                                {message.direction} / {message.channel} / {message.createdAt}
                                {message.direction === "outbound" ? ` / ${message.providerKey}` : ""}
                              </p>
                              {explanation ? <p className="muted">{explanation}</p> : null}
                              {message.events.length ? (
                                <details>
                                  <summary>Delivery history ({message.events.length})</summary>
                                  <ul className="list">
                                    {message.events.map((event, index) => (
                                      <li key={`${message.id}-${event.at}-${index}`}>
                                        {(event.status || "unknown").replaceAll("_", " ")}
                                        {event.rawStatus ? ` (${event.rawStatus})` : ""}
                                        {event.reason ? ` — ${event.reason}` : ""}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              ) : null}
                            </div>
                            <div className="inline-actions">
                              <span className={`pill ${messageHealthTone(message.deliveryStatus)}`}>
                                {messageHealthLabel(message)}
                              </span>
                              {message.direction === "outbound" && message.deliveryUpdatedAt ? (
                                <span className="muted">Updated {message.deliveryUpdatedAt}</span>
                              ) : null}
                              {messageNeedsAttention(message.deliveryStatus) ? (
                                <a className="mini-button secondary-button" href="#message-health">Review options</a>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ) : null}
              </div>
              <div className="inline-actions">
                {conversation.unreadCount ? <span className="pill high">{conversation.unreadCount} unread</span> : null}
                <span className="pill">{conversation.status.replaceAll("_", " ")}</span>
              </div>
            </li>
          ))}
          {dashboard.conversations.length === 0 ? <li className="list-row"><span className="muted">No open customer conversations yet.</span></li> : null}
        </ul>
      </section>

      <section className="panel section-actions" id="message-health">
        <div className="list-row flush-row">
          <div>
            <h2>Message health</h2>
            <p className="muted">Provider receipts show what happened after a send. Failed attempts stay in history when you retry.</p>
          </div>
          <span className={`pill ${dashboard.metrics.deliveryProblems ? "high" : ""}`}>
            {dashboard.metrics.deliveryProblems} need attention
          </span>
        </div>
        <ul className="list">
          {dashboard.messageHealth.map((message) => {
            const unhealthy = messageNeedsAttention(message.deliveryStatus);
            const smsLike = ["sms", "mms", "manual_sms"].includes(message.channel);
            const configuredProviders = dashboard.providers.filter((provider) => {
              const capability = message.channel === "email" ? "Email" : message.channel === "mms" ? "MMS" : "SMS";
              const accountReady = dashboard.accounts.some((account) =>
                account.providerKey === provider.providerKey
                && account.connectionStatus === "active"
                && account.liveSendingEnabled
                && account.outboundEnabled
                && !account.emergencyPaused
              );
              return provider.capabilities.includes(capability) && (provider.providerKey === "manual_sms" || accountReady);
            });
            return (
              <li className="list-row" key={message.id}>
                <div>
                  <h3>{message.destination}</h3>
                  <p>{message.body}</p>
                  <p className="muted">
                    {message.providerKey} / {message.deliveryUpdatedAt}
                    {message.retryAttempt ? ` / retry ${message.retryAttempt}` : ""}
                  </p>
                  {message.safeReason ? <p className="muted">{message.safeReason}</p> : null}
                  {message.errorCode ? <p className="muted">Provider code: {message.errorCode}</p> : null}
                  {message.events.length > 1 ? (
                    <details>
                      <summary>Delivery history ({message.events.length})</summary>
                      <ul className="list">
                        {message.events.map((event, index) => (
                          <li key={`${message.id}-${event.at}-${index}`}>
                            {event.status?.replaceAll("_", " ") || "unknown"}
                            {event.rawStatus ? ` (${event.rawStatus})` : ""}
                            {event.reason ? ` — ${event.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
                <div className="inline-actions">
                  <span className={`pill ${unhealthy ? "high" : message.deliveryStatus === "delivered" ? "" : "medium"}`}>
                    {message.deliveryStatus.replaceAll("_", " ")}
                  </span>
                  {unhealthy && message.retryAttempt < 3 ? configuredProviders.map((provider) => (
                    <form action={retryMessageAction} key={`${message.id}-${provider.providerKey}`}>
                      <input name="messageId" type="hidden" value={message.id} />
                      <input name="providerKey" type="hidden" value={provider.providerKey} />
                      <button className="mini-button secondary-button" type="submit">
                        {provider.providerKey === message.providerKey ? "Retry" : `Try ${provider.displayName}`}
                      </button>
                    </form>
                  )) : null}
                  {unhealthy && smsLike ? (
                    <a className="mini-button secondary-button" href={manualSmsHref(message.destination, message.body)}>
                      Send from my device
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
          {dashboard.messageHealth.length === 0 ? <li className="list-row"><span className="muted">No outbound messages yet.</span></li> : null}
        </ul>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Providers</h2>
            <p className="muted">Manual sending stays usable even when automated providers are missing keys, paused, or waiting on approval.</p>
          </div>
          <span className="pill">{dashboard.providers.length} providers</span>
        </div>
        <div className="grid">
          {dashboard.providers.map((provider) => (
            <section className="panel span-4" key={provider.providerKey}>
              <div className="list-row flush-row">
                <div>
                  <span className="eyebrow">{provider.family}</span>
                  <h3>{provider.displayName}</h3>
                </div>
                <span className={`pill ${statusTone(provider.runtimeStatus)}`}>{provider.runtimeStatus.replaceAll("_", " ")}</span>
              </div>
              <p className="muted">{provider.capabilities.join(", ") || "No active capability yet"}</p>
              {provider.missing.length > 0 ? <p className="muted">Missing: {provider.missing.join(", ")}</p> : null}
              <span className={`pill ${statusTone(provider.status)}`}>{provider.status}</span>
            </section>
          ))}
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><PhoneCall size={18} /> Messaging Accounts</h2>
            <p className="muted">Each business can use its own accounts, Ferocity-managed accounts, or assisted manual sending.</p>
          </div>
          <Link className="mini-button" href="/app/integrations">Connect tools</Link>
        </div>
        <ul className="list">
          {dashboard.accounts.map((account) => (
            <li className="list-row" key={`${account.providerKey}-${account.ownershipMode}`}>
              <div>
                <h3>{account.accountLabel}</h3>
                <p className="muted">{account.providerKey} / {account.ownershipMode.replaceAll("_", " ")}</p>
                {account.ownershipMode !== "manual_assisted" ? (
                  <p className="muted">
                    Safety limits: {account.hourlySendCap ?? "custom"} per hour, {account.dailySendCap ?? "custom"} per day,
                    {" "}{account.perRecipientHourlyCap ?? "custom"} per recipient each hour
                  </p>
                ) : null}
              </div>
              <div className="inline-actions">
                <span className={`pill ${statusTone(account.connectionStatus)}`}>{account.connectionStatus.replaceAll("_", " ")}</span>
                <span className={`pill ${statusTone(account.credentialsStatus)}`}>{account.credentialsStatus.replaceAll("_", " ")}</span>
                <span className={`pill ${account.liveSendingEnabled ? "high" : ""}`}>{account.liveSendingEnabled ? "live on" : "live off"}</span>
                {account.emergencyPaused ? <span className="pill high">emergency paused</span> : null}
                {account.ownershipMode !== "manual_assisted" ? (
                  <form action={account.emergencyPaused ? clearMessagingEmergencyPauseAction : emergencyPauseMessagingAccountAction}>
                    <input name="accountId" type="hidden" value={account.id} />
                    <button className="mini-button secondary-button" type="submit">
                      {account.emergencyPaused ? "Clear pause (keep sends off)" : "Emergency pause"}
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
          {dashboard.accounts.length === 0 ? <li className="list-row"><span className="muted">Connect a messaging account to get started.</span></li> : null}
        </ul>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2><Mail size={18} /> Registration / A2P Readiness</h2>
          <p className="muted">Customers should answer plain business questions. Ferocity generates compliant provider wording behind the scenes.</p>
          <div className="button-row section-actions">
            <Link className="mini-button" href="/app/messaging/a2p">Start texting setup</Link>
            <Link className="mini-button secondary-button" href="/app/messaging/twilio-isv">ISV readiness</Link>
          </div>
          <ul className="list">
            {dashboard.registrations.map((registration) => (
              <li className="list-row" key={registration.id}>
                <div>
                  <h3>{registration.providerKey} / {registration.registrationType.replaceAll("_", " ")}</h3>
                  <p className="muted">{registration.legalBusinessName ?? "Business name needed"} {registration.websiteUrl ? `/ ${registration.websiteUrl}` : ""}</p>
                </div>
                <span className={`pill ${statusTone(registration.status)}`}>{registration.status}</span>
              </li>
            ))}
            {dashboard.registrations.length === 0 ? <li className="list-row"><span className="muted">No A2P or provider registrations have been started yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6">
          <h2>Incoming Message Connection</h2>
          <p className="muted">Connected messaging services send incoming messages and delivery updates here.</p>
          <code>{dashboard.webhookUrl}</code>
          <ul className="list section-actions">
            {dashboard.failures.map((failure) => (
              <li className="list-row" key={failure.id}>
                <div>
                  <h3>{failure.providerKey} / {failure.routeName}</h3>
                  <p className="muted">{failure.safeErrorMessage}</p>
                </div>
                <span className={`pill ${failure.retryable ? "medium" : "high"}`}>{failure.safeErrorCategory}</span>
              </li>
            ))}
            {dashboard.failures.length === 0 ? <li className="list-row"><span className="muted">No messaging provider failures logged.</span></li> : null}
          </ul>
        </section>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </section>
  );
}

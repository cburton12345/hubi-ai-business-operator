import Link from "next/link";
import { Building2, MessageSquareText, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getTwilioIsvDashboard } from "@/lib/messaging/get-twilio-isv-dashboard";

function tone(status: string) {
  if (status === "complete") return "";
  if (status === "blocked") return "high";
  return "medium";
}

export default async function TwilioIsvPage() {
  const dashboard = await getTwilioIsvDashboard();

  return (
    <QueuePageShell
      eyebrow="Twilio ISV"
      title="Texting Customers The Right Way"
      description="Track Ferocity's Twilio ISV readiness and each customer's A2P path without sharing one risky campaign across unrelated businesses."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ShieldCheck size={18} /> Recommended Setup</h2>
            <p className="muted">{dashboard.recommendedArchitecture}</p>
            <p className="muted">
              Ferocity should create or map each customer separately: subaccount, secondary profile, brand, campaign, Messaging Service, number, then live-send approval.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/messaging/a2p"><MessageSquareText size={16} /> Customer texting setup</Link>
            <Link className="button secondary-button" href="/app/messaging">Messaging Center</Link>
            <Link className="button secondary-button" href="/docs/twilio-isv-onboarding">Docs</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        <section className="panel span-6">
          <h2><Building2 size={18} /> Ferocity Primary Profile</h2>
          <ul className="list">
            <li className="list-row"><strong>Account keys</strong><span className={`pill ${dashboard.primaryProfile.hasAccountKeys ? "" : "medium"}`}>{dashboard.primaryProfile.hasAccountKeys ? "present" : "needed"}</span></li>
            <li className="list-row"><strong>Primary profile SID</strong><span className={`pill ${dashboard.primaryProfile.profileSid ? "" : "medium"}`}>{dashboard.primaryProfile.profileSid ? "recorded" : "needed"}</span></li>
            <li className="list-row"><strong>Profile approved</strong><span className={`pill ${dashboard.primaryProfile.approved ? "" : "high"}`}>{dashboard.primaryProfile.approved ? "yes" : "not yet"}</span></li>
            <li className="list-row"><strong>Business identity</strong><span className={`pill ${dashboard.primaryProfile.businessIdentity === "ISV Reseller or Partner" ? "" : "medium"}`}>{dashboard.primaryProfile.businessIdentity || "needed"}</span></li>
          </ul>
          {dashboard.primaryProfile.missing.length > 0 ? <p className="muted">Needs: {dashboard.primaryProfile.missing.join(", ")}.</p> : null}
        </section>

        <section className="panel span-6">
          <h2>Customer Route</h2>
          {dashboard.route ? (
            <ul className="list">
              <li className="list-row"><strong>Status</strong><span className="pill medium">{dashboard.route.status.replaceAll("_", " ")}</span></li>
              <li className="list-row"><strong>Account mode</strong><span className="pill">{dashboard.route.accountMode.replaceAll("_", " ")}</span></li>
              <li className="list-row"><strong>Subaccount</strong><span className="muted">{dashboard.route.customerSubaccountSid ?? "not recorded"}</span></li>
              <li className="list-row"><strong>Messaging Service</strong><span className="muted">{dashboard.route.messagingServiceSid ?? "not recorded"}</span></li>
              <li className="list-row"><strong>Phone number</strong><span className="muted">{dashboard.route.phoneNumber ?? "not recorded"}</span></li>
              <li className="list-row"><strong>Live sends</strong><span className={`pill ${dashboard.route.liveSendingEnabled ? "high" : "medium"}`}>{dashboard.route.liveSendingEnabled ? "on" : "off"}</span></li>
            </ul>
          ) : (
            <p className="muted">No Twilio customer connection exists yet. Start customer texting setup when the account is ready.</p>
          )}
        </section>
      </section>

      <section className="panel section-actions">
        <h2>Readiness Steps</h2>
        <ul className="list">
          {dashboard.steps.map((step) => (
            <li className="list-row" key={step.key}>
              <div>
                <h3>{step.label}</h3>
                <p className="muted">{step.detail}</p>
              </div>
              <span className={`pill ${tone(step.status)}`}>{step.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel section-actions">
        <h2>Latest Customer Packet</h2>
        {dashboard.latestRegistration ? (
          <div className="form-stack">
            <p><strong>{dashboard.latestRegistration.legalBusinessName ?? "Business name needed"}</strong></p>
            <p className="muted">{dashboard.latestRegistration.websiteUrl ?? "Website needed"} / {dashboard.latestRegistration.status}</p>
            {dashboard.latestRegistration.campaignDescription ? <p>{dashboard.latestRegistration.campaignDescription}</p> : null}
          </div>
        ) : (
          <p className="muted">No customer A2P packet has been drafted yet.</p>
        )}
      </section>
    </QueuePageShell>
  );
}

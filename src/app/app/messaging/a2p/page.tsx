import Link from "next/link";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getMessagingDashboard } from "@/lib/messaging/get-messaging-dashboard";
import { saveA2pRegistrationDraftAction } from "./actions";

export default async function A2pSetupPage() {
  const dashboard = await getMessagingDashboard();
  const latest = dashboard.registrations[0];

  return (
    <QueuePageShell
      eyebrow="Texting Setup"
      title="Set Up Business Texting"
      description="Answer normal business questions. Ferocity turns them into the registration packet needed before automated texting can go live."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><ShieldCheck size={18} /> What This Does</h2>
            <p className="muted">
              This prepares the business messaging registration for Twilio/A2P. It does not submit to Twilio, send texts, buy numbers, or turn on live SMS.
            </p>
          </div>
          <div className="button-row">
            <Link className="button secondary-button" href="/app/messaging">Messaging Center</Link>
            <Link className="button secondary-button" href="/app/text-queue">Manual texts</Link>
          </div>
        </div>
      </section>

      {latest ? (
        <section className="panel section-actions">
          <div className="list-row flush-row">
            <div>
              <h2>Latest Draft</h2>
              <p className="muted">{latest.providerKey} / {latest.registrationType.replaceAll("_", " ")} / {latest.legalBusinessName ?? "Business name needed"}</p>
            </div>
            <span className="pill medium">{latest.status.replaceAll("_", " ")}</span>
          </div>
        </section>
      ) : null}

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><MessageSquareText size={18} /> Business Texting Registration Draft</h2>
            <p className="muted">Use the customer&apos;s real legal information. Each business needs its own registration.</p>
          </div>
          <span className="pill">draft only</span>
        </div>
        <form action={saveA2pRegistrationDraftAction} className="form-stack">
          <div className="two-col">
            <label>Legal business name<input name="legalBusinessName" required /></label>
            <label>DBA or public name<input name="dbaName" /></label>
          </div>
          <div className="two-col">
            <label>Business type<input name="businessType" placeholder="LLC, sole proprietor, corporation" required /></label>
            <label>Website<input name="websiteUrl" type="url" placeholder="https://example.com" required /></label>
          </div>
          <label>Street address<input name="addressLine1" required /></label>
          <div className="two-col">
            <label>Address line 2<input name="addressLine2" /></label>
            <label>City<input name="city" required /></label>
          </div>
          <div className="two-col">
            <label>State<input name="state" required /></label>
            <label>ZIP / postal code<input name="postalCode" required /></label>
          </div>
          <label>
            What will texts be used for?
            <textarea name="messagingUseCase" rows={3} defaultValue="Lead follow-up, appointment reminders, estimate follow-up, invoice reminders, job updates, and review requests." required />
          </label>
          <div className="two-col">
            <label>Expected volume<input name="expectedVolume" defaultValue="10-40 per month" required /></label>
            <label>Opt-in method<input name="optInMethod" defaultValue="Website form, phone call, estimate, invoice, or direct customer request." required /></label>
          </div>
          <div className="two-col">
            <label>Privacy policy URL<input name="privacyPolicyUrl" type="url" /></label>
            <label>Terms URL<input name="termsUrl" type="url" /></label>
          </div>
          <label>
            Sample message 1
            <textarea name="sampleMessageOne" rows={2} placeholder="Optional. Ferocity can generate one if blank." />
          </label>
          <label>
            Sample message 2
            <textarea name="sampleMessageTwo" rows={2} placeholder="Optional. Ferocity can generate one if blank." />
          </label>
          <button className="button" type="submit">Save registration draft</button>
        </form>
      </section>
    </QueuePageShell>
  );
}

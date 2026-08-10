import Link from "next/link";
import type { Metadata } from "next";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";

export const metadata: Metadata = {
  title: "SMS Opt-In",
  description: "Choose whether to receive Ferocity account, service, and optional marketing text messages.",
  alternates: { canonical: "/sms-opt-in" }
};

export default async function SmsOptInPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <main className="public-page">
      <section className="public-shell legal-copy">
        <PublicNav />
        <section className="public-hero">
          <p className="eyebrow">Ferocity text messages</p>
          <h1>Choose the text messages you want to receive.</h1>
          <p className="muted">
            This preference applies to communications sent by Ferocity. It does not enroll you in the separate messaging program of any business that uses Ferocity.
          </p>
        </section>

        <section className="start-grid">
          <form action="/api/public/sms-opt-in" method="post" className="panel form-stack span-7">
            <label className="hidden-field">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>

            {status === "confirmed" ? (
              <p className="success-panel">Your SMS preferences were recorded. No purchase was required.</p>
            ) : null}
            {status === "invalid" ? (
              <p className="form-error">Enter a valid mobile number and affirmatively select the service-message consent checkbox.</p>
            ) : null}
            {status === "error" ? (
              <p className="form-error">Ferocity could not record the preference. Please try again or email ferocityflow@outlook.com.</p>
            ) : null}

            <label>
              Mobile phone number
              <input name="phone" type="tel" autoComplete="tel" inputMode="tel" required />
            </label>

            <label className="checkbox-row">
              <input name="serviceConsent" type="checkbox" required />
              <span className="sms-consent-copy">
                I agree to receive recurring automated account and service text messages from Ferocity, including verification, setup, support, security, and requested operational notices. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase. See the <Link href="/privacy">Privacy Policy</Link> and <Link href="/sms-terms">SMS Terms</Link>.
              </span>
            </label>

            <label className="checkbox-row">
              <input name="marketingConsent" type="checkbox" />
              <span className="sms-consent-copy">
                Optional: I also agree to receive recurring automated marketing texts from Ferocity about product education, offers, and events. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. This choice is not required to purchase or use Ferocity.
              </span>
            </label>

            <button className="button" type="submit">Confirm SMS preferences</button>
            <p className="muted">
              Ferocity records the consent language and time of submission. Submitting this form does not guarantee that SMS service is currently available or that every carrier will deliver every message.
            </p>
          </form>

          <aside className="panel span-5">
            <MessageSquareText size={24} />
            <h2>You control the channel.</h2>
            <ul className="plain-list">
              <li><ShieldCheck size={16} /><span>The checkboxes begin unchecked.</span></li>
              <li><ShieldCheck size={16} /><span>Marketing consent is separate and optional.</span></li>
              <li><ShieldCheck size={16} /><span>Reply STOP at any time to opt out.</span></li>
              <li><ShieldCheck size={16} /><span>Reply HELP or email ferocityflow@outlook.com for help.</span></li>
            </ul>
          </aside>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}

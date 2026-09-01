import Link from "next/link";
import type { Metadata } from "next";
import { PublicFooter } from "@/components/public/PublicFooter";
import { env } from "@/lib/env";

function phoneHref(value: string) { return `tel:${value.replace(/[^+\d]/g, "")}`; }

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with your Ferocity account, billing, or platform experience.",
  alternates: { canonical: "/support" }
};

export default async function SupportPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; reference?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supportPhone = env.VOICE_PHONE_NUMBER;
  return (
    <main className="public-page">
      <header className="public-nav">
        <Link className="brand-mark" href="/">Ferocity</Link>
        <Link className="button secondary-button" href="/login">Sign in</Link>
      </header>
      <section className="public-content narrow-content">
        <span className="eyebrow">Ferocity Support</span>
        <h1>Tell us what you need.</h1>
        <p>Ferocity creates a trackable request, alerts the support team, and emails your reference number.</p>
        <div className="button-row section-actions">
          {supportPhone ? <a className="button" href={phoneHref(supportPhone)}>Call AI support</a> : null}
          <a className="button secondary-button" href="mailto:support@ferocity.live">Email support</a>
        </div>
        {supportPhone ? <p className="muted">Our AI support agent can record a trackable case and alert the platform administrator. Ask for human follow-up at any time.</p> : null}

        {params.sent ? (
          <section className="success-panel">
            <h2>Your request is in the support queue.</h2>
            <p>Reference: <strong>{params.reference}</strong>. A confirmation was sent to your email.</p>
          </section>
        ) : (
          <form action="/api/public/support" method="post" className="panel stacked-form section-actions">
            {params.error ? <p className="form-error">We could not submit that request. Check the fields and try again, or email support@ferocity.live.</p> : null}
            <div className="form-grid two">
              <label>Your name<input name="name" required minLength={2} maxLength={160} autoComplete="name" /></label>
              <label>Email<input name="email" type="email" required maxLength={320} autoComplete="email" /></label>
              <label>What do you need help with?
                <select name="issueType" defaultValue="technical">
                  <option value="account">Account access</option>
                  <option value="billing">Billing or payment</option>
                  <option value="technical">Something is not working</option>
                  <option value="privacy">Privacy or data request</option>
                  <option value="other">Something else</option>
                </select>
              </label>
              <label>Subject<input name="subject" required minLength={4} maxLength={180} /></label>
            </div>
            <label>What happened, and what were you trying to do?
              <textarea name="message" required minLength={12} maxLength={5000} rows={7} />
            </label>
            <label className="sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <p className="muted">Do not include passwords, verification codes, or full payment-card information.</p>
            <button className="button" type="submit">Send support request</button>
          </form>
        )}
      </section>
      <PublicFooter />
    </main>
  );
}

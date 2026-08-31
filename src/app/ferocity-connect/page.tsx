import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { publicConnectPlan } from "@/lib/billing/public-plans";

export const metadata: Metadata = {
  title: "Ferocity Connect | Android SMS for Ferocity",
  description: "Pair an Android phone so approved Ferocity workflows can send and track business text messages through its mobile plan.",
  alternates: { canonical: "/ferocity-connect" }
};

const capabilities = [
  "Send approved follow-ups, appointment reminders, estimate and invoice reminders, and review requests",
  "Keep replies, delivery status, failures, and opt-outs in the Ferocity conversation timeline",
  "Honor consent, quiet hours, STOP and HELP automatically",
  "Pause on repeated failures and surface messages that need attention",
  "Use the business phone and mobile plan already installed in the paired Android device"
];

export default function FerocityConnectPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />
        <section className="public-hero">
          <p className="eyebrow">Ferocity Connect</p>
          <h1>Let Ferocity text through your Android business phone.</h1>
          <p className="muted">{publicConnectPlan.fit} Messages still require the right consent and authority. Ferocity watches delivery health and stops unsafe sending instead of treating “accepted” as “received.”</p>
          <div className="button-row">
            <Link className="button" href="/subscribe?plan=ferocity_connect">Start Connect — {publicConnectPlan.price}</Link>
            <Link className="button secondary-button" href="/login?next=/app/integrations/ferocity-connect">Subscriber setup &amp; download</Link>
            <Link className="button secondary-button" href="/pricing">Compare full plans</Link>
          </div>
        </section>

        <section className="feature-split">
          <article className="panel">
            <p className="eyebrow">What it handles</p>
            <h2>Connected texting, not a second inbox to babysit.</h2>
            <ul className="plain-list">
              {capabilities.map((item) => <li key={item}><CheckCircle2 size={16} /><span>{item}</span></li>)}
            </ul>
          </article>
          <article className="panel">
            <p className="eyebrow">Simple packaging</p>
            <strong className="price-line">{publicConnectPlan.price}</strong>
            <p>One paired Android device is included. {publicConnectPlan.additionalDevicePrice}.</p>
            <p className="muted">One device is also included in every monthly Ferocity software plan, so existing subscribers do not buy Connect twice.</p>
          </article>
        </section>

        <section className="panel feature-split">
          <div>
            <ShieldCheck size={24} />
            <h2>Built with real safeguards.</h2>
            <p className="muted">Ferocity applies per-device and recipient pacing, quiet hours, consent and suppression checks, retry limits, idempotency, delivery tracking, and an emergency sending switch.</p>
          </div>
          <div>
            <h2>Important limits</h2>
            <p className="muted">Ferocity Connect currently supports SMS on a paired Android device. It does not include MMS, guarantee carrier delivery, bypass carrier rules, or make unsolicited marketing lawful. Your carrier may charge for messages or restrict automated use. High-volume or registered messaging may require a managed provider instead.</p>
          </div>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Secure Android installation</p>
          <h2>Subscribers download the signed app inside their workspace.</h2>
          <p className="muted">The APK is not exposed as an anonymous public file. An eligible workspace receives a short-lived secure download, then Ferocity creates a separate one-time pairing link for the phone.</p>
          <Link className="button secondary-button" href="/login?next=/app/integrations/ferocity-connect">Open Connect setup</Link>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}

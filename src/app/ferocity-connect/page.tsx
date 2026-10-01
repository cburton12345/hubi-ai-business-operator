import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, MessageSquareReply, ShieldCheck, Smartphone } from "lucide-react";
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
        <section className="connect-hero">
          <div className="connect-hero-copy">
            <p className="eyebrow">Ferocity Connect</p>
            <h1>Put your business texting on autopilot—without changing your number.</h1>
            <p className="connect-lead">{publicConnectPlan.fit} Ferocity can send approved follow-ups and reminders, capture replies, and tell you when a message needs attention.</p>
            <div className="button-row">
              <Link className="button" href="/subscribe?plan=ferocity_connect">Start Connect — {publicConnectPlan.price}</Link>
              <Link className="button secondary-button" href="/login?next=/app/integrations/ferocity-connect">Subscriber setup &amp; download</Link>
              <Link className="button secondary-button" href="/pricing">Compare full plans</Link>
            </div>
            <div className="connect-trust-strip" aria-label="Ferocity Connect safeguards">
              <span><ShieldCheck size={16} /> Consent and STOP enforced</span>
              <span><Smartphone size={16} /> Private workspace pairing</span>
              <span><CheckCircle2 size={16} /> Delivery health tracked</span>
            </div>
          </div>

          <div className="connect-device" aria-label="Example Ferocity Connect activity">
            <div className="connect-device-top"><span /><strong>Ferocity Connect</strong><span /></div>
            <div className="connect-device-status"><i /> Paired and ready</div>
            <div className="connect-message-card">
              <CalendarClock size={18} />
              <div><strong>Invoice reminder</strong><span>Scheduled for 9:15 AM</span></div>
              <b>Queued</b>
            </div>
            <div className="connect-message-card">
              <CheckCircle2 size={18} />
              <div><strong>Estimate follow-up</strong><span>Sent from your business phone</span></div>
              <b className="connect-success">Sent</b>
            </div>
            <div className="connect-reply">
              <MessageSquareReply size={18} />
              <div><span>New reply</span><strong>“Yes, Tuesday works.”</strong></div>
            </div>
            <p>Conversation updated · no extra inbox</p>
          </div>
        </section>

        <section className="feature-split">
          <article className="panel">
            <p className="eyebrow">What it handles</p>
            <h2>Connected texting, not a second inbox to babysit.</h2>
            <ul className="plain-list connect-capability-list">
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
            <p className="muted">Ferocity checks consent, quiet hours, pacing, duplicate sends, delivery health, and opt-outs before an automation keeps moving.</p>
          </div>
          <div>
            <h2>Important limits</h2>
            <p className="muted">Ferocity Connect currently supports SMS on a paired Android device. It does not include MMS, guarantee carrier delivery, bypass carrier rules, or make unsolicited marketing lawful. Your carrier may charge for messages or restrict automated use. High-volume or registered messaging may require a managed provider instead.</p>
          </div>
        </section>

        <section className="section-actions" aria-label="Ferocity Connect delivery loop">
          <p className="eyebrow">A complete message loop</p>
          <h2>Queued is not sent. Sent is not delivered. A reply is not the end of the workflow.</h2>
          <div className="public-grid">
            <article className="panel value-card"><h2>Before sending</h2><p className="muted">Ferocity checks workspace authority, recipient consent, suppression state, quiet hours, pacing, device health, and duplicate protection.</p></article>
            <article className="panel value-card"><h2>After sending</h2><p className="muted">The conversation timeline records provider and device state, delivery evidence when available, failures, retry history, and the reason attention is needed.</p></article>
            <article className="panel value-card"><h2>When a reply arrives</h2><p className="muted">Ferocity records the inbound message, honors STOP and HELP, updates the conversation, and can prepare or perform only the response allowed by that workspace’s rules.</p></article>
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

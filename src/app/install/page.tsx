import Link from "next/link";
import type { Metadata } from "next";
import { Download, MonitorSmartphone, Smartphone, Star } from "lucide-react";
import { InstallAppButton } from "@/components/InstallAppButton";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Install Ferocity App",
  description: "Install Ferocity as an app on your phone, tablet, or desktop.",
  alternates: {
    canonical: "/install"
  }
};

export default function InstallPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="public-hero">
          <p className="eyebrow">Ferocity app</p>
          <h1>Install Ferocity on your phone or computer.</h1>
          <p className="muted">
            Ferocity is an installable web app. It opens like an app, stays tied to your secure Ferocity login,
            and gives faster access to Needs Attention, owner alerts, Business Grader, job tracking, and guided setup.
          </p>
          <div className="button-row">
            <InstallAppButton />
            <Link className="button secondary-button" href="/login">Open Ferocity</Link>
            <Link className="button secondary-button" href="/business-health-score">Free Grader</Link>
          </div>
        </section>

        <section className="grid section-actions">
          <article className="panel span-4">
            <Smartphone size={22} />
            <h2>iPhone or iPad</h2>
            <p className="muted">Open this page in Safari, tap Share, then tap Add to Home Screen.</p>
          </article>
          <article className="panel span-4">
            <MonitorSmartphone size={22} />
            <h2>Android</h2>
            <p className="muted">Open this page in Chrome and tap Install app or Add to Home screen.</p>
          </article>
          <article className="panel span-4">
            <Download size={22} />
            <h2>Desktop</h2>
            <p className="muted">Open this page in Chrome, Edge, or another supported browser and choose Install from the address bar or browser menu.</p>
          </article>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">Why install it?</p>
          <h2>Ferocity works better when it is one tap away.</h2>
          <div className="path-grid">
            {[
              ["Owner check-in", "Open Needs Attention and see decisions, risks, stuck work, missing connections, and money follow-up."],
              ["Field work", "Get faster access to schedules, proof photos, receipts, mileage, customer updates, and payroll review."],
              ["Sales follow-up", "Work new leads, stale opportunities, viewed estimates, unpaid invoices, and review requests."],
              ["Worker requests", "Post a staffing need, review matches, and approve contact from the field or office."],
              ["Setup help", "Open guided setup and let Ferocity recommend the next steps."]
            ].map(([title, body]) => (
              <div className="path-card" key={title}>
                <Star size={18} />
                <strong>{title}</strong>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel section-actions">
          <h2>No app store required.</h2>
          <p className="muted">
            Ferocity installs from the browser, opens from the home screen, and stays connected to the same secure business login.
          </p>
        </section>

        <section className="panel section-actions">
          <p className="eyebrow">After sign-in</p>
          <h2>Turn on owner alerts after you install.</h2>
          <p className="muted">
            Push notifications are optional. Use them for hot leads, owner decisions, blocked automation, safety issues,
            reminders, meetings, job plans, and money follow-up.
          </p>
          <div className="button-row">
            <Link className="button secondary-button" href="/app/notifications">Open notification settings</Link>
            <Link className="button secondary-button" href="/login?next=/app/notifications">Sign in to enable</Link>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}

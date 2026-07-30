import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/public/PublicNav";

export const metadata: Metadata = {
  title: "About Ferocity",
  description:
    "Ferocity helps service businesses respond faster, follow up, organize work, get paid, request reviews, and see what needs attention.",
  alternates: {
    canonical: "/about"
  }
};

export default function AboutPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />
        <section className="public-hero">
          <p className="eyebrow">About Ferocity</p>
          <h1>Built for owners who are tired of being the whole back office.</h1>
          <p className="muted">
            Ferocity was built around a simple problem: good businesses lose money because leads are missed, follow-up gets delayed,
            invoices age, reviews are forgotten, and too much sits in one person’s head. Ferocity gives the team one place to see what
            needs attention and lets AI prepare the next action while important customer-facing work stays under control.
          </p>
        </section>
        <section className="public-grid">
          <div className="panel">
            <h2>Who it serves first</h2>
            <p className="muted">
              Ferocity is focused first on owners and teams that need leads, jobs, payments, reviews, reminders, and marketing in one system.
            </p>
          </div>
          <div className="panel">
            <h2>What it does</h2>
            <p className="muted">
              Ferocity tracks lead sources, connects website and marketing activity, shows stale opportunities, prepares follow-up, organizes jobs or orders, helps track payments, and drafts review or marketing work.
            </p>
          </div>
          <div className="panel">
            <h2>Owner control</h2>
            <p className="muted">
              Ferocity does not send messages, publish content, change ads, or start billing without the right connected account, review rules, and customer consent.
            </p>
          </div>
          <div className="panel">
            <h2>Support</h2>
            <p className="muted">
              Customers can reach Ferocity at support@ferocity.live. Setup and onboarding requests also flow through the free grader and start pages.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "About Ferocity",
  description:
    "Why Ferocity exists: businesses needed one intelligence responsible for remembering context and moving work across the organization.",
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
          <h1>Businesses did not need another place to store work. They needed something responsible for moving it.</h1>
          <p className="muted">
            Ferocity began with a simple observation: most business software records what happened, but still leaves a person responsible for noticing every change, rebuilding context at every handoff, and deciding what happens next. Ferocity was built to carry that responsibility across the organization—within the authority people choose.
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
            <h2>What makes it different</h2>
            <p className="muted">
              One Business Brain connects conversations, customers, promises, jobs, money, employees, providers, and outcomes. Ferocity uses that context to notice what matters, coordinate the next step, verify the result, and continue watching.
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
              Customers can use the in-product support flow or email support@ferocity.live. Setup and onboarding requests also flow through the free grader and start pages.
            </p>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}

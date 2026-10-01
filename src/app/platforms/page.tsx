import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircleQuestion } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";
import { publicPlatforms } from "@/lib/public-site/platform-catalog";

export const metadata: Metadata = {
  title: "Ways to Start with Ferocity",
  description: "Compare practical ways to start with Ferocity, including the complete operating system, Earn, Calls, Connect, Job Tracker, and managed paths.",
  alternates: { canonical: "/platforms" }
};

export default function PlatformsPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="public-hero">
          <p className="eyebrow">One system. Several useful ways to start.</p>
          <h1>Start with the business problem that matters now.</h1>
          <p className="muted">
            Use the complete operating system or begin with phone coverage, Android texting, job and money control, a revenue-based Earn path, or a managed implementation. The records and context can grow with you instead of starting over.
          </p>
          <div className="button-row">
            <Link className="button" href="/ask-ferocity">
              Not sure what you need? Ask Ferocity <MessageCircleQuestion size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing">
              Compare all pricing
            </Link>
          </div>
        </section>

        <section className="public-grid" aria-label="Ways to start with Ferocity">
          {publicPlatforms.map((platform) => (
            <article className="panel value-card form-stack" id={platform.key} key={platform.key}>
              <div>
                <p className="eyebrow">{platform.eyebrow}</p>
                <h2>{platform.name}</h2>
                <p>{platform.summary}</p>
                <p className="muted"><strong>Best for:</strong> {platform.bestFor}</p>
              </div>

              <div className="notice-card">
                <div>
                  <strong>{platform.pricing}</strong>
                  <p className="muted">{platform.costNotes}</p>
                </div>
              </div>

              <ul className="plain-list">
                {platform.capabilities.map((capability) => (
                  <li key={capability}>
                    <CheckCircle2 size={16} />
                    <span>{capability}</span>
                  </li>
                ))}
              </ul>

              <p className="muted"><strong>Typical setup:</strong> {platform.setup}</p>

              <div className="button-row">
                <Link className="button" href={platform.startHref}>
                  Get started <ArrowRight size={16} />
                </Link>
                <Link className="button secondary-button" href={platform.plansHref}>
                  View plans
                </Link>
                <Link
                  className="button secondary-button"
                  href={{ pathname: "/ask-ferocity", query: { platform: platform.key } }}
                >
                  Ask Ferocity
                </Link>
              </div>
              <Link className="mini-button" href={platform.detailsHref}>View customer-facing details</Link>
            </article>
          ))}
        </section>

        <section className="panel feature-split section-actions">
          <div>
            <p className="eyebrow">A guided choice—not a sales maze</p>
            <h2>Describe the outcome. Ferocity can help choose the path.</h2>
            <p className="muted">
              You do not need to know which product name or screen solves the problem. Ask naturally about capabilities, pricing, setup, provider costs, or how different starting paths compare.
            </p>
          </div>
          <div>
            <Link className="button" href="/ask-ferocity">
              Ask Ferocity <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <PublicFooter />
      </section>
    </main>
  );
}

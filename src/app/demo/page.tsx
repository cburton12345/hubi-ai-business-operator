import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicNav } from "@/components/public/PublicNav";
import { PublicFooter } from "@/components/public/PublicFooter";
import { FeaturedDemoMedia } from "@/components/public/FeaturedDemoMedia";
import { BusinessLoopDemo } from "@/components/public/BusinessLoopDemo";
import { PublicCommandStory } from "@/components/public/PublicCommandStory";
import { ChatExperience } from "@/app/chat/[publicKey]/ChatExperience";
import { getFerocityPublicSalesProfile } from "@/lib/forms/get-public-form-profile";
import { getPublicCopy } from "@/lib/public-site/featured-demo";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Ferocity Demo | Watch the AI Business Operating System Think",
  description:
    "See one shared Business Brain coordinate people, specialized AI departments, and providers from the first conversation through future growth.",
  alternates: { canonical: "/demo" }
};

const loop = ["Remember", "Watch", "Understand", "Decide", "Coordinate", "Act", "Verify", "Continue"];

export default async function DemoPage() {
  const [hero, publicSalesProfile] = await Promise.all([
    getPublicCopy("demo_hero"),
    getFerocityPublicSalesProfile()
  ]);
  return (
    <main className="public-page">
      <section className="public-shell">
        <PublicNav />

        <section className="hero-command demo-hero">
          <div className="hero-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1>{hero.headline}</h1>
            <p>{hero.body}</p>
            <div className="button-row">
              <Link className="button" href={hero.ctaHref}>
                {hero.ctaLabel} <ArrowRight size={16} />
              </Link>
              <Link className="button secondary-button" href={hero.secondaryCtaHref}>{hero.secondaryCtaLabel}</Link>
            </div>
          </div>

          <div className="video-frame">
            <FeaturedDemoMedia priority fallbackAlt="Animated Ferocity walkthrough showing the business noticing, coordinating, acting, and learning" />
          </div>
        </section>

        <section className="demo-audience-band" aria-label="Businesses Ferocity can coordinate">
          <div><strong>Field and service businesses</strong><span>Calls, estimates, crews, jobs, changes, invoices, and follow-up.</span></div>
          <div><strong>Professional firms</strong><span>Inquiries, appointments, proposals, client work, billing, and retention.</span></div>
          <div><strong>Agencies and operators</strong><span>Campaigns, sales, delivery, reporting, renewals, and referrals.</span></div>
        </section>

        <BusinessLoopDemo />

        {publicSalesProfile ? (
          <PublicCommandStory>
            <ChatExperience
              brandName={publicSalesProfile.brandName}
              experience="ferocity_sales"
              publicKey={publicSalesProfile.publicKey}
            />
          </PublicCommandStory>
        ) : null}

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">The handoffs stop breaking</p>
            <h2>The estimate knows what was promised on the call. The crew knows what was sold. The invoice knows what changed.</h2>
            <p>
              People and specialized AI departments work from the same Business Brain instead of rebuilding the story at every step. Ferocity remembers what happened, notices meaningful change, advances authorized work, checks the result, and keeps the next department moving.
            </p>
          </div>
          <div className="demo-proof-flow">
            {loop.map((item) => <span key={item}>{item}</span>)}
          </div>
        </section>

        <section className="demo-positioning">
          <div>
            <p className="eyebrow">Authority without bottlenecks</p>
            <h2>The right work goes to the right worker—human or AI.</h2>
            <p>
              Assign work to a person, choose Draft only or Ask first for an AI department, or authorize routine work to run automatically. Ferocity follows consent, spending, publishing, payment, and provider rules—and keeps every action traceable.
            </p>
          </div>
          <div className="notice-card">
            <CheckCircle2 size={20} />
            <div>
              <strong>Only real decisions interrupt the work</strong>
              <p className="muted">Exceptions, uncertainty, protected actions, and choices outside the rules go to the person with the authority and context to decide.</p>
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <p className="eyebrow">Start with one problem</p>
            <h2>Give everyone responsible for the business one system for what happens next.</h2>
            <p>Ask Ferocity for a practical diagnosis, compare the operating levels, or start guided setup.</p>
          </div>
          <div className="button-row">
            <Link className="button" href="/start">
              Start Ferocity <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/pricing">Compare plans</Link>
            <Link className="button secondary-button" href="#ask-ferocity">Ask Ferocity here</Link>
          </div>
        </section>
        <PublicFooter />
      </section>
    </main>
  );
}

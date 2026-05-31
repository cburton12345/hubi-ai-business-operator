import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, ChartNoAxesCombined, FileCheck2, MessageSquareText, Star } from "lucide-react";

const marketplaceProUrl = "https://marketplacepro.live";

const tour = [
  {
    step: "1",
    title: "A lead comes in",
    body: (
      <>
        A website form, phone call,{" "}
        <Link className="inline-link" href={marketplaceProUrl}>
          MarketplacePro
        </Link>{" "}
        request, or quote request becomes a tracked lead.
      </>
    ),
    result: "Source: storm roof repair page / Priority: high / Needs reply",
    icon: MessageSquareText
  },
  {
    step: "2",
    title: "Ferocity shows the next move",
    body: "The system suggests a reply, creates an internal note, and flags whether the lead needs a callback.",
    result: "Reply draft / Customer message held for review",
    icon: BellRing
  },
  {
    step: "3",
    title: "Follow-up stays visible",
    body: "If the customer does not respond, Ferocity keeps the lead in view instead of letting it disappear.",
    result: "Follow-up due today / Owner can call, text, or snooze",
    icon: CalendarClock
  },
  {
    step: "4",
    title: "Estimate and invoice reminders appear",
    body: "Open estimates, viewed estimates, unpaid invoices, and callbacks turn into clear operator tasks.",
    result: "Estimate follow-up queued / Invoice reminder drafted",
    icon: FileCheck2
  },
  {
    step: "5",
    title: "Reviews and marketing compound",
    body: "After completed work, Ferocity creates review request drafts and content ideas tied to real services.",
    result: "Review request draft / SEO refresh idea / GBP post draft",
    icon: Star
  },
  {
    step: "6",
    title: "ROI becomes clearer",
    body: "Lead sources connect to jobs, invoices, reviews, and revenue so the business can see what is working.",
    result: "Campaign -> lead -> estimate -> job -> paid invoice",
    icon: ChartNoAxesCombined
  }
];

export default function TourPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/start">Start</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Tour mode</p>
          <h1>Follow a lead through Ferocity.</h1>
          <p className="muted">
            This public tour follows one lead from capture to reply, follow-up, estimate, review, marketing, and revenue tracking.
          </p>
          <div className="button-row">
            <Link className="button" href="/demo/acme-roofing">
              Open roofing example <ArrowRight size={16} />
            </Link>
            <Link className="button secondary-button" href="/automations">
              View automations
            </Link>
            <Link className="button secondary-button" href="/start?source=tour">
              Start my setup
            </Link>
          </div>
        </section>

        <section className="tour-board">
          {tour.map((item) => {
            const Icon = item.icon;
            return (
              <article className="tour-card" key={item.title}>
                <div className="tour-step">
                  <span>{item.step}</span>
                  <Icon size={18} />
                </div>
                <div>
                  <h2>{item.title}</h2>
                  <p className="muted">{item.body}</p>
                </div>
                <div className="tour-result">{item.result}</div>
              </article>
            );
          })}
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>What this means for an owner</h2>
              <p className="muted">
                Ferocity is not just a place to store contacts. It shows what needs attention, drafts the next action, and keeps customer-facing
                actions behind approval until the business has the right connected accounts and controls.
              </p>
            </div>
            <Link className="mini-button" href="/features">
              See all features
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}

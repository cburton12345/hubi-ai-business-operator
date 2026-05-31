import Link from "next/link";
import { ArrowRight, BellRing, Bot, CalendarClock, ChartNoAxesCombined, FileCheck2, Megaphone, MessageSquareText, Star } from "lucide-react";

const marketplaceProUrl = "https://marketplacepro.live";

const tour = [
  {
    step: "1",
    title: "Ferocity sets up the system",
    body: "The owner describes the business in plain English. Ferocity turns that into services, service areas, lead sources, review flow, follow-up rules, and safety controls.",
    result: "Setup plan / SEO, reviews, ads, forms, and follow-up mapped first",
    icon: Bot
  },
  {
    step: "2",
    title: "Growth channels start feeding the loop",
    body: "Local SEO pages, Google profile activity, reviews, paid campaigns, referrals, website forms, and marketplace sources are tracked before the lead is ever handled.",
    result: "Source tracking / Service + city + channel attached",
    icon: Megaphone
  },
  {
    step: "3",
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
    step: "4",
    title: "Ferocity shows the next move",
    body: "The system suggests a reply, creates an internal note, and flags whether the lead needs a callback.",
    result: "Reply draft / Customer message held for review",
    icon: BellRing
  },
  {
    step: "5",
    title: "Follow-up stays visible",
    body: "If the customer does not respond, Ferocity keeps the lead in view instead of letting it disappear.",
    result: "Follow-up due today / Owner can call, text, or snooze",
    icon: CalendarClock
  },
  {
    step: "6",
    title: "Estimate and invoice reminders appear",
    body: "Open estimates, viewed estimates, unpaid invoices, and callbacks turn into clear operator tasks.",
    result: "Estimate follow-up queued / Invoice reminder drafted",
    icon: FileCheck2
  },
  {
    step: "7",
    title: "Reviews and marketing compound",
    body: "After completed work, Ferocity creates review request drafts and content ideas tied to real services.",
    result: "Review request draft / SEO refresh idea / GBP post draft",
    icon: Star
  },
  {
    step: "8",
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
          <h1>Follow the full growth and operations loop.</h1>
          <p className="muted">
            The workflow usually starts with setup and growth channels, then moves into lead capture, reply, follow-up, estimate,
            payment, review, marketing proof, and revenue tracking. Some businesses may start at a later step, but the loop stays the same.
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

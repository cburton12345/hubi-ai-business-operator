import Link from "next/link";
import { BellRing, CalendarClock, FileCheck2, MailCheck, Megaphone, MessageSquareReply, ShieldCheck, Star } from "lucide-react";

const marketplaceProUrl = "https://marketplacepro.live";

const automationGroups = [
  {
    title: "Lead response",
    body: (
      <>
        Reply faster to new leads, missed calls, quote requests, and{" "}
        <Link className="inline-link" href={marketplaceProUrl}>
          MarketplacePro
        </Link>{" "}
        inquiries.
      </>
    ),
    items: ["Speed-to-lead draft", "Unanswered lead alert", "Callback reminder", "Stale lead recovery"],
    icon: MessageSquareReply
  },
  {
    title: "Estimates and money",
    body: "Keep open estimates and unpaid invoices from slipping through the cracks.",
    items: ["Estimate follow-up", "Viewed estimate reminder", "Invoice follow-up", "Won/lost tracking"],
    icon: FileCheck2
  },
  {
    title: "Reviews and reputation",
    body: "Ask at the right time, route unhappy feedback first, and draft review responses.",
    items: ["Review request after job", "Negative-experience interception", "Review response draft", "Google profile workflow"],
    icon: Star
  },
  {
    title: "Scheduling",
    body: "Help the team see callbacks, appointments, service jobs, and missed follow-up.",
    items: ["Callback scheduling", "Appointment reminders", "Technician schedule visibility", "Calendar connection status"],
    icon: CalendarClock
  },
  {
    title: "Marketing and SEO",
    body: "Create useful marketing drafts without auto-publishing thin content.",
    items: ["Service page draft", "GBP post draft", "Blog/content idea", "SEO refresh suggestion"],
    icon: Megaphone
  },
  {
    title: "Operator alerts",
    body: "Surface problems before they become lost revenue.",
    items: ["Stale lead alert", "Ignored estimate alert", "Overdue invoice alert", "Drop in lead flow"],
    icon: BellRing
  }
];

export default function AutomationsPage() {
  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/demo/tour">Tour</Link>
            <Link href="/features">Features</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/about">About</Link>
            <Link href="/integrations">Integrations</Link>
            <Link href="/start">Start</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Ferocity automations</p>
          <h1>Automations that help run the business.</h1>
          <p className="muted">
            Ferocity focuses on practical follow-up, reminders, review requests, marketing drafts, and operator alerts. Customer messages,
            publishing, connected accounts, and ad spend stay under review and approval.
          </p>
          <div className="button-row">
            <Link className="button" href="/demo/tour">
              Take the tour
            </Link>
            <Link className="button secondary-button" href="/integrations">
              See integrations
            </Link>
            <Link className="button secondary-button" href="/start?source=automations">
              Start my setup
            </Link>
          </div>
        </section>

        <section className="public-grid">
          {automationGroups.map((group) => {
            const Icon = group.icon;
            return (
              <div className="panel" key={group.title}>
                <Icon size={20} />
                <h2>{group.title}</h2>
                <p className="muted">{group.body}</p>
                <ul className="plain-list">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Safe By Default</h2>
              <p className="muted">
                Ferocity creates the draft, shows the next action, and logs what changed. It does not send customer messages, publish pages,
                connect outside accounts, or spend money without the right permissions, consent rules, and plan controls.
              </p>
            </div>
            <ShieldCheck size={22} />
          </div>
          <div className="button-row">
            <Link className="mini-button" href="/demo/acme-roofing">
              View roofing example
            </Link>
            <Link className="mini-button secondary-button" href="/about">
              Learn more
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Email, SMS, And Connected Tools</h2>
              <p className="muted">
                Ferocity is built to work with trusted tools for email, SMS, calendars, payments, websites, and publishing. Businesses can
                use managed connection paths or bring their own accounts as their plan and usage grow.
              </p>
            </div>
            <MailCheck size={22} />
          </div>
        </section>
      </section>
    </main>
  );
}

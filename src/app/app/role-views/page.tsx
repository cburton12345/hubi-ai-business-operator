import Link from "next/link";
import { BarChart3, BriefcaseBusiness, ClipboardCheck, DollarSign, HardHat, Megaphone, ShieldCheck, Users } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";

const modes = [
  {
    title: "What needs attention?",
    subtitle: "Start here when you just want to know what needs attention and what to do next.",
    icon: <ShieldCheck size={18} />,
    primaryHref: "/app/welcome",
    primaryLabel: "Start Here",
    links: [
      ["Start Here", "/app/welcome"],
      ["Today", "/app/attention-command"],
      ["AI Workforce", "/app/ai-workforce"],
      ["Customers", "/app/lead-command"],
      ["Jobs", "/app/service-command"],
      ["Money", "/app/cash-collection"],
      ["Growth", "/app/growth-calendar"]
    ]
  },
  {
    title: "What is Ferocity watching?",
    subtitle: "See what Ferocity is checking, what it can prepare, what needs approval, and what still needs setup.",
    icon: <ShieldCheck size={18} />,
    primaryHref: "/app/autopilot",
    primaryLabel: "Open Watch List",
    links: [
      ["What Ferocity watches", "/app/autopilot"],
      ["AI Workforce", "/app/ai-workforce"],
      ["Let Ferocity set up", "/app/build-system"],
      ["Business info", "/app/business-brain"],
      ["Automation Timeline", "/app/automation-timeline"],
      ["Safety and readiness", "/app/safety-readiness"]
    ]
  },
  {
    title: "What needs the owner?",
    subtitle: "Ferocity summarizes what happened, what matters, and what needs a human decision.",
    icon: <DollarSign size={18} />,
    primaryHref: "/app/owner-command-center",
    primaryLabel: "Open Owner Events",
    links: [
      ["Attention command", "/app/attention-command"],
      ["Here is what needs you", "/app/owner-command-center"],
      ["Money radar and reports", "/app/reports"],
      ["Cash collection", "/app/cash-collection"],
      ["Billing and subscription", "/app/billing"],
      ["Connected systems", "/app/lifeops-connections"],
      ["System health", "/app/system-health"]
    ]
  },
  {
    title: "Who needs follow-up?",
    subtitle: "Ferocity watches leads, callbacks, estimates, invoices, and customer updates so work does not slip.",
    icon: <ClipboardCheck size={18} />,
    primaryHref: "/app/lead-command",
    primaryLabel: "Open Customers",
    links: [
      ["Attention command", "/app/attention-command"],
      ["Lead command", "/app/lead-command"],
      ["Automation command", "/app/automation-command"],
      ["Lead follow-up", "/app/operator"],
      ["Action queue", "/app/actions"],
      ["Calendar and scheduled work", "/app/calendar"],
      ["Service jobs and invoices", "/app/service"],
      ["Cash collection", "/app/cash-collection"],
      ["Customer update drafts", "/app/operations-workforce#customer-updates"]
    ]
  },
  {
    title: "What should the field team do?",
    subtitle: "A focused work mode for anyone—including an owner—who needs to see today's work, report hours, upload proof, or log job costs.",
    icon: <HardHat size={18} />,
    primaryHref: "/employee",
    primaryLabel: "Open Field Team",
    links: [
      ["My field team view", "/employee"],
      ["Punch in or out", "/employee#quick-actions"],
      ["Today's assignments", "/app/operations-workforce#schedule"],
      ["Field costs and mileage", "/app/operations-workforce#field-work"],
      ["Field photos and proof", "/app/operations-workforce#field-work"],
      ["Technician workflow", "/app/service/tech"]
    ]
  },
  {
    title: "How do we get more business?",
    subtitle: "Ferocity prepares website, SEO, reviews, campaigns, proof, publishing, and growth reporting work.",
    icon: <Megaphone size={18} />,
    primaryHref: "/app/marketing-os",
    primaryLabel: "Open Marketing",
    links: [
      ["Growth calendar", "/app/growth-calendar"],
      ["Customer touchpoints", "/app/customer-touchpoints"],
      ["Marketing", "/app/marketing-os"],
      ["Website connector", "/app/website"],
      ["SEO", "/app/seo"],
      ["Customer proof / UGC", "/app/proof"],
      ["Publishing hub", "/app/publishing-hub"],
      ["Business Grader leads", "/app/website-grader"]
    ]
  },
  {
    title: "Where are jobs, bids, and invoices?",
    subtitle: "Ferocity organizes customers, jobs, routes, estimates, invoices, inventory, and review requests.",
    icon: <BriefcaseBusiness size={18} />,
    primaryHref: "/app/service-command",
    primaryLabel: "Open Work",
    links: [
      ["Service command", "/app/service-command"],
      ["Customers, jobs, estimates, invoices", "/app/service"],
      ["Cash collection", "/app/cash-collection"],
      ["Route planning", "/app/service/routes"],
      ["Inventory and equipment", "/app/service/inventory"],
      ["AI Walkthrough", "/app/ai-walkthrough"],
      ["Review requests", "/app/review"]
    ]
  },
  {
    title: "What needs setup or approval?",
    subtitle: "Use this when something needs keys, limits, integrations, access, QA, webhooks, or launch checks.",
    icon: <ShieldCheck size={18} />,
    primaryHref: "/app/setup",
    primaryLabel: "Open Setup",
    links: [
      ["Attention command", "/app/attention-command"],
      ["Safety and readiness", "/app/safety-readiness"],
      ["Automation command", "/app/automation-command"],
      ["Setup and module choices", "/app/setup"],
      ["Controls and limits", "/app/controls"],
      ["Credentials", "/app/credentials"],
      ["Integrations", "/app/integrations"],
      ["Access control", "/app/access"],
      ["Go-live checks", "/app/go-live"],
      ["QA and safety", "/app/qa"]
    ]
  }
];

export default function RoleViewsPage() {
  return (
    <QueuePageShell
      eyebrow="Choose A View"
      title="Pick The Problem"
      description="Most owners should start with what they are trying to solve. These are shortcuts, not extra systems to learn."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><Users size={18} /> Pick the simplest door.</h2>
            <p className="muted">
              Start with Today if you are unsure. Open another view only when that problem is in front of you.
            </p>
          </div>
          <div className="button-row">
            <Link className="button" href="/app/build-system">Let Ferocity guide setup</Link>
            <Link className="button secondary-button" href="/app/feature-map">Full feature map</Link>
          </div>
        </div>
      </section>

      <section className="grid section-actions">
        {modes.map((mode) => (
          <article className="panel span-6" key={mode.title}>
            <div className="list-row flush-row">
              <div>
                <h2>{mode.icon} {mode.title}</h2>
                <p className="muted">{mode.subtitle}</p>
              </div>
              <Link className="mini-button" href={mode.primaryHref}>{mode.primaryLabel}</Link>
            </div>
            <ul className="list">
              {mode.links.map(([label, href]) => (
                <li className="list-row" key={label}>
                  <div>
                    <h3><Link href={href}>{label}</Link></h3>
                  </div>
                  <Link className="mini-button secondary-button" href={href}>Open</Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="panel section-actions">
        <h2><BarChart3 size={18} /> Shared Records, Different Doors</h2>
        <p className="muted">
          These modes all point back to the same leads, customers, jobs, invoices, workflows, reports, controls, and event streams.
          The goal is not more staffing. The goal is fewer missed steps: Ferocity handles routine monitoring and preparation, then asks for help only when the business actually needs a person.
        </p>
      </section>
    </QueuePageShell>
  );
}
